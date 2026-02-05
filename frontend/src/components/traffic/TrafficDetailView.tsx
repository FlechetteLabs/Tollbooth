/**
 * Traffic detail view - shows request/response details
 */

import { useState, useMemo, useEffect } from 'react';
import { clsx } from 'clsx';
import { useAppStore, DisplayMode } from '../../stores/appStore';
import { TrafficFlow, ReplayVariant } from '../../types';
import { DisplayModeToggle, formatContent } from '../shared/DisplayModeToggle';
import { GenerateMockModal } from '../shared/GenerateMockModal';
import { AnnotationPanel } from '../shared/AnnotationPanel';
import { CreateVariantModal } from '../replay/CreateVariantModal';
import { GlossopetraeDecodePanel } from '../shared/GlossopetraeDecodePanel';
import { computeDiff } from '../../utils/diff';

type Tab = 'request' | 'response' | 'parsed';
type ViewMode = 'modified' | 'original' | 'diff';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:2000';

interface JsonViewerProps {
  data: unknown;
  raw?: boolean;
}

function JsonViewer({ data, raw }: JsonViewerProps) {
  try {
    const formatted = raw
      ? JSON.stringify(data)
      : JSON.stringify(data, null, 2);
    return (
      <pre className="text-sm font-mono whitespace-pre-wrap break-all">
        {formatted}
      </pre>
    );
  } catch {
    return <span className="text-inspector-error">Unable to display content</span>;
  }
}

interface HeadersViewProps {
  headers: Record<string, string>;
}

function HeadersView({ headers }: HeadersViewProps) {
  return (
    <div className="space-y-1">
      {Object.entries(headers).map(([key, value]) => (
        <div key={key} className="font-mono text-sm break-words">
          <span className="text-inspector-accent">{key}:</span>{' '}
          <span className="text-inspector-text break-all">{value}</span>
        </div>
      ))}
    </div>
  );
}

interface ViewModeToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  hasModification: boolean;
}

