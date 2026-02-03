/**
 * Message bubble component for conversation display
 */

import { clsx } from 'clsx';
import { LLMMessage, ContentBlock } from '../../types';

interface MessageBubbleProps {
  message: LLMMessage;
  isModified?: boolean;  // Show lightning bolt indicator
  label?: string;        // Optional label (e.g., "Original", "Modified")
  variant?: 'default' | 'original' | 'modified';  // Styling variant for compare view
}

function renderContentBlock(block: ContentBlock, idx: number) {
  switch (block.type) {
    case 'text':
      return (
        <div key={idx} className="whitespace-pre-wrap break-all">
          {block.text}
        </div>
      );

    case 'thinking':
      return (
        <div
          key={idx}
          className="bg-purple-900/30 border border-purple-700 rounded-lg p-3 my-2"
        >
          <div className="text-xs text-purple-400 font-semibold mb-1">Thinking</div>
          <div className="text-sm whitespace-pre-wrap break-all opacity-80">
            {block.thinking}
          </div>
        </div>
      );

    case 'tool_use':
      return (
        <div
          key={idx}
          className="bg-blue-900/30 border border-blue-700 rounded-lg p-3 my-2"
        >
          <div className="text-xs text-blue-400 font-semibold mb-1">
            Tool Use: {block.name}
          </div>
          <pre className="text-sm font-mono whitespace-pre-wrap break-all">
            {JSON.stringify(block.input, null, 2)}
          </pre>
        </div>
      );

    case 'tool_result':
      return (
        <div
          key={idx}
          className={clsx(
            'rounded-lg p-3 my-2 border',
            block.is_error
              ? 'bg-red-900/30 border-red-700'
              : 'bg-green-900/30 border-green-700'
          )}
        >
          <div
            className={clsx(
              'text-xs font-semibold mb-1',
              block.is_error ? 'text-red-400' : 'text-green-400'
            )}
          >
            Tool Result {block.is_error && '(Error)'}
          </div>
          <pre className="text-sm font-mono whitespace-pre-wrap break-all">
            {typeof block.content === 'string'
              ? block.content
              : JSON.stringify(block.content, null, 2)}
          </pre>
        </div>
      );

    case 'image':
      return (
        <div key={idx} className="my-2">
          <div className="text-xs text-inspector-muted mb-1">Image</div>
          {block.source.data ? (
            <img
              src={`data:${block.source.media_type};base64,${block.source.data}`}
              alt="Embedded image"
              className="max-w-full max-h-64 rounded"
            />
          ) : block.source.url ? (
            <img
              src={block.source.url}
              alt="URL image"
              className="max-w-full max-h-64 rounded"
            />
          ) : (
            <div className="text-inspector-muted">[Image placeholder]</div>
          )}
        </div>
      );

    default:
      return (
        <div key={idx} className="text-inspector-muted text-sm">
          [Unknown content type]
        </div>
      );
  }
}

export function MessageBubble({ message, isModified, label, variant = 'default' }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  // Determine border styling based on variant
  const getBorderClass = () => {
    if (variant === 'original') {
      return 'border-l-4 border-l-gray-500';
    }
    if (variant === 'modified') {
      return 'border-l-4 border-l-orange-500';
    }
    return '';
  };

  return (
    <div
      className={clsx(
        'mb-4',
        isUser ? 'ml-8' : 'mr-8',
        variant === 'original' && 'opacity-75'
      )}
    >
      {/* Role label with optional modification indicator */}
      <div
        className={clsx(
          'text-xs font-semibold mb-1 flex items-center gap-1',
          isUser
            ? 'text-blue-400 justify-end'
            : isSystem
            ? 'text-gray-400'
            : 'text-green-400'
        )}
      >
        {isModified && (
          <span className="text-orange-500" title="Modified">⚡</span>
        )}
        <span>{message.role.toUpperCase()}</span>
        {label && (
          <span className={clsx(
            'ml-1 px-1.5 py-0.5 rounded text-[10px]',
            variant === 'original'
              ? 'bg-gray-700 text-gray-300'
              : variant === 'modified'
              ? 'bg-orange-900/50 text-orange-300'
              : 'bg-inspector-surface'
          )}>
            {label}
          </span>
        )}
      </div>

      {/* Message content */}
      <div
        className={clsx(
          'rounded-lg p-3',
          isUser
            ? 'bg-blue-900/30 border border-blue-800'
            : isSystem
            ? 'bg-gray-800/50 border border-gray-700'
            : 'bg-inspector-surface border border-inspector-border',
          getBorderClass()
        )}
      >
        {typeof message.content === 'string' ? (
          <div className="whitespace-pre-wrap break-all text-sm">
            {message.content}
          </div>
        ) : (
          <div className="text-sm">
            {message.content.map((block, idx) => renderContentBlock(block, idx))}
          </div>
        )}
      </div>
    </div>
  );
}
