/**
 * Chat View - interact with LLM to generate mock data
 * Supports switching between configured providers mid-conversation
 */

import { useState, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import { ChatMessage, LLMProviderConfig, ALL_PROVIDERS } from '../../types';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:2000';

// Provider display names
const PROVIDER_NAMES: Record<LLMProviderConfig, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  ollama: 'Ollama',
};

interface DisplayMessage extends ChatMessage {
  id: string;
  timestamp: number;
  provider?: LLMProviderConfig;
  model?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface LLMStatus {
  configured: boolean;
  activeProvider: LLMProviderConfig;
  configuredProviders: LLMProviderConfig[];
}

export function ChatView() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [llmStatus, setLlmStatus] = useState<LLMStatus | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<LLMProviderConfig | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Check LLM status on mount
  useEffect(() => {
    checkLLMStatus();
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const checkLLMStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings/llm-status`);
      const data = await res.json();
      setLlmStatus({
        configured: data.configured,
        activeProvider: data.activeProvider,
        configuredProviders: data.configuredProviders || [],
      });
      // Default to active provider
      if (!selectedProvider && data.activeProvider) {
        setSelectedProvider(data.activeProvider);
      }
    } catch {
      setLlmStatus({ configured: false, activeProvider: 'anthropic', configuredProviders: [] });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading || !selectedProvider) return;

    const userMessage: DisplayMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      // Build messages array for API
      const apiMessages: ChatMessage[] = messages
        .map(m => ({ role: m.role, content: m.content }))
        .concat({ role: 'user', content: userMessage.content });

      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          provider: selectedProvider,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Chat request failed');
      }

      const data = await res.json();

      const assistantMessage: DisplayMessage = {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: data.content,
        timestamp: Date.now(),
        provider: data.provider || selectedProvider,
        model: data.model,
        usage: data.usage,
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleSaveToStore = async (message: DisplayMessage) => {
    const key = prompt('Enter a key for this response:', `chat_response_${Date.now()}`);
    if (!key) return;

    try {
      const res = await fetch(`${API_BASE}/api/datastore/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          data: {
            metadata: {
              created_at: message.timestamp,
              description: `Chat response from ${message.provider || 'unknown'} (${message.model || 'unknown'}) saved at ${new Date(message.timestamp).toLocaleString()}`,
            },
            status_code: 200,
            headers: { 'content-type': 'application/json' },
            body: message.content,
          },
        }),
      });

      if (!res.ok) throw new Error('Failed to save');
      alert(`Saved to data store as "${key}"`);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleClear = () => {
    if (messages.length > 0 && confirm('Clear chat history?')) {
      setMessages([]);
    }
  };

  if (llmStatus === null) {
    return (
      <div className="flex-1 flex items-center justify-center text-inspector-muted">
        Loading...
      </div>
    );
  }

  const configuredProviders = llmStatus.configuredProviders;
  const hasConfiguredProvider = configuredProviders.length > 0;

  if (!hasConfiguredProvider) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-inspector-muted p-8">
        <div className="text-6xl mb-4">🤖</div>
        <h2 className="text-xl font-medium text-inspector-text mb-2">No LLM Configured</h2>
        <p className="text-center max-w-md">
          To use the chat feature, you need to configure at least one LLM provider with an API key.
        </p>
        <p className="text-sm mt-4">
          Go to <span className="text-inspector-accent">Settings</span> to configure providers.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-inspector-border bg-inspector-surface px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h2 className="font-medium text-inspector-text">LLM Chat</h2>
              <p className="text-xs text-inspector-muted">
                Generate mock responses and save them to the data store
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Provider Selector */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-inspector-muted">Provider:</label>
              <select
                value={selectedProvider || ''}
                onChange={(e) => setSelectedProvider(e.target.value as LLMProviderConfig)}
                className="bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm text-inspector-text"
              >
                {ALL_PROVIDERS.map(provider => {
                  const isConfigured = configuredProviders.includes(provider);
                  return (
                    <option key={provider} value={provider} disabled={!isConfigured}>
                      {PROVIDER_NAMES[provider]} {!isConfigured && '(not configured)'}
                    </option>
                  );
                })}
              </select>
            </div>

            <button
              onClick={handleClear}
              disabled={messages.length === 0}
              className="text-sm px-3 py-1 rounded bg-inspector-bg hover:bg-inspector-border text-inspector-muted disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-inspector-muted py-8">
            <p>Start a conversation with the LLM.</p>
            <p className="text-sm mt-2">
              Use this to generate mock API responses, test prompts, or create data for rules.
            </p>
            <p className="text-sm mt-2">
              You can switch providers mid-conversation using the dropdown above.
            </p>
          </div>
        )}

        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onSaveToStore={message.role === 'assistant' ? () => handleSaveToStore(message) : undefined}
          />
        ))}

        {loading && (
          <div className="flex gap-3 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-inspector-accent flex items-center justify-center text-white text-sm">
              AI
            </div>
            <div className="flex-1 bg-inspector-surface rounded-lg p-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-inspector-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-inspector-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-inspector-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-inspector-error/20 text-inspector-error rounded-lg p-3 text-sm">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-inspector-border p-4">
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
            rows={3}
            className="flex-1 bg-inspector-bg border border-inspector-border rounded-lg px-3 py-2 text-inspector-text resize-none focus:outline-none focus:ring-2 focus:ring-inspector-accent"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading || !selectedProvider}
            className="px-4 py-2 bg-inspector-accent hover:bg-inspector-accent/80 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed self-end"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

interface MessageBubbleProps {
  message: DisplayMessage;
  onSaveToStore?: () => void;
}

function MessageBubble({ message, onSaveToStore }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={clsx('flex gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={clsx(
          'w-8 h-8 rounded-full flex items-center justify-center text-white text-sm shrink-0',
          isUser ? 'bg-inspector-muted' : 'bg-inspector-accent'
        )}
      >
        {isUser ? 'U' : 'AI'}
      </div>

      <div className={clsx('flex-1 max-w-[80%]', isUser && 'flex flex-col items-end')}>
        <div
          className={clsx(
            'rounded-lg p-3',
            isUser
              ? 'bg-inspector-accent text-white'
              : 'bg-inspector-surface text-inspector-text'
          )}
        >
          <pre className="whitespace-pre-wrap font-sans text-sm">{message.content}</pre>
        </div>

        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-xs text-inspector-muted">
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>

          {message.provider && (
            <span className="text-xs text-inspector-muted">
              via {PROVIDER_NAMES[message.provider]}
            </span>
          )}

          {message.model && (
            <span className="text-xs text-inspector-muted font-mono">
              ({message.model})
            </span>
          )}

          {message.usage && (
            <span className="text-xs text-inspector-muted">
              {message.usage.input_tokens} + {message.usage.output_tokens} tokens
            </span>
          )}

          {onSaveToStore && (
            <button
              onClick={onSaveToStore}
              className="text-xs text-inspector-accent hover:underline"
            >
              Save to Data Store
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
