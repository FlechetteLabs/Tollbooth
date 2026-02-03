/**
 * Conversation list view - shows all correlated conversations with filtering and search
 */

import { useState, useMemo } from 'react';
import { clsx } from 'clsx';
import { useAppStore } from '../../stores/appStore';
import { Conversation, LLMProvider } from '../../types';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:2000';

function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleTimeString();
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString();
}

function getProviderColor(provider: string): string {
  switch (provider) {
    case 'anthropic':
      return 'bg-orange-600';
    case 'openai':
      return 'bg-green-600';
    case 'google':
      return 'bg-blue-600';
    case 'ollama':
      return 'bg-purple-600';
    default:
      return 'bg-gray-600';
  }
}

interface ConversationFilters {
  searchText: string;
  provider: LLMProvider | 'all';
  minTurns: number;
  maxTurns: number;
  minMessages: number;
  maxMessages: number;
}

const defaultFilters: ConversationFilters = {
  searchText: '',
  provider: 'all',
  minTurns: 0,
  maxTurns: 0,
  minMessages: 0,
  maxMessages: 0,
};

interface ConversationRowProps {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
  searchText: string;
}

function highlightMatch(text: string, search: string): React.ReactNode {
  if (!search) return text;
  const index = text.toLowerCase().indexOf(search.toLowerCase());
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-yellow-500/50 text-white">{text.slice(index, index + search.length)}</mark>
      {text.slice(index + search.length)}
    </>
  );
}

function ConversationRow({ conversation, isSelected, onClick, searchText }: ConversationRowProps) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'p-4 cursor-pointer border-b border-inspector-border transition-colors',
        isSelected
          ? 'bg-inspector-accent/20'
          : 'hover:bg-inspector-surface'
      )}
    >
      <div className="flex items-center gap-3 mb-2">
        {/* Provider badge */}
        <span
          className={clsx(
            'px-2 py-0.5 rounded text-xs font-bold text-white',
            getProviderColor(conversation.provider)
          )}
        >
          {conversation.provider}
        </span>

        {/* Model */}
        <span className="text-sm font-mono text-inspector-muted">
          {highlightMatch(conversation.model, searchText)}
        </span>

        {/* Time */}
        <span className="ml-auto text-xs text-inspector-muted">
          {formatDate(conversation.updated_at)} {formatTime(conversation.updated_at)}
        </span>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <span className="text-inspector-muted">
          {conversation.turns.length} turn{conversation.turns.length !== 1 ? 's' : ''}
        </span>
        <span className="text-inspector-muted">
          {conversation.message_count} messages
        </span>
      </div>
    </div>
  );
}

function getConversationText(conversation: Conversation): string {
  const parts: string[] = [conversation.model, conversation.provider];

  for (const turn of conversation.turns) {
    for (const msg of turn.request.messages) {
      if (typeof msg.content === 'string') {
        parts.push(msg.content);
      } else {
        for (const block of msg.content) {
          if (block.type === 'text') {
            parts.push(block.text);
          }
        }
      }
    }
    if (turn.response) {
      for (const block of turn.response.content) {
        if (block.type === 'text') {
          parts.push(block.text);
        }
      }
    }
  }

  return parts.join(' ').toLowerCase();
}

