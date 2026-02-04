/**
 * Node Detail Modal - shows full content of a tree node (single message)
 */

import { useState } from 'react';
import { clsx } from 'clsx';
import { ConversationTreeNode } from '../../types';
import { Modal } from '../shared/Modal';

interface NodeDetailModalProps {
  node: ConversationTreeNode;
  onClose: () => void;
  onSelectForComparison?: () => void;
  isComparisonCandidate?: boolean;
  onSetAsRoot?: () => void;
  isCurrentViewRoot?: boolean;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleTimeString();
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString();
}

export function NodeDetailModal({
  node,
  onClose,
  onSelectForComparison,
  isComparisonCandidate = false,
  onSetAsRoot,
  isCurrentViewRoot = false,
}: NodeDetailModalProps) {
  const isUser = node.role === 'user';
  const [thinkingExpanded, setThinkingExpanded] = useState(false);

  return (
    <Modal isOpen={true} onClose={onClose} title="Message Details" maxWidth="max-w-4xl">
      <div className="space-y-4">
        {/* Metadata header */}
        <div className="flex flex-wrap items-center gap-3 text-sm pb-3 border-b border-inspector-border">
          <span className={clsx(
            'px-2 py-0.5 rounded text-xs font-bold text-white',
            isUser ? 'bg-blue-600' : 'bg-green-600'
          )}>
            {isUser ? 'USER' : 'ASSISTANT'}
          </span>
          <span className={clsx(
            'px-2 py-0.5 rounded text-xs font-bold text-white',
            node.provider === 'anthropic' ? 'bg-orange-600' :
            node.provider === 'openai' ? 'bg-green-600' :
            node.provider === 'google' ? 'bg-blue-600' :
            node.provider === 'ollama' ? 'bg-purple-600' :
            'bg-gray-600'
          )}>
            {node.provider}
          </span>
          <span className="font-mono text-inspector-text">{node.model}</span>
          <span className="text-inspector-muted">Message #{node.message_index + 1}</span>
          <span className="text-inspector-muted">
            {formatDate(node.timestamp)} {formatTime(node.timestamp)}
          </span>
          {node.is_modified && (
            <span className="px-2 py-0.5 rounded text-xs bg-orange-600 text-white">
              Modified
            </span>
          )}
        </div>

        {/* Thinking content (collapsible) */}
        {node.thinking && (
          <div>
            <button
              onClick={() => setThinkingExpanded(!thinkingExpanded)}
              className="flex items-center gap-2 text-xs font-semibold text-purple-400 hover:text-purple-300 transition-colors"
            >
              <span className="text-[10px]">{thinkingExpanded ? '\u25BC' : '\u25B6'}</span>
              Thinking
              <span className="text-inspector-muted font-normal">
                ({node.thinking.length.toLocaleString()} chars)
              </span>
            </button>
            {thinkingExpanded && (
              <div className="mt-2 border rounded-lg p-4 max-h-64 overflow-y-auto bg-purple-900/10 border-purple-500/30">
                <pre className="text-sm whitespace-pre-wrap break-words text-purple-300/80 italic">
                  {node.thinking}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Message content */}
        <div>
          <div className={clsx(
            'text-xs font-semibold mb-2',
            isUser ? 'text-blue-400' : 'text-green-400'
          )}>
            {isUser ? 'USER MESSAGE' : 'ASSISTANT RESPONSE'}
          </div>
          <div className={clsx(
            'border rounded-lg p-4 max-h-96 overflow-y-auto',
            isUser ? 'bg-blue-900/10 border-blue-500/30' : 'bg-green-900/10 border-green-500/30'
          )}>
            <pre className="text-sm whitespace-pre-wrap break-words text-inspector-text">
              {node.full_message || '(empty)'}
            </pre>
          </div>
        </div>

        {/* IDs for reference */}
        <div className="text-xs text-inspector-muted space-y-1 pt-2 border-t border-inspector-border">
          <div><span className="font-semibold">Node ID:</span> {node.node_id}</div>
          <div><span className="font-semibold">Conversation:</span> {node.conversation_id}</div>
          <div><span className="font-semibold">Turn:</span> {node.turn_index + 1}</div>
          <div><span className="font-semibold">Flow ID:</span> {node.flow_id}</div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          {onSetAsRoot && (
            <button
              onClick={() => {
                onSetAsRoot();
                onClose();
              }}
              className={clsx(
                'px-4 py-2 rounded text-sm transition-colors',
                isCurrentViewRoot
                  ? 'bg-purple-600 text-white'
                  : 'bg-inspector-surface border border-inspector-border hover:border-purple-500'
              )}
            >
              {isCurrentViewRoot ? 'Current View Root' : 'Set as View Root'}
            </button>
          )}
          {onSelectForComparison && (
            <button
              onClick={() => {
                onSelectForComparison();
                onClose();
              }}
              className={clsx(
                'px-4 py-2 rounded text-sm transition-colors',
                isComparisonCandidate
                  ? 'bg-cyan-600 text-white'
                  : 'bg-inspector-surface border border-inspector-border hover:border-cyan-500'
              )}
            >
              {isComparisonCandidate ? 'Selected for Comparison' : 'Select for Comparison'}
            </button>
          )}
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
