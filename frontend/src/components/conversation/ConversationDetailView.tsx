/**
 * Conversation detail view - shows full conversation with messages
 */

import { useState, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { useAppStore } from '../../stores/appStore';
import { MessageBubble } from './MessageBubble';
import { ConversationTurn, ContentBlock, LLMMessage, ParsedLLMResponse } from '../../types';

type ViewMode = 'modified' | 'original' | 'compare';

/**
 * Compare two messages to check if they differ
 */
function messagesEqual(a: LLMMessage, b: LLMMessage): boolean {
  if (a.role !== b.role) return false;

  // Compare content
  if (typeof a.content === 'string' && typeof b.content === 'string') {
    return a.content === b.content;
  }

  // If types differ, not equal
  if (typeof a.content !== typeof b.content) return false;

  // Both are arrays - do deep comparison
  return JSON.stringify(a.content) === JSON.stringify(b.content);
}

/**
 * Compare two content blocks for equality
 */
function contentBlocksEqual(a: ContentBlock, b: ContentBlock): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Hook to track container width for responsive layout
 */
function useContainerWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!ref.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}

/**
 * Helper component for rendering response content blocks
 */
function ResponseContentBlock({ block }: { block: ContentBlock }) {
  if (block.type === 'text') {
    return (
      <div className="whitespace-pre-wrap break-all text-sm">
        {block.text}
      </div>
    );
  }
  if (block.type === 'thinking') {
    return (
      <div className="bg-purple-900/30 border border-purple-700 rounded-lg p-3 my-2">
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
      <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-3 my-2">
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
}

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
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);

  const hasModifications = turn.request_modified || turn.response_modified;

  // Default to 'compare' when modifications exist, otherwise 'modified'
  const [viewMode, setViewMode] = useState<ViewMode>(hasModifications ? 'compare' : 'modified');

  // Responsive: use horizontal layout when width > 700px
  const useHorizontalLayout = containerWidth > 700;

  // Select which data to display based on toggle
  const displayRequest = viewMode === 'original' && turn.original_request ? turn.original_request : turn.request;
  const displayResponse = viewMode === 'original' && turn.original_response ? turn.original_response : turn.response;

  // Get original data for comparison
  const originalRequest = turn.original_request || turn.request;
  const originalResponse = turn.original_response || turn.response;
  const modifiedRequest = turn.request;
  const modifiedResponse = turn.response;

  /**
   * Check if a specific message at index was modified (request messages)
   */
  function isMessageModified(idx: number): boolean {
    if (!turn.request_modified || !turn.original_request) return false;
    const orig = turn.original_request.messages[idx];
    const mod = turn.request.messages[idx];
    if (!orig || !mod) return true; // Different lengths = modified
    return !messagesEqual(orig, mod);
  }

  /**
   * Check if a specific response content block was modified
   */
  function isResponseBlockModified(idx: number): boolean {
    if (!turn.response_modified || !turn.original_response) return false;
    const orig = turn.original_response.content[idx];
    const mod = turn.response?.content[idx];
    if (!orig || !mod) return true;
    return !contentBlocksEqual(orig, mod);
  }

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
        <div ref={containerRef} className="pl-6">
          {/* View mode toggle */}
          {hasModifications && (
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs text-inspector-muted">View:</span>
              <button
                onClick={() => setViewMode('compare')}
                className={clsx(
                  'px-2 py-1 text-xs rounded',
                  viewMode === 'compare'
                    ? 'bg-inspector-accent text-white'
                    : 'bg-inspector-surface border border-inspector-border hover:border-inspector-accent'
                )}
              >
                Compare
              </button>
              <button
                onClick={() => setViewMode('modified')}
                className={clsx(
                  'px-2 py-1 text-xs rounded',
                  viewMode === 'modified'
                    ? 'bg-inspector-accent text-white'
                    : 'bg-inspector-surface border border-inspector-border hover:border-inspector-accent'
                )}
              >
                Modified (Sent)
              </button>
              <button
                onClick={() => setViewMode('original')}
                className={clsx(
                  'px-2 py-1 text-xs rounded',
                  viewMode === 'original'
                    ? 'bg-inspector-accent text-white'
                    : 'bg-inspector-surface border border-inspector-border hover:border-inspector-accent'
                )}
              >
                Original
              </button>
            </div>
          )}

          {/* Request messages */}
          {viewMode === 'compare' && turn.request_modified ? (
            // Compare view - show differences
            <div className="space-y-4">
              {modifiedRequest.messages.map((modMsg, idx) => {
                const origMsg = originalRequest.messages[idx];
                const isDifferent = !origMsg || !messagesEqual(origMsg, modMsg);

                if (!isDifferent && origMsg) {
                  // Message unchanged - render normally
                  return <MessageBubble key={`req-${idx}`} message={modMsg} />;
                }

                // Message differs - render comparison
                return (
                  <div
                    key={`req-${idx}`}
                    className={clsx(
                      'gap-2',
                      useHorizontalLayout ? 'flex' : 'space-y-2'
                    )}
                  >
                    {origMsg && (
                      <div className={useHorizontalLayout ? 'flex-1 min-w-0' : ''}>
                        <MessageBubble
                          message={origMsg}
                          label="Original"
                          variant="original"
                        />
                      </div>
                    )}
                    <div className={useHorizontalLayout ? 'flex-1 min-w-0' : ''}>
                      <MessageBubble
                        message={modMsg}
                        label="Modified"
                        variant="modified"
                        isModified
                      />
                    </div>
                  </div>
                );
              })}
              {/* Handle case where original has more messages than modified */}
              {originalRequest.messages.length > modifiedRequest.messages.length &&
                originalRequest.messages.slice(modifiedRequest.messages.length).map((origMsg, idx) => (
                  <div
                    key={`req-removed-${idx}`}
                    className={clsx(
                      'gap-2',
                      useHorizontalLayout ? 'flex' : 'space-y-2'
                    )}
                  >
                    <div className={useHorizontalLayout ? 'flex-1 min-w-0' : ''}>
                      <MessageBubble
                        message={origMsg}
                        label="Removed"
                        variant="original"
                      />
                    </div>
                    {useHorizontalLayout && (
                      <div className="flex-1 min-w-0 flex items-center justify-center text-inspector-muted text-sm italic">
                        (removed)
                      </div>
                    )}
                  </div>
                ))
              }
            </div>
          ) : (
            // Modified or Original view
            displayRequest.messages.map((msg, idx) => (
              <MessageBubble
                key={`req-${idx}`}
                message={msg}
                isModified={viewMode === 'modified' && isMessageModified(idx)}
              />
            ))
          )}

          {/* Response */}
          {viewMode === 'compare' && turn.response_modified && modifiedResponse && originalResponse ? (
            // Compare view for response
            <div className="mt-4 pt-4 border-t border-inspector-border">
              <div className="text-xs font-semibold text-green-400 mb-2">
                ASSISTANT RESPONSE
                {modifiedResponse.stop_reason && (
                  <span className="ml-2 text-inspector-muted">
                    (stop: {modifiedResponse.stop_reason})
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {modifiedResponse.content.map((modBlock: ContentBlock, idx: number) => {
                  const origBlock = originalResponse.content[idx];
                  const isDifferent = !origBlock || !contentBlocksEqual(origBlock, modBlock);

                  if (!isDifferent && origBlock) {
                    // Block unchanged - render normally
                    return (
                      <div key={idx} className="bg-inspector-surface border border-inspector-border rounded-lg p-3">
                        <ResponseContentBlock block={modBlock} />
                      </div>
                    );
                  }

                  // Block differs - render comparison
                  return (
                    <div
                      key={idx}
                      className={clsx(
                        'gap-2',
                        useHorizontalLayout ? 'flex' : 'space-y-2'
                      )}
                    >
                      {origBlock && (
                        <div className={clsx(
                          'bg-inspector-surface border border-gray-600 border-l-4 border-l-gray-500 rounded-lg p-3 opacity-75',
                          useHorizontalLayout ? 'flex-1 min-w-0' : ''
                        )}>
                          <div className="text-[10px] text-gray-400 mb-1 font-semibold">ORIGINAL</div>
                          <ResponseContentBlock block={origBlock} />
                        </div>
                      )}
                      <div className={clsx(
                        'bg-inspector-surface border border-orange-700 border-l-4 border-l-orange-500 rounded-lg p-3',
                        useHorizontalLayout ? 'flex-1 min-w-0' : ''
                      )}>
                        <div className="text-[10px] text-orange-400 mb-1 font-semibold flex items-center gap-1">
                          <span className="text-orange-500">⚡</span> MODIFIED
                        </div>
                        <ResponseContentBlock block={modBlock} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : displayResponse && displayResponse.content.length > 0 ? (
            // Modified or Original view
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
                  const showModified = viewMode === 'modified' && isResponseBlockModified(idx);
                  return (
                    <div key={idx} className="relative">
                      {showModified && (
                        <span className="absolute -left-1 top-0 text-orange-500 text-xs" title="Modified">⚡</span>
                      )}
                      <ResponseContentBlock block={block} />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
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
