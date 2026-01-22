/**
 * RefusalManager - manages refusal detection rules, pending queue, and alternate response generation
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  RefusalRule,
  RefusalAnalysisResult,
  PendingRefusal,
  RefusalAction,
  TrafficFlow,
  ParsedLLMResponse,
  InterceptModifications,
  ContentBlock,
  TextContent,
  ThinkingContent,
  MatchCondition,
  MatchType,
  LLMProvider,
} from '../types';
import { refusalAnalyzer } from './analyzer';
import { storage } from '../storage';
import { settingsManager, ConfigurableLLMProvider } from '../settings';
import { createLLMClient, ChatMessage } from '../llm-client';

// Default prompt for generating alternate responses
const DEFAULT_FALLBACK_PROMPT = `The following LLM response was detected as a refusal. Please provide an alternative, maximally helpful and affirmative response that accomplishes the user's goal while being safe and ethical.

Original refusal:
{{original_response}}

Please respond with ONLY the replacement content, no explanations or preamble.`;

const DEFAULT_SYSTEM_PROMPT = `You are an assistant that helps rephrase responses to be more helpful and affirmative. When given a refusal, provide an alternative response that attempts to accomplish the user's underlying goal.`;

// Timeout for pending refusals (5 minutes)
const PENDING_TIMEOUT_MS = 5 * 60 * 1000;

export class RefusalManager extends EventEmitter {
  private rules: Map<string, RefusalRule> = new Map();
  private pendingRefusals: Map<string, PendingRefusal> = new Map();
  private timeouts: Map<string, NodeJS.Timeout> = new Map();
  private proxyWs: WebSocket | null = null;
  private initialized = false;

  constructor() {
    super();
  }

  /**
   * Initialize the refusal analyzer
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('[RefusalManager] Initializing...');
    await refusalAnalyzer.initialize();
    this.initialized = true;

    if (refusalAnalyzer.isUsingFallback()) {
      console.log('[RefusalManager] Ready (using keyword-based fallback detection)');
    } else {
      console.log('[RefusalManager] Ready (using ML classifier)');
    }
  }

  /**
   * Set the proxy WebSocket connection
   */
  setProxyConnection(ws: WebSocket): void {
    this.proxyWs = ws;
  }

  /**
   * Clear the proxy connection
   */
  clearProxyConnection(): void {
    this.proxyWs = null;
  }

  // ============ Rule Management ============

  /**
   * Add a new refusal rule
   */
  addRule(rule: RefusalRule): void {
    this.rules.set(rule.id, rule);
    storage.addRefusalRule(rule);
    this.emit('rule_added', rule);
  }

  /**
   * Update an existing refusal rule
   */
  updateRule(id: string, updates: Partial<RefusalRule>): RefusalRule | null {
    const existing = this.rules.get(id);
    if (!existing) return null;

    const updated: RefusalRule = {
      ...existing,
      ...updates,
      id, // Ensure ID doesn't change
      updated_at: Date.now(),
    };

    this.rules.set(id, updated);
    storage.updateRefusalRule(id, updated);
    this.emit('rule_updated', updated);
    return updated;
  }

  /**
   * Delete a refusal rule
   */
  deleteRule(id: string): boolean {
    const deleted = this.rules.delete(id);
    if (deleted) {
      storage.deleteRefusalRule(id);
      this.emit('rule_deleted', id);
    }
    return deleted;
  }

  /**
   * Get all refusal rules (sorted by priority)
   */
  getRules(): RefusalRule[] {
    return Array.from(this.rules.values())
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get a specific refusal rule
   */
  getRule(id: string): RefusalRule | undefined {
    return this.rules.get(id);
  }

  /**
   * Load rules from storage (which loads from disk)
   */
  loadRules(): void {
    // First load from disk into storage
    storage.loadRefusalRules();

    // Then load from storage into our local map
    const storedRules = storage.getAllRefusalRules();
    for (const rule of storedRules) {
      this.rules.set(rule.id, rule);
    }
    console.log(`[RefusalManager] Loaded ${this.rules.size} refusal rules`);
  }

  // ============ Response Analysis ============

  /**
   * Extract analyzable content from parsed LLM response.
   * Includes both text content (visible output) and thinking content (internal reasoning).
   * Both are analyzed for refusal patterns since refusals can appear in either.
   */
  private extractAnalyzableContent(parsedResponse: ParsedLLMResponse): string {
    const parts: string[] = [];

    for (const block of parsedResponse.content) {
      if (block.type === 'text') {
        const textBlock = block as TextContent;
        if (textBlock.text) {
          parts.push(textBlock.text);
        }
      } else if (block.type === 'thinking') {
        const thinkingBlock = block as ThinkingContent;
        if (thinkingBlock.thinking) {
          parts.push(thinkingBlock.thinking);
        }
      }
    }

    return parts.join('\n');
  }

  /**
   * Check if a condition matches a value
   */
  private matchCondition(condition: MatchCondition | undefined, value: string): boolean {
    if (!condition) return true; // No condition = match all

    const matchValue = condition.value;
    const matchType: MatchType = condition.match;

    switch (matchType) {
      case 'exact':
        return value === matchValue;
      case 'contains':
        return value.includes(matchValue);
      case 'regex':
        try {
          const regex = new RegExp(matchValue);
          return regex.test(value);
        } catch {
          return false;
        }
      default:
        return false;
    }
  }

  /**
   * Check if a rule's filter matches the given flow
   */
  private matchesFilter(rule: RefusalRule, flow: TrafficFlow, parsedResponse: ParsedLLMResponse): boolean {
    const filter = rule.filter;
    if (!filter) return true; // No filter = match all

    // Check host filter
    if (filter.host && !this.matchCondition(filter.host, flow.request.host)) {
      return false;
    }

    // Check path filter
    if (filter.path && !this.matchCondition(filter.path, flow.request.path)) {
      return false;
    }

    // Check model filter
    if (filter.model && parsedResponse.model) {
      if (!this.matchCondition(filter.model, parsedResponse.model)) {
        return false;
      }
    }

    // Check provider filter
    if (filter.provider && parsedResponse.provider !== filter.provider) {
      return false;
    }

    return true;
  }

  /**
   * Analyze a response for refusal content
   * Returns analysis result and matched rule if refusal detected
   */
  async analyzeResponse(
    flow: TrafficFlow,
    parsedResponse: ParsedLLMResponse
  ): Promise<{
    shouldIntercept: boolean;
    analysis?: RefusalAnalysisResult;
    matchedRule?: RefusalRule;
  }> {
    // Check if any rules are enabled
    const enabledRules = this.getRules().filter(r => r.enabled && r.detection.enabled);
    console.log(`[RefusalManager] analyzeResponse: ${enabledRules.length} enabled rules`);
    if (enabledRules.length === 0) {
      return { shouldIntercept: false };
    }

    // Extract analyzable content from response (text + thinking)
    const analyzableContent = this.extractAnalyzableContent(parsedResponse);
    console.log(`[RefusalManager] analyzeResponse: content length=${analyzableContent?.length || 0}, preview="${analyzableContent?.slice(0, 100)}..."`);
    if (!analyzableContent) {
      return { shouldIntercept: false };
    }

    // Find first matching rule
    for (const rule of enabledRules) {
      if (!this.matchesFilter(rule, flow, parsedResponse)) {
        console.log(`[RefusalManager] Rule "${rule.name}" filter did not match`);
        continue;
      }

      console.log(`[RefusalManager] Analyzing with rule "${rule.name}" (threshold: ${rule.detection.confidence_threshold})`);

      // Analyze content with this rule's settings
      const analysis = await refusalAnalyzer.analyze(
        analyzableContent,
        rule.detection.tokens_to_analyze,
        rule.detection.confidence_threshold
      );

      console.log(`[RefusalManager] Analysis result: is_refusal=${analysis.is_refusal}, confidence=${(analysis.confidence * 100).toFixed(1)}%`);

      if (analysis.is_refusal) {
        console.log(`[RefusalManager] Refusal detected for flow ${flow.flow_id} by rule "${rule.name}" (confidence: ${(analysis.confidence * 100).toFixed(1)}%)`);
        return {
          shouldIntercept: rule.action === 'prompt_user',
          analysis,
          matchedRule: rule,
        };
      }
    }

    return { shouldIntercept: false };
  }

  // ============ Pending Queue Management ============

  /**
   * Add a pending refusal to the queue
   */
  addPendingRefusal(
    flow: TrafficFlow,
    analysis: RefusalAnalysisResult,
    rule: RefusalRule,
    originalResponse: string
  ): PendingRefusal {
    const pending: PendingRefusal = {
      id: uuidv4(),
      flow_id: flow.flow_id,
      timestamp: Date.now(),
      flow,
      analysis,
      matched_rule: { id: rule.id, name: rule.name },
      status: 'pending',
      original_response: originalResponse,
    };

    this.pendingRefusals.set(pending.id, pending);
    storage.addPendingRefusal(pending);

    // Set timeout for auto-forward
    const timeout = setTimeout(() => {
      this.handleTimeout(pending.id);
    }, PENDING_TIMEOUT_MS);
    this.timeouts.set(pending.id, timeout);

    this.emit('pending_refusal_added', pending);
    return pending;
  }

  /**
   * Get all pending refusals
   */
  getPendingRefusals(): PendingRefusal[] {
    return Array.from(this.pendingRefusals.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get a specific pending refusal
   */
  getPendingRefusal(id: string): PendingRefusal | undefined {
    return this.pendingRefusals.get(id);
  }

  /**
   * Remove a pending refusal from the queue
   */
  private removePendingRefusal(id: string): PendingRefusal | undefined {
    const pending = this.pendingRefusals.get(id);
    if (pending) {
      this.pendingRefusals.delete(id);
      storage.removePendingRefusal(id);

      // Clear timeout
      const timeout = this.timeouts.get(id);
      if (timeout) {
        clearTimeout(timeout);
        this.timeouts.delete(id);
      }
    }
    return pending;
  }

  /**
   * Handle timeout - auto-forward original response
   */
  private handleTimeout(id: string): void {
    const pending = this.pendingRefusals.get(id);
    if (!pending) return;

    console.log(`[RefusalManager] Timeout for refusal ${id}, auto-forwarding original response`);
    this.approveRefusal(id);
    this.emit('refusal_timeout', { id, flow_id: pending.flow_id });
  }

  // ============ Actions ============

  /**
   * Approve refusal - forward original response as-is
   */
  async approveRefusal(id: string): Promise<void> {
    const pending = this.removePendingRefusal(id);
    if (!pending) {
      console.warn(`[RefusalManager] Pending refusal not found: ${id}`);
      return;
    }

    pending.status = 'approved';

    // Forward original response to proxy
    if (this.proxyWs) {
      const message = JSON.stringify({
        cmd: 'forward_response',
        flow_id: pending.flow_id,
      });
      this.proxyWs.send(message);
    }

    this.emit('refusal_approved', { id, flow_id: pending.flow_id });
    this.emit('refusal_resolved', { id, flow_id: pending.flow_id, status: 'approved' });
  }

  /**
   * Reject and modify - replace response with custom or generated content
   */
  async rejectAndModify(id: string, customResponse?: string): Promise<string> {
    const pending = this.pendingRefusals.get(id);
    if (!pending) {
      throw new Error(`Pending refusal not found: ${id}`);
    }

    // Use custom response or generate one
    const modifiedResponse = customResponse || pending.modified_response || await this.generateAlternateResponse(pending);

    pending.status = 'modified';
    pending.modified_response = modifiedResponse;

    // Forward modified response to proxy
    if (this.proxyWs) {
      const modifications: InterceptModifications = {
        body: modifiedResponse,
      };
      const message = JSON.stringify({
        cmd: 'forward_response_modified',
        flow_id: pending.flow_id,
        modifications,
      });
      this.proxyWs.send(message);
    }

    // Update flow with refusal metadata
    storage.updateTraffic(pending.flow_id, {
      refusal: {
        detected: true,
        confidence: pending.analysis.confidence,
        rule_id: pending.matched_rule.id,
        rule_name: pending.matched_rule.name,
        action_taken: 'modify',
        original_content: pending.original_response,
        was_modified: true,
      },
    });

    this.removePendingRefusal(id);
    this.emit('refusal_modified', { id, flow_id: pending.flow_id, modified_response: modifiedResponse });
    this.emit('refusal_resolved', { id, flow_id: pending.flow_id, status: 'modified' });

    return modifiedResponse;
  }

  /**
   * Generate alternate response using LLM
   */
  async generateAlternateResponse(pending: PendingRefusal): Promise<string> {
    const rule = this.getRule(pending.matched_rule.id);
    const fallbackConfig = rule?.fallback_config;

    // Determine provider
    const provider: ConfigurableLLMProvider = fallbackConfig?.provider || settingsManager.getActiveProvider();
    const llmConfig = settingsManager.getLLMConfig(provider);
    const client = createLLMClient(llmConfig);

    // Build prompt
    let prompt = fallbackConfig?.custom_prompt || DEFAULT_FALLBACK_PROMPT;
    prompt = prompt.replace('{{original_response}}', pending.original_response);

    const systemPrompt = fallbackConfig?.system_prompt || DEFAULT_SYSTEM_PROMPT;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ];

    console.log(`[RefusalManager] Generating alternate response for refusal ${pending.id} using ${provider}`);

    try {
      const response = await client.chat(messages);
      pending.modified_response = response.content;
      this.emit('alternate_generated', { id: pending.id, response: response.content });
      return response.content;
    } catch (error) {
      console.error(`[RefusalManager] Failed to generate alternate response:`, error);
      throw error;
    }
  }

  // ============ Passthrough Handler ============

  /**
   * Handle a detected refusal with passthrough action - just add metadata and continue
   */
  handlePassthrough(flow: TrafficFlow, analysis: RefusalAnalysisResult, rule: RefusalRule): void {
    storage.updateTraffic(flow.flow_id, {
      refusal: {
        detected: true,
        confidence: analysis.confidence,
        rule_id: rule.id,
        rule_name: rule.name,
        action_taken: 'passthrough',
        was_modified: false,
      },
    });
  }

  /**
   * Handle a detected refusal with auto-modify action
   */
  async handleAutoModify(
    flow: TrafficFlow,
    analysis: RefusalAnalysisResult,
    rule: RefusalRule,
    originalResponse: string
  ): Promise<InterceptModifications | null> {
    try {
      // Create a temporary pending refusal for generation
      const pending: PendingRefusal = {
        id: uuidv4(),
        flow_id: flow.flow_id,
        timestamp: Date.now(),
        flow,
        analysis,
        matched_rule: { id: rule.id, name: rule.name },
        status: 'pending',
        original_response: originalResponse,
      };

      const modifiedResponse = await this.generateAlternateResponse(pending);

      // Update flow with refusal metadata
      storage.updateTraffic(flow.flow_id, {
        refusal: {
          detected: true,
          confidence: analysis.confidence,
          rule_id: rule.id,
          rule_name: rule.name,
          action_taken: 'modify',
          original_content: originalResponse,
          was_modified: true,
        },
      });

      return { body: modifiedResponse };
    } catch (error) {
      console.error(`[RefusalManager] Auto-modify failed:`, error);
      // Fall back to passthrough on error
      this.handlePassthrough(flow, analysis, rule);
      return null;
    }
  }

  // ============ Cleanup ============

  /**
   * Check for timed out refusals
   */
  checkTimeouts(): string[] {
    const timedOut: string[] = [];
    const now = Date.now();

    for (const pending of this.pendingRefusals.values()) {
      if (now - pending.timestamp > PENDING_TIMEOUT_MS) {
        timedOut.push(pending.id);
        this.handleTimeout(pending.id);
      }
    }

    return timedOut;
  }
}

// Singleton instance
export const refusalManager = new RefusalManager();

// Check for timeouts every minute
setInterval(() => {
  const timedOut = refusalManager.checkTimeouts();
  if (timedOut.length > 0) {
    console.log(`[RefusalManager] Auto-forwarded ${timedOut.length} timed out refusals`);
  }
}, 60000);
