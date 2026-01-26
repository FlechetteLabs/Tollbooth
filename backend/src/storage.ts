/**
 * Storage for traffic, conversations, and intercepts
 *
 * Supports optional persistence to disk when /data is mounted.
 * Uses persistence layer to handle file I/O.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  TrafficFlow,
  Conversation,
  URLLogEntry,
  PendingIntercept,
  InterceptMode,
  StreamChunk,
  RefusalRule,
  PendingRefusal,
  InlineAnnotation,
  FilterPreset,
} from './types';
import { persistence } from './persistence';

// Legacy paths for backwards compatibility
const REFUSAL_RULES_FILE = process.env.REFUSAL_RULES_PATH || './datastore/refusal-rules.json';

class Storage {
  private traffic: Map<string, TrafficFlow> = new Map();
  private conversations: Map<string, Conversation> = new Map();
  private urlLog: URLLogEntry[] = [];
  private pendingIntercepts: Map<string, PendingIntercept> = new Map();
  private interceptMode: InterceptMode = 'passthrough';
  private rulesEnabled: boolean = true;
  private streamChunks: Map<string, StreamChunk[]> = new Map();
  private refusalRules: Map<string, RefusalRule> = new Map();
  private pendingRefusals: Map<string, PendingRefusal> = new Map();
  private filterPresets: Map<string, FilterPreset> = new Map();
  private initialized = false;

  /**
   * Initialize storage - load persisted data if available
   */
  async initialize(): Promise<void> {
    // Initialize persistence layer first
    await persistence.initialize();

    // Load traffic from disk if persistence is enabled
    if (persistence.isPersisted('traffic')) {
      const flows = await persistence.loadAllTrafficFlows() as TrafficFlow[];
      for (const flow of flows) {
        this.traffic.set(flow.flow_id, flow);
      }
      console.log(`[Storage] Loaded ${this.traffic.size} traffic flows from disk`);
    }

    // Load filter presets
    if (persistence.isPersisted('config')) {
      const presets = await persistence.loadConfigFile<FilterPreset[]>('presets', []);
      for (const preset of presets) {
        this.filterPresets.set(preset.id, preset);
      }
      console.log(`[Storage] Loaded ${this.filterPresets.size} filter presets`);
    }

    // Load refusal rules (uses legacy path for now, will migrate)
    this.loadRefusalRules();

    this.initialized = true;
  }

  // ============ Traffic methods ============

  addTraffic(flow: TrafficFlow): void {
    this.traffic.set(flow.flow_id, flow);
    // Persist to disk
    this.persistTrafficFlow(flow);
  }

  getTraffic(flowId: string): TrafficFlow | undefined {
    return this.traffic.get(flowId);
  }

  updateTraffic(flowId: string, updates: Partial<TrafficFlow>): void {
    const existing = this.traffic.get(flowId);
    if (existing) {
      const updated = { ...existing, ...updates };
      this.traffic.set(flowId, updated);
      // Persist to disk
      this.persistTrafficFlow(updated);
    }
  }

  getAllTraffic(): TrafficFlow[] {
    return Array.from(this.traffic.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  getTrafficCount(): number {
    return this.traffic.size;
  }

  // Hide traffic (keep in storage but mark as hidden)
  hideTraffic(flowId: string, ruleRef?: { id: string; name: string }): boolean {
    const existing = this.traffic.get(flowId);
    if (!existing) return false;
    const updated = {
      ...existing,
      hidden: true,
      hidden_at: Date.now(),
      hidden_by_rule: ruleRef,
    };
    this.traffic.set(flowId, updated);
    this.persistTrafficFlow(updated);
    return true;
  }

  // Unhide traffic
  unhideTraffic(flowId: string): boolean {
    const existing = this.traffic.get(flowId);
    if (!existing) return false;
    const updated = {
      ...existing,
      hidden: false,
      hidden_at: undefined,
      hidden_by_rule: undefined,
    };
    this.traffic.set(flowId, updated);
    this.persistTrafficFlow(updated);
    return true;
  }

  // Delete traffic permanently
  deleteTraffic(flowId: string): boolean {
    const deleted = this.traffic.delete(flowId);
    if (deleted) {
      // Delete from disk
      persistence.deleteTrafficFlow(flowId).catch(err => {
        console.error(`[Storage] Failed to delete traffic flow ${flowId}:`, err);
      });
    }
    return deleted;
  }

  // Bulk delete traffic
  deleteTrafficBulk(flowIds: string[]): number {
    let deleted = 0;
    for (const flowId of flowIds) {
      if (this.deleteTraffic(flowId)) {
        deleted++;
      }
    }
    return deleted;
  }

  // Bulk hide traffic
  hideTrafficBulk(flowIds: string[], ruleRef?: { id: string; name: string }): number {
    let hidden = 0;
    for (const flowId of flowIds) {
      if (this.hideTraffic(flowId, ruleRef)) {
        hidden++;
      }
    }
    return hidden;
  }

  // Get traffic with optional hidden filter
  getAllTrafficFiltered(includeHidden: boolean = false): TrafficFlow[] {
    const all = Array.from(this.traffic.values());
    const filtered = includeHidden ? all : all.filter(f => !f.hidden);
    return filtered.sort((a, b) => b.timestamp - a.timestamp);
  }

  // ============ Annotation methods (inline in traffic) ============

  /**
   * Set or update annotation for a traffic flow
   */
  setTrafficAnnotation(flowId: string, annotation: InlineAnnotation | null): TrafficFlow | null {
    const existing = this.traffic.get(flowId);
    if (!existing) return null;

    const updated: TrafficFlow = {
      ...existing,
      annotation: annotation || undefined,
      tags: annotation?.tags || undefined,
    };
    this.traffic.set(flowId, updated);
    this.persistTrafficFlow(updated);
    return updated;
  }

  /**
   * Add tags to a traffic flow, creating/updating annotation as needed
   */
  addTrafficTags(flowId: string, newTags: string[]): TrafficFlow | null {
    const existing = this.traffic.get(flowId);
    if (!existing) return null;

    const now = Date.now();
    const existingAnnotation = existing.annotation;

    if (existingAnnotation) {
      // Merge tags
      const tagSet = new Set([...existingAnnotation.tags, ...newTags]);
      const updated: TrafficFlow = {
        ...existing,
        annotation: {
          ...existingAnnotation,
          tags: Array.from(tagSet),
          updated_at: now,
        },
        tags: Array.from(tagSet),
      };
      this.traffic.set(flowId, updated);
      this.persistTrafficFlow(updated);
      return updated;
    } else {
      // Create new annotation with just tags
      const updated: TrafficFlow = {
        ...existing,
        annotation: {
          title: '',
          tags: newTags,
          created_at: now,
          updated_at: now,
        },
        tags: newTags,
      };
      this.traffic.set(flowId, updated);
      this.persistTrafficFlow(updated);
      return updated;
    }
  }

  /**
   * Get all unique tags from all traffic flows
   */
  getAllTags(): string[] {
    const tagSet = new Set<string>();
    for (const flow of this.traffic.values()) {
      if (flow.tags) {
        for (const tag of flow.tags) {
          tagSet.add(tag);
          // Also add parent tags for hierarchical tags
          const parts = tag.split(':');
          let current = '';
          for (const part of parts) {
            current = current ? `${current}:${part}` : part;
            tagSet.add(current);
          }
        }
      }
    }
    return Array.from(tagSet).sort();
  }

  // ============ Filter Preset methods ============

  addFilterPreset(preset: FilterPreset): void {
    this.filterPresets.set(preset.id, preset);
    this.persistFilterPresets();
  }

  getFilterPreset(id: string): FilterPreset | undefined {
    return this.filterPresets.get(id);
  }

  updateFilterPreset(id: string, updates: Partial<FilterPreset>): FilterPreset | null {
    const existing = this.filterPresets.get(id);
    if (!existing) return null;

    const updated = { ...existing, ...updates, updated_at: Date.now() };
    this.filterPresets.set(id, updated);
    this.persistFilterPresets();
    return updated;
  }

  deleteFilterPreset(id: string): boolean {
    const deleted = this.filterPresets.delete(id);
    if (deleted) {
      this.persistFilterPresets();
    }
    return deleted;
  }

  getAllFilterPresets(): FilterPreset[] {
    return Array.from(this.filterPresets.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  private async persistFilterPresets(): Promise<void> {
    if (!persistence.isPersisted('config')) return;
    const presets = Array.from(this.filterPresets.values());
    await persistence.saveConfigFile('presets', presets);
  }

  // ============ URL Log methods ============

  addURLLogEntry(entry: URLLogEntry): void {
    this.urlLog.push(entry);
  }

  getURLLog(): URLLogEntry[] {
    return this.urlLog.slice().reverse();
  }

  getURLLogFiltered(filter: {
    domain?: string;
    method?: string;
    status_code?: number;
    is_llm_api?: boolean;
    search?: string;
  }): URLLogEntry[] {
    let filtered = this.urlLog;

    if (filter.domain) {
      filtered = filtered.filter(e => e.host.includes(filter.domain!));
    }
    if (filter.method) {
      filtered = filtered.filter(e => e.method === filter.method);
    }
    if (filter.status_code !== undefined) {
      filtered = filtered.filter(e => e.status_code === filter.status_code);
    }
    if (filter.is_llm_api !== undefined) {
      filtered = filtered.filter(e => e.is_llm_api === filter.is_llm_api);
    }
    if (filter.search) {
      const search = filter.search.toLowerCase();
      filtered = filtered.filter(e => e.url.toLowerCase().includes(search));
    }

    return filtered.slice().reverse();
  }

  // ============ Conversation methods ============

  addConversation(conversation: Conversation): void {
    this.conversations.set(conversation.conversation_id, conversation);
  }

  getConversation(conversationId: string): Conversation | undefined {
    return this.conversations.get(conversationId);
  }

  updateConversation(conversationId: string, updates: Partial<Conversation>): void {
    const existing = this.conversations.get(conversationId);
    if (existing) {
      this.conversations.set(conversationId, { ...existing, ...updates });
    }
  }

  getAllConversations(): Conversation[] {
    return Array.from(this.conversations.values()).sort((a, b) => b.updated_at - a.updated_at);
  }

  findConversationByHash(hash: string): Conversation | undefined {
    // Hash is stored as metadata in the conversation
    return Array.from(this.conversations.values()).find(
      c => (c as any).correlationHash === hash
    );
  }

  // ============ Intercept methods ============

  setInterceptMode(mode: InterceptMode): void {
    this.interceptMode = mode;
  }

  getInterceptMode(): InterceptMode {
    return this.interceptMode;
  }

  setRulesEnabled(enabled: boolean): void {
    this.rulesEnabled = enabled;
  }

  getRulesEnabled(): boolean {
    return this.rulesEnabled;
  }

  addPendingIntercept(intercept: PendingIntercept): void {
    this.pendingIntercepts.set(intercept.flow_id, intercept);
  }

  removePendingIntercept(flowId: string): PendingIntercept | undefined {
    const intercept = this.pendingIntercepts.get(flowId);
    this.pendingIntercepts.delete(flowId);
    return intercept;
  }

  getPendingIntercepts(): PendingIntercept[] {
    return Array.from(this.pendingIntercepts.values()).sort(
      (a, b) => a.timestamp - b.timestamp
    );
  }

  // ============ Stream chunk methods ============

  addStreamChunk(flowId: string, chunk: StreamChunk): void {
    const chunks = this.streamChunks.get(flowId) || [];
    chunks.push(chunk);
    this.streamChunks.set(flowId, chunks);
  }

  getStreamChunks(flowId: string): StreamChunk[] {
    return this.streamChunks.get(flowId) || [];
  }

  clearStreamChunks(flowId: string): void {
    this.streamChunks.delete(flowId);
  }

  // ============ Refusal Rule methods ============

  addRefusalRule(rule: RefusalRule): void {
    this.refusalRules.set(rule.id, rule);
    this.saveRefusalRules();
  }

  getRefusalRule(id: string): RefusalRule | undefined {
    return this.refusalRules.get(id);
  }

  updateRefusalRule(id: string, updates: Partial<RefusalRule>): void {
    const existing = this.refusalRules.get(id);
    if (existing) {
      this.refusalRules.set(id, { ...existing, ...updates });
      this.saveRefusalRules();
    }
  }

  deleteRefusalRule(id: string): boolean {
    const deleted = this.refusalRules.delete(id);
    if (deleted) {
      this.saveRefusalRules();
    }
    return deleted;
  }

  getAllRefusalRules(): RefusalRule[] {
    return Array.from(this.refusalRules.values()).sort((a, b) => a.priority - b.priority);
  }

  // Load refusal rules from disk
  loadRefusalRules(): void {
    try {
      if (fs.existsSync(REFUSAL_RULES_FILE)) {
        const data = fs.readFileSync(REFUSAL_RULES_FILE, 'utf-8');
        const rules: RefusalRule[] = JSON.parse(data);
        this.refusalRules.clear();
        for (const rule of rules) {
          this.refusalRules.set(rule.id, rule);
        }
        console.log(`[Storage] Loaded ${rules.length} refusal rules from ${REFUSAL_RULES_FILE}`);
      } else {
        console.log(`[Storage] No refusal rules file found at ${REFUSAL_RULES_FILE}, starting with empty rules`);
      }
    } catch (error) {
      console.error(`[Storage] Failed to load refusal rules:`, error);
    }
  }

  // Save refusal rules to disk
  private saveRefusalRules(): void {
    try {
      const rules = Array.from(this.refusalRules.values());
      const dir = path.dirname(REFUSAL_RULES_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(REFUSAL_RULES_FILE, JSON.stringify(rules, null, 2));
      console.log(`[Storage] Saved ${rules.length} refusal rules to ${REFUSAL_RULES_FILE}`);
    } catch (error) {
      console.error(`[Storage] Failed to save refusal rules:`, error);
    }
  }

  // ============ Pending Refusal methods ============

  addPendingRefusal(pending: PendingRefusal): void {
    this.pendingRefusals.set(pending.id, pending);
  }

  getPendingRefusal(id: string): PendingRefusal | undefined {
    return this.pendingRefusals.get(id);
  }

  removePendingRefusal(id: string): PendingRefusal | undefined {
    const pending = this.pendingRefusals.get(id);
    this.pendingRefusals.delete(id);
    return pending;
  }

  getPendingRefusals(): PendingRefusal[] {
    return Array.from(this.pendingRefusals.values()).sort(
      (a, b) => b.timestamp - a.timestamp
    );
  }

  // ============ Persistence helpers ============

  /**
   * Persist a traffic flow to disk (fire and forget)
   */
  private persistTrafficFlow(flow: TrafficFlow): void {
    persistence.saveTrafficFlow(flow.flow_id, flow).catch(err => {
      console.error(`[Storage] Failed to persist traffic flow ${flow.flow_id}:`, err);
    });
  }

  // ============ Clear all data ============

  clear(): void {
    this.traffic.clear();
    this.conversations.clear();
    this.urlLog = [];
    this.pendingIntercepts.clear();
    this.streamChunks.clear();
    // Note: refusalRules are NOT cleared as they are configuration
    this.pendingRefusals.clear();
    // Note: filterPresets are NOT cleared as they are configuration
  }
}

export const storage = new Storage();
