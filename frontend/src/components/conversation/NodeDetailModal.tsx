/**
 * Node Detail Modal - scrollable conversation thread with branch selectors
 * Renders the entire branch path as a scrollable list, auto-scrolls to the
 * clicked node, and shows branch selector buttons at fork points.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { clsx } from 'clsx';
import { ConversationTreeNode } from '../../types';
import { Modal } from '../shared/Modal';
import { AnnotationPanel } from '../shared/AnnotationPanel';

interface NodeDetailModalProps {
  node: ConversationTreeNode;           // The node that was clicked (for auto-scroll)
  onClose: () => void;
  branchPath: ConversationTreeNode[];   // Full path from root to leaf
  onSelectForComparison?: () => void;
  isComparisonCandidate?: boolean;
  onSetAsRoot?: () => void;
  isCurrentViewRoot?: boolean;
  onBranchSelect?: (parentNodeId: string, childIndex: number) => void;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleTimeString();
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString();
}

/**
 * Individual message bubble in the conversation thread
 */
function MessageBubble({
  msgNode,
  isHighlighted,
  scrollRef,
}: {
  msgNode: ConversationTreeNode;
  isHighlighted: boolean;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const isUser = msgNode.role === 'user';
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [suggestionExpanded, setSuggestionExpanded] = useState(false);
  const isLikelySuggestion = msgNode.is_likely_suggestion;

  // Likely-suggestion messages are hidden by default with a toggle
  if (isLikelySuggestion && !suggestionExpanded) {
    return (
      <div
        ref={isHighlighted ? scrollRef : undefined}
        className="rounded-lg border border-yellow-600/20 bg-yellow-900/5 px-4 py-2 transition-all"
      >
        <button
          onClick={() => setSuggestionExpanded(true)}
          className="flex items-center gap-2 text-xs text-yellow-500 hover:text-yellow-400 transition-colors w-full"
        >
          <span className="text-[10px]">{'\u25B6'}</span>
          <span className="font-semibold">Hidden: likely a prompt suggestion</span>
          <span className="text-inspector-muted font-normal">
            ({msgNode.full_message.length} chars) - click to show
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={isHighlighted ? scrollRef : undefined}
      className={clsx(
        'rounded-lg border p-4 transition-all',
        isHighlighted && 'ring-2 ring-cyan-400',
        isLikelySuggestion
          ? 'bg-yellow-900/5 border-yellow-600/20'
          : isUser
            ? 'bg-blue-900/10 border-blue-500/30'
            : 'bg-green-900/10 border-green-500/30'
      )}
    >
      {/* Message header */}
      <div className="flex flex-wrap items-center gap-2 text-sm mb-2">
        {isLikelySuggestion ? (
          <span className="px-2 py-0.5 rounded text-xs font-bold text-white bg-yellow-600">
            SUGGESTION?
          </span>
        ) : (
          <span className={clsx(
            'px-2 py-0.5 rounded text-xs font-bold text-white',
            isUser ? 'bg-blue-600' : 'bg-green-600'
          )}>
            {isUser ? 'USER' : 'ASSISTANT'}
          </span>
        )}
        <span className={clsx(
          'px-2 py-0.5 rounded text-xs font-bold text-white',
          msgNode.provider === 'anthropic' ? 'bg-orange-600' :
          msgNode.provider === 'openai' ? 'bg-green-600' :
          msgNode.provider === 'google' ? 'bg-blue-600' :
          msgNode.provider === 'ollama' ? 'bg-purple-600' :
          'bg-gray-600'
        )}>
          {msgNode.provider}
        </span>
        <span className="font-mono text-xs text-inspector-muted">{msgNode.model}</span>
        <span className="text-xs text-inspector-muted">
          {formatDate(msgNode.timestamp)} {formatTime(msgNode.timestamp)}
        </span>
        <span className="text-xs text-inspector-muted">#{msgNode.message_index + 1}</span>
        {msgNode.is_modified && (
          <span className="px-2 py-0.5 rounded text-xs bg-orange-600 text-white">Modified</span>
        )}
        {msgNode.has_annotation && (
          <span className="text-blue-400 text-xs" title="Has annotation">A</span>
        )}
        {msgNode.tags && msgNode.tags.length > 0 && (
          <span className="text-cyan-400 text-xs" title={`Tags: ${msgNode.tags.join(', ')}`}>
            T{msgNode.tags.length}
          </span>
        )}
        {isLikelySuggestion && (
          <button
            onClick={() => setSuggestionExpanded(false)}
            className="text-xs text-yellow-500 hover:text-yellow-400 ml-auto"
          >
            hide
          </button>
        )}
      </div>

      {/* Thinking content (collapsible) */}
      {msgNode.thinking && (
        <div className="mb-2">
          <button
            onClick={() => setThinkingExpanded(!thinkingExpanded)}
            className="flex items-center gap-2 text-xs font-semibold text-purple-400 hover:text-purple-300 transition-colors"
          >
            <span className="text-[10px]">{thinkingExpanded ? '\u25BC' : '\u25B6'}</span>
            Thinking
            <span className="text-inspector-muted font-normal">
              ({msgNode.thinking.length.toLocaleString()} chars)
            </span>
          </button>
          {thinkingExpanded && (
            <div className="mt-2 border rounded-lg p-3 max-h-48 overflow-y-auto bg-purple-900/10 border-purple-500/30">
              <pre className="text-sm whitespace-pre-wrap break-words text-purple-300/80 italic">
                {msgNode.thinking}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Message content */}
      <pre className={clsx(
        'text-sm whitespace-pre-wrap break-words',
        isLikelySuggestion ? 'text-inspector-muted italic' : 'text-inspector-text'
      )}>
        {msgNode.full_message || '(empty)'}
      </pre>
    </div>
  );
}

/**
 * Inline likely-suggestion toggle (collapsed by default)
 */
function LikelySuggestionToggle({
  suggestion,
}: {
  suggestion: { content: string; thinking?: string; timestamp: number };
}) {
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <div className="rounded-lg border border-yellow-600/20 bg-yellow-900/5 px-4 py-2 transition-all">
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-2 text-xs text-yellow-500 hover:text-yellow-400 transition-colors w-full"
        >
          <span className="text-[10px]">{'\u25B6'}</span>
          <span className="font-semibold">Hidden: likely a prompt suggestion</span>
          <span className="text-inspector-muted font-normal">
            ({suggestion.content.length} chars) - click to show
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-yellow-600/20 bg-yellow-900/5 p-4 transition-all">
      <div className="flex items-center justify-between mb-2">
        <span className="px-2 py-0.5 rounded text-xs font-bold text-white bg-yellow-600">
          SUGGESTION?
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-inspector-muted">
            {formatDate(suggestion.timestamp)} {formatTime(suggestion.timestamp)}
          </span>
          <button
            onClick={() => setExpanded(false)}
            className="text-xs text-yellow-500 hover:text-yellow-400"
          >
            hide
          </button>
        </div>
      </div>
      {suggestion.thinking && (
        <div className="mb-2 border rounded-lg p-2 bg-purple-900/10 border-purple-500/30">
          <pre className="text-xs whitespace-pre-wrap break-words text-purple-300/80 italic">
            {suggestion.thinking}
          </pre>
        </div>
      )}
      <pre className="text-sm whitespace-pre-wrap break-words text-inspector-muted italic">
        {suggestion.content}
      </pre>
    </div>
  );
}

/**
 * Display for an alternate loop (merge-back path)
 */
function AlternateLoopDisplay({
  loop,
}: {
  loop: { messages: Array<{ role: string; content: string }>; merge_point_id: string };
}) {
  const [expanded, setExpanded] = useState(false);
  const msgCount = loop.messages.length;

  if (!expanded) {
    return (
      <div className="rounded-lg border border-yellow-600/20 bg-yellow-900/5 px-4 py-2 transition-all">
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-2 text-xs text-yellow-500 hover:text-yellow-400 transition-colors w-full"
        >
          <span className="text-sm">{'\u27F2'}</span>
          <span className="font-semibold">Alternate path</span>
          <span className="text-inspector-muted font-normal">
            ({msgCount} message{msgCount !== 1 ? 's' : ''}) - click to expand
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-yellow-600/20 bg-yellow-900/5 p-4 transition-all">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-yellow-400">{'\u27F2'}</span>
          <span className="px-2 py-0.5 rounded text-xs font-bold text-white bg-yellow-600">
            ALTERNATE PATH
          </span>
          <span className="text-xs text-inspector-muted">
            {msgCount} message{msgCount !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={() => setExpanded(false)}
          className="text-xs text-yellow-500 hover:text-yellow-400"
        >
          collapse
        </button>
      </div>
      <div className="border-l-4 border-yellow-600/30 pl-3 space-y-2">
        {loop.messages.map((msg, mIdx) => (
          <div key={mIdx} className="text-sm">
            <span className={clsx(
              'text-xs font-bold mr-2',
              msg.role === 'user' ? 'text-blue-400' : 'text-green-400'
            )}>
              {msg.role === 'user' ? 'USER' : 'ASSISTANT'}
            </span>
            <pre className="inline whitespace-pre-wrap break-words text-inspector-muted">
              {msg.content.length > 300 ? msg.content.slice(0, 300) + '...' : msg.content}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Branch selector shown at fork points
 */
function BranchSelector({
  parentNode,
  selectedChildId,
  onSelect,
}: {
  parentNode: ConversationTreeNode;
  selectedChildId?: string;
  onSelect: (childIndex: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 py-2 px-3 my-1 bg-yellow-900/10 border border-yellow-600/20 rounded-lg">
      <span className="text-xs text-yellow-400 font-semibold shrink-0">
        Branch ({parentNode.children.length} paths):
      </span>
      <div className="flex flex-wrap gap-1">
        {parentNode.children.map((child, idx) => {
          const isSelected = child.node_id === selectedChildId;
          return (
            <button
              key={child.node_id}
              onClick={() => onSelect(idx)}
              className={clsx(
                'px-2 py-1 rounded text-xs transition-colors',
                isSelected
                  ? 'bg-yellow-600 text-white'
                  : 'bg-inspector-surface border border-inspector-border text-inspector-muted hover:border-yellow-500 hover:text-yellow-400'
              )}
              title={child.full_message.slice(0, 100)}
            >
              <span className={clsx(
                'font-bold mr-1',
                child.role === 'user' ? 'text-blue-400' : 'text-green-400'
              )}>
                {child.role === 'user' ? 'U' : 'A'}
              </span>
              {child.message.slice(0, 30)}{child.message.length > 30 ? '...' : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function NodeDetailModal({
  node,
  onClose,
  branchPath,
  onSelectForComparison,
  isComparisonCandidate = false,
  onSetAsRoot,
  isCurrentViewRoot = false,
  onBranchSelect,
}: NodeDetailModalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to clicked node on mount
  useEffect(() => {
    // Small delay to let the modal render
    const timer = setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleBranchSelect = useCallback((parentNodeId: string, childIndex: number) => {
    if (onBranchSelect) {
      onBranchSelect(parentNodeId, childIndex);
    }
  }, [onBranchSelect]);

  return (
    <Modal isOpen={true} onClose={onClose} title="Conversation Branch" maxWidth="max-w-6xl">
      <div className="flex flex-col" style={{ maxHeight: 'calc(80vh - 120px)' }}>
        {/* Summary header */}
        <div className="pb-3 mb-3 border-b border-inspector-border flex flex-wrap items-center gap-3 text-sm shrink-0">
          <span className="text-inspector-muted">
            {branchPath.length} messages in branch
          </span>
          <span className="text-inspector-muted">|</span>
          <span className="font-mono text-inspector-muted text-xs">
            {node.conversation_id.slice(0, 8)}
          </span>

          {/* Actions */}
          <div className="ml-auto flex items-center gap-2">
            {onSetAsRoot && (
              <button
                onClick={() => {
                  onSetAsRoot();
                  onClose();
                }}
                className={clsx(
                  'px-3 py-1 rounded text-xs transition-colors',
                  isCurrentViewRoot
                    ? 'bg-purple-600 text-white'
                    : 'bg-inspector-surface border border-inspector-border hover:border-purple-500 text-inspector-muted'
                )}
              >
                {isCurrentViewRoot ? 'Current Root' : 'Set as Root'}
              </button>
            )}
            {onSelectForComparison && (
              <button
                onClick={() => {
                  onSelectForComparison();
                  onClose();
                }}
                className={clsx(
                  'px-3 py-1 rounded text-xs transition-colors',
                  isComparisonCandidate
                    ? 'bg-cyan-600 text-white'
                    : 'bg-inspector-surface border border-inspector-border hover:border-cyan-500 text-inspector-muted'
                )}
              >
                {isComparisonCandidate ? 'Selected' : 'Compare'}
              </button>
            )}
          </div>
        </div>

        {/* Scrollable message thread */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
          {branchPath.map((msgNode, idx) => (
            <div key={msgNode.node_id}>
              {/* Message bubble */}
              <MessageBubble
                msgNode={msgNode}
                isHighlighted={msgNode.node_id === node.node_id}
                scrollRef={scrollRef}
              />

              {/* Inline likely suggestions */}
              {msgNode.likely_suggestions && msgNode.likely_suggestions.length > 0 && (
                <div className="space-y-2 mt-2">
                  {msgNode.likely_suggestions.map((suggestion, sIdx) => (
                    <LikelySuggestionToggle key={sIdx} suggestion={suggestion} />
                  ))}
                </div>
              )}

              {/* Alternate loops (merge-back paths) */}
              {msgNode.alternate_loops && msgNode.alternate_loops.length > 0 && (
                <div className="space-y-2 mt-2">
                  {msgNode.alternate_loops.map((loop, loopIdx) => (
                    <AlternateLoopDisplay key={loopIdx} loop={loop} />
                  ))}
                </div>
              )}

              {/* Branch selector if fork point */}
              {msgNode.children.length > 1 && (
                <BranchSelector
                  parentNode={msgNode}
                  selectedChildId={branchPath[idx + 1]?.node_id}
                  onSelect={(childIndex) => handleBranchSelect(msgNode.node_id, childIndex)}
                />
              )}

              {/* Turn-level annotation panel */}
              <div className="mt-1">
                <AnnotationPanel
                  targetType="conversation"
                  targetId={msgNode.flow_id}
                  conversationId={msgNode.conversation_id}
                  turnId={msgNode.turn_id}
                  collapsible={true}
                  defaultCollapsed={true}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="pt-3 mt-3 border-t border-inspector-border flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded text-sm bg-inspector-accent text-white hover:bg-opacity-90"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
