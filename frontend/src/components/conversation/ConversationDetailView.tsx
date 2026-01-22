/**
 * Conversation detail view - shows full conversation with messages
 */

import { useState } from 'react';
import { clsx } from 'clsx';
import { useAppStore } from '../../stores/appStore';
import { MessageBubble } from './MessageBubble';
import { ConversationTurn, ContentBlock } from '../../types';

function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleTimeString();
}

interface TurnViewProps {
  turn: ConversationTurn;
  turnIndex: number;
}

function TurnView({ turn, turnIndex }: TurnViewProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border-b border-inspector-border pb-4 mb-4">
      {/* Turn header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 mb-3 text-left"
      >
        <span className="text-inspector-muted">{expanded ? '▼' : '▶'}</span>
        <span className="font-semibold text-sm">Turn {turnIndex + 1}</span>
        <span className="text-xs text-inspector-muted">
          {formatTime(turn.timestamp)}
        </span>
        {turn.streaming && !turn.response && (
          <span className="px-2 py-0.5 rounded text-xs bg-yellow-600 text-white animate-pulse">
            Streaming...
          </span>
        )}
        {turn.refusal?.detected && (
          <span className={clsx(
            'px-2 py-0.5 rounded text-xs',
            turn.refusal.was_modified ? 'bg-purple-600 text-white' : 'bg-orange-600 text-white'
          )}>
            {turn.refusal.was_modified
              ? `Refusal Modified (${(turn.refusal.confidence * 100).toFixed(0)}%)`
              : `Refusal Detected (${(turn.refusal.confidence * 100).toFixed(0)}%)`}
          </span>
        )}
        {turn.response?.usage && (
          <span className="ml-auto text-xs text-inspector-muted">
            {turn.response.usage.input_tokens} in / {turn.response.usage.output_tokens} out
          </span>
        )}
      </button>

      {expanded && (
        <div className="pl-6">
          {/* Request messages */}
          {turn.request.messages.map((msg, idx) => (
            <MessageBubble key={`req-${idx}`} message={msg} />
          ))}

          {/* Response */}
          {turn.response && turn.response.content.length > 0 && (
            <div className="mt-4 pt-4 border-t border-inspector-border">
              <div className="text-xs font-semibold text-green-400 mb-2">
                ASSISTANT RESPONSE
                {turn.response.stop_reason && (
                  <span className="ml-2 text-inspector-muted">
                    (stop: {turn.response.stop_reason})
                  </span>
                )}
              </div>
              <div className="bg-inspector-surface border border-inspector-border rounded-lg p-3">
                {turn.response.content.map((block: ContentBlock, idx: number) => {
                  if (block.type === 'text') {
                    return (
                      <div key={idx} className="whitespace-pre-wrap break-all text-sm">
                        {block.text}
                      </div>
                    );
                  }
                  if (block.type === 'thinking') {
                    return (
                      <div
                        key={idx}
                        className="bg-purple-900/30 border border-purple-700 rounded-lg p-3 my-2"
                      >
                        <div className="text-xs text-purple-400 font-semibold mb-1">
                          Thinking
                        </div>
                        <div className="text-sm whitespace-pre-wrap break-all opacity-80">
                          {block.thinking}
                        </div>
                      </div>
                    );
                  }
                  if (block.type === 'tool_use') {
                    return (
                      <div
                        key={idx}
                        className="bg-blue-900/30 border border-blue-700 rounded-lg p-3 my-2"
                      >
                        <div className="text-xs text-blue-400 font-semibold mb-1">
                          Tool Use: {block.name}
                        </div>
                        <pre className="text-sm font-mono whitespace-pre-wrap break-all">
                          {JSON.stringify(block.input, null, 2)}
                        </pre>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ConversationDetailView() {
  const { selectedConversationId, conversations, setSelectedConversationId } = useAppStore();

  if (!selectedConversationId) {
    return (
      <div className="h-full flex items-center justify-center text-inspector-muted border-l border-inspector-border">
        <p>Select a conversation to view details</p>
      </div>
    );
  }

  const conversation = conversations.get(selectedConversationId);
  if (!conversation) {
    return (
      <div className="h-full flex items-center justify-center text-inspector-muted border-l border-inspector-border">
        <p>Conversation not found</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col border-l border-inspector-border min-h-0 min-w-0 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between p-4 border-b border-inspector-border">
        <div className="flex items-center gap-3">
          <span
            className={clsx(
              'px-2 py-0.5 rounded text-xs font-bold text-white',
              conversation.provider === 'anthropic'
                ? 'bg-orange-600'
                : conversation.provider === 'openai'
                ? 'bg-green-600'
                : conversation.provider === 'google'
                ? 'bg-blue-600'
                : 'bg-gray-600'
            )}
          >
            {conversation.provider}
          </span>
          <span className="font-mono text-sm">{conversation.model}</span>
        </div>
        <button
          onClick={() => setSelectedConversationId(null)}
          className="text-inspector-muted hover:text-inspector-text"
        >
          ✕
        </button>
      </div>

      {/* Info bar */}
      <div className="shrink-0 flex items-center gap-4 px-4 py-2 bg-inspector-surface text-sm text-inspector-muted border-b border-inspector-border">
        <span>{conversation.turns.length} turns</span>
        <span>{conversation.message_count} messages</span>
        <span>Started: {formatTime(conversation.created_at)}</span>
      </div>

      {/* Turns */}
      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden p-4">
        {conversation.turns.map((turn, idx) => (
          <TurnView key={turn.turn_id} turn={turn} turnIndex={idx} />
        ))}
      </div>
    </div>
  );
}
