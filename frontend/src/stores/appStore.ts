/**
 * Main application store using Zustand
 */

import { create } from 'zustand';
import {
  TrafficFlow,
  Conversation,
  ConversationTree,
  PendingIntercept,
  PendingRefusal,
  InterceptMode,
  View,
  URLLogEntry,
} from '../types';

export type DisplayMode = 'raw' | 'pretty' | 'aggressive' | 'insane';

// Glossopetrae seed configuration
export interface GlossopetareSeed {
  id: string;
  name: string;
  seed: string;
  active: boolean;
}

interface AppState {
  // Display settings
  displayMode: DisplayMode;
  setDisplayMode: (mode: DisplayMode) => void;

  // Current view
  currentView: View;
  setCurrentView: (view: View) => void;

  // Traffic
  traffic: Map<string, TrafficFlow>;
  addTraffic: (flow: TrafficFlow) => void;
  addTrafficBulk: (flows: TrafficFlow[]) => void;
  updateTraffic: (flowId: string, updates: Partial<TrafficFlow>) => void;
  removeTraffic: (flowId: string) => void;
  selectedTrafficId: string | null;
  setSelectedTrafficId: (id: string | null) => void;

  // Conversations
  conversations: Map<string, Conversation>;
  addOrUpdateConversation: (conversation: Conversation) => void;
  setConversationsBulk: (conversations: Conversation[]) => void;
  selectedConversationId: string | null;
  setSelectedConversationId: (id: string | null) => void;

  // Conversation Tree
  conversationTree: ConversationTree | null;
  setConversationTree: (tree: ConversationTree | null) => void;
  selectedTreeNodeId: string | null;  // Format: "conversationId:turnIndex"
  setSelectedTreeNodeId: (id: string | null) => void;
  comparisonNodeIds: [string, string] | null;  // Two node IDs to compare
  setComparisonNodeIds: (ids: [string, string] | null) => void;

  // Intercept
  interceptMode: InterceptMode;
  setInterceptMode: (mode: InterceptMode) => void;
  rulesEnabled: boolean;
  setRulesEnabled: (enabled: boolean) => void;
  pendingIntercepts: Map<string, PendingIntercept>;
  addPendingIntercept: (intercept: PendingIntercept) => void;
  removePendingIntercept: (flowId: string) => void;
  setPendingIntercepts: (intercepts: PendingIntercept[]) => void;
  selectedInterceptId: string | null;
  setSelectedInterceptId: (id: string | null) => void;

  // URL Log
  urlLog: URLLogEntry[];
  setUrlLog: (entries: URLLogEntry[]) => void;

  // Pending Refusals
  pendingRefusals: Map<string, PendingRefusal>;
  addPendingRefusal: (refusal: PendingRefusal) => void;
  removePendingRefusal: (id: string) => void;
  selectedRefusalId: string | null;
  setSelectedRefusalId: (id: string | null) => void;

  // WebSocket status
  wsConnected: boolean;
  setWsConnected: (connected: boolean) => void;

  // Glossopetrae (conlang decoder)
  glossopetraeAvailable: boolean;  // Whether the library is installed
  setGlossopetraeAvailable: (available: boolean) => void;
  glossopetraeEnabled: boolean;    // User preference to enable/disable
  setGlossopetraeEnabled: (enabled: boolean) => void;
  glossopetraeSeeds: GlossopetareSeed[];
  addGlossopetaeSeed: (seed: GlossopetareSeed) => void;
  updateGlossopetaeSeed: (id: string, updates: Partial<GlossopetareSeed>) => void;
  removeGlossopetaeSeed: (id: string) => void;
  setGlossopetraeSeeds: (seeds: GlossopetareSeed[]) => void;
  getActiveGlossopetraeSeeds: () => string[];

  // Initialize from backend
  initializeState: (data: {
    traffic: TrafficFlow[];
    conversations: Conversation[];
    interceptMode: InterceptMode;
    rulesEnabled?: boolean;
    pendingIntercepts: PendingIntercept[];
    pendingRefusals?: PendingRefusal[];
  }) => void;

  // Clear all data
  clearAll: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Display settings
  displayMode: 'pretty',
  setDisplayMode: (mode) => set({ displayMode: mode }),

  // Current view
  currentView: 'traffic',
  setCurrentView: (view) => set({ currentView: view }),

  // Traffic
  traffic: new Map(),
  addTraffic: (flow) =>
    set((state) => {
      const newTraffic = new Map(state.traffic);
      newTraffic.set(flow.flow_id, flow);
      return { traffic: newTraffic };
    }),
  addTrafficBulk: (flows) =>
    set((state) => {
      const newTraffic = new Map(state.traffic);
      for (const flow of flows) {
        newTraffic.set(flow.flow_id, flow);
      }
      return { traffic: newTraffic };
    }),
  updateTraffic: (flowId, updates) =>
    set((state) => {
      const existing = state.traffic.get(flowId);
      if (!existing) return state;
      const newTraffic = new Map(state.traffic);
      newTraffic.set(flowId, { ...existing, ...updates });
      return { traffic: newTraffic };
    }),
  removeTraffic: (flowId) =>
    set((state) => {
      const newTraffic = new Map(state.traffic);
      newTraffic.delete(flowId);
      return { traffic: newTraffic };
    }),
  selectedTrafficId: null,
  setSelectedTrafficId: (id) => set({ selectedTrafficId: id }),

