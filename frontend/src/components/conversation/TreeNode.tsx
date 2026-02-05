/**
 * Tree Node component for conversation branch visualization
 * Displays a single message (user or assistant)
 */

import { useState, useCallback } from 'react';
import { clsx } from 'clsx';
import { ConversationTreeNode } from '../../types';

interface TreeNodeProps {
  node: ConversationTreeNode;
  isRoot?: boolean;
  isSelected?: boolean;
  isExpanded?: boolean;  // Global expansion state
  relatedTreeCount?: number;
  totalTreeCount?: number;
  onClick: () => void;
  onShowRelated?: () => void;
}

export function TreeNode({
  node,
  isRoot = false,
  isSelected = false,
  isExpanded = false,
  relatedTreeCount = 0,
  totalTreeCount = 0,
  onClick,
  onShowRelated,
}: TreeNodeProps) {
  const isUser = node.role === 'user';
  const [localExpanded, setLocalExpanded] = useState(false);

  // Node is expanded if globally expanded OR locally expanded via right-click
  const showFullMessage = isExpanded || localExpanded;

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setLocalExpanded(!localExpanded);
  }, [localExpanded]);

  return (
    <div
      className={clsx(
        'p-3 border-2 rounded-lg cursor-pointer transition-all h-full flex flex-col',
        showFullMessage ? 'min-w-[180px]' : 'min-w-[180px] max-w-[220px]',
        'hover:shadow-lg',
        isSelected && 'ring-2 ring-cyan-400',
        localExpanded && !isExpanded && 'ring-1 ring-yellow-500/50',
        node.is_modified && 'border-orange-500',
        !node.is_modified && (isUser ? 'border-blue-500' : 'border-green-500'),
        isUser ? 'bg-blue-900/20' : 'bg-green-900/20'
      )}
      onClick={onClick}
      onContextMenu={handleContextMenu}
      title={showFullMessage ? 'Right-click to collapse' : 'Right-click to expand full message'}
    >
      {/* Root indicators */}
      {isRoot && (
        <div className="text-xs mb-2 flex items-center gap-2 border-b border-inspector-border pb-2">
          {onShowRelated && relatedTreeCount > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onShowRelated();
              }}
              className="text-cyan-400 hover:text-cyan-300"
              title="Trees connected via replay"
            >
              {relatedTreeCount} related
            </button>
          )}
          {relatedTreeCount > 0 && (
            <span className="text-inspector-muted">|</span>
          )}
          <span className="text-inspector-muted" title="Total conversation trees">
            {totalTreeCount} trees
          </span>
        </div>
      )}

      {/* Role label */}
      <div className={clsx(
        'text-xs font-semibold mb-1',
        node.is_likely_suggestion ? 'text-yellow-500' :
        isUser ? 'text-blue-400' : 'text-green-400'
      )}>
        {node.is_likely_suggestion ? 'SUGGESTION?' : isUser ? 'USER' : 'ASSISTANT'}
      </div>

      {/* Message preview or full message */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <div className={clsx(
          'text-sm h-full',
          showFullMessage ? 'whitespace-pre-wrap break-words overflow-hidden' : 'line-clamp-3',
          node.is_likely_suggestion ? 'text-inspector-muted italic' : 'text-inspector-text'
        )}>
          {showFullMessage ? (node.full_message || '(empty)') : (node.message || '(empty)')}
        </div>
        {/* Fade indicator when expanded content is truncated */}
        {showFullMessage && node.full_message && node.full_message.length > 800 && (
          <div className={clsx(
            'absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t to-transparent pointer-events-none flex items-end justify-center pb-1',
            isUser ? 'from-blue-950/95' : 'from-green-950/95'
          )}>
            <span className="text-[10px] text-inspector-muted">click for full message</span>
          </div>
        )}
      </div>

      {/* Likely suggestions indicator */}
      {node.likely_suggestions && node.likely_suggestions.length > 0 && (
        <div className="mt-1 text-xs text-yellow-500 flex items-center gap-1">
          <span>{'\u25B6'}</span>
          <span>{node.likely_suggestions.length} suggestion{node.likely_suggestions.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Footer with metadata */}
      <div className="mt-auto pt-2 border-t border-inspector-border/50 flex items-center justify-between text-xs text-inspector-muted shrink-0">
        <span className="font-mono truncate max-w-[120px]" title={node.model}>
          {node.model.slice(0, 15)}
        </span>
        <div className="flex items-center gap-1">
          {node.thinking && (
            <span className="text-purple-400" title="Has thinking content">
              T
            </span>
          )}
          {node.is_modified && (
            <span className="text-orange-500">
              *
            </span>
          )}
          {node.parameter_modifications?.hasModifications && (
            <span
              className="text-yellow-400"
              title="Parameters modified (system/tools/temperature/tokens/model)"
            >
              P
            </span>
          )}
          {node.has_annotation && (
            <span className="text-blue-400" title="Has annotation">
              A
            </span>
          )}
          {node.tags && node.tags.length > 0 && (
            <span className="text-cyan-400" title={`Tags: ${node.tags.join(', ')}`}>
              T{node.tags.length}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
