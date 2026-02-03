/**
 * Conversation detail view - shows full conversation with messages
 */

import { useState } from 'react';
import { clsx } from 'clsx';
import { useAppStore } from '../../stores/appStore';
import { MessageBubble } from './MessageBubble';
import { ConversationTurn, ContentBlock } from '../../types';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:2000';

function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleTimeString();
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString();
}

interface TurnViewProps {
  turn: ConversationTurn;
  turnIndex: number;
}

function TurnView({ turn, turnIndex }: TurnViewProps) {
  const [expanded, setExpanded] = useState(true);
  const [showOriginal, setShowOriginal] = useState(false);

  const hasModifications = turn.request_modified || turn.response_modified;

  // Select which data to display based on toggle
  const displayRequest = showOriginal && turn.original_request ? turn.original_request : turn.request;
  const displayResponse = showOriginal && turn.original_response ? turn.original_response : turn.response;

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
        {turn.request_modified && (
          <span className="px-2 py-0.5 rounded text-xs bg-blue-600 text-white">
            Request Modified
          </span>
        )}
        {turn.response_modified && (
          <span className="px-2 py-0.5 rounded text-xs bg-purple-600 text-white">
            Response Modified
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
          {/* Original/Modified toggle */}
          {hasModifications && (
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs text-inspector-muted">View:</span>
              <button
                onClick={() => setShowOriginal(false)}
                className={clsx(
                  'px-2 py-1 text-xs rounded',
                  !showOriginal
                    ? 'bg-inspector-accent text-white'
                    : 'bg-inspector-surface border border-inspector-border hover:border-inspector-accent'
                )}
              >
                Modified (Sent)
              </button>
              <button
                onClick={() => setShowOriginal(true)}
                className={clsx(
                  'px-2 py-1 text-xs rounded',
                  showOriginal
                    ? 'bg-inspector-accent text-white'
                    : 'bg-inspector-surface border border-inspector-border hover:border-inspector-accent'
                )}
              >
                Original
              </button>
            </div>
          )}

          {/* Request messages */}
          {displayRequest.messages.map((msg, idx) => (
            <MessageBubble key={`req-${idx}`} message={msg} />
          ))}

          {/* Response */}
          {displayResponse && displayResponse.content.length > 0 && (
            <div className="mt-4 pt-4 border-t border-inspector-border">
              <div className="text-xs font-semibold text-green-400 mb-2">
                ASSISTANT RESPONSE
                {displayResponse.stop_reason && (
                  <span className="ml-2 text-inspector-muted">
                    (stop: {displayResponse.stop_reason})
                  </span>
                )}
              </div>
              <div className="bg-inspector-surface border border-inspector-border rounded-lg p-3">
                {displayResponse.content.map((block: ContentBlock, idx: number) => {
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
  const [exporting, setExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const handleExport = async (format: 'json' | 'markdown' | 'html') => {
    if (!selectedConversationId) return;
    setExporting(true);
    setShowExportMenu(false);
    try {
      const res = await fetch(`${API_BASE}/api/conversations/${selectedConversationId}/export?format=${format}`);
      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const ext = format === 'markdown' ? 'md' : format;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `conversation-${selectedConversationId.slice(0, 8)}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

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
                : conversation.provider === 'ollama'
                ? 'bg-purple-600'
                : 'bg-gray-600'
            )}
          >
            {conversation.provider}
          </span>
          <span className="font-mono text-sm">{conversation.model}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={exporting}
              className="px-3 py-1 rounded text-sm bg-inspector-surface border border-inspector-border hover:border-inspector-accent disabled:opacity-50"
            >
              {exporting ? 'Exporting...' : 'Export ▼'}
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 bg-inspector-surface border border-inspector-border rounded shadow-lg z-10 min-w-[140px]">
                <button
                  onClick={() => handleExport('json')}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-inspector-accent/20"
                >
                  JSON
                </button>
                <button
                  onClick={() => handleExport('markdown')}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-inspector-accent/20"
                >
                  Markdown
                </button>
                <button
                  onClick={() => handleExport('html')}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-inspector-accent/20"
                >
                  HTML
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => setSelectedConversationId(null)}
            className="text-inspector-muted hover:text-inspector-text"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Info bar */}
      <div className="shrink-0 flex items-center gap-4 px-4 py-2 bg-inspector-surface text-sm text-inspector-muted border-b border-inspector-border">
        <span>{conversation.turns.length} turns</span>
        <span>{conversation.message_count} messages</span>
        <span>Started: {formatDate(conversation.created_at)} {formatTime(conversation.created_at)}</span>
        {conversation.turns.length > 0 && conversation.turns[conversation.turns.length - 1].response?.usage && (
          <span className="ml-auto">
            Total tokens: {conversation.turns.reduce((sum, t) => sum + (t.response?.usage?.input_tokens || 0), 0)} in / {conversation.turns.reduce((sum, t) => sum + (t.response?.usage?.output_tokens || 0), 0)} out
          </span>
        )}
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
