/**
 * Intercept queue view - shows pending intercepts and controls
 */

import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { useAppStore } from '../../stores/appStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import { PendingIntercept, InterceptMode, RuleDirection, RuleActionType } from '../../types';
import { DisplayModeToggle, formatContent } from '../shared/DisplayModeToggle';
import { GenerateMockModal } from '../shared/GenerateMockModal';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:2000';

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}

function getTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

interface InterceptCardProps {
  intercept: PendingIntercept;
  isActive: boolean;
  isChecked: boolean;
  onSelect: () => void;
  onCheckChange: (checked: boolean) => void;
}

function InterceptCard({ intercept, isActive, isChecked, onSelect, onCheckChange }: InterceptCardProps) {
  const timeAgo = getTimeAgo(intercept.timestamp);
  const isOld = Date.now() - intercept.timestamp > 4 * 60 * 1000; // 4 minutes

  return (
    <div
      className={clsx(
        'p-4 border-b border-inspector-border transition-colors flex items-start gap-3',
        isActive
          ? 'bg-inspector-accent/20'
          : 'hover:bg-inspector-surface',
        isOld && 'border-l-4 border-l-inspector-warning'
      )}
    >
      <input
        type="checkbox"
        checked={isChecked}
        onChange={(e) => {
          e.stopPropagation();
          onCheckChange(e.target.checked);
        }}
        className="mt-1 w-4 h-4 rounded border-inspector-border cursor-pointer"
        onClick={(e) => e.stopPropagation()}
      />
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onSelect}>
        <div className="flex items-center gap-3 mb-2">
          <span
            className={clsx(
              'px-2 py-0.5 rounded text-xs font-bold text-white',
              intercept.type === 'request' ? 'bg-blue-600' : 'bg-green-600'
            )}
          >
            {intercept.type.toUpperCase()}
          </span>
          <span className="font-mono text-sm truncate flex-1">
            {intercept.flow.request.method} {intercept.flow.request.host}
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-inspector-muted">
          <span className="truncate">{intercept.flow.request.path}</span>
          <span className={clsx(isOld && 'text-inspector-warning')}>{timeAgo}</span>
          {isOld && <span className="text-inspector-warning">Timeout soon</span>}
        </div>
      </div>
    </div>
  );
}

interface HeaderEditorProps {
  headers: Record<string, string>;
  onChange: (headers: Record<string, string>) => void;
  readOnly?: boolean;
}

