/**
 * Data Store View - browse and manage stored mock requests/responses
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { clsx } from 'clsx';
import { StoredResponse, StoredRequest, StoredItem, Rule } from '../../types';
import { TransformModal } from '../shared/TransformModal';

type Tab = 'responses' | 'requests';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:2000';

export function DataStoreView() {
  const [activeTab, setActiveTab] = useState<Tab>('responses');
  const [responses, setResponses] = useState<StoredItem<StoredResponse>[]>([]);
  const [requests, setRequests] = useState<StoredItem<StoredRequest>[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingItem, setEditingItem] = useState<StoredItem<StoredResponse | StoredRequest> | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [transformingItem, setTransformingItem] = useState<StoredItem<StoredResponse> | null>(null);

  // Fetch rules on mount to determine usage
  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/rules`);
      if (res.ok) {
        const data = await res.json();
        setRules(data.rules || []);
      }
    } catch {
      // Silently fail - usage info is optional
    }
  };

  // Compute which keys are used by rules
  const keyUsageMap = useMemo(() => {
    const usageMap = new Map<string, Rule[]>();
    for (const rule of rules) {
      if (rule.action.type === 'serve_from_store' && rule.action.store_key) {
        const existing = usageMap.get(rule.action.store_key) || [];
        usageMap.set(rule.action.store_key, [...existing, rule]);
      }
    }
    return usageMap;
  }, [rules]);

  // Fetch data on mount and tab change
  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'responses') {
        const res = await fetch(`${API_BASE}/api/datastore/responses`);
        if (!res.ok) throw new Error('Failed to fetch responses');
        const data = await res.json();
        setResponses(data.items);
      } else {
        const res = await fetch(`${API_BASE}/api/datastore/requests`);
        if (!res.ok) throw new Error('Failed to fetch requests');
        const data = await res.json();
        setRequests(data.items);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (key: string) => {
    // Check if any rules use this key
    const usingRules = keyUsageMap.get(key) || [];
    let confirmMessage = `Delete "${key}"?`;

    if (usingRules.length > 0) {
      const ruleNames = usingRules.map(r => r.name).join(', ');
      confirmMessage = `Warning: This entry is used by ${usingRules.length} rule(s): ${ruleNames}\n\nDeleting it will cause those rules to fail silently.\n\nDelete "${key}" anyway?`;
    }

    if (!confirm(confirmMessage)) return;

    try {
      const endpoint = activeTab === 'responses' ? 'responses' : 'requests';
      const res = await fetch(`${API_BASE}/api/datastore/${endpoint}/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');

      // Refresh and clear selection
      if (selectedKey === key) setSelectedKey(null);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCreate = async (data: CreateEntryData) => {
    try {
      const endpoint = activeTab === 'responses' ? 'responses' : 'requests';
      const res = await fetch(`${API_BASE}/api/datastore/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: data.key, data: data.entry }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to create');
      }
      setShowCreateModal(false);
      fetchData();
    } catch (err: any) {
      throw err; // Let modal handle the error display
    }
  };

  const handleEdit = (item: StoredItem<StoredResponse | StoredRequest>) => {
    setEditingItem(item);
  };

  const handleDuplicate = async (item: StoredItem<StoredResponse | StoredRequest>) => {
    try {
      const endpoint = activeTab === 'responses' ? 'responses' : 'requests';
      const newKey = `${item.key}_copy`;

      // Create new entry with updated metadata
      const newData = {
        ...item.data,
        metadata: {
          ...item.data.metadata,
          created_at: Date.now(),
          description: item.data.metadata.description
            ? `${item.data.metadata.description} (Copy)`
            : 'Copy',
        },
      };

      const res = await fetch(`${API_BASE}/api/datastore/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: newKey, data: newData }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to duplicate');
      }

      fetchData();
      setSelectedKey(newKey);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdate = async (key: string, data: StoredResponse | StoredRequest) => {
    try {
      const endpoint = activeTab === 'responses' ? 'responses' : 'requests';
      const res = await fetch(`${API_BASE}/api/datastore/${endpoint}/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to update');
      }
      setEditingItem(null);
      fetchData();
    } catch (err: any) {
      throw err; // Let modal handle the error display
    }
  };

  const items = activeTab === 'responses' ? responses : requests;
  const selectedItem = items.find(item => item.key === selectedKey);

  const handleExport = () => {
    const exportData = {
      version: 1,
      exported_at: new Date().toISOString(),
      type: activeTab,
      items: items,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `datastore-${activeTab}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    try {
      const content = await file.text();
      const data = JSON.parse(content);

      // Validate structure
      if (!data.items || !Array.isArray(data.items)) {
        throw new Error('Invalid file format: expected { items: [...] }');
      }

      // Import each item
      let imported = 0;
      let skipped = 0;
      const endpoint = activeTab === 'responses' ? 'responses' : 'requests';

      for (const item of data.items) {
        if (!item.key || !item.data) {
          skipped++;
          continue;
        }

        try {
          const res = await fetch(`${API_BASE}/api/datastore/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: item.key, data: item.data }),
          });

          if (res.ok) {
            imported++;
          } else {
            // Key might already exist, try to skip
            skipped++;
          }
        } catch {
          skipped++;
        }
      }

      fetchData();
      alert(`Imported ${imported} ${activeTab}${skipped > 0 ? `, ${skipped} skipped (may already exist)` : ''}.`);
    } catch (err: any) {
      setError(`Import failed: ${err.message}`);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden" data-testid="datastore-view">
      {/* Header with tabs */}
      <div className="border-b border-inspector-border bg-inspector-surface px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex gap-2" role="tablist" aria-label="Data store tabs">
            <TabButton
              active={activeTab === 'responses'}
              onClick={() => { setActiveTab('responses'); setSelectedKey(null); }}
              testId="datastore-tab-responses"
            >
              Responses ({responses.length})
            </TabButton>
            <TabButton
              active={activeTab === 'requests'}
              onClick={() => { setActiveTab('requests'); setSelectedKey(null); }}
              testId="datastore-tab-requests"
            >
              Requests ({requests.length})
            </TabButton>
          </div>
          <div className="flex gap-2">
            {/* Import/Export buttons */}
            <button
              onClick={handleExport}
              disabled={items.length === 0}
              className="text-sm px-3 py-1 rounded bg-inspector-bg hover:bg-inspector-border text-inspector-muted disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              title={`Export all ${activeTab} to JSON`}
              data-testid="datastore-export-btn"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Export
            </button>
            <label className="text-sm px-3 py-1 rounded bg-inspector-bg hover:bg-inspector-border text-inspector-muted cursor-pointer flex items-center gap-1" data-testid="datastore-import-btn">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Import
              <input
                type="file"
                accept=".json"
                className="hidden"
                data-testid="datastore-import-input"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleImport(file);
                    e.target.value = ''; // Reset for same file re-import
                  }
                }}
              />
            </label>
            <button
              onClick={() => setShowCreateModal(true)}
              className="text-sm px-3 py-1 rounded bg-inspector-accent hover:bg-inspector-accent/80 text-white font-medium"
              data-testid="datastore-create-btn"
            >
              + Create New
            </button>
            <button
              onClick={fetchData}
              className="text-sm px-3 py-1 rounded bg-inspector-bg hover:bg-inspector-border text-inspector-muted"
              data-testid="datastore-refresh-btn"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-inspector-error/20 text-inspector-error px-4 py-2 text-sm">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* List */}
        <div className="w-1/3 border-r border-inspector-border overflow-y-auto">
          {loading ? (
            <div className="p-4 text-inspector-muted">Loading...</div>
          ) : items.length === 0 ? (
            <div className="p-4 text-inspector-muted">
              No {activeTab} stored yet.
            </div>
          ) : (
            <div className="divide-y divide-inspector-border">
              {items.map((item) => (
                <ItemRow
                  key={item.key}
                  item={item}
                  isSelected={selectedKey === item.key}
                  onClick={() => setSelectedKey(item.key)}
                  onEdit={() => handleEdit(item)}
                  onDuplicate={() => handleDuplicate(item)}
                  onDelete={() => handleDelete(item.key)}
                  type={activeTab}
                  usedByRules={keyUsageMap.get(item.key) || []}
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="flex-1 overflow-y-auto">
          {selectedItem ? (
            <DetailPanel
              item={selectedItem}
              type={activeTab}
              usedByRules={keyUsageMap.get(selectedItem.key) || []}
              onTransform={activeTab === 'responses' ? () => setTransformingItem(selectedItem as StoredItem<StoredResponse>) : undefined}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-inspector-muted">
              Select an item to view details
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateEntryModal
          type={activeTab}
          onClose={() => setShowCreateModal(false)}
          onSave={handleCreate}
        />
      )}

      {/* Edit Modal */}
      {editingItem && (
        <EditEntryModal
          type={activeTab}
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={handleUpdate}
        />
      )}

      {/* Transform Modal */}
      {transformingItem && (
        <TransformModal
          datastoreKey={transformingItem.key}
          currentBody={transformingItem.data.body}
          onClose={() => setTransformingItem(null)}
          onSuccess={() => {
            setTransformingItem(null);
            fetchData();
          }}
        />
      )}
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
}

function TabButton({ active, onClick, children, testId }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      data-testid={testId}
      className={clsx(
        'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
        active
          ? 'bg-inspector-accent text-white'
          : 'bg-inspector-bg text-inspector-muted hover:text-inspector-text'
      )}
    >
      {children}
    </button>
  );
}

interface ItemRowProps {
  item: StoredItem<StoredResponse> | StoredItem<StoredRequest>;
  isSelected: boolean;
  onClick: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  type: Tab;
  usedByRules: Rule[];
}

function ItemRow({ item, isSelected, onClick, onEdit, onDuplicate, onDelete, type, usedByRules }: ItemRowProps) {
  const timestamp = new Date(item.data.metadata.created_at).toLocaleString();
  const description = item.data.metadata.description;

  return (
    <div
      onClick={onClick}
      data-testid={`datastore-item-${item.key}`}
      aria-selected={isSelected}
      role="option"
      className={clsx(
        'px-4 py-3 cursor-pointer hover:bg-inspector-surface transition-colors',
        isSelected && 'bg-inspector-surface border-l-2 border-inspector-accent'
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {/* Short ID */}
            {item.shortId && (
              <span className="text-xs text-inspector-accent font-mono w-10 flex-shrink-0">
                {item.shortId}
              </span>
            )}
            <span className="font-mono text-sm truncate text-inspector-text">
              {item.key}
            </span>
            {usedByRules.length > 0 && (
              <span
                className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 flex items-center gap-1"
                title={`Used by: ${usedByRules.map(r => r.name).join(', ')}`}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                {usedByRules.length}
              </span>
            )}
          </div>
          {description && (
            <div className="text-xs text-inspector-muted truncate mt-0.5">
              {description}
            </div>
          )}
          <div className="flex items-center gap-2 mt-1">
            {type === 'responses' && 'status_code' in item.data && (
              <StatusBadge code={(item.data as StoredResponse).status_code} />
            )}
            {type === 'requests' && 'method' in item.data && (
              <MethodBadge method={(item.data as StoredRequest).method} />
            )}
            <span className="text-xs text-inspector-muted">{timestamp}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1 text-inspector-muted hover:text-inspector-accent transition-colors"
            title="Edit"
            aria-label={`Edit ${item.key}`}
            data-testid={`datastore-item-edit-${item.key}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
            className="p-1 text-inspector-muted hover:text-inspector-accent transition-colors"
            title="Duplicate"
            aria-label={`Duplicate ${item.key}`}
            data-testid={`datastore-item-duplicate-${item.key}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1 text-inspector-muted hover:text-inspector-error transition-colors"
            title="Delete"
            aria-label={`Delete ${item.key}`}
            data-testid={`datastore-item-delete-${item.key}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

interface DetailPanelProps {
  item: StoredItem<StoredResponse> | StoredItem<StoredRequest>;
  type: Tab;
  usedByRules: Rule[];
  onTransform?: () => void;
}

function DetailPanel({ item, type, usedByRules, onTransform }: DetailPanelProps) {
  const [showBodyMode, setShowBodyMode] = useState<'raw' | 'pretty'>('pretty');

  const data = item.data;
  const body = data.body;
  const headers = data.headers;

  // Try to format JSON body
  let formattedBody = body;
  if (showBodyMode === 'pretty') {
    try {
      formattedBody = JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      // Not JSON, use raw
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* Key and metadata */}
      <div>
        <div className="flex items-center gap-2">
          {item.shortId && (
            <span className="text-sm text-inspector-accent font-mono">
              {item.shortId}
            </span>
          )}
          <h2 className="text-lg font-medium text-inspector-text font-mono">
            {item.key}
          </h2>
        </div>
        {data.metadata.description && (
          <p className="text-sm text-inspector-muted mt-1">
            {data.metadata.description}
          </p>
        )}
        <p className="text-xs text-inspector-muted mt-1">
          Created: {new Date(data.metadata.created_at).toLocaleString()}
        </p>
      </div>

      {/* Used by rules */}
      {usedByRules.length > 0 && (
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
          <h3 className="text-sm font-medium text-purple-400 mb-2 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            Used by {usedByRules.length} rule{usedByRules.length !== 1 ? 's' : ''}
          </h3>
          <div className="space-y-1">
            {usedByRules.map((rule) => (
              <div key={rule.id} className="flex items-center gap-2 text-sm">
                <span className={clsx(
                  'w-2 h-2 rounded-full',
                  rule.enabled ? 'bg-inspector-success' : 'bg-inspector-muted'
                )} />
                <span className="text-inspector-text">{rule.name}</span>
                <span className="text-xs text-inspector-muted">
                  ({rule.direction})
                </span>
                {!rule.enabled && (
                  <span className="text-xs text-inspector-muted">(disabled)</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Type-specific info */}
      {type === 'responses' && 'status_code' in data && (
        <div className="flex items-center gap-4">
          <div>
            <span className="text-xs text-inspector-muted">Status</span>
            <div className="mt-0.5">
              <StatusBadge code={(data as StoredResponse).status_code} />
            </div>
          </div>
        </div>
      )}

      {type === 'requests' && 'method' in data && (
        <div className="flex items-center gap-4">
          <div>
            <span className="text-xs text-inspector-muted">Method</span>
            <div className="mt-0.5">
              <MethodBadge method={(data as StoredRequest).method} />
            </div>
          </div>
          <div>
            <span className="text-xs text-inspector-muted">URL</span>
            <div className="mt-0.5 text-sm font-mono text-inspector-text">
              {(data as StoredRequest).url}
            </div>
          </div>
        </div>
      )}

      {/* Headers */}
      <div>
        <h3 className="text-sm font-medium text-inspector-text mb-2">Headers</h3>
        {Object.keys(headers).length > 0 ? (
          <div className="bg-inspector-bg rounded p-3 font-mono text-xs overflow-x-auto">
            {Object.entries(headers).map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <span className="text-inspector-accent">{key}:</span>
                <span className="text-inspector-text">{value}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-inspector-muted">No headers</p>
        )}
      </div>

      {/* Body */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-inspector-text">Body</h3>
          <div className="flex gap-2">
            {type === 'responses' && onTransform && (
              <button
                onClick={onTransform}
                className="text-xs px-2 py-1 rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 flex items-center gap-1"
                title="Transform body content using LLM"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Transform with LLM
              </button>
            )}
            <div className="flex gap-1">
              <button
                onClick={() => setShowBodyMode('raw')}
                className={clsx(
                  'text-xs px-2 py-1 rounded',
                  showBodyMode === 'raw'
                    ? 'bg-inspector-accent text-white'
                    : 'bg-inspector-bg text-inspector-muted hover:text-inspector-text'
                )}
              >
                Raw
              </button>
              <button
                onClick={() => setShowBodyMode('pretty')}
                className={clsx(
                  'text-xs px-2 py-1 rounded',
                  showBodyMode === 'pretty'
                    ? 'bg-inspector-accent text-white'
                    : 'bg-inspector-bg text-inspector-muted hover:text-inspector-text'
                )}
              >
                Pretty
              </button>
            </div>
          </div>
        </div>
        <pre className="bg-inspector-bg rounded p-3 font-mono text-xs overflow-auto max-h-96 whitespace-pre-wrap break-all text-inspector-text">
          {formattedBody || '(empty)'}
        </pre>
      </div>
    </div>
  );
}

function StatusBadge({ code }: { code: number }) {
  const color = code >= 500
    ? 'bg-inspector-error'
    : code >= 400
    ? 'bg-orange-500'
    : code >= 300
    ? 'bg-yellow-500'
    : 'bg-inspector-success';

  return (
    <span className={clsx('text-xs font-bold px-2 py-0.5 rounded text-white', color)}>
      {code}
    </span>
  );
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: 'bg-green-600',
    POST: 'bg-blue-600',
    PUT: 'bg-orange-600',
    PATCH: 'bg-yellow-600',
    DELETE: 'bg-red-600',
  };
  const color = colors[method.toUpperCase()] || 'bg-inspector-muted';

  return (
    <span className={clsx('text-xs font-bold px-2 py-0.5 rounded text-white', color)}>
      {method.toUpperCase()}
    </span>
  );
}

// Types for create modal
interface CreateEntryData {
  key: string;
  entry: StoredResponse | StoredRequest;
}

interface CreateEntryModalProps {
  type: Tab;
  onClose: () => void;
  onSave: (data: CreateEntryData) => Promise<void>;
}

function CreateEntryModal({ type, onClose, onSave }: CreateEntryModalProps) {
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [headers, setHeaders] = useState<Record<string, string>>({});
  const [newHeaderKey, setNewHeaderKey] = useState('');
  const [newHeaderValue, setNewHeaderValue] = useState('');

  // Response-specific
  const [statusCode, setStatusCode] = useState(200);

  // Request-specific
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddHeader = () => {
    if (newHeaderKey.trim() && newHeaderValue.trim()) {
      setHeaders({ ...headers, [newHeaderKey.trim()]: newHeaderValue.trim() });
      setNewHeaderKey('');
      setNewHeaderValue('');
    }
  };

  const handleRemoveHeader = (headerKey: string) => {
    const newHeaders = { ...headers };
    delete newHeaders[headerKey];
    setHeaders(newHeaders);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setBody(content);

      // Auto-set key from filename if empty
      if (!key) {
        const fileName = file.name.replace(/\.[^/.]+$/, ''); // Remove extension
        setKey(fileName);
      }
    };
    reader.readAsText(file);
  };

  const handleSave = async () => {
    if (!key.trim()) {
      setError('Key is required');
      return;
    }

    if (type === 'requests' && !url.trim()) {
      setError('URL is required for requests');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let entry: StoredResponse | StoredRequest;

      if (type === 'responses') {
        entry = {
          metadata: {
            created_at: Date.now(),
            description: description || undefined,
          },
          status_code: statusCode,
          headers,
          body,
        };
      } else {
        entry = {
          metadata: {
            created_at: Date.now(),
            description: description || undefined,
          },
          method,
          url,
          headers,
          body,
        };
      }

      await onSave({ key: key.trim(), entry });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const modalTitleId = 'create-entry-modal-title';

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby={modalTitleId}
      data-testid="create-entry-modal"
    >
      <div className="bg-inspector-surface border border-inspector-border rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-inspector-border">
          <h2 id={modalTitleId} className="text-lg font-medium text-inspector-text">
            Create New {type === 'responses' ? 'Response' : 'Request'}
          </h2>
          <button
            onClick={onClose}
            className="text-inspector-muted hover:text-inspector-text"
            aria-label="Close"
            data-testid="create-entry-close-btn"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="bg-inspector-error/20 text-inspector-error rounded p-3 text-sm" role="alert">
              {error}
            </div>
          )}

          {/* Key */}
          <div>
            <label className="block text-sm text-inspector-text mb-1" htmlFor="create-entry-key">Key *</label>
            <input
              id="create-entry-key"
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="unique-key-name"
              className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text font-mono text-sm focus:outline-none focus:border-inspector-accent"
              data-testid="create-entry-key-input"
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
              className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text text-sm focus:outline-none focus:border-inspector-accent"
            />
          </div>

          {/* Type-specific fields */}
          {type === 'responses' ? (
            <div>
              <label className="block text-sm text-inspector-text mb-1">Status Code</label>
              <input
                type="number"
                value={statusCode}
                onChange={(e) => setStatusCode(parseInt(e.target.value) || 200)}
                className="w-32 bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text text-sm focus:outline-none focus:border-inspector-accent"
              />
            </div>
          ) : (
            <div className="flex gap-4">
              <div>
                <label className="block text-sm text-inspector-text mb-1">Method</label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text text-sm focus:outline-none focus:border-inspector-accent"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm text-inspector-text mb-1">URL *</label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://api.example.com/endpoint"
                  className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text font-mono text-sm focus:outline-none focus:border-inspector-accent"
                />
              </div>
            </div>
          )}

          {/* Headers */}
          <div>
            <label className="block text-sm text-inspector-text mb-2">Headers</label>
            <div className="space-y-2">
              {Object.entries(headers).map(([headerKey, value]) => (
                <div key={headerKey} className="flex items-center gap-2 bg-inspector-bg rounded px-2 py-1">
                  <span className="font-mono text-xs text-inspector-accent">{headerKey}:</span>
                  <span className="font-mono text-xs text-inspector-text flex-1">{value}</span>
                  <button
                    onClick={() => handleRemoveHeader(headerKey)}
                    className="text-inspector-muted hover:text-inspector-error"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newHeaderKey}
                  onChange={(e) => setNewHeaderKey(e.target.value)}
                  placeholder="Header name"
                  className="flex-1 bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-inspector-text font-mono text-xs focus:outline-none focus:border-inspector-accent"
                />
                <input
                  type="text"
                  value={newHeaderValue}
                  onChange={(e) => setNewHeaderValue(e.target.value)}
                  placeholder="Value"
                  className="flex-1 bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-inspector-text font-mono text-xs focus:outline-none focus:border-inspector-accent"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddHeader()}
                />
                <button
                  onClick={handleAddHeader}
                  className="px-2 py-1 bg-inspector-border text-inspector-text rounded text-xs hover:bg-inspector-accent hover:text-white"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* Body */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm text-inspector-text">Body</label>
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                  accept=".json,.txt,.xml,.html"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs px-2 py-1 bg-inspector-bg border border-inspector-border rounded text-inspector-muted hover:text-inspector-text hover:border-inspector-accent"
                >
                  Upload File
                </button>
              </div>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Enter body content or upload a file..."
              className="w-full h-48 bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text font-mono text-sm resize-none focus:outline-none focus:border-inspector-accent"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-inspector-border bg-inspector-bg">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-inspector-muted hover:text-inspector-text"
            data-testid="create-entry-cancel-btn"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={clsx(
              'px-4 py-2 text-sm font-medium rounded',
              saving
                ? 'bg-inspector-accent/50 text-white cursor-not-allowed'
                : 'bg-inspector-accent text-white hover:bg-inspector-accent/80'
            )}
            data-testid="create-entry-save-btn"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Edit Entry Modal
interface EditEntryModalProps {
  type: Tab;
  item: StoredItem<StoredResponse | StoredRequest>;
  onClose: () => void;
  onSave: (key: string, data: StoredResponse | StoredRequest) => Promise<void>;
}

function EditEntryModal({ type, item, onClose, onSave }: EditEntryModalProps) {
  const [description, setDescription] = useState(item.data.metadata.description || '');
  const [body, setBody] = useState(item.data.body);
  const [headers, setHeaders] = useState<Record<string, string>>(item.data.headers || {});
  const [newHeaderKey, setNewHeaderKey] = useState('');
  const [newHeaderValue, setNewHeaderValue] = useState('');

  // Response-specific
  const [statusCode, setStatusCode] = useState(
    type === 'responses' ? (item.data as StoredResponse).status_code : 200
  );

  // Request-specific
  const [method, setMethod] = useState(
    type === 'requests' ? (item.data as StoredRequest).method : 'GET'
  );
  const [url, setUrl] = useState(
    type === 'requests' ? (item.data as StoredRequest).url : ''
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddHeader = () => {
    if (newHeaderKey.trim() && newHeaderValue.trim()) {
      setHeaders({ ...headers, [newHeaderKey.trim()]: newHeaderValue.trim() });
      setNewHeaderKey('');
      setNewHeaderValue('');
    }
  };

  const handleRemoveHeader = (headerKey: string) => {
    const newHeaders = { ...headers };
    delete newHeaders[headerKey];
    setHeaders(newHeaders);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setBody(content);
    };
    reader.readAsText(file);
  };

  const handleSave = async () => {
    if (type === 'requests' && !url.trim()) {
      setError('URL is required for requests');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let data: StoredResponse | StoredRequest;

      if (type === 'responses') {
        data = {
          metadata: {
            created_at: item.data.metadata.created_at,
            description: description || undefined,
          },
          status_code: statusCode,
          headers,
          body,
        };
      } else {
        data = {
          metadata: {
            created_at: item.data.metadata.created_at,
            description: description || undefined,
          },
          method,
          url,
          headers,
          body,
        };
      }

      await onSave(item.key, data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const modalTitleId = 'edit-entry-modal-title';

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby={modalTitleId}
      data-testid="edit-entry-modal"
    >
      <div className="bg-inspector-surface border border-inspector-border rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-inspector-border">
          <h2 id={modalTitleId} className="text-lg font-medium text-inspector-text">
            Edit {type === 'responses' ? 'Response' : 'Request'}
          </h2>
          <button
            onClick={onClose}
            className="text-inspector-muted hover:text-inspector-text"
            aria-label="Close"
            data-testid="edit-entry-close-btn"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="bg-inspector-error/20 text-inspector-error rounded p-3 text-sm" role="alert">
              {error}
            </div>
          )}

          {/* Key (read-only) */}
          <div>
            <label className="block text-sm text-inspector-text mb-1" htmlFor="edit-entry-key">Key</label>
            <input
              id="edit-entry-key"
              type="text"
              value={item.key}
              disabled
              className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-muted font-mono text-sm opacity-60"
              data-testid="edit-entry-key-input"
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
              className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text text-sm focus:outline-none focus:border-inspector-accent"
            />
          </div>

          {/* Type-specific fields */}
          {type === 'responses' ? (
            <div>
              <label className="block text-sm text-inspector-text mb-1">Status Code</label>
              <input
                type="number"
                value={statusCode}
                onChange={(e) => setStatusCode(parseInt(e.target.value) || 200)}
                className="w-32 bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text text-sm focus:outline-none focus:border-inspector-accent"
              />
            </div>
          ) : (
            <div className="flex gap-4">
              <div>
                <label className="block text-sm text-inspector-text mb-1">Method</label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text text-sm focus:outline-none focus:border-inspector-accent"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm text-inspector-text mb-1">URL *</label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://api.example.com/endpoint"
                  className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text font-mono text-sm focus:outline-none focus:border-inspector-accent"
                />
              </div>
            </div>
          )}

          {/* Headers */}
          <div>
            <label className="block text-sm text-inspector-text mb-2">Headers</label>
            <div className="space-y-2">
              {Object.entries(headers).map(([headerKey, value]) => (
                <div key={headerKey} className="flex items-center gap-2 bg-inspector-bg rounded px-2 py-1">
                  <span className="font-mono text-xs text-inspector-accent">{headerKey}:</span>
                  <span className="font-mono text-xs text-inspector-text flex-1">{value}</span>
                  <button
                    onClick={() => handleRemoveHeader(headerKey)}
                    className="text-inspector-muted hover:text-inspector-error"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newHeaderKey}
                  onChange={(e) => setNewHeaderKey(e.target.value)}
                  placeholder="Header name"
                  className="flex-1 bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-inspector-text font-mono text-xs focus:outline-none focus:border-inspector-accent"
                />
                <input
                  type="text"
                  value={newHeaderValue}
                  onChange={(e) => setNewHeaderValue(e.target.value)}
                  placeholder="Value"
                  className="flex-1 bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-inspector-text font-mono text-xs focus:outline-none focus:border-inspector-accent"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddHeader()}
                />
                <button
                  onClick={handleAddHeader}
                  className="px-2 py-1 bg-inspector-border text-inspector-text rounded text-xs hover:bg-inspector-accent hover:text-white"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* Body */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm text-inspector-text">Body</label>
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                  accept=".json,.txt,.xml,.html"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs px-2 py-1 bg-inspector-bg border border-inspector-border rounded text-inspector-muted hover:text-inspector-text hover:border-inspector-accent"
                >
                  Upload File
                </button>
              </div>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Enter body content or upload a file..."
              className="w-full h-48 bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text font-mono text-sm resize-none focus:outline-none focus:border-inspector-accent"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-inspector-border bg-inspector-bg">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-inspector-muted hover:text-inspector-text"
            data-testid="edit-entry-cancel-btn"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={clsx(
              'px-4 py-2 text-sm font-medium rounded',
              saving
                ? 'bg-inspector-accent/50 text-white cursor-not-allowed'
                : 'bg-inspector-accent text-white hover:bg-inspector-accent/80'
            )}
            data-testid="edit-entry-save-btn"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
