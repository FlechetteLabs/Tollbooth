/**
 * WebSocket hook for real-time updates from backend
 *
 * This hook uses a singleton pattern - only one WebSocket connection
 * is created regardless of how many components call the hook.
 */

import { useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import { TrafficFlow, Conversation, PendingIntercept, PendingRefusal, InterceptMode } from '../types';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:2002';
const RECONNECT_DELAY = 3000;

interface WSMessage {
  type: string;
  data: unknown;
}

// Singleton WebSocket state (module-level)
let sharedWs: WebSocket | null = null;
let reconnectTimeout: number | null = null;
let connectionCount = 0;
let isConnecting = false;

// Store reference for message handling (set by first hook instance)
let storeRef: ReturnType<typeof useAppStore> | null = null;

function handleMessage(message: WSMessage) {
  if (!storeRef) return;

  const {
    initializeState,
    addTraffic,
    updateTraffic,
    addOrUpdateConversation,
    addPendingIntercept,
    removePendingIntercept,
    addPendingRefusal,
    removePendingRefusal,
    setInterceptMode,
    setRulesEnabled,
  } = storeRef;

  switch (message.type) {
    case 'init':
      initializeState(
        message.data as {
          traffic: TrafficFlow[];
          conversations: Conversation[];
          interceptMode: InterceptMode;
          rulesEnabled?: boolean;
          pendingIntercepts: PendingIntercept[];
          pendingRefusals?: PendingRefusal[];
        }
      );
      break;

    case 'traffic':
      addTraffic(message.data as TrafficFlow);
      break;

    case 'conversation':
      addOrUpdateConversation(message.data as Conversation);
      break;

    case 'stream_update':
      const streamData = message.data as { flow_id: string; partial: unknown };
      updateTraffic(streamData.flow_id, {});
      break;

    case 'intercept':
      addPendingIntercept(message.data as PendingIntercept);
      break;

    case 'intercept_completed':
    case 'intercept_dropped':
      const resolvedData = message.data as { flow_id: string };
      removePendingIntercept(resolvedData.flow_id);
      break;

    case 'intercept_mode_changed':
      const modeData = message.data as { mode: InterceptMode };
      setInterceptMode(modeData.mode);
      break;

    case 'rules_enabled_changed':
      const rulesData = message.data as { enabled: boolean };
      setRulesEnabled(rulesData.enabled);
      break;

    // Refusal detection messages
    case 'pending_refusal':
      addPendingRefusal(message.data as PendingRefusal);
      break;

    case 'refusal_resolved':
      const refusalData = message.data as { id: string; flow_id: string; status: string };
      removePendingRefusal(refusalData.id);
      break;

    case 'alternate_generated':
      // Update the pending refusal with the generated alternate
      // This is handled by the component that requested the generation
      break;
  }
}

function connect() {
  // Prevent multiple simultaneous connection attempts
  if (isConnecting) return;
  if (sharedWs && (sharedWs.readyState === WebSocket.OPEN || sharedWs.readyState === WebSocket.CONNECTING)) {
    return;
  }

  isConnecting = true;
  const ws = new WebSocket(WS_URL);
  sharedWs = ws;

  ws.onopen = () => {
    isConnecting = false;
    console.log('WebSocket connected');
    storeRef?.setWsConnected(true);
  };

  ws.onclose = () => {
    isConnecting = false;
    console.log('WebSocket disconnected');
    storeRef?.setWsConnected(false);
    sharedWs = null;

    // Only reconnect if there are still active consumers
    if (connectionCount > 0) {
      reconnectTimeout = window.setTimeout(() => {
        connect();
      }, RECONNECT_DELAY);
    }
  };

  ws.onerror = (error) => {
    isConnecting = false;
    console.error('WebSocket error:', error);
  };

  ws.onmessage = (event) => {
    try {
      const message: WSMessage = JSON.parse(event.data);
      handleMessage(message);
    } catch (err) {
      console.error('Failed to parse WebSocket message:', err);
    }
  };
}

export function useWebSocket() {
  const store = useAppStore();
  const mountedRef = useRef(false);

  // Keep store reference updated for message handling
  storeRef = store;

  const send = useCallback((message: object) => {
    if (sharedWs?.readyState === WebSocket.OPEN) {
      sharedWs.send(JSON.stringify(message));
    }
  }, []);

  const setInterceptModeWs = useCallback(
    (mode: InterceptMode) => {
      send({ cmd: 'set_intercept_mode', mode });
    },
    [send]
  );

  const setRulesEnabledWs = useCallback(
    (enabled: boolean) => {
      send({ cmd: 'set_rules_enabled', enabled });
    },
    [send]
  );

  const forwardIntercept = useCallback(
    (flowId: string) => {
      send({ cmd: 'forward', flow_id: flowId });
    },
    [send]
  );

  const forwardModifiedIntercept = useCallback(
    (flowId: string, modifications: object, type: 'request' | 'response' = 'request') => {
      send({ cmd: 'forward_modified', flow_id: flowId, modifications, type });
    },
    [send]
  );

  const dropIntercept = useCallback(
    (flowId: string) => {
      send({ cmd: 'drop', flow_id: flowId });
    },
    [send]
  );

  // Refusal-related commands
  const approveRefusal = useCallback(
    (refusalId: string) => {
      send({ cmd: 'approve_refusal', refusal_id: refusalId });
    },
    [send]
  );

  const modifyRefusal = useCallback(
    (refusalId: string, modifiedResponse: string) => {
      send({ cmd: 'modify_refusal', refusal_id: refusalId, modified_response: modifiedResponse });
    },
    [send]
  );

  const generateAlternate = useCallback(
    (refusalId: string) => {
      send({ cmd: 'generate_alternate', refusal_id: refusalId });
    },
    [send]
  );

  useEffect(() => {
    // Prevent double-mount in React StrictMode
    if (mountedRef.current) return;
    mountedRef.current = true;

    connectionCount++;
    connect();

    return () => {
      mountedRef.current = false;
      connectionCount--;

      // Only close if this is the last consumer
      if (connectionCount === 0) {
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }
        if (sharedWs) {
          sharedWs.close();
          sharedWs = null;
        }
      }
    };
  }, []);

  return {
    send,
    setInterceptModeWs,
    setRulesEnabledWs,
    forwardIntercept,
    forwardModifiedIntercept,
    dropIntercept,
    approveRefusal,
    modifyRefusal,
    generateAlternate,
  };
}
