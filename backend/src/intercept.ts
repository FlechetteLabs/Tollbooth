/**
 * Intercept manager - handles request/response interception queue
 * Also evaluates rules and auto-applies modifications
 */

import { EventEmitter } from 'events';
import {
  InterceptMode,
  PendingIntercept,
  InterceptModifications,
  TrafficFlow,
  LLMModification,
  Rule,
  RuleReference,
  ParsedLLMResponse,
} from './types';
import { storage } from './storage';
import { rulesEngine } from './rules';
import { dataStore } from './datastore';
import { settingsManager, ConfigurableLLMProvider } from './settings';
import { createLLMClient, ChatMessage } from './llm-client';
import { parseResponse } from './parsers';

class InterceptManager extends EventEmitter {
  private proxyWs: WebSocket | null = null;
  // Track current index for round_robin and sequential modes (rule_id -> current_index)
  private storeKeyIndices: Map<string, number> = new Map();
  // LLM cache for generate_once mode (cache_key -> generated content)
  private llmCache: Map<string, string> = new Map();

  constructor() {
    super();
  }

  /**
   * Extract context from flow based on context type
   */
  private extractContext(flow: TrafficFlow, contextType: 'none' | 'url_only' | 'body_only' | 'headers_only' | 'full', direction: 'request' | 'response'): string {
    // Handle context types that don't depend on direction
    if (contextType === 'none') {
      return '';
    }
    if (contextType === 'url_only') {
      return `${flow.request.method} ${flow.request.url}`;
    }

    if (direction === 'request') {
      const body = flow.request.content || '';
      const headers = JSON.stringify(flow.request.headers, null, 2);

      switch (contextType) {
        case 'body_only':
          return body;
        case 'headers_only':
          return headers;
        case 'full':
        default:
          return `Headers:\n${headers}\n\nBody:\n${body}`;
      }
    } else {
      const body = flow.response?.content || '';
      const headers = JSON.stringify(flow.response?.headers || {}, null, 2);

      switch (contextType) {
        case 'body_only':
          return body;
        case 'headers_only':
          return headers;
        case 'full':
        default:
          return `Headers:\n${headers}\n\nBody:\n${body}`;
      }
    }
  }