  // Conversations
  conversations: new Map(),
  addOrUpdateConversation: (conversation) =>
    set((state) => {
      const newConversations = new Map(state.conversations);
      newConversations.set(conversation.conversation_id, conversation);
      return { conversations: newConversations };
    }),
  setConversationsBulk: (conversations) =>
    set((state) => {
      const newConversations = new Map(state.conversations);
      for (const conv of conversations) {
        newConversations.set(conv.conversation_id, conv);
      }
      return { conversations: newConversations };
    }),
  selectedConversationId: null,
  setSelectedConversationId: (id) => set({ selectedConversationId: id }),

  // Conversation Tree
  conversationTree: null,
  setConversationTree: (tree) => set({ conversationTree: tree }),
  selectedTreeNodeId: null,
  setSelectedTreeNodeId: (id) => set({ selectedTreeNodeId: id }),
  comparisonNodeIds: null,
  setComparisonNodeIds: (ids) => set({ comparisonNodeIds: ids }),

  // Intercept
  interceptMode: 'passthrough',
  setInterceptMode: (mode) => set({ interceptMode: mode }),
  rulesEnabled: false,
  setRulesEnabled: (enabled) => set({ rulesEnabled: enabled }),
  pendingIntercepts: new Map(),
  addPendingIntercept: (intercept) =>
    set((state) => {
      const newPending = new Map(state.pendingIntercepts);
      newPending.set(intercept.flow_id, intercept);
      return { pendingIntercepts: newPending };
    }),
  removePendingIntercept: (flowId) =>
    set((state) => {
      const newPending = new Map(state.pendingIntercepts);
      newPending.delete(flowId);
      return { pendingIntercepts: newPending };
    }),
  setPendingIntercepts: (intercepts) =>
    set(() => {
      const newPending = new Map<string, PendingIntercept>();
      for (const intercept of intercepts) {
        newPending.set(intercept.flow_id, intercept);
      }
      return { pendingIntercepts: newPending };
    }),
  selectedInterceptId: null,
  setSelectedInterceptId: (id) => set({ selectedInterceptId: id }),

  // URL Log
  urlLog: [],
  setUrlLog: (entries) => set({ urlLog: entries }),

  // Pending Refusals
  pendingRefusals: new Map(),
  addPendingRefusal: (refusal) =>
    set((state) => {
      const newPending = new Map(state.pendingRefusals);
      newPending.set(refusal.id, refusal);
      return { pendingRefusals: newPending };
    }),
  removePendingRefusal: (id) =>
    set((state) => {
      const newPending = new Map(state.pendingRefusals);
      newPending.delete(id);
      // If the removed refusal was selected, clear selection
      if (state.selectedRefusalId === id) {
        return { pendingRefusals: newPending, selectedRefusalId: null };
      }
      return { pendingRefusals: newPending };
    }),
  selectedRefusalId: null,
  setSelectedRefusalId: (id) => set({ selectedRefusalId: id }),

  // WebSocket status
  wsConnected: false,
  setWsConnected: (connected) => set({ wsConnected: connected }),

  // Glossopetrae (conlang decoder)
  glossopetraeAvailable: false,
  setGlossopetraeAvailable: (available) => set({ glossopetraeAvailable: available }),
  glossopetraeEnabled: true,  // Enabled by default when available
  setGlossopetraeEnabled: (enabled) => set({ glossopetraeEnabled: enabled }),
  glossopetraeSeeds: [],
  addGlossopetaeSeed: (seed) =>
    set((state) => ({
      glossopetraeSeeds: [...state.glossopetraeSeeds, seed],
    })),
  updateGlossopetaeSeed: (id, updates) =>
    set((state) => ({
      glossopetraeSeeds: state.glossopetraeSeeds.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    })),
  removeGlossopetaeSeed: (id) =>
    set((state) => ({
      glossopetraeSeeds: state.glossopetraeSeeds.filter((s) => s.id !== id),
    })),
  setGlossopetraeSeeds: (seeds) => set({ glossopetraeSeeds: seeds }),
  getActiveGlossopetraeSeeds: () => {
    // This is a selector, not an action - we need to access it differently
    // For now, return empty array - components should use the state directly
    return [];
  },

  // Initialize from backend
  initializeState: (data) =>
    set(() => {
      const traffic = new Map<string, TrafficFlow>();
      for (const flow of data.traffic) {
        traffic.set(flow.flow_id, flow);
      }

      const conversations = new Map<string, Conversation>();
      for (const conv of data.conversations) {
        conversations.set(conv.conversation_id, conv);
      }

      const pendingIntercepts = new Map<string, PendingIntercept>();
      for (const pending of data.pendingIntercepts) {
        pendingIntercepts.set(pending.flow_id, pending);
      }

      const pendingRefusals = new Map<string, PendingRefusal>();
      for (const refusal of data.pendingRefusals || []) {
        pendingRefusals.set(refusal.id, refusal);
      }

      return {
        traffic,
        conversations,
        interceptMode: data.interceptMode,
        rulesEnabled: data.rulesEnabled ?? false,
        pendingIntercepts,
        pendingRefusals,
      };
    }),

  // Clear all data
  clearAll: () =>
    set({
      traffic: new Map(),
      conversations: new Map(),
      conversationTree: null,
      selectedTreeNodeId: null,
      comparisonNodeIds: null,
      pendingIntercepts: new Map(),
      pendingRefusals: new Map(),
      urlLog: [],
      selectedTrafficId: null,
      selectedConversationId: null,
      selectedInterceptId: null,
      selectedRefusalId: null,
    }),
}));