function HeaderEditor({ headers, onChange, readOnly }: HeaderEditorProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [newHeaderKey, setNewHeaderKey] = useState('');
  const [newHeaderValue, setNewHeaderValue] = useState('');

  const handleValueChange = (key: string, value: string) => {
    onChange({ ...headers, [key]: value });
  };

  const handleDeleteHeader = (key: string) => {
    const newHeaders = { ...headers };
    delete newHeaders[key];
    onChange(newHeaders);
  };

  const handleAddHeader = () => {
    if (newHeaderKey.trim() && newHeaderValue.trim()) {
      onChange({ ...headers, [newHeaderKey.trim()]: newHeaderValue.trim() });
      setNewHeaderKey('');
      setNewHeaderValue('');
    }
  };

  return (
    <div className="space-y-2">
      {Object.entries(headers).map(([key, value]) => (
        <div key={key} className="flex items-start gap-2 font-mono text-sm">
          <span className="text-inspector-accent shrink-0">{key}:</span>
          {readOnly ? (
            <span className="text-inspector-text break-all">{value}</span>
          ) : (
            <>
              <input
                type="text"
                value={value}
                onChange={(e) => handleValueChange(key, e.target.value)}
                className="flex-1 min-w-0 bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm focus:outline-none focus:border-inspector-accent"
              />
              <button
                onClick={() => handleDeleteHeader(key)}
                className="text-inspector-error hover:text-red-400 px-1"
                title="Remove header"
              >
                x
              </button>
            </>
          )}
        </div>
      ))}
      {!readOnly && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-inspector-border">
          <input
            type="text"
            placeholder="Header name"
            value={newHeaderKey}
            onChange={(e) => setNewHeaderKey(e.target.value)}
            className="w-32 bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm focus:outline-none focus:border-inspector-accent"
          />
          <input
            type="text"
            placeholder="Value"
            value={newHeaderValue}
            onChange={(e) => setNewHeaderValue(e.target.value)}
            className="flex-1 min-w-0 bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm focus:outline-none focus:border-inspector-accent"
            onKeyDown={(e) => e.key === 'Enter' && handleAddHeader()}
          />
          <button
            onClick={handleAddHeader}
            className="px-2 py-1 bg-inspector-accent text-white rounded text-sm hover:bg-blue-600"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

interface InterceptDetailProps {
  intercept: PendingIntercept;
  onForward: () => void;
  onForwardModified: (modifications: { body?: string; headers?: Record<string, string>; status_code?: number }) => void;
  onDrop: () => void;
}

function InterceptDetail({ intercept, onForward, onForwardModified, onDrop }: InterceptDetailProps) {
  const { displayMode } = useAppStore();
  const isRequest = intercept.type === 'request';

  // Get original content
  const originalBody = isRequest
    ? intercept.flow.request.content || ''
    : intercept.flow.response?.content || '';

  const originalHeaders = isRequest
    ? intercept.flow.request.headers
    : intercept.flow.response?.headers || {};

  const originalStatusCode = intercept.flow.response?.status_code;

  // Editable state
  const [editedBody, setEditedBody] = useState(originalBody);
  const [editedHeaders, setEditedHeaders] = useState<Record<string, string>>({ ...originalHeaders });
  const [editedStatusCode, setEditedStatusCode] = useState(originalStatusCode);
  const [activeTab, setActiveTab] = useState<'headers' | 'body'>('body');
  const [isEditing, setIsEditing] = useState(false);

  // Modal state
  const [showSaveToDatastore, setShowSaveToDatastore] = useState(false);
  const [showSaveAsRule, setShowSaveAsRule] = useState(false);
  const [showGenerateMock, setShowGenerateMock] = useState(false);

  // Reset state when intercept changes
  useEffect(() => {
    setEditedBody(originalBody);
    setEditedHeaders({ ...originalHeaders });
    setEditedStatusCode(originalStatusCode);
    setIsEditing(false);
    setActiveTab('body');
  }, [intercept.flow_id]);

  // Check if anything was modified
  const bodyModified = editedBody !== originalBody;
  const headersModified = JSON.stringify(editedHeaders) !== JSON.stringify(originalHeaders);
  const statusModified = !isRequest && editedStatusCode !== originalStatusCode;
  const hasModifications = bodyModified || headersModified || statusModified;

  const handleForwardModified = () => {
    const modifications: { body?: string; headers?: Record<string, string>; status_code?: number } = {};
    if (bodyModified) modifications.body = editedBody;
    if (headersModified) modifications.headers = editedHeaders;
    if (statusModified && editedStatusCode !== undefined) modifications.status_code = editedStatusCode;
    onForwardModified(modifications);
  };

  return (
    <div className="flex-1 flex flex-col border-l border-inspector-border min-h-0 min-w-0 overflow-hidden">
      {/* Header - fixed */}
      <div className="shrink-0 p-4 border-b border-inspector-border">
        <div className="flex items-center gap-3 mb-2">
          <span
            className={clsx(
              'px-2 py-0.5 rounded text-xs font-bold text-white',
              isRequest ? 'bg-blue-600' : 'bg-green-600'
            )}
          >
            {intercept.type.toUpperCase()}
          </span>
          <span className="font-mono text-sm truncate">
            {intercept.flow.request.method} {intercept.flow.request.url}
          </span>
        </div>
        {!isRequest && intercept.flow.response && (
          <div className="flex items-center gap-2 text-sm text-inspector-muted">
            <span>Status:</span>
            {isEditing ? (
              <input
                type="number"
                value={editedStatusCode || ''}
                onChange={(e) => setEditedStatusCode(parseInt(e.target.value, 10) || undefined)}
                className="w-20 bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm focus:outline-none focus:border-inspector-accent"
              />
            ) : (
              <span className={clsx(
                editedStatusCode && editedStatusCode >= 200 && editedStatusCode < 300 ? 'text-inspector-success' :
                editedStatusCode && editedStatusCode >= 400 ? 'text-inspector-error' : ''
              )}>
                {editedStatusCode} {intercept.flow.response.reason}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Tabs - fixed */}
      <div className="shrink-0 flex border-b border-inspector-border">
        <button
          onClick={() => setActiveTab('headers')}
          className={clsx(
            'px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'headers'
              ? 'text-inspector-accent border-b-2 border-inspector-accent'
              : 'text-inspector-muted hover:text-inspector-text'
          )}
        >
          Headers ({Object.keys(editedHeaders).length})
          {headersModified && <span className="ml-1 text-inspector-warning">*</span>}
        </button>
        <button
          onClick={() => setActiveTab('body')}
          className={clsx(
            'px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'body'
              ? 'text-inspector-accent border-b-2 border-inspector-accent'
              : 'text-inspector-muted hover:text-inspector-text'
          )}
        >
          Body {editedBody.length > 0 && `(${editedBody.length} bytes)`}
          {bodyModified && <span className="ml-1 text-inspector-warning">*</span>}
        </button>
        <div className="ml-auto flex items-center gap-2 pr-2">
          <DisplayModeToggle />
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={clsx(
              'px-3 py-1 rounded text-sm',
              isEditing
                ? 'bg-inspector-accent text-white'
                : 'bg-inspector-surface text-inspector-text hover:bg-inspector-border'
            )}
          >
            {isEditing ? 'Preview' : 'Edit'}
          </button>
        </div>
      </div>

      {/* Content - scrollable */}
      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden p-4">
        {activeTab === 'headers' && (
          <div className="bg-inspector-bg border border-inspector-border rounded-lg p-3">
            <HeaderEditor
              headers={editedHeaders}
              onChange={setEditedHeaders}
              readOnly={!isEditing}
            />
          </div>
        )}

        {activeTab === 'body' && (
          <>
            {isEditing ? (
              <textarea
                value={editedBody}
                onChange={(e) => setEditedBody(e.target.value)}
                className="w-full h-full min-h-[300px] bg-inspector-bg border border-inspector-border rounded-lg p-3 font-mono text-sm resize-none focus:outline-none focus:border-inspector-accent"
                spellCheck={false}
              />
            ) : (
              <div className="bg-inspector-bg border border-inspector-border rounded-lg p-3">
                <pre className="font-mono text-sm whitespace-pre-wrap break-all">
                  {formatContent(editedBody, displayMode)}
                </pre>
              </div>
            )}
          </>
        )}
      </div>

      {/* Actions - fixed at bottom */}
      <div className="shrink-0 p-4 border-t border-inspector-border bg-inspector-surface">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={onForward}
            className="px-4 py-2 bg-inspector-success text-white rounded-lg font-medium hover:bg-green-600 transition-colors"
          >
            Forward
          </button>
          <button
            onClick={handleForwardModified}
            disabled={!hasModifications}
            className={clsx(
              'px-4 py-2 rounded-lg font-medium transition-colors',
              hasModifications
                ? 'bg-inspector-accent text-white hover:bg-blue-600'
                : 'bg-inspector-border text-inspector-muted cursor-not-allowed'
            )}
          >
            Forward Modified
          </button>
          <button
            onClick={onDrop}
            className="px-4 py-2 bg-inspector-error text-white rounded-lg font-medium hover:bg-red-600 transition-colors"
          >
            Drop
          </button>
          {hasModifications && (
            <span className="ml-auto text-sm text-inspector-warning">
              * Modified
            </span>
          )}
        </div>

        {/* Save buttons */}
        <div className="flex items-center gap-3 pt-3 border-t border-inspector-border">
          <button
            onClick={() => setShowSaveToDatastore(true)}
            className="px-3 py-1.5 text-sm bg-inspector-surface border border-inspector-border rounded hover:bg-inspector-border transition-colors"
          >
            Save to Datastore
          </button>
          <button
            onClick={() => setShowSaveAsRule(true)}
            className="px-3 py-1.5 text-sm bg-inspector-surface border border-inspector-border rounded hover:bg-inspector-border transition-colors"
          >
            Save as Rule
          </button>
          <button
            onClick={() => setShowGenerateMock(true)}
            className="px-3 py-1.5 text-sm bg-inspector-accent/20 text-inspector-accent border border-inspector-accent/30 rounded hover:bg-inspector-accent/30 transition-colors flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Generate Mock
          </button>
          {hasModifications && (
            <span className="text-xs text-inspector-muted ml-auto">
              (saves edited version)
            </span>
          )}
        </div>
      </div>

      {/* Save to Datastore Modal */}
      {showSaveToDatastore && (
        <SaveToDatastoreModal
          isRequest={isRequest}
          flow={intercept.flow}
          editedBody={editedBody}
          editedHeaders={editedHeaders}
          editedStatusCode={editedStatusCode}
          onClose={() => setShowSaveToDatastore(false)}
        />
      )}

      {/* Save as Rule Modal */}
      {showSaveAsRule && (
        <SaveAsRuleModal
          intercept={intercept}
          editedBody={editedBody}
          editedHeaders={editedHeaders}
          editedStatusCode={editedStatusCode}
          onClose={() => setShowSaveAsRule(false)}
        />
      )}

      {/* Generate Mock Modal */}
      {showGenerateMock && (
        <GenerateMockModal
          request={{
            method: intercept.flow.request.method,
            url: intercept.flow.request.url,
            host: intercept.flow.request.host,
            path: intercept.flow.request.path,
            headers: intercept.flow.request.headers,
            body: intercept.flow.request.content || undefined,
          }}
          onClose={() => setShowGenerateMock(false)}
          onSuccess={() => setShowGenerateMock(false)}
        />
      )}
    </div>
  );
}

// ============ Save to Datastore Modal ============

interface SaveToDatastoreModalProps {
  isRequest: boolean;
  flow: PendingIntercept['flow'];
  editedBody: string;
  editedHeaders: Record<string, string>;
  editedStatusCode?: number;
  onClose: () => void;
}

function SaveToDatastoreModal({
  isRequest,
  flow,
  editedBody,
  editedHeaders,
  editedStatusCode,
  onClose,
}: SaveToDatastoreModalProps) {
  const defaultKey = `${flow.request.method.toLowerCase()}_${flow.request.host.replace(/\./g, '_')}${flow.request.path.replace(/\//g, '_').replace(/[^a-z0-9_]/gi, '')}`;

  const [storeKey, setStoreKey] = useState(defaultKey);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSave = async () => {
    if (!storeKey.trim()) {
      setError('Key is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const endpoint = isRequest ? 'requests' : 'responses';
      const data = isRequest
        ? {
            metadata: { created_at: Date.now(), description: description || undefined },
            method: flow.request.method,
            url: flow.request.url,
            headers: editedHeaders,
            body: editedBody,
          }
        : {
            metadata: { created_at: Date.now(), description: description || undefined },
            status_code: editedStatusCode || flow.response?.status_code || 200,
            headers: editedHeaders,
            body: editedBody,
          };

      const res = await fetch(`${API_BASE}/api/datastore/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: storeKey.trim(), data }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to save');
      }

      setSuccess(true);
      setTimeout(onClose, 1000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-inspector-surface border border-inspector-border rounded-lg shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-medium text-inspector-text mb-4">
          Save {isRequest ? 'Request' : 'Response'} to Datastore
        </h2>

        {error && (
          <div className="bg-inspector-error/20 text-inspector-error px-3 py-2 rounded text-sm mb-4">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-inspector-success/20 text-inspector-success px-3 py-2 rounded text-sm mb-4">
            Saved successfully!
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-inspector-text mb-1">Key</label>
            <input
              type="text"
              value={storeKey}
              onChange={(e) => setStoreKey(e.target.value)}
              className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text font-mono text-sm"
              placeholder="unique_key_name"
            />
          </div>

          <div>
            <label className="block text-sm text-inspector-text mb-1">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text text-sm"
              placeholder="Brief description..."
            />
          </div>

          <div className="text-xs text-inspector-muted">
            <p>Body size: {editedBody.length} bytes</p>
            <p>Headers: {Object.keys(editedHeaders).length}</p>
            {!isRequest && <p>Status: {editedStatusCode || flow.response?.status_code}</p>}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded bg-inspector-bg hover:bg-inspector-border text-inspector-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || success}
            className="px-4 py-2 text-sm rounded bg-inspector-accent hover:bg-blue-600 text-white disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ Save as Rule Modal ============

interface SaveAsRuleModalProps {
  intercept: PendingIntercept;
  editedBody: string;
  editedHeaders: Record<string, string>;
  editedStatusCode?: number;
  onClose: () => void;
}

function SaveAsRuleModal({
  intercept,
  editedBody,
  editedHeaders,
  editedStatusCode,
  onClose,
}: SaveAsRuleModalProps) {
  const flow = intercept.flow;
  const direction: RuleDirection = intercept.type === 'request' ? 'request' : 'response';

  const [ruleName, setRuleName] = useState(`Rule for ${flow.request.host}`);
  const [actionType, setActionType] = useState<RuleActionType>('passthrough');
  const [storeKeyMode, setStoreKeyMode] = useState<'new' | 'existing'>('new');
  const [newStoreKey, setNewStoreKey] = useState(
    `${flow.request.method.toLowerCase()}_${flow.request.host.replace(/\./g, '_')}${flow.request.path.replace(/\//g, '_').replace(/[^a-z0-9_]/gi, '')}`
  );
  const [existingStoreKey, setExistingStoreKey] = useState('');
  const [existingKeys, setExistingKeys] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Fetch existing keys for serve_from_store
  useEffect(() => {
    if (actionType === 'serve_from_store') {
      const endpoint = direction === 'response' ? 'responses' : 'requests';
      fetch(`${API_BASE}/api/datastore/${endpoint}`)
        .then((res) => res.json())
        .then((data) => {
          setExistingKeys((data.items || []).map((i: { key: string }) => i.key));
        })
        .catch(console.error);
    }
  }, [actionType, direction]);

  const handleSave = async () => {
    if (!ruleName.trim()) {
      setError('Rule name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let storeKey: string | undefined;

      // If serve_from_store with new key, save to datastore first
      if (actionType === 'serve_from_store') {
        if (storeKeyMode === 'new') {
          if (!newStoreKey.trim()) {
            setError('Store key is required');
            setSaving(false);
            return;
          }
          storeKey = newStoreKey.trim();

          // Save to datastore
          const endpoint = direction === 'response' ? 'responses' : 'requests';
          const storeData =
            direction === 'response'
              ? {
                  metadata: { created_at: Date.now(), description: `From intercept: ${flow.request.path}` },
                  status_code: editedStatusCode || flow.response?.status_code || 200,
                  headers: editedHeaders,
                  body: editedBody,
                }
              : {
                  metadata: { created_at: Date.now(), description: `From intercept: ${flow.request.path}` },
                  method: flow.request.method,
                  url: flow.request.url,
                  headers: editedHeaders,
                  body: editedBody,
                };

          const storeRes = await fetch(`${API_BASE}/api/datastore/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: storeKey, data: storeData }),
          });

          if (!storeRes.ok) {
            const errData = await storeRes.json();
            throw new Error(errData.error || 'Failed to save to datastore');
          }
        } else {
          if (!existingStoreKey) {
            setError('Please select an existing store key');
            setSaving(false);
            return;
          }
          storeKey = existingStoreKey;
        }
      }

      // Create the rule
      const rule = {
        name: ruleName.trim(),
        enabled: true,
        direction,
        priority: 999,
        filter: {
          host: { match: 'contains', value: flow.request.host },
          path: { match: 'contains', value: flow.request.path },
        },
        action: {
          type: actionType,
          ...(actionType === 'serve_from_store' && storeKey ? { store_key: storeKey } : {}),
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

      setSuccess(true);
      setTimeout(onClose, 1000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-inspector-surface border border-inspector-border rounded-lg shadow-xl w-full max-w-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-medium text-inspector-text mb-4">Create Rule from Intercept</h2>

        {error && (
          <div className="bg-inspector-error/20 text-inspector-error px-3 py-2 rounded text-sm mb-4">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-inspector-success/20 text-inspector-success px-3 py-2 rounded text-sm mb-4">
            Rule created successfully!
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-inspector-text mb-1">Rule Name</label>
            <input
              type="text"
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
              className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text"
            />
          </div>

          <div>
            <label className="block text-sm text-inspector-text mb-1">Direction</label>
            <div className="text-sm text-inspector-muted bg-inspector-bg px-3 py-2 rounded">
              {direction.charAt(0).toUpperCase() + direction.slice(1)} (from intercept type)
            </div>
          </div>

          <div>
            <label className="block text-sm text-inspector-text mb-1">Action Type</label>
            <select
              value={actionType}
              onChange={(e) => setActionType(e.target.value as RuleActionType)}
              className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text"
            >
              <option value="passthrough">Passthrough (log only)</option>
              <option value="intercept">Intercept (manual edit)</option>
              <option value="serve_from_store">Serve from Data Store</option>
            </select>
          </div>

          {actionType === 'serve_from_store' && (
            <div className="space-y-3 p-3 bg-inspector-bg rounded border border-inspector-border">
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={storeKeyMode === 'new'}
                    onChange={() => setStoreKeyMode('new')}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-inspector-text">Save current as new key</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={storeKeyMode === 'existing'}
                    onChange={() => setStoreKeyMode('existing')}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-inspector-text">Use existing key</span>
                </label>
              </div>

              {storeKeyMode === 'new' ? (
                <div>
                  <label className="block text-xs text-inspector-muted mb-1">New Store Key</label>
                  <input
                    type="text"
                    value={newStoreKey}
                    onChange={(e) => setNewStoreKey(e.target.value)}
                    className="w-full bg-inspector-surface border border-inspector-border rounded px-3 py-2 text-inspector-text font-mono text-sm"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-inspector-muted mb-1">Existing Store Key</label>
                  <select
                    value={existingStoreKey}
                    onChange={(e) => setExistingStoreKey(e.target.value)}
                    className="w-full bg-inspector-surface border border-inspector-border rounded px-3 py-2 text-inspector-text"
                  >
                    <option value="">Select a key...</option>
                    {existingKeys.map((key) => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          <div className="text-xs text-inspector-muted bg-inspector-bg p-3 rounded">
            <p className="font-medium mb-1">Filter (auto-generated):</p>
            <p>Host contains: {flow.request.host}</p>
            <p>Path contains: {flow.request.path}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded bg-inspector-bg hover:bg-inspector-border text-inspector-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || success}
            className="px-4 py-2 text-sm rounded bg-inspector-accent hover:bg-blue-600 text-white disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create Rule'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function InterceptQueueView() {
  const {
    interceptMode,
    rulesEnabled,
    pendingIntercepts,
    selectedInterceptId,
    setSelectedInterceptId,
  } = useAppStore();
  const { setInterceptModeWs, setRulesEnabledWs, forwardIntercept, forwardModifiedIntercept, dropIntercept } =
    useWebSocket();

  // Selection state
  const [selectedFlowIds, setSelectedFlowIds] = useState<Set<string>>(new Set());

  const sortedIntercepts = Array.from(pendingIntercepts.values()).sort(
    (a, b) => a.timestamp - b.timestamp
  );

  // Clean up selection when intercepts are removed
  useEffect(() => {
    const validIds = new Set(sortedIntercepts.map(i => i.flow_id));
    setSelectedFlowIds(prev => {
      const newSet = new Set<string>();
      prev.forEach(id => {
        if (validIds.has(id)) newSet.add(id);
      });
      return newSet.size !== prev.size ? newSet : prev;
    });
  }, [pendingIntercepts]);

  const selectedIntercept = selectedInterceptId
    ? pendingIntercepts.get(selectedInterceptId)
    : null;

  // Selection helpers
  const requestIntercepts = sortedIntercepts.filter(i => i.type === 'request');
  const responseIntercepts = sortedIntercepts.filter(i => i.type === 'response');

  const selectAll = () => setSelectedFlowIds(new Set(sortedIntercepts.map(i => i.flow_id)));
  const unselectAll = () => setSelectedFlowIds(new Set());
  const selectRequests = () => setSelectedFlowIds(new Set(requestIntercepts.map(i => i.flow_id)));
  const selectResponses = () => setSelectedFlowIds(new Set(responseIntercepts.map(i => i.flow_id)));

  const toggleSelection = (flowId: string, checked: boolean) => {
    setSelectedFlowIds(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(flowId);
      } else {
        newSet.delete(flowId);
      }
      return newSet;
    });
  };

  // Bulk actions
  const forwardSelected = () => {
    selectedFlowIds.forEach(flowId => {
      forwardIntercept(flowId);
    });
    setSelectedFlowIds(new Set());
    setSelectedInterceptId(null);
  };

  const dropSelected = () => {
    selectedFlowIds.forEach(flowId => {
      dropIntercept(flowId);
    });
    setSelectedFlowIds(new Set());
    setSelectedInterceptId(null);
  };

  const modes: { id: InterceptMode; label: string; description: string }[] = [
    { id: 'passthrough', label: 'Passthrough', description: 'All traffic flows through' },
    { id: 'intercept_llm', label: 'Intercept LLM', description: 'Hold LLM API calls only' },
    { id: 'intercept_all', label: 'Intercept All', description: 'Hold all traffic' },
  ];

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      {/* Left panel - mode selector and queue */}
      <div className="w-96 flex flex-col border-r border-inspector-border shrink-0 min-w-0 overflow-hidden">
        {/* Mode selector */}
        <div className="p-4 border-b border-inspector-border shrink-0">
          <h3 className="text-sm font-semibold text-inspector-muted mb-3">Intercept Mode</h3>
          <div className="space-y-2">
            {modes.map((mode) => (
              <button
                key={mode.id}
                onClick={() => setInterceptModeWs(mode.id)}
                className={clsx(
                  'w-full text-left px-3 py-2 rounded-lg transition-colors',
                  interceptMode === mode.id
                    ? 'bg-inspector-accent text-white'
                    : 'bg-inspector-surface text-inspector-text hover:bg-inspector-border'
                )}
              >
                <div className="font-medium">{mode.label}</div>
                <div className="text-xs opacity-70">{mode.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Rules Mode toggle */}
        <div className="p-4 border-b border-inspector-border shrink-0">
          <h3 className="text-sm font-semibold text-inspector-muted mb-3">Rules Mode</h3>
          <button
            onClick={() => setRulesEnabledWs(!rulesEnabled)}
            className={clsx(
              'w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between',
              rulesEnabled
                ? 'bg-inspector-success text-white'
                : 'bg-inspector-surface text-inspector-text hover:bg-inspector-border'
            )}
          >
            <div>
              <div className="font-medium">{rulesEnabled ? 'Rules Enabled' : 'Rules Disabled'}</div>
              <div className="text-xs opacity-70">
                {rulesEnabled
                  ? 'Rules are applied to all traffic'
                  : 'Enable to apply traffic rules'}
              </div>
            </div>
            <div
              className={clsx(
                'w-10 h-6 rounded-full relative transition-colors',
                rulesEnabled ? 'bg-white/30' : 'bg-inspector-border'
              )}
            >
              <div
                className={clsx(
                  'absolute top-1 w-4 h-4 rounded-full transition-all',
                  rulesEnabled ? 'right-1 bg-white' : 'left-1 bg-inspector-muted'
                )}
              />
            </div>
          </button>
        </div>

        {/* Queue Header with Selection Controls */}
        <div className="shrink-0 p-3 border-b border-inspector-border bg-inspector-surface">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-inspector-text">
              Queue ({sortedIntercepts.length})
              {selectedFlowIds.size > 0 && (
                <span className="text-inspector-accent ml-2">
                  {selectedFlowIds.size} selected
                </span>
              )}
            </span>
          </div>

          {/* Selection buttons */}
          <div className="flex flex-wrap gap-1 mb-2">
            <button
              onClick={selectAll}
              disabled={sortedIntercepts.length === 0}
              className="px-2 py-1 text-xs bg-inspector-bg border border-inspector-border rounded hover:border-inspector-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              All
            </button>
            <button
              onClick={unselectAll}
              disabled={selectedFlowIds.size === 0}
              className="px-2 py-1 text-xs bg-inspector-bg border border-inspector-border rounded hover:border-inspector-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              None
            </button>
            <button
              onClick={selectRequests}
              disabled={requestIntercepts.length === 0}
              className="px-2 py-1 text-xs bg-inspector-bg border border-inspector-border rounded hover:border-inspector-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Requests ({requestIntercepts.length})
            </button>
            <button
              onClick={selectResponses}
              disabled={responseIntercepts.length === 0}
              className="px-2 py-1 text-xs bg-inspector-bg border border-inspector-border rounded hover:border-inspector-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Responses ({responseIntercepts.length})
            </button>
          </div>

          {/* Bulk action buttons */}
          <div className="flex gap-2">
            <button
              onClick={forwardSelected}
              disabled={selectedFlowIds.size === 0}
              className={clsx(
                'flex-1 px-3 py-1.5 text-sm font-medium rounded transition-colors',
                selectedFlowIds.size > 0
                  ? 'bg-inspector-success text-white hover:bg-green-600'
                  : 'bg-inspector-border text-inspector-muted cursor-not-allowed'
              )}
            >
              Forward Selected
            </button>
            <button
              onClick={dropSelected}
              disabled={selectedFlowIds.size === 0}
              className={clsx(
                'flex-1 px-3 py-1.5 text-sm font-medium rounded transition-colors',
                selectedFlowIds.size > 0
                  ? 'bg-inspector-error text-white hover:bg-red-600'
                  : 'bg-inspector-border text-inspector-muted cursor-not-allowed'
              )}
            >
              Drop Selected
            </button>
          </div>
        </div>

        {/* Queue List */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {sortedIntercepts.length === 0 ? (
            <div className="flex items-center justify-center h-full text-inspector-muted">
              <div className="text-center">
                <p className="text-4xl mb-4">🛑</p>
                <p>No pending intercepts</p>
                {interceptMode === 'passthrough' && (
                  <p className="text-sm mt-2">Enable interception to capture requests</p>
                )}
              </div>
            </div>
          ) : (
            sortedIntercepts.map((intercept) => (
              <InterceptCard
                key={intercept.flow_id}
                intercept={intercept}
                isActive={selectedInterceptId === intercept.flow_id}
                isChecked={selectedFlowIds.has(intercept.flow_id)}
                onSelect={() => setSelectedInterceptId(intercept.flow_id)}
                onCheckChange={(checked) => toggleSelection(intercept.flow_id, checked)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right panel - detail view */}
      {selectedIntercept ? (
        <InterceptDetail
          key={selectedIntercept.flow_id}
          intercept={selectedIntercept}
          onForward={() => {
            forwardIntercept(selectedIntercept.flow_id);
            setSelectedInterceptId(null);
          }}
          onForwardModified={(modifications) => {
            forwardModifiedIntercept(
              selectedIntercept.flow_id,
              modifications,
              selectedIntercept.type
            );
            setSelectedInterceptId(null);
          }}
          onDrop={() => {
            dropIntercept(selectedIntercept.flow_id);
            setSelectedInterceptId(null);
          }}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-inspector-muted">
          <p>Select a pending intercept to view and modify</p>
        </div>
      )}
    </div>
  );
}