  /**
   * Call LLM to generate content
   */
  private async callLLM(prompt: string, systemPrompt?: string, provider?: ConfigurableLLMProvider): Promise<string> {
    // Determine which provider to use
    const targetProvider = provider || settingsManager.getActiveProvider();
    const llmConfig = settingsManager.getLLMConfig(targetProvider);
    const client = createLLMClient(llmConfig);

    const messages: ChatMessage[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await client.chat(messages);
    return response.content;
  }

  /**
   * Handle modify_llm action for a rule
   */
  private async handleModifyLLM(
    flow: TrafficFlow,
    rule: Rule,
    direction: 'request' | 'response'
  ): Promise<InterceptModifications | null> {
    const llmMod = rule.action.llm_modification;
    if (!llmMod) return null;

    try {
      // Determine cache key for generate_once mode
      const cacheKey = llmMod.cache_key || `llm_cache_${rule.id}`;
      const mode = llmMod.generation_mode || 'generate_live';

      // Check cache for generate_once mode
      if (mode === 'generate_once') {
        const cached = this.llmCache.get(cacheKey);
        if (cached) {
          console.log(`[InterceptManager] Serving LLM result from cache: ${cacheKey}`);
          return { body: cached };
        }

        // Also check datastore for persistent cache
        try {
          const stored = await dataStore.getResponse(cacheKey);
          if (stored) {
            console.log(`[InterceptManager] Serving LLM result from datastore cache: ${cacheKey}`);
            this.llmCache.set(cacheKey, stored.body);
            return { body: stored.body };
          }
        } catch {
          // Ignore - just means no cached entry
        }
      }

      // Build the prompt
      let finalPrompt: string;
      let systemPrompt: string | undefined;

      if (llmMod.template_id) {
        // Use template
        const template = settingsManager.getTemplate(llmMod.template_id);
        if (!template) {
          console.error(`[InterceptManager] Template not found: ${llmMod.template_id}`);
          return null;
        }

        // Build variables from flow + user provided
        const context = this.extractContext(flow, llmMod.context, direction);
        const vars = {
          method: flow.request.method,
          url: flow.request.url,
          host: flow.request.host,
          path: flow.request.path,
          content: context,
          ...llmMod.template_variables,
        };

        finalPrompt = settingsManager.interpolateString(template.template, vars);
        systemPrompt = template.systemPrompt;
      } else {
        // Use direct prompt
        const context = this.extractContext(flow, llmMod.context, direction);
        finalPrompt = `${llmMod.prompt}\n\nContext:\n${context}`;
        systemPrompt = 'You are an API modification assistant. Return only the modified content without explanation or formatting.';
      }

      // Call LLM
      console.log(`[InterceptManager] Calling LLM for modify_llm (mode: ${mode})`);
      const result = await this.callLLM(finalPrompt, systemPrompt, llmMod.provider);

      // Cache result for generate_once mode
      if (mode === 'generate_once') {
        this.llmCache.set(cacheKey, result);

        // Also persist to datastore
        try {
          await dataStore.saveResponse(cacheKey, {
            metadata: {
              created_at: Date.now(),
              description: `LLM cache for rule: ${rule.name}`,
            },
            status_code: 200,
            headers: { 'content-type': 'text/plain' },
            body: result,
          });
          console.log(`[InterceptManager] Cached LLM result to datastore: ${cacheKey}`);
        } catch (err) {
          console.error(`[InterceptManager] Failed to cache LLM result:`, err);
        }
      }

      return { body: result };
    } catch (err) {
      console.error(`[InterceptManager] LLM modification failed:`, err);
      return null;
    }
  }

  /**
   * Clear LLM cache for a specific key or all keys
   */
  clearLLMCache(cacheKey?: string): void {
    if (cacheKey) {
      this.llmCache.delete(cacheKey);
    } else {
      this.llmCache.clear();
    }
  }

  /**
   * Get the next store key based on the selection mode
   * @param ruleId - The rule ID for tracking state
   * @param storeKey - Single store key (if set)
   * @param storeKeys - Multiple store keys (if set)
   * @param mode - Selection mode
   * @returns The selected store key, or null if no keys available
   */
  private getNextStoreKey(
    ruleId: string,
    storeKey?: string,
    storeKeys?: string[],
    mode?: string
  ): string | null {
    // Single mode (default) - use store_key
    if (!mode || mode === 'single' || !storeKeys || storeKeys.length === 0) {
      return storeKey || (storeKeys && storeKeys[0]) || null;
    }

    const keys = storeKeys;
    if (keys.length === 0) return null;
    if (keys.length === 1) return keys[0];

    switch (mode) {
      case 'round_robin': {
        // Get current index and advance
        const currentIndex = this.storeKeyIndices.get(ruleId) || 0;
        const selectedKey = keys[currentIndex % keys.length];
        this.storeKeyIndices.set(ruleId, (currentIndex + 1) % keys.length);
        return selectedKey;
      }

      case 'random': {
        // Random selection
        const randomIndex = Math.floor(Math.random() * keys.length);
        return keys[randomIndex];
      }

      case 'sequential': {
        // Sequential - advance and stop at the end
        const currentIndex = this.storeKeyIndices.get(ruleId) || 0;
        const selectedKey = keys[Math.min(currentIndex, keys.length - 1)];
        if (currentIndex < keys.length - 1) {
          this.storeKeyIndices.set(ruleId, currentIndex + 1);
        }
        return selectedKey;
      }

      default:
        return keys[0];
    }
  }

  /**
   * Reset the store key index for a specific rule (useful for sequential mode)
   */
  resetStoreKeyIndex(ruleId: string): void {
    this.storeKeyIndices.delete(ruleId);
  }

  /**
   * Set the WebSocket connection to proxy
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

  /**
   * Set intercept mode
   */
  setInterceptMode(mode: InterceptMode): void {
    storage.setInterceptMode(mode);

    // Notify proxy
    if (this.proxyWs) {
      const message = JSON.stringify({
        cmd: 'set_intercept_mode',
        mode,
      });
      this.proxyWs.send(message);
    }

    // Notify frontend
    this.emit('mode_changed', mode);
  }

  /**
   * Get current intercept mode
   */
  getInterceptMode(): InterceptMode {
    return storage.getInterceptMode();
  }

  /**
   * Set rules enabled
   */
  setRulesEnabled(enabled: boolean): void {
    storage.setRulesEnabled(enabled);

    // Notify proxy
    if (this.proxyWs) {
      const message = JSON.stringify({
        cmd: 'set_rules_enabled',
        enabled,
      });
      this.proxyWs.send(message);
    }

    // Notify frontend
    this.emit('rules_enabled_changed', enabled);
  }

  /**
   * Get rules enabled state
   */
  getRulesEnabled(): boolean {
    return storage.getRulesEnabled();
  }

  /**
   * Handle incoming intercept request from proxy
   */
  async handleInterceptRequest(flow: TrafficFlow): Promise<void> {
    // Evaluate rules first
    const ruleMatch = rulesEngine.evaluateRequest(flow);

    if (ruleMatch) {
      console.log(`[InterceptManager] Rule matched for request: ${ruleMatch.rule.name} (${ruleMatch.action})`);

      switch (ruleMatch.action) {
        case 'passthrough':
          // Just forward without adding to pending queue
          this.forwardRequest(flow.flow_id);
          return;

        case 'modify_static':
          // Apply static modification and forward
          if (ruleMatch.rule.action.static_modification) {
            const mod = ruleMatch.rule.action.static_modification;
            const modifications: InterceptModifications = {};

            // Apply body modifications (with variable interpolation)
            if (mod.replace_body !== undefined || mod.find_replace) {
              const originalBody = flow.request.content || '';
              modifications.body = rulesEngine.applyStaticModification(originalBody, mod, flow);
              console.log(`[InterceptManager] Applying static modification to request body`);
            }

            // Apply header modifications (with variable interpolation)
            if (mod.header_modifications && mod.header_modifications.length > 0) {
              const originalHeaders = flow.request.headers || {};
              modifications.headers = rulesEngine.applyHeaderModifications(originalHeaders, mod.header_modifications, flow);
              console.log(`[InterceptManager] Applying header modifications to request`);
            }

            if (Object.keys(modifications).length > 0) {
              const ruleRef = { id: ruleMatch.rule.id, name: ruleMatch.rule.name };
              this.forwardModifiedRequest(flow.flow_id, modifications, ruleRef);
            } else {
              this.forwardRequest(flow.flow_id);
            }
          } else {
            this.forwardRequest(flow.flow_id);
          }
          return;

        case 'serve_from_store':
          // For request rules, apply stored request data (headers/body) to the request
          if (ruleMatch.store_key) {
            try {
              const stored = await dataStore.getRequest(ruleMatch.store_key);
              if (stored) {
                console.log(`[InterceptManager] Applying stored request: ${ruleMatch.store_key}`);
                const mergeMode = ruleMatch.rule.action.request_merge_mode || 'merge';
                const modifications: InterceptModifications = {};

                // Apply body from stored request
                if (stored.body) {
                  modifications.body = stored.body;
                }

                // Apply headers based on merge mode
                if (stored.headers && Object.keys(stored.headers).length > 0) {
                  if (mergeMode === 'replace') {
                    // Replace all headers with stored headers
                    modifications.headers = stored.headers;
                  } else {
                    // Merge: stored headers override incoming headers
                    modifications.headers = {
                      ...flow.request.headers,
                      ...stored.headers,
                    };
                  }
                }

                if (Object.keys(modifications).length > 0) {
                  const ruleRef = { id: ruleMatch.rule.id, name: ruleMatch.rule.name };
                  this.forwardModifiedRequest(flow.flow_id, modifications, ruleRef);
                } else {
                  this.forwardRequest(flow.flow_id);
                }
                return;
              } else {
                console.log(`[InterceptManager] Stored request not found: ${ruleMatch.store_key}`);
              }
            } catch (err) {
              console.error(`[InterceptManager] Error loading stored request:`, err);
            }
          }
          // Fall back to forwarding original
          this.forwardRequest(flow.flow_id);
          return;

        case 'intercept':
          // Fall through to manual interception
          break;

        case 'modify_llm':
          // Apply LLM modification to request
          {
            const llmResult = await this.handleModifyLLM(flow, ruleMatch.rule, 'request');
            if (llmResult) {
              console.log(`[InterceptManager] Applying LLM modification to request`);
              const ruleRef = { id: ruleMatch.rule.id, name: ruleMatch.rule.name };
              this.forwardModifiedRequest(flow.flow_id, llmResult, ruleRef);
              return;
            }
            // LLM failed, fall through to forward original
            console.log(`[InterceptManager] LLM modification failed, forwarding original request`);
            this.forwardRequest(flow.flow_id);
          }
          return;
      }
    }

    // No rule matched or rule action is 'intercept'
    // If intercept mode is passthrough (traffic only came through because of rules mode),
    // just forward without adding to queue
    if (storage.getInterceptMode() === 'passthrough') {
      console.log(`[InterceptManager] No rule matched, passthrough mode - forwarding request`);
      this.forwardRequest(flow.flow_id);
      return;
    }

    // Intercept mode is active - add to pending queue for manual handling
    const pending: PendingIntercept = {
      flow_id: flow.flow_id,
      timestamp: Date.now(),
      flow,
      type: 'request',
    };

    storage.addPendingIntercept(pending);
    this.emit('intercept_request', pending);
  }

  /**
   * Handle incoming intercept response from proxy
   */
  async handleInterceptResponse(flow: TrafficFlow): Promise<void> {
    // Evaluate rules first
    const ruleMatch = rulesEngine.evaluateResponse(flow);

    if (ruleMatch) {
      console.log(`[InterceptManager] Rule matched for response: ${ruleMatch.rule.name} (${ruleMatch.action})`);

      switch (ruleMatch.action) {
        case 'passthrough':
          // Just forward without adding to pending queue
          this.forwardResponse(flow.flow_id);
          return;

        case 'modify_static':
          // Apply static modification and forward
          if (ruleMatch.rule.action.static_modification && flow.response) {
            const mod = ruleMatch.rule.action.static_modification;
            const modifications: InterceptModifications = {};

            // Apply body modifications (with variable interpolation)
            if (mod.replace_body !== undefined || mod.find_replace) {
              const originalBody = flow.response.content || '';
              modifications.body = rulesEngine.applyStaticModification(originalBody, mod, flow);
              console.log(`[InterceptManager] Applying static modification to response body`);
            }

            // Apply header modifications (with variable interpolation)
            if (mod.header_modifications && mod.header_modifications.length > 0) {
              const originalHeaders = flow.response.headers || {};
              modifications.headers = rulesEngine.applyHeaderModifications(originalHeaders, mod.header_modifications, flow);
              console.log(`[InterceptManager] Applying header modifications to response`);
            }

            if (Object.keys(modifications).length > 0) {
              const ruleRef = { id: ruleMatch.rule.id, name: ruleMatch.rule.name };
              this.forwardModifiedResponse(flow.flow_id, modifications, ruleRef);
            } else {
              this.forwardResponse(flow.flow_id);
            }
          } else {
            this.forwardResponse(flow.flow_id);
          }
          return;

        case 'serve_from_store':
          // Serve a stored response (supports multiple keys with selection modes)
          {
            const selectedKey = this.getNextStoreKey(
              ruleMatch.rule.id,
              ruleMatch.rule.action.store_key,
              ruleMatch.rule.action.store_keys,
              ruleMatch.rule.action.store_key_mode
            );

            if (selectedKey) {
              try {
                const stored = await dataStore.getResponse(selectedKey);
                if (stored) {
                  const mode = ruleMatch.rule.action.store_key_mode || 'single';
                  console.log(`[InterceptManager] Serving stored response: ${selectedKey} (mode: ${mode})`);
                  const ruleRef = { id: ruleMatch.rule.id, name: ruleMatch.rule.name };
                  this.forwardModifiedResponse(flow.flow_id, {
                    body: stored.body,
                    status_code: stored.status_code,
                    headers: stored.headers,
                  }, ruleRef);
                  return;
                } else {
                  console.log(`[InterceptManager] Stored response not found: ${selectedKey}`);
                }
              } catch (err) {
                console.error(`[InterceptManager] Error loading stored response:`, err);
              }
            }
          }
          // Fall back to forwarding original
          this.forwardResponse(flow.flow_id);
          return;

        case 'intercept':
          // Fall through to manual interception
          break;

        case 'modify_llm':
          // Apply LLM modification to response
          {
            const llmResult = await this.handleModifyLLM(flow, ruleMatch.rule, 'response');
            if (llmResult) {
              console.log(`[InterceptManager] Applying LLM modification to response`);
              const ruleRef = { id: ruleMatch.rule.id, name: ruleMatch.rule.name };
              this.forwardModifiedResponse(flow.flow_id, llmResult, ruleRef);
              return;
            }
            // LLM failed, fall through to forward original
            console.log(`[InterceptManager] LLM modification failed, forwarding original response`);
            this.forwardResponse(flow.flow_id);
          }
          return;

        case 'auto_hide':
          // Forward the response, then mark as hidden
          {
            console.log(`[InterceptManager] Auto-hiding traffic: ${flow.flow_id}`);
            const ruleRef = { id: ruleMatch.rule.id, name: ruleMatch.rule.name };
            storage.hideTraffic(flow.flow_id, ruleRef);
            this.forwardResponse(flow.flow_id);
          }
          return;

        case 'auto_clear':
          // Forward the response, then delete from storage
          {
            console.log(`[InterceptManager] Auto-clearing traffic: ${flow.flow_id}`);
            // Forward first, then delete
            this.forwardResponse(flow.flow_id);
            // Small delay to ensure the response is processed before deletion
            setTimeout(() => {
              storage.deleteTraffic(flow.flow_id);
            }, 100);
          }
          return;
      }
    }

    // Check for refusal detection on LLM responses
    // This is done after rule processing to allow rules to take precedence
    if (flow.is_llm_api && flow.response) {
      const refusalResult = await this.checkRefusal(flow);
      if (refusalResult) {
        // Refusal was detected and handled (either added to queue, forwarded, or modified)
        return;
      }
    }

    // No rule matched or rule action is 'intercept'
    // If intercept mode is passthrough (traffic only came through because of rules mode),
    // just forward without adding to queue
    if (storage.getInterceptMode() === 'passthrough') {
      console.log(`[InterceptManager] No rule matched, passthrough mode - forwarding response`);
      this.forwardResponse(flow.flow_id);
      return;
    }

    // Intercept mode is active - add to pending queue for manual handling
    const pending: PendingIntercept = {
      flow_id: flow.flow_id,
      timestamp: Date.now(),
      flow,
      type: 'response',
    };

    storage.addPendingIntercept(pending);
    this.emit('intercept_response', pending);
  }

  /**
   * Check for refusal in LLM response and handle accordingly
   * Returns true if refusal was detected and handled
   */
  private async checkRefusal(flow: TrafficFlow): Promise<boolean> {
    // Dynamically import refusalManager to avoid circular dependency
    const { refusalManager } = await import('./refusal');

    // Parse the response if not already parsed
    const existingFlow = storage.getTraffic(flow.flow_id);
    if (!existingFlow || !flow.response) {
      console.log(`[checkRefusal] Early return: existingFlow=${!!existingFlow}, flow.response=${!!flow.response}`);
      return false;
    }

    const parsedResponse = parseResponse(existingFlow.request, flow.response);
    if (!parsedResponse) {
      console.log(`[checkRefusal] parsedResponse is null for flow ${flow.flow_id}`);
      return false;
    }

    console.log(`[checkRefusal] Analyzing flow ${flow.flow_id}, content blocks: ${parsedResponse.content?.length || 0}`);

    // Analyze for refusal
    const result = await refusalManager.analyzeResponse(flow, parsedResponse);
    console.log(`[checkRefusal] Analysis result: shouldIntercept=${result.shouldIntercept}, hasAnalysis=${!!result.analysis}, hasMatchedRule=${!!result.matchedRule}`);
    if (!result.analysis || !result.matchedRule) {
      return false;
    }

    const { analysis, matchedRule } = result;
    console.log(`[InterceptManager] Refusal detected for flow ${flow.flow_id}, action: ${matchedRule.action}`);

    switch (matchedRule.action) {
      case 'passthrough':
        // Just add metadata and forward
        refusalManager.handlePassthrough(flow, analysis, matchedRule);
        this.forwardResponse(flow.flow_id);
        return true;

      case 'prompt_user':
        // Add to pending refusals queue and hold
        const originalResponse = flow.response?.content || '';
        refusalManager.addPendingRefusal(flow, analysis, matchedRule, originalResponse);
        // Don't forward - wait for user action
        return true;

      case 'modify':
        // Auto-generate replacement and forward
        const originalContent = flow.response?.content || '';
        const modifications = await refusalManager.handleAutoModify(flow, analysis, matchedRule, originalContent);
        if (modifications) {
          const ruleRef = { id: matchedRule.id, name: matchedRule.name };
          this.forwardModifiedResponse(flow.flow_id, modifications, ruleRef);
        } else {
          // Fallback to forwarding original if modification failed
          this.forwardResponse(flow.flow_id);
        }
        return true;
    }

    return false;
  }

  /**
   * Forward request without modifications
   */
  forwardRequest(flowId: string): void {
    storage.removePendingIntercept(flowId);

    if (this.proxyWs) {
      const message = JSON.stringify({
        cmd: 'forward',
        flow_id: flowId,
      });
      this.proxyWs.send(message);
    }

    this.emit('intercept_completed', flowId);
  }

  /**
   * Forward request with modifications
   */
  forwardModifiedRequest(flowId: string, modifications: InterceptModifications, rule?: RuleReference): void {
    storage.removePendingIntercept(flowId);

    // Store rule info if provided
    if (rule) {
      storage.updateTraffic(flowId, { request_modified_by_rule: rule });
    }

    if (this.proxyWs) {
      const message = JSON.stringify({
        cmd: 'forward_modified',
        flow_id: flowId,
        modifications,
      });
      this.proxyWs.send(message);
    }

    this.emit('intercept_completed', flowId);
  }

  /**
   * Drop request
   */
  dropRequest(flowId: string): void {
    storage.removePendingIntercept(flowId);

    if (this.proxyWs) {
      const message = JSON.stringify({
        cmd: 'drop',
        flow_id: flowId,
      });
      this.proxyWs.send(message);
    }

    this.emit('intercept_dropped', flowId);
  }

  /**
   * Forward response without modifications
   */
  forwardResponse(flowId: string): void {
    storage.removePendingIntercept(flowId);

    if (this.proxyWs) {
      const message = JSON.stringify({
        cmd: 'forward_response',
        flow_id: flowId,
      });
      this.proxyWs.send(message);
    }

    this.emit('intercept_completed', flowId);
  }

  /**
   * Forward response with modifications
   */
  forwardModifiedResponse(flowId: string, modifications: InterceptModifications, rule?: RuleReference): void {
    storage.removePendingIntercept(flowId);

    // Store rule info if provided
    if (rule) {
      storage.updateTraffic(flowId, { response_modified_by_rule: rule });
    }

    if (this.proxyWs) {
      const message = JSON.stringify({
        cmd: 'forward_response_modified',
        flow_id: flowId,
        modifications,
      });
      this.proxyWs.send(message);
    }

    this.emit('intercept_completed', flowId);
  }

  /**
   * Get all pending intercepts
   */
  getPendingIntercepts(): PendingIntercept[] {
    return storage.getPendingIntercepts();
  }

  /**
   * Get pending intercept by flow ID
   */
  getPendingIntercept(flowId: string): PendingIntercept | undefined {
    return storage.getPendingIntercepts().find(p => p.flow_id === flowId);
  }

  /**
   * Check for timed out intercepts (5 minute timeout)
   */
  checkTimeouts(): string[] {
    const timedOut: string[] = [];
    const now = Date.now();
    const timeout = 5 * 60 * 1000; // 5 minutes

    for (const pending of storage.getPendingIntercepts()) {
      if (now - pending.timestamp > timeout) {
        timedOut.push(pending.flow_id);
        // Auto-forward on timeout
        if (pending.type === 'request') {
          this.forwardRequest(pending.flow_id);
        } else {
          this.forwardResponse(pending.flow_id);
        }
      }
    }

    return timedOut;
  }
}

export const interceptManager = new InterceptManager();

// Check for timeouts every minute
setInterval(() => {
  const timedOut = interceptManager.checkTimeouts();
  if (timedOut.length > 0) {
    console.log(`Auto-forwarded ${timedOut.length} timed out intercepts`);
  }
}, 60000);