export function ConversationListView() {
  const { conversations, selectedConversationId, setSelectedConversationId } = useAppStore();
  const [filters, setFilters] = useState<ConversationFilters>(defaultFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildResult, setRebuildResult] = useState<{ conversationsCreated: number; turnsCreated: number } | null>(null);

  // Get unique providers for filter dropdown
  const availableProviders = useMemo(() => {
    const providers = new Set<LLMProvider>();
    conversations.forEach(c => providers.add(c.provider));
    return Array.from(providers).sort();
  }, [conversations]);

  // Filter and search conversations
  const filteredConversations = useMemo(() => {
    let result = Array.from(conversations.values());

    // Text search
    if (filters.searchText) {
      const searchLower = filters.searchText.toLowerCase();
      result = result.filter(c => getConversationText(c).includes(searchLower));
    }

    // Provider filter
    if (filters.provider !== 'all') {
      result = result.filter(c => c.provider === filters.provider);
    }

    // Turn count filters
    if (filters.minTurns > 0) {
      result = result.filter(c => c.turns.length >= filters.minTurns);
    }
    if (filters.maxTurns > 0) {
      result = result.filter(c => c.turns.length <= filters.maxTurns);
    }

    // Message count filters
    if (filters.minMessages > 0) {
      result = result.filter(c => c.message_count >= filters.minMessages);
    }
    if (filters.maxMessages > 0) {
      result = result.filter(c => c.message_count <= filters.maxMessages);
    }

    // Sort by updated_at descending
    return result.sort((a, b) => b.updated_at - a.updated_at);
  }, [conversations, filters]);

  const handleExport = async (format: 'json' | 'markdown' | 'html', all: boolean) => {
    setExporting(true);
    try {
      const ids = all ? undefined : filteredConversations.map(c => c.conversation_id);
      const res = await fetch(`${API_BASE}/api/conversations/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_ids: ids, format }),
      });

      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const ext = format === 'markdown' ? 'md' : format;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `conversations.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  const handleRebuild = async () => {
    if (!confirm('This will rebuild all conversations from existing traffic. Continue?')) return;

    setRebuilding(true);
    setRebuildResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/conversations/rebuild`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearExisting: true }),
      });

      if (!res.ok) throw new Error('Rebuild failed');

      const result = await res.json();
      setRebuildResult(result);
      // Conversations will be updated via WebSocket
    } catch (err) {
      console.error('Rebuild failed:', err);
      alert('Failed to rebuild conversations');
    } finally {
      setRebuilding(false);
    }
  };

  const clearFilters = () => setFilters(defaultFilters);
  const hasActiveFilters = filters.searchText || filters.provider !== 'all' ||
    filters.minTurns > 0 || filters.maxTurns > 0 ||
    filters.minMessages > 0 || filters.maxMessages > 0;

  if (conversations.size === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-inspector-muted">
        <div className="text-center">
          <p className="text-4xl mb-4">💬</p>
          <p>No conversations captured yet</p>
          <p className="text-sm mt-2">LLM API calls will be correlated into conversations</p>
          <button
            onClick={handleRebuild}
            disabled={rebuilding}
            className="mt-4 px-4 py-2 bg-inspector-accent text-white rounded hover:bg-inspector-accent/80 disabled:opacity-50"
          >
            {rebuilding ? 'Rebuilding...' : 'Rebuild from Traffic'}
          </button>
          <p className="text-xs mt-2 text-inspector-muted">
            Reconstruct conversations from existing traffic data
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Search and Filter Bar */}
      <div className="shrink-0 p-3 border-b border-inspector-border bg-inspector-bg">
        <div className="flex items-center gap-2">
          {/* Search input */}
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Search conversations..."
              value={filters.searchText}
              onChange={(e) => setFilters({ ...filters, searchText: e.target.value })}
              className="w-full bg-inspector-surface border border-inspector-border rounded px-3 py-1.5 text-sm focus:outline-none focus:border-inspector-accent pl-8"
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-inspector-muted">🔍</span>
          </div>

          {/* Provider filter */}
          <select
            value={filters.provider}
            onChange={(e) => setFilters({ ...filters, provider: e.target.value as LLMProvider | 'all' })}
            className="bg-inspector-surface border border-inspector-border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-inspector-accent"
          >
            <option value="all">All Providers</option>
            {availableProviders.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          {/* Toggle advanced filters */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={clsx(
              'px-3 py-1.5 rounded text-sm border transition-colors',
              showFilters || hasActiveFilters
                ? 'bg-inspector-accent/20 border-inspector-accent text-inspector-accent'
                : 'bg-inspector-surface border-inspector-border hover:border-inspector-accent'
            )}
          >
            Filters {hasActiveFilters && `(${filteredConversations.length})`}
          </button>

          {/* Rebuild button */}
          <button
            onClick={handleRebuild}
            disabled={rebuilding}
            className="px-3 py-1.5 rounded text-sm bg-inspector-surface border border-inspector-border hover:border-inspector-accent disabled:opacity-50"
            title="Rebuild conversations from existing traffic"
          >
            {rebuilding ? 'Rebuilding...' : '🔄 Rebuild'}
          </button>

          {/* Export dropdown */}
          <div className="relative group">
            <button
              disabled={exporting || filteredConversations.length === 0}
              className="px-3 py-1.5 rounded text-sm bg-inspector-surface border border-inspector-border hover:border-inspector-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? 'Exporting...' : 'Export ▼'}
            </button>
            <div className="absolute right-0 top-full mt-1 bg-inspector-surface border border-inspector-border rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 min-w-[160px]">
              <button
                onClick={() => handleExport('json', false)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-inspector-accent/20"
              >
                Export as JSON
              </button>
              <button
                onClick={() => handleExport('markdown', false)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-inspector-accent/20"
              >
                Export as Markdown
              </button>
              <button
                onClick={() => handleExport('html', false)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-inspector-accent/20"
              >
                Export as HTML
              </button>
            </div>
          </div>
        </div>

        {/* Advanced filters panel */}
        {showFilters && (
          <div className="mt-3 pt-3 border-t border-inspector-border">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm text-inspector-muted">Turns:</span>
                <input
                  type="number"
                  min="0"
                  placeholder="Min"
                  value={filters.minTurns || ''}
                  onChange={(e) => setFilters({ ...filters, minTurns: parseInt(e.target.value) || 0 })}
                  className="w-16 bg-inspector-surface border border-inspector-border rounded px-2 py-1 text-sm"
                />
                <span className="text-inspector-muted">-</span>
                <input
                  type="number"
                  min="0"
                  placeholder="Max"
                  value={filters.maxTurns || ''}
                  onChange={(e) => setFilters({ ...filters, maxTurns: parseInt(e.target.value) || 0 })}
                  className="w-16 bg-inspector-surface border border-inspector-border rounded px-2 py-1 text-sm"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-inspector-muted">Messages:</span>
                <input
                  type="number"
                  min="0"
                  placeholder="Min"
                  value={filters.minMessages || ''}
                  onChange={(e) => setFilters({ ...filters, minMessages: parseInt(e.target.value) || 0 })}
                  className="w-16 bg-inspector-surface border border-inspector-border rounded px-2 py-1 text-sm"
                />
                <span className="text-inspector-muted">-</span>
                <input
                  type="number"
                  min="0"
                  placeholder="Max"
                  value={filters.maxMessages || ''}
                  onChange={(e) => setFilters({ ...filters, maxMessages: parseInt(e.target.value) || 0 })}
                  className="w-16 bg-inspector-surface border border-inspector-border rounded px-2 py-1 text-sm"
                />
              </div>

              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-sm text-inspector-accent hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Rebuild result notification */}
      {rebuildResult && (
        <div className="shrink-0 px-3 py-2 bg-green-900/30 text-sm text-green-400 border-b border-green-700 flex items-center justify-between">
          <span>
            Rebuilt {rebuildResult.conversationsCreated} conversations with {rebuildResult.turnsCreated} turns
          </span>
          <button
            onClick={() => setRebuildResult(null)}
            className="text-green-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Results summary */}
      {hasActiveFilters && (
        <div className="shrink-0 px-3 py-2 bg-inspector-surface/50 text-sm text-inspector-muted border-b border-inspector-border">
          Showing {filteredConversations.length} of {conversations.size} conversations
        </div>
      )}

      {/* Conversation list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {filteredConversations.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-inspector-muted">
            No conversations match your filters
          </div>
        ) : (
          filteredConversations.map((conv) => (
            <ConversationRow
              key={conv.conversation_id}
              conversation={conv}
              isSelected={selectedConversationId === conv.conversation_id}
              onClick={() => setSelectedConversationId(conv.conversation_id)}
              searchText={filters.searchText}
            />
          ))
        )}
      </div>
    </div>
  );
}
