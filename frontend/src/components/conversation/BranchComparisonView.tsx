/**
 * Branch Comparison View - side-by-side diff of two branches
 * Updated for message-based nodes
 */

import { useMemo } from 'react';
import { clsx } from 'clsx';
import { ConversationTreeNode } from '../../types';

interface BranchComparisonViewProps {
  branch1: ConversationTreeNode[];
  branch2: ConversationTreeNode[];
  onClose: () => void;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleTimeString();
}

/**
 * Find where branches diverge by comparing messages
 */
function findDivergenceIndex(branch1: ConversationTreeNode[], branch2: ConversationTreeNode[]): number {
  const minLength = Math.min(branch1.length, branch2.length);

  for (let i = 0; i < minLength; i++) {
    // Check if message content differs
    if (branch1[i].message !== branch2[i].message) {
      return i;
    }
    // Also check role
    if (branch1[i].role !== branch2[i].role) {
      return i;
    }
  }

  return minLength;
}

interface MessageCardProps {
  node: ConversationTreeNode;
  isDivergent: boolean;
}

function MessageCard({ node, isDivergent }: MessageCardProps) {
  const isUser = node.role === 'user';

  return (
    <div
      className={clsx(
        'p-4 rounded-lg border',
        isDivergent ? 'border-yellow-500 bg-yellow-900/10' : 'border-inspector-border',
        isUser ? 'bg-blue-900/10' : 'bg-green-900/10'
      )}
    >
      {/* Role label */}
      <div className={clsx(
        'text-xs font-semibold mb-2',
        isUser ? 'text-blue-400' : 'text-green-400'
      )}>
        {isUser ? 'USER' : 'ASSISTANT'}
      </div>

      {/* Message content */}
      <div className="text-sm whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
        {node.full_message || '(empty)'}
      </div>

      {/* Metadata footer */}
      <div className="mt-2 pt-2 border-t border-inspector-border/50 text-xs text-inspector-muted flex items-center justify-between">
        <span>{node.model}</span>
        <span>{formatTime(node.timestamp)}</span>
        {node.is_modified && <span className="text-orange-500">Modified</span>}
      </div>
    </div>
  );
}

export function BranchComparisonView({ branch1, branch2, onClose }: BranchComparisonViewProps) {
  const divergenceIndex = useMemo(
    () => findDivergenceIndex(branch1, branch2),
    [branch1, branch2]
  );

  const maxLength = Math.max(branch1.length, branch2.length);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between p-4 border-b border-inspector-border bg-inspector-surface">
        <div>
          <h2 className="text-lg font-semibold">Branch Comparison</h2>
          <p className="text-sm text-inspector-muted">
            {divergenceIndex === 0
              ? 'Branches diverge from the start'
              : `Branches share ${divergenceIndex} message${divergenceIndex !== 1 ? 's' : ''} before diverging`}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-inspector-muted hover:text-inspector-text"
        >
          Close
        </button>
      </div>

      {/* Comparison grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Headers */}
          <div className="text-sm font-semibold text-inspector-muted pb-2 border-b border-inspector-border">
            Branch A ({branch1.length} messages)
          </div>
          <div className="text-sm font-semibold text-inspector-muted pb-2 border-b border-inspector-border">
            Branch B ({branch2.length} messages)
          </div>

          {/* Message-by-message comparison */}
          {Array.from({ length: maxLength }).map((_, idx) => {
            const node1 = branch1[idx];
            const node2 = branch2[idx];
            const isDivergent = idx >= divergenceIndex;

            return (
              <div key={idx} className="contents">
                {/* Message label spanning both columns */}
                <div className="col-span-2 text-xs font-semibold text-inspector-muted mt-4 mb-2 flex items-center gap-2">
                  <span>Message {idx + 1}</span>
                  {idx === divergenceIndex && (
                    <span className="px-2 py-0.5 rounded bg-red-600/30 text-red-400">
                      Divergence Point
                    </span>
                  )}
                  {isDivergent && idx !== divergenceIndex && (
                    <span className="px-2 py-0.5 rounded bg-yellow-600/30 text-yellow-400">
                      Divergent
                    </span>
                  )}
                </div>

                {/* Branch A message */}
                <div>
                  {node1 ? (
                    <MessageCard node={node1} isDivergent={isDivergent} />
                  ) : (
                    <div className="p-4 rounded-lg border border-dashed border-inspector-border text-center text-inspector-muted">
                      (no message)
                    </div>
                  )}
                </div>

                {/* Branch B message */}
                <div>
                  {node2 ? (
                    <MessageCard node={node2} isDivergent={isDivergent} />
                  ) : (
                    <div className="p-4 rounded-lg border border-dashed border-inspector-border text-center text-inspector-muted">
                      (no message)
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
