/**
 * Main application store using Zustand
 */

import { create } from 'zustand';
import {
  TrafficFlow,
  Conversation,
  PendingIntercept,
  PendingRefusal,
  InterceptMode,
  View,
  URLLogEntry,
} from '../types';

export type DisplayMode = 'raw' | 'pretty' | 'aggressive' | 'insane';

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
  updateTraffic: (flowId: string, updates: Partial<TrafficFlow>) => void;
  selectedTrafficId: string | null;
  setSelectedTrafficId: (id: string | null) => void;

  // Conversations
  conversations: Map<string, Conversation>;
  addOrUpdateConversation: (conversation: Conversation) => void;
  selectedConversationId: string | null;
  setSelectedConversationId: (id: string | null) => void;

  // Intercept
  interceptMode: InterceptMode;
  setInterceptMode: (mode: InterceptMode) => void;
  rulesEnabled: boolean;
  setRulesEnabled: (enabled: boolean) => void;
  pendingIntercepts: Map<string, PendingIntercept>;
  addPendingIntercept: (intercept: PendingIntercept) => void;
  removePendingIntercept: (flowId: string) => void;
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
  updateTraffic: (flowId, updates) =>
    set((state) => {
      const existing = state.traffic.get(flowId);
      if (!existing) return state;
      const newTraffic = new Map(state.traffic);
      newTraffic.set(flowId, { ...existing, ...updates });
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
  selectedConversationId: null,
  setSelectedConversationId: (id) => set({ selectedConversationId: id }),

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
      pendingIntercepts: new Map(),
      pendingRefusals: new Map(),
      urlLog: [],
      selectedTrafficId: null,
      selectedConversationId: null,
      selectedInterceptId: null,
      selectedRefusalId: null,
    }),
}));
