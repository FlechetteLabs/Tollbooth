/**
 * Star/favorite toggle button for conversations
 */

import { clsx } from 'clsx';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:2000';

interface StarButtonProps {
  conversationId: string;
  starred: boolean;
  onToggle: (starred: boolean) => void;
}

export function StarButton({ conversationId, starred, onToggle }: StarButtonProps) {
  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const newValue = !starred;
    onToggle(newValue);

    try {
      await fetch(`${API_BASE}/api/conversations/${conversationId}/starred`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starred: newValue }),
      });
    } catch (err) {
      console.error('Failed to toggle star:', err);
      onToggle(!newValue); // Revert on failure
    }
  };

  return (
    <button
      onClick={handleClick}
      className={clsx(
        'text-xl leading-none transition-colors',
        starred ? 'text-yellow-400' : 'text-gray-500 hover:text-yellow-400'
      )}
      title={starred ? 'Unstar' : 'Star this conversation'}
    >
      {starred ? '\u2605' : '\u2606'}
    </button>
  );
}