function ViewModeToggle({ mode, onChange, hasModification }: ViewModeToggleProps) {
  const options: { value: ViewMode; label: string }[] = [
    { value: 'modified', label: 'Modified' },
    { value: 'original', label: 'Original' },
    { value: 'diff', label: 'Diff' },
  ];

  return (
    <div className="flex bg-inspector-bg rounded-lg p-0.5">
      {options.map((option) => {
        const isDisabled = !hasModification && option.value !== 'modified';
        return (
          <button
            key={option.value}
            onClick={() => !isDisabled && onChange(option.value)}
            disabled={isDisabled}
            className={clsx(
              'px-3 py-1 text-xs font-medium rounded-md transition-colors',
              mode === option.value
                ? 'bg-inspector-accent text-white'
                : isDisabled
                ? 'text-inspector-muted/50 cursor-not-allowed'
                : 'text-inspector-muted hover:text-inspector-text'
            )}
            title={isDisabled ? 'No modifications to compare' : undefined}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

interface ViewModeBannerProps {
  mode: ViewMode;
  type: 'request' | 'response';
  hasModification: boolean;
  ruleName?: string;
}

function ViewModeBanner({ mode, type, hasModification, ruleName }: ViewModeBannerProps) {
  if (!hasModification) {
    return (
      <div className="px-3 py-1.5 rounded-lg bg-inspector-bg border border-inspector-border text-xs text-inspector-muted">
        No modification history available
      </div>
    );
  }

  const messages: Record<ViewMode, { text: string; className: string }> = {
    modified: {
      text: `Viewing modified ${type}`,
      className: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    },
    original: {
      text: `Viewing original ${type}`,
      className: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
    },
    diff: {
      text: `Comparing original vs modified`,
      className: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
    },
  };

  const { text, className } = messages[mode];

  return (
    <div className={clsx('px-3 py-1.5 rounded-lg border text-xs', className)}>
      <span>{text}</span>
      {ruleName && (
        <span className="ml-2 text-inspector-muted">
          Modified by: <span className="text-orange-400 font-medium">{ruleName}</span>
        </span>
      )}
    </div>
  );
}


interface DiffViewProps {
  original: string;
  modified: string;
  displayMode: DisplayMode;
}

function DiffView({ original, modified, displayMode }: DiffViewProps) {
  const diff = useMemo(() => {
    const origFormatted = formatContent(original, displayMode);
    const modFormatted = formatContent(modified, displayMode);
    return computeDiff(origFormatted, modFormatted);
  }, [original, modified, displayMode]);

  return (
    <div className="bg-inspector-bg p-3 rounded-lg font-mono text-sm">
      {diff.map((line, idx) => (
        <div
          key={idx}
          className={clsx(
            'whitespace-pre-wrap break-all',
            line.type === 'added' && 'bg-green-500/20 text-green-400',
            line.type === 'removed' && 'bg-red-500/20 text-red-400 line-through',
            line.type === 'same' && 'text-inspector-text'
          )}
        >
          <span className="select-none opacity-50 mr-2">
            {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
          </span>
          {line.line || '\u00A0'}
        </div>
      ))}
    </div>
  );
}

interface HeadersDiffViewProps {
  original: Record<string, string>;
  modified: Record<string, string>;
}

function HeadersDiffView({ original, modified }: HeadersDiffViewProps) {
  const allKeys = useMemo(() => {
    const keys = new Set([...Object.keys(original), ...Object.keys(modified)]);
    return Array.from(keys).sort();
  }, [original, modified]);

  return (
    <div className="space-y-1">
      {allKeys.map((key) => {
        const origValue = original[key];
        const modValue = modified[key];
        const isAdded = origValue === undefined;
        const isRemoved = modValue === undefined;
        const isChanged = origValue !== undefined && modValue !== undefined && origValue !== modValue;

        if (isChanged) {
          return (
            <div key={key} className="font-mono text-sm break-words">
              <div className="bg-red-500/20 text-red-400 line-through">
                <span className="text-red-300">{key}:</span> {origValue}
              </div>
              <div className="bg-green-500/20 text-green-400">
                <span className="text-green-300">{key}:</span> {modValue}
              </div>
            </div>
          );
        }

        return (
          <div
            key={key}
            className={clsx(
              'font-mono text-sm break-words',
              isAdded && 'bg-green-500/20 text-green-400',
              isRemoved && 'bg-red-500/20 text-red-400 line-through'
            )}
          >
            <span className={clsx(
              isAdded ? 'text-green-300' : isRemoved ? 'text-red-300' : 'text-inspector-accent'
            )}>{key}:</span>{' '}
            <span className="break-all">{modValue ?? origValue}</span>
          </div>
        );
      })}
    </div>
  );
}

interface DetailPanelProps {
  flow: TrafficFlow;
  tab: Tab;
  displayMode: DisplayMode;
  viewMode: ViewMode;
}

function DetailPanel({ flow, tab, displayMode, viewMode }: DetailPanelProps) {
  const isRaw = displayMode === 'raw';

  if (tab === 'request') {
    const hasModification = !!flow.request_modified && !!flow.original_request;
    const request = viewMode === 'original' && hasModification ? flow.original_request! : flow.request;
    const originalRequest = flow.original_request;

    if (viewMode === 'diff' && hasModification && originalRequest) {
      return (
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-inspector-muted mb-2">URL</h4>
            {originalRequest.url !== flow.request.url ? (
              <div className="font-mono text-sm">
                <div className="bg-red-500/20 text-red-400 line-through break-all">{originalRequest.url}</div>
                <div className="bg-green-500/20 text-green-400 break-all">{flow.request.url}</div>
              </div>
            ) : (
              <p className="font-mono text-sm break-all">{flow.request.url}</p>
            )}
          </div>

          <div>
            <h4 className="text-sm font-semibold text-inspector-muted mb-2">Headers</h4>
            <HeadersDiffView original={originalRequest.headers} modified={flow.request.headers} />
          </div>

          {(originalRequest.content || flow.request.content) && (
            <div>
              <h4 className="text-sm font-semibold text-inspector-muted mb-2">Body</h4>
              <DiffView
                original={originalRequest.content || ''}
                modified={flow.request.content || ''}
                displayMode={displayMode}
              />
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-semibold text-inspector-muted mb-2">URL</h4>
          <p className="font-mono text-sm break-all">{request.url}</p>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-inspector-muted mb-2">Headers</h4>
          <HeadersView headers={request.headers} />
        </div>

        {request.content && (
          <div>
            <h4 className="text-sm font-semibold text-inspector-muted mb-2">Body</h4>
            <div className="bg-inspector-bg p-3 rounded-lg">
              <pre className="text-sm font-mono whitespace-pre-wrap break-all">
                {formatContent(request.content, displayMode)}
              </pre>
              <GlossopetraeDecodePanel text={request.content} direction="decode" />
            </div>
          </div>
        )}
      </div>
    );
  }

  if (tab === 'response') {
    if (!flow.response) {
      return (
        <div className="text-inspector-muted text-center py-8">
          Response not yet received
        </div>
      );
    }

    const hasModification = !!flow.response_modified && !!flow.original_response;
    const response = viewMode === 'original' && hasModification ? flow.original_response! : flow.response;
    const originalResponse = flow.original_response;

    if (viewMode === 'diff' && hasModification && originalResponse) {
      return (
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-inspector-muted mb-2">Status</h4>
            {originalResponse.status_code !== flow.response.status_code ? (
              <div className="font-mono">
                <span className="bg-red-500/20 text-red-400 line-through px-1">
                  {originalResponse.status_code} {originalResponse.reason}
                </span>
                {' → '}
                <span className="bg-green-500/20 text-green-400 px-1">
                  {flow.response.status_code} {flow.response.reason}
                </span>
              </div>
            ) : (
              <p className="font-mono">
                <span
                  className={clsx(
                    flow.response.status_code >= 200 && flow.response.status_code < 300
                      ? 'text-inspector-success'
                      : flow.response.status_code >= 400
                      ? 'text-inspector-error'
                      : 'text-inspector-warning'
                  )}
                >
                  {flow.response.status_code}
                </span>{' '}
                {flow.response.reason}
              </p>
            )}
          </div>

          <div>
            <h4 className="text-sm font-semibold text-inspector-muted mb-2">Headers</h4>
            <HeadersDiffView original={originalResponse.headers} modified={flow.response.headers} />
          </div>

          {(originalResponse.content || flow.response.content) && (
            <div>
              <h4 className="text-sm font-semibold text-inspector-muted mb-2">Body</h4>
              <DiffView
                original={originalResponse.content || ''}
                modified={flow.response.content || ''}
                displayMode={displayMode}
              />
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-semibold text-inspector-muted mb-2">Status</h4>
          <p className="font-mono">
            <span
              className={clsx(
                response.status_code >= 200 && response.status_code < 300
                  ? 'text-inspector-success'
                  : response.status_code >= 400
                  ? 'text-inspector-error'
                  : 'text-inspector-warning'
              )}
            >
              {response.status_code}
            </span>{' '}
            {response.reason}
          </p>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-inspector-muted mb-2">Headers</h4>
          <HeadersView headers={response.headers} />
        </div>

        {response.content && (
          <div>
            <h4 className="text-sm font-semibold text-inspector-muted mb-2">Body</h4>
            <div className="bg-inspector-bg p-3 rounded-lg">
              <pre className="text-sm font-mono whitespace-pre-wrap break-all">
                {formatContent(response.content, displayMode)}
              </pre>
              <GlossopetraeDecodePanel text={response.content} direction="decode" />
            </div>
          </div>
        )}
      </div>
    );
  }

  if (tab === 'parsed') {
    if (!flow.parsed) {
      return (
        <div className="text-inspector-muted text-center py-8">
          Not an LLM API request or parsing failed
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-semibold text-inspector-muted mb-1">Provider</h4>
            <p className="font-mono">{flow.parsed.provider}</p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-inspector-muted mb-1">Model</h4>
            <p className="font-mono">{flow.parsed.model}</p>
          </div>
          {flow.parsed.max_tokens && (
            <div>
              <h4 className="text-sm font-semibold text-inspector-muted mb-1">Max Tokens</h4>
              <p className="font-mono">{flow.parsed.max_tokens}</p>
            </div>
          )}
          {flow.parsed.temperature !== undefined && (
            <div>
              <h4 className="text-sm font-semibold text-inspector-muted mb-1">Temperature</h4>
              <p className="font-mono">{flow.parsed.temperature}</p>
            </div>
          )}
        </div>

        {flow.parsed.system && (
          <div>
            <h4 className="text-sm font-semibold text-inspector-muted mb-2">System Prompt</h4>
            <div className="bg-inspector-bg p-3 rounded-lg">
              <pre className="text-sm font-mono whitespace-pre-wrap break-words">
                {flow.parsed.system}
              </pre>
            </div>
          </div>
        )}

        <div>
          <h4 className="text-sm font-semibold text-inspector-muted mb-2">
            Messages ({flow.parsed.messages.length})
          </h4>
          <div className="space-y-2">
            {flow.parsed.messages.map((msg, idx) => (
              <div key={idx} className="bg-inspector-bg p-3 rounded-lg">
                <span
                  className={clsx(
                    'text-xs font-bold uppercase px-2 py-0.5 rounded',
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : msg.role === 'assistant'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-600 text-white'
                  )}
                >
                  {msg.role}
                </span>
                <div className="mt-2">
                  {typeof msg.content === 'string' ? (
                    <pre className="text-sm font-mono whitespace-pre-wrap break-words">
                      {msg.content.slice(0, 500)}
                      {msg.content.length > 500 && '...'}
                    </pre>
                  ) : (
                    <JsonViewer data={msg.content} raw={isRaw} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export function TrafficDetailView() {
  const { selectedTrafficId, traffic, setSelectedTrafficId, displayMode } = useAppStore();
  const [activeTab, setActiveTab] = useState<Tab>('request');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveType, setSaveType] = useState<'request' | 'response'>('response');
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [ruleDirection, setRuleDirection] = useState<'request' | 'response'>('request');
  const [requestViewMode, setRequestViewMode] = useState<ViewMode>('modified');
  const [responseViewMode, setResponseViewMode] = useState<ViewMode>('modified');
  const [mockingEndpoint, setMockingEndpoint] = useState(false);
  const [mockSuccess, setMockSuccess] = useState<string | null>(null);
  const [showGenerateMock, setShowGenerateMock] = useState(false);
  const [showCreateVariant, setShowCreateVariant] = useState(false);

  // Mock endpoint handler - saves response to datastore and creates rule in one action
  const handleMockEndpoint = async (flow: TrafficFlow) => {
    if (!flow.response) return;

    setMockingEndpoint(true);
    setMockSuccess(null);

    try {
      // Generate a unique key for the datastore entry
      const storeKey = `mock_${flow.request.method.toLowerCase()}_${flow.request.host.replace(/\./g, '_')}${flow.request.path.replace(/\//g, '_').replace(/[^a-z0-9_]/gi, '')}`;

      // 1. Save response to datastore
      const storeData = {
        metadata: {
          created_at: Date.now(),
          description: `Mock for ${flow.request.method} ${flow.request.path}`,
        },
        status_code: flow.response.status_code,
        headers: flow.response.headers,
        body: flow.response.content || '',
      };

      const storeRes = await fetch(`${API_BASE}/api/datastore/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: storeKey, data: storeData }),
      });

      if (!storeRes.ok) {
        const errData = await storeRes.json();
        throw new Error(errData.error || 'Failed to save to datastore');
      }

      // 2. Create rule with serve_from_store action
      const rule = {
        id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: `Mock ${flow.request.host}${flow.request.path}`,
        enabled: true,
        direction: 'response',
        priority: 0, // High priority
        filter: {
          host: { match: 'contains', value: flow.request.host },
          path: { match: 'exact', value: flow.request.path },
        },
        action: {
          type: 'serve_from_store',
          store_key: storeKey,
        },
      };

      const ruleRes = await fetch(`${API_BASE}/api/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      });

      if (!ruleRes.ok) {
        const errData = await ruleRes.json();
        throw new Error(errData.error || 'Failed to create rule');
      }

      setMockSuccess(`Mock created! Enable "Rules Mode" in Intercept view to activate.`);
      setTimeout(() => setMockSuccess(null), 5000);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setMockingEndpoint(false);
    }
  };

  if (!selectedTrafficId) {
    return (
      <div className="h-full flex items-center justify-center text-inspector-muted border-l border-inspector-border">
        <p>Select a request to view details</p>
      </div>
    );
  }

  const flow = traffic.get(selectedTrafficId);
  if (!flow) {
    return (
      <div className="h-full flex items-center justify-center text-inspector-muted border-l border-inspector-border">
        <p>Flow not found</p>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'request', label: 'Request' },
    { id: 'response', label: 'Response' },
    { id: 'parsed', label: 'Parsed' },
  ];

  return (
    <div className="h-full flex flex-col border-l border-inspector-border min-h-0 min-w-0 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between p-4 border-b border-inspector-border">
        <div className="flex-1 min-w-0">
          <p className="font-mono text-sm truncate">
            {flow.request.method} {flow.request.url}
          </p>
        </div>
        <div className="flex items-center gap-2 ml-4">
          {/* Save to Datastore dropdown */}
          <div className="relative group" data-testid="traffic-save-datastore-dropdown">
            <button
              className="text-xs px-2 py-1 bg-inspector-surface border border-inspector-border rounded text-inspector-muted hover:text-inspector-text hover:border-inspector-accent flex items-center gap-1"
              data-testid="traffic-save-datastore-btn"
            >
              Save to Datastore
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className="absolute right-0 top-full mt-1 bg-inspector-surface border border-inspector-border rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <button
                onClick={() => { setSaveType('request'); setShowSaveModal(true); }}
                className="block w-full text-left px-3 py-2 text-xs text-inspector-text hover:bg-inspector-bg whitespace-nowrap"
                data-testid="traffic-save-request-btn"
              >
                Save Request
              </button>
              {flow.response && (
                <button
                  onClick={() => { setSaveType('response'); setShowSaveModal(true); }}
                  className="block w-full text-left px-3 py-2 text-xs text-inspector-text hover:bg-inspector-bg whitespace-nowrap"
                  data-testid="traffic-save-response-btn"
                >
                  Save Response
                </button>
              )}
            </div>
          </div>

          {/* Save as Rule dropdown */}
          <div className="relative group" data-testid="traffic-save-rule-dropdown">
            <button
              className="text-xs px-2 py-1 bg-inspector-surface border border-inspector-border rounded text-inspector-muted hover:text-inspector-text hover:border-inspector-accent flex items-center gap-1"
              data-testid="traffic-save-rule-btn"
            >
              Save as Rule
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className="absolute right-0 top-full mt-1 bg-inspector-surface border border-inspector-border rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <button
                onClick={() => { setRuleDirection('request'); setShowRuleModal(true); }}
                className="block w-full text-left px-3 py-2 text-xs text-inspector-text hover:bg-inspector-bg whitespace-nowrap"
                data-testid="traffic-request-rule-btn"
              >
                Request Rule
              </button>
              <button
                onClick={() => { setRuleDirection('response'); setShowRuleModal(true); }}
                className="block w-full text-left px-3 py-2 text-xs text-inspector-text hover:bg-inspector-bg whitespace-nowrap"
                data-testid="traffic-response-rule-btn"
              >
                Response Rule
              </button>
            </div>
          </div>

          {/* Mock This Endpoint dropdown - quick mock or LLM generation */}
          <div className="relative group" data-testid="traffic-mock-dropdown">
            <button
              disabled={mockingEndpoint}
              className={clsx(
                'text-xs px-2 py-1 rounded font-medium flex items-center gap-1',
                mockingEndpoint
                  ? 'bg-inspector-accent/50 text-white cursor-wait'
                  : 'bg-inspector-accent hover:bg-inspector-accent/80 text-white'
              )}
              title="Create mock for this endpoint"
              data-testid="traffic-mock-endpoint-btn"
            >
              {mockingEndpoint ? (
                <>
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Mocking...
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Mock
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </>
              )}
            </button>
            <div className="absolute right-0 top-full mt-1 bg-inspector-surface border border-inspector-border rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              {flow.response && (
                <button
                  onClick={() => handleMockEndpoint(flow)}
                  disabled={mockingEndpoint}
                  className="block w-full text-left px-3 py-2 text-xs text-inspector-text hover:bg-inspector-bg whitespace-nowrap"
                  data-testid="traffic-quick-mock-btn"
                >
                  Quick Mock (use current response)
                </button>
              )}
              <button
                onClick={() => setShowGenerateMock(true)}
                className="block w-full text-left px-3 py-2 text-xs text-inspector-accent hover:bg-inspector-bg whitespace-nowrap flex items-center gap-1"
                data-testid="traffic-llm-mock-btn"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Generate with LLM
              </button>
            </div>
          </div>

          {/* Create Replay Variant */}
          <button
            onClick={() => setShowCreateVariant(true)}
            className="text-xs px-2 py-1 bg-inspector-surface border border-inspector-border rounded text-inspector-muted hover:text-inspector-text hover:border-inspector-accent flex items-center gap-1"
            title="Create replay variant"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Replay
          </button>

          <button
            onClick={() => setSelectedTrafficId(null)}
            className="text-inspector-muted hover:text-inspector-text"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Tabs and Display Mode */}
      <div className="shrink-0 flex items-center justify-between border-b border-inspector-border">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'px-4 py-2 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'text-inspector-accent border-b-2 border-inspector-accent'
                  : 'text-inspector-muted hover:text-inspector-text'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="pr-2">
          <DisplayModeToggle />
        </div>
      </div>

      {/* Mock Success Message */}
      {mockSuccess && (
        <div className="shrink-0 bg-inspector-success/20 text-inspector-success px-4 py-2 text-sm flex items-center justify-between">
          <span>{mockSuccess}</span>
          <button
            onClick={() => setMockSuccess(null)}
            className="text-inspector-success hover:text-inspector-success/80"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Refusal Detection Banner */}
      {flow.refusal?.detected && (
        <div className={clsx(
          'shrink-0 px-4 py-2 border-b border-inspector-border flex items-center justify-between',
          flow.refusal.was_modified
            ? 'bg-purple-500/10 text-purple-400'
            : 'bg-orange-500/10 text-orange-400'
        )}>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-sm font-medium">
              {flow.refusal.was_modified ? 'Refusal Detected & Modified' : 'Refusal Detected'}
            </span>
            <span className="text-xs opacity-75">
              ({(flow.refusal.confidence * 100).toFixed(0)}% confidence)
            </span>
          </div>
          <div className="text-xs">
            Rule: <span className="font-medium">{flow.refusal.rule_name}</span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden p-4">
        {/* View Mode Banner + Toggle - only show for request/response tabs */}
        {(activeTab === 'request' || activeTab === 'response') && (() => {
          const hasModification = activeTab === 'request'
            ? !!flow.request_modified && !!flow.original_request
            : !!flow.response_modified && !!flow.original_response;
          const viewMode = activeTab === 'request' ? requestViewMode : responseViewMode;
          const ruleName = activeTab === 'request'
            ? flow.request_modified_by_rule?.name
            : flow.response_modified_by_rule?.name;

          return (
            <div className="mb-4 flex items-center justify-between gap-4">
              <ViewModeBanner
                mode={viewMode}
                type={activeTab}
                hasModification={hasModification}
                ruleName={ruleName}
              />
              <ViewModeToggle
                mode={viewMode}
                onChange={(mode) => {
                  if (activeTab === 'request') {
                    setRequestViewMode(mode);
                  } else {
                    setResponseViewMode(mode);
                  }
                }}
                hasModification={hasModification}
              />
            </div>
          );
        })()}
        <DetailPanel
          flow={flow}
          tab={activeTab}
          displayMode={displayMode}
          viewMode={activeTab === 'request' ? requestViewMode : responseViewMode}
        />

        {/* Annotation Panel */}
        <div className="mt-4">
          <AnnotationPanel
            targetType="traffic"
            targetId={flow.flow_id}
            defaultCollapsed={true}
          />
        </div>
      </div>

      {/* Save to Datastore Modal */}
      {showSaveModal && (
        <SaveToDatastoreModal
          flow={flow}
          type={saveType}
          onClose={() => setShowSaveModal(false)}
        />
      )}

      {/* Save as Rule Modal */}
      {showRuleModal && (
        <SaveAsRuleModal
          flow={flow}
          direction={ruleDirection}
          onClose={() => setShowRuleModal(false)}
        />
      )}

      {/* Generate Mock Modal */}
      {showGenerateMock && (
        <GenerateMockModal
          request={{
            method: flow.request.method,
            url: flow.request.url,
            host: flow.request.host,
            path: flow.request.path,
            headers: flow.request.headers,
            body: flow.request.content || undefined,
          }}
          onClose={() => setShowGenerateMock(false)}
          onSuccess={(datastoreKey) => {
            setShowGenerateMock(false);
            setMockSuccess(`Mock created with key: ${datastoreKey}`);
            setTimeout(() => setMockSuccess(null), 5000);
          }}
        />
      )}

      {/* Create Variant Modal */}
      {showCreateVariant && (
        <CreateVariantModal
          flow={flow}
          onClose={() => setShowCreateVariant(false)}
          onCreated={() => {
            setShowCreateVariant(false);
            setMockSuccess('Replay variant created! View it in the Replay tab.');
            setTimeout(() => setMockSuccess(null), 5000);
          }}
        />
      )}
    </div>
  );
}

interface SaveToDatastoreModalProps {
  flow: TrafficFlow;
  type: 'request' | 'response';
  onClose: () => void;
}

function SaveToDatastoreModal({ flow, type, onClose }: SaveToDatastoreModalProps) {
  // Generate a default key from the URL
  const defaultKey = (() => {
    try {
      const url = new URL(flow.request.url);
      const path = url.pathname.replace(/\//g, '_').replace(/^_/, '');
      return `${url.hostname}_${path || 'root'}`.slice(0, 50);
    } catch {
      return `traffic_${flow.flow_id.slice(0, 8)}`;
    }
  })();

  const [key, setKey] = useState(defaultKey);
  const [description, setDescription] = useState(`Saved from traffic: ${flow.request.method} ${flow.request.path}`);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSave = async () => {
    if (!key.trim()) {
      setError('Key is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const endpoint = type === 'response' ? 'responses' : 'requests';
      let data: any;

      if (type === 'response') {
        if (!flow.response) {
          throw new Error('No response available to save');
        }
        data = {
          metadata: {
            created_at: Date.now(),
            description,
          },
          status_code: flow.response.status_code,
          headers: flow.response.headers,
          body: flow.response.content || '',
        };
      } else {
        data = {
          metadata: {
            created_at: Date.now(),
            description,
          },
          method: flow.request.method,
          url: flow.request.url,
          headers: flow.request.headers,
          body: flow.request.content || '',
        };
      }

      const res = await fetch(`${API_BASE}/api/datastore/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key.trim(), data }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to save');
      }

      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-inspector-surface border border-inspector-border rounded-lg shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-inspector-border">
          <h2 className="text-lg font-medium text-inspector-text">
            Save {type === 'response' ? 'Response' : 'Request'} to Datastore
          </h2>
          <button
            onClick={onClose}
            className="text-inspector-muted hover:text-inspector-text"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-inspector-error/20 text-inspector-error rounded p-3 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-inspector-success/20 text-inspector-success rounded p-3 text-sm">
              Saved successfully!
            </div>
          )}

          {/* Source info */}
          <div className="text-xs text-inspector-muted bg-inspector-bg rounded p-2 font-mono">
            {flow.request.method} {flow.request.url}
            {type === 'response' && flow.response && (
              <span className="ml-2 text-inspector-accent">{flow.response.status_code}</span>
            )}
          </div>

          {/* Key */}
          <div>
            <label className="block text-sm text-inspector-text mb-1">Key *</label>
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="unique-key-name"
              disabled={success}
              className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text font-mono text-sm focus:outline-none focus:border-inspector-accent disabled:opacity-50"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm text-inspector-text mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              disabled={success}
              className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text text-sm focus:outline-none focus:border-inspector-accent disabled:opacity-50"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-inspector-border bg-inspector-bg">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-inspector-muted hover:text-inspector-text"
          >
            {success ? 'Close' : 'Cancel'}
          </button>
          {!success && (
            <button
              onClick={handleSave}
              disabled={saving}
              className={clsx(
                'px-4 py-2 text-sm font-medium rounded',
                saving
                  ? 'bg-inspector-accent/50 text-white cursor-not-allowed'
                  : 'bg-inspector-accent text-white hover:bg-inspector-accent/80'
              )}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface SaveAsRuleModalProps {
  flow: TrafficFlow;
  direction: 'request' | 'response';
  onClose: () => void;
}

type RuleActionType = 'passthrough' | 'intercept' | 'serve_from_store';

function SaveAsRuleModal({ flow, direction, onClose }: SaveAsRuleModalProps) {
  // Generate a default name from the URL
  const defaultName = (() => {
    try {
      const url = new URL(flow.request.url);
      return `${flow.request.method} ${url.hostname}${url.pathname.slice(0, 30)}`;
    } catch {
      return `Rule from traffic ${flow.flow_id.slice(0, 8)}`;
    }
  })();

  // Generate a default datastore key
  const defaultStoreKey = (() => {
    try {
      const url = new URL(flow.request.url);
      const path = url.pathname.replace(/\//g, '_').replace(/^_/, '');
      return `${url.hostname}_${path || 'root'}`.slice(0, 50);
    } catch {
      return `traffic_${flow.flow_id.slice(0, 8)}`;
    }
  })();

  const [name, setName] = useState(defaultName);
  const [matchHost, setMatchHost] = useState(true);
  const [matchPath, setMatchPath] = useState(true);
  const [matchMethod, setMatchMethod] = useState(true);
  const [actionType, setActionType] = useState<RuleActionType>('passthrough');
  const [storeKeyMode, setStoreKeyMode] = useState<'new' | 'existing'>('new');
  const [newStoreKey, setNewStoreKey] = useState(defaultStoreKey);
  const [existingStoreKey, setExistingStoreKey] = useState('');
  const [existingKeys, setExistingKeys] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Fetch existing datastore keys for serve_from_store
  useEffect(() => {
    if (actionType === 'serve_from_store') {
      const fetchKeys = async () => {
        try {
          const endpoint = direction === 'response' ? 'responses' : 'requests';
          const res = await fetch(`${API_BASE}/api/datastore/${endpoint}`);
          if (res.ok) {
            const data = await res.json();
            setExistingKeys((data.items || []).map((i: { key: string }) => i.key));
          }
        } catch (err) {
          console.error('Failed to fetch datastore keys:', err);
        }
      };
      fetchKeys();
    }
  }, [actionType, direction]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Rule name is required');
      return;
    }

    if (actionType === 'serve_from_store') {
      if (storeKeyMode === 'new' && !newStoreKey.trim()) {
        setError('Store key is required');
        return;
      }
      if (storeKeyMode === 'existing' && !existingStoreKey) {
        setError('Please select an existing store key');
        return;
      }
    }

    setSaving(true);
    setError(null);

    try {
      // If saving to datastore with new key, save the data first
      if (actionType === 'serve_from_store' && storeKeyMode === 'new') {
        const endpoint = direction === 'response' ? 'responses' : 'requests';
        let datastoreData: any;

        if (direction === 'response' && flow.response) {
          datastoreData = {
            metadata: {
              created_at: Date.now(),
              description: `Saved from traffic: ${flow.request.method} ${flow.request.path}`,
            },
            status_code: flow.response.status_code,
            headers: flow.response.headers,
            body: flow.response.content || '',
          };
        } else {
          datastoreData = {
            metadata: {
              created_at: Date.now(),
              description: `Saved from traffic: ${flow.request.method} ${flow.request.path}`,
            },
            method: flow.request.method,
            url: flow.request.url,
            headers: flow.request.headers,
            body: flow.request.content || '',
          };
        }

        const saveRes = await fetch(`${API_BASE}/api/datastore/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: newStoreKey.trim(), data: datastoreData }),
        });

        if (!saveRes.ok) {
          const errData = await saveRes.json();
          throw new Error(errData.error || 'Failed to save to datastore');
        }
      }

      // Build the filter based on selected options
      const filter: any = {};

      if (matchHost) {
        filter.host = {
          match: 'exact',
          value: flow.request.host,
        };
      }

      if (matchPath) {
        filter.path = {
          match: 'exact',
          value: flow.request.path,
        };
      }

      if (matchMethod) {
        filter.method = {
          match: 'exact',
          value: flow.request.method,
        };
      }

      // Mark as LLM API if the flow is an LLM API request
      if (flow.is_llm_api) {
        filter.is_llm_api = true;
      }

      // Build action
      const action: any = { type: actionType };
      if (actionType === 'serve_from_store') {
        action.store_key = storeKeyMode === 'new' ? newStoreKey.trim() : existingStoreKey;
      }

      const rule = {
        id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: name.trim(),
        enabled: false, // Disabled by default as requested
        direction,
        priority: 100, // Default priority
        filter,
        action,
      };

      const res = await fetch(`${API_BASE}/api/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to create rule');
      }

      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-inspector-surface border border-inspector-border rounded-lg shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-inspector-border">
          <h2 className="text-lg font-medium text-inspector-text">
            Create {direction === 'request' ? 'Request' : 'Response'} Rule
          </h2>
          <button
            onClick={onClose}
            className="text-inspector-muted hover:text-inspector-text"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-inspector-error/20 text-inspector-error rounded p-3 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-inspector-success/20 text-inspector-success rounded p-3 text-sm">
              Rule created successfully! It is disabled by default.
            </div>
          )}

          {/* Source info */}
          <div className="text-xs text-inspector-muted bg-inspector-bg rounded p-2 font-mono">
            {flow.request.method} {flow.request.url}
            {flow.is_llm_api && (
              <span className="ml-2 px-1.5 py-0.5 bg-purple-600 text-white text-xs rounded">LLM</span>
            )}
          </div>

          {/* Rule Name */}
          <div>
            <label className="block text-sm text-inspector-text mb-1">Rule Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter rule name"
              disabled={success}
              className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text text-sm focus:outline-none focus:border-inspector-accent disabled:opacity-50"
            />
          </div>

          {/* Match Options */}
          <div>
            <label className="block text-sm text-inspector-text mb-2">Match Conditions</label>
            <div className="space-y-2 bg-inspector-bg rounded p-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={matchHost}
                  onChange={(e) => setMatchHost(e.target.checked)}
                  disabled={success}
                  className="w-4 h-4 rounded border-inspector-border"
                />
                <span className="text-sm">Host:</span>
                <span className="text-sm font-mono text-inspector-muted">{flow.request.host}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={matchPath}
                  onChange={(e) => setMatchPath(e.target.checked)}
                  disabled={success}
                  className="w-4 h-4 rounded border-inspector-border"
                />
                <span className="text-sm">Path:</span>
                <span className="text-sm font-mono text-inspector-muted truncate">{flow.request.path}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={matchMethod}
                  onChange={(e) => setMatchMethod(e.target.checked)}
                  disabled={success}
                  className="w-4 h-4 rounded border-inspector-border"
                />
                <span className="text-sm">Method:</span>
                <span className="text-sm font-mono text-inspector-muted">{flow.request.method}</span>
              </label>
            </div>
          </div>

          {/* Action Type */}
          <div>
            <label className="block text-sm text-inspector-text mb-2">Action</label>
            <select
              value={actionType}
              onChange={(e) => setActionType(e.target.value as RuleActionType)}
              disabled={success}
              className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text text-sm focus:outline-none focus:border-inspector-accent disabled:opacity-50"
            >
              <option value="passthrough">Passthrough (log only)</option>
              <option value="intercept">Intercept (manual edit)</option>
              <option value="serve_from_store">Serve from Data Store</option>
            </select>
          </div>

          {/* Serve from Store Options */}
          {actionType === 'serve_from_store' && (
            <div className="bg-inspector-bg rounded p-3 space-y-3">
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={storeKeyMode === 'new'}
                    onChange={() => setStoreKeyMode('new')}
                    disabled={success}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Save current {direction} as new key</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={storeKeyMode === 'existing'}
                    onChange={() => setStoreKeyMode('existing')}
                    disabled={success}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Use existing key</span>
                </label>
              </div>

              {storeKeyMode === 'new' ? (
                <div>
                  <label className="block text-xs text-inspector-muted mb-1">New Key Name</label>
                  <input
                    type="text"
                    value={newStoreKey}
                    onChange={(e) => setNewStoreKey(e.target.value)}
                    placeholder="my_mock_response"
                    disabled={success}
                    className="w-full bg-inspector-surface border border-inspector-border rounded px-3 py-2 text-inspector-text text-sm font-mono focus:outline-none focus:border-inspector-accent disabled:opacity-50"
                  />
                  <p className="text-xs text-inspector-muted mt-1">
                    The current {direction} will be saved to the datastore with this key.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-inspector-muted mb-1">Select Existing Key</label>
                  <select
                    value={existingStoreKey}
                    onChange={(e) => setExistingStoreKey(e.target.value)}
                    disabled={success}
                    className="w-full bg-inspector-surface border border-inspector-border rounded px-3 py-2 text-inspector-text text-sm font-mono focus:outline-none focus:border-inspector-accent disabled:opacity-50"
                  >
                    <option value="">Select a key...</option>
                    {existingKeys.map((key) => (
                      <option key={key} value={key}>{key}</option>
                    ))}
                  </select>
                  {existingKeys.length === 0 && (
                    <p className="text-xs text-inspector-warning mt-1">
                      No existing {direction === 'response' ? 'responses' : 'requests'} in datastore.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Info */}
          <div className="text-xs text-inspector-muted">
            The rule will be created <span className="font-semibold">disabled</span> by default. You can edit it in the Rules view.
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-inspector-border bg-inspector-bg">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-inspector-muted hover:text-inspector-text"
          >
            {success ? 'Close' : 'Cancel'}
          </button>
          {!success && (
            <button
              onClick={handleSave}
              disabled={saving || (!matchHost && !matchPath && !matchMethod)}
              className={clsx(
                'px-4 py-2 text-sm font-medium rounded',
                saving || (!matchHost && !matchPath && !matchMethod)
                  ? 'bg-inspector-accent/50 text-white cursor-not-allowed'
                  : 'bg-inspector-accent text-white hover:bg-inspector-accent/80'
              )}
            >
              {saving ? 'Creating...' : 'Create Rule'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
