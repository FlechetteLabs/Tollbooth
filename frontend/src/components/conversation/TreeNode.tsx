/**
 * Tree Node component for conversation branch visualization
 * Displays a single message (user or assistant)
 */

import { clsx } from 'clsx';
import { ConversationTreeNode } from '../../types';

interface TreeNodeProps {
  node: ConversationTreeNode;
  isRoot?: boolean;
  isSelected?: boolean;
  relatedTreeCount?: number;
  totalTreeCount?: number;
  onClick: () => void;
  onShowRelated?: () => void;
}

export function TreeNode({
  node,
  isRoot = false,
  isSelected = false,
  relatedTreeCount = 0,
  totalTreeCount = 0,
  onClick,
  onShowRelated,
}: TreeNodeProps) {
  const isUser = node.role === 'user';

  return (
    <div
      className={clsx(
        'p-3 border-2 rounded-lg cursor-pointer transition-all min-w-[180px] max-w-[220px]',
        'hover:shadow-lg',
        isSelected && 'ring-2 ring-cyan-400',
        node.is_modified && 'border-orange-500',
        !node.is_modified && (isUser ? 'border-blue-500' : 'border-green-500'),
        isUser ? 'bg-blue-900/20' : 'bg-green-900/20'
      )}
      onClick={onClick}
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

      {/* Message preview */}
      <div className={clsx(
        'text-sm line-clamp-3',
        node.is_likely_suggestion ? 'text-inspector-muted italic' : 'text-inspector-text'
      )}>
        {node.message || '(empty)'}
      </div>

      {/* Likely suggestions indicator */}
      {node.likely_suggestions && node.likely_suggestions.length > 0 && (
        <div className="mt-1 text-xs text-yellow-500 flex items-center gap-1">
          <span>{'\u25B6'}</span>
          <span>{node.likely_suggestions.length} suggestion{node.likely_suggestions.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Footer with metadata */}
      <div className="mt-2 pt-2 border-t border-inspector-border/50 flex items-center justify-between text-xs text-inspector-muted">
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
