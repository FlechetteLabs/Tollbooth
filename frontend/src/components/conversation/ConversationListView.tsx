/**
 * Conversation list view - shows all correlated conversations
 */

import { clsx } from 'clsx';
import { useAppStore } from '../../stores/appStore';
import { Conversation } from '../../types';

function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleTimeString();
}

function getProviderColor(provider: string): string {
  switch (provider) {
    case 'anthropic':
      return 'bg-orange-600';
    case 'openai':
      return 'bg-green-600';
    case 'google':
      return 'bg-blue-600';
    default:
      return 'bg-gray-600';
  }
}

interface ConversationRowProps {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
}

function ConversationRow({ conversation, isSelected, onClick }: ConversationRowProps) {
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
          {conversation.model}
        </span>

        {/* Time */}
        <span className="ml-auto text-xs text-inspector-muted">
          {formatTime(conversation.updated_at)}
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

export function ConversationListView() {
  const { conversations, selectedConversationId, setSelectedConversationId } = useAppStore();

  // Sort by updated_at descending
  const sortedConversations = Array.from(conversations.values()).sort(
    (a, b) => b.updated_at - a.updated_at
  );

  if (sortedConversations.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-inspector-muted">
        <div className="text-center">
          <p className="text-4xl mb-4">💬</p>
          <p>No conversations captured yet</p>
          <p className="text-sm mt-2">LLM API calls will be correlated into conversations</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {sortedConversations.map((conv) => (
        <ConversationRow
          key={conv.conversation_id}
          conversation={conv}
          isSelected={selectedConversationId === conv.conversation_id}
          onClick={() => setSelectedConversationId(conv.conversation_id)}
        />
      ))}
    </div>
  );
}
