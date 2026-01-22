/**
 * In-memory storage for traffic, conversations, and intercepts
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
} from './types';

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

  // Traffic methods
  addTraffic(flow: TrafficFlow): void {
    this.traffic.set(flow.flow_id, flow);
  }

  getTraffic(flowId: string): TrafficFlow | undefined {
    return this.traffic.get(flowId);
  }

  updateTraffic(flowId: string, updates: Partial<TrafficFlow>): void {
    const existing = this.traffic.get(flowId);
    if (existing) {
      this.traffic.set(flowId, { ...existing, ...updates });
    }
  }

  getAllTraffic(): TrafficFlow[] {
    return Array.from(this.traffic.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  getTrafficCount(): number {
    return this.traffic.size;
  }

  // URL Log methods
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

  // Conversation methods
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

  // Intercept methods
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

  // Stream chunk methods
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

  // Refusal Rule methods
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

  // Pending Refusal methods
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

  // Clear all data
  clear(): void {
    this.traffic.clear();
    this.conversations.clear();
    this.urlLog = [];
    this.pendingIntercepts.clear();
    this.streamChunks.clear();
    // Note: refusalRules are NOT cleared as they are configuration
    this.pendingRefusals.clear();
  }
}

export const storage = new Storage();
