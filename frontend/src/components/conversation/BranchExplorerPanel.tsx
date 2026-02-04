/**
 * Branch Explorer Panel - main container for conversation tree visualization
 */

import { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { ConversationTree, Conversation } from '../../types';
import { ConversationTreeView } from './ConversationTreeView';
import { useAppStore } from '../../stores/appStore';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:2000';

interface BranchExplorerPanelProps {
  conversationId: string;
}

type ViewMode = 'tree' | 'related';

export function BranchExplorerPanel({ conversationId }: BranchExplorerPanelProps) {
  const [tree, setTree] = useState<ConversationTree | null>(null);
  const [relatedTrees, setRelatedTrees] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('tree');
  const [rebuilding, setRebuilding] = useState(false);

  const { setSelectedConversationId } = useAppStore();

  // Fetch tree data
  const fetchTree = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/conversations/${conversationId}/tree`);
      if (!res.ok) {
        throw new Error('Failed to fetch conversation tree');
      }
      const data = await res.json();
      setTree(data);
    } catch (err) {
      console.error('Failed to fetch tree:', err);
      setError(err instanceof Error ? err.message : 'Failed to load tree');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  // Fetch related trees
  const fetchRelatedTrees = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/conversations/${conversationId}/related`);
      if (!res.ok) return;
      const data = await res.json();
      setRelatedTrees(data.trees || []);
    } catch (err) {
      console.error('Failed to fetch related trees:', err);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchTree();
    fetchRelatedTrees();
  }, [fetchTree, fetchRelatedTrees]);

  // Rebuild branches
  const handleRebuildBranches = async () => {
    setRebuilding(true);
    try {
      const res = await fetch(`${API_BASE}/api/conversations/rebuild-branches`, {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error('Failed to rebuild branches');
      }
      // Refresh tree after rebuild
      await fetchTree();
      await fetchRelatedTrees();
    } catch (err) {
      console.error('Failed to rebuild branches:', err);
      setError(err instanceof Error ? err.message : 'Failed to rebuild branches');
    } finally {
      setRebuilding(false);
    }
  };

  // Navigate to related tree
  const handleNavigateToTree = (conv: Conversation) => {
    setSelectedConversationId(conv.conversation_id);
    setViewMode('tree');
  };

  // Show related trees
  const handleShowRelatedTrees = () => {
    setViewMode('related');
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-inspector-muted">
        <div className="flex items-center gap-2">
          <div className="animate-spin h-5 w-5 border-2 border-inspector-accent border-t-transparent rounded-full" />
          <span>Loading tree...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-inspector-muted gap-4">
        <p className="text-red-400">{error}</p>
        <button
          onClick={fetchTree}
          className="px-4 py-2 bg-inspector-surface border border-inspector-border rounded hover:border-inspector-accent"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!tree || tree.nodes.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-inspector-muted gap-4">
        <p>No tree data available for this conversation.</p>
        <button
          onClick={handleRebuildBranches}
          disabled={rebuilding}
          className="px-4 py-2 bg-inspector-surface border border-inspector-border rounded hover:border-inspector-accent disabled:opacity-50"
        >
          {rebuilding ? 'Rebuilding...' : 'Detect Branches'}
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with view toggle */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-inspector-border">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('tree')}
            className={clsx(
              'px-3 py-1 text-sm rounded transition-colors',
              viewMode === 'tree'
                ? 'bg-inspector-accent text-white'
                : 'bg-inspector-surface border border-inspector-border hover:border-inspector-accent'
            )}
          >
            Tree View
          </button>
          {relatedTrees.length > 0 && (
            <button
              onClick={() => setViewMode('related')}
              className={clsx(
                'px-3 py-1 text-sm rounded transition-colors',
                viewMode === 'related'
                  ? 'bg-inspector-accent text-white'
                  : 'bg-inspector-surface border border-inspector-border hover:border-inspector-accent'
              )}
            >
              Related Trees ({relatedTrees.length})
            </button>
          )}
        </div>
        <button
          onClick={handleRebuildBranches}
          disabled={rebuilding}
          className="px-3 py-1 text-sm bg-inspector-surface border border-inspector-border rounded hover:border-inspector-accent disabled:opacity-50"
          title="Re-detect branches across all conversations"
        >
          {rebuilding ? 'Rebuilding...' : 'Rebuild Branches'}
        </button>
      </div>

      {/* Content */}
      {viewMode === 'tree' ? (
        <ConversationTreeView
          tree={tree}
          onShowRelatedTrees={relatedTrees.length > 0 ? handleShowRelatedTrees : undefined}
        />
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          <h3 className="text-sm font-semibold text-inspector-muted mb-4">
            Related Conversation Trees
          </h3>
          <p className="text-xs text-inspector-muted mb-4">
            These trees are connected via replay links to the current conversation tree.
          </p>
          <div className="space-y-3">
            {relatedTrees.map((conv) => (
              <button
                key={conv.conversation_id}
                onClick={() => handleNavigateToTree(conv)}
                className="w-full text-left p-4 bg-inspector-surface border border-inspector-border rounded-lg hover:border-inspector-accent transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={clsx(
                      'px-2 py-0.5 rounded text-xs font-bold text-white',
                      conv.provider === 'anthropic' ? 'bg-orange-600' :
                      conv.provider === 'openai' ? 'bg-green-600' :
                      conv.provider === 'google' ? 'bg-blue-600' :
                      conv.provider === 'ollama' ? 'bg-purple-600' :
                      'bg-gray-600'
                    )}
                  >
                    {conv.provider}
                  </span>
                  <span className="text-xs text-inspector-muted">
                    {conv.turns.length} turns
                  </span>
                </div>
                <div className="text-sm font-mono">{conv.model}</div>
                <div className="text-xs text-inspector-muted mt-1">
                  {new Date(conv.created_at).toLocaleString()}
                </div>
                {conv.children_conversation_ids && conv.children_conversation_ids.length > 0 && (
                  <div className="text-xs text-cyan-400 mt-2">
                    {conv.children_conversation_ids.length} branch{conv.children_conversation_ids.length !== 1 ? 'es' : ''}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
