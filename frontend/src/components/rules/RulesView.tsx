/**
 * Rules View - manage traffic manipulation rules
 */

import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { Rule, RuleActionType, StoredResponse, RefusalRule } from '../../types';
import { RuleEditor } from './RuleEditor';
import { LLMRulesTab } from './LLMRulesTab';

type Tab = 'request' | 'response' | 'llm';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:2000';

// Rule templates for common patterns
interface RuleTemplate {
  name: string;
  description: string;
  direction: 'request' | 'response';
  rule: Partial<Rule>;
}

const RULE_TEMPLATES: RuleTemplate[] = [
  {
    name: 'Mock 500 Error',
    description: 'Return a 500 Internal Server Error response',
    direction: 'response',
    rule: {
      name: 'Mock 500 Error',
      filter: {},
      action: {
        type: 'modify_static',
        static_modification: {
          replace_body: '{"error": "Internal Server Error", "message": "Mocked error response"}',
        },
      },
    },
  },
  {
    name: 'Mock 429 Rate Limit',
    description: 'Return a 429 Too Many Requests response with Retry-After header',
    direction: 'response',
    rule: {
      name: 'Mock 429 Rate Limit',
      filter: {},
      action: {
        type: 'modify_static',
        static_modification: {
          replace_body: '{"error": "rate_limit_exceeded", "message": "Too many requests. Please retry after the specified time."}',
          header_modifications: [
            { type: 'set', key: 'Retry-After', value: '60' },
          ],
        },
      },
    },
  },
  {
    name: 'Mock Empty Response',
    description: 'Return an empty 200 OK response',
    direction: 'response',
    rule: {
      name: 'Mock Empty Response',
      filter: {},
      action: {
        type: 'modify_static',
        static_modification: {
          replace_body: '',
        },
      },
    },
  },
  {
    name: 'Log LLM Traffic',
    description: 'Passthrough rule to log all LLM API traffic',
    direction: 'request',
    rule: {
      name: 'Log LLM Traffic',
      filter: { is_llm_api: true },
      action: { type: 'passthrough' },
    },
  },
  {
    name: 'Replace Model Name',
    description: 'Find/replace model name in LLM requests',
    direction: 'request',
    rule: {
      name: 'Replace Model Name',
      filter: { is_llm_api: true },
      action: {
        type: 'modify_static',
        static_modification: {
          find_replace: [
            { find: '"model":"claude-3-opus', replace: '"model":"claude-3-sonnet', regex: false, replace_all: true },
          ],
        },
      },
    },
  },
  {
    name: 'Strip Thinking Blocks',
    description: 'Remove <thinking>...</thinking> content from Claude responses',
    direction: 'response',
    rule: {
      name: 'Strip Thinking Blocks',
      filter: { is_llm_api: true },
      action: {
        type: 'modify_static',
        static_modification: {
          find_replace: [
            { find: '<thinking>[\\s\\S]*?</thinking>', replace: '', regex: true, replace_all: true },
          ],
        },
      },
    },
  },
  {
    name: 'Intercept Anthropic API',
    description: 'Intercept all Anthropic API requests for manual editing',
    direction: 'request',
    rule: {
      name: 'Intercept Anthropic API',
      filter: { host: { match: 'contains', value: 'anthropic.com' } },
      action: { type: 'intercept' },
    },
  },
  {
    name: 'Intercept OpenAI API',
    description: 'Intercept all OpenAI API requests for manual editing',
    direction: 'request',
    rule: {
      name: 'Intercept OpenAI API',
      filter: { host: { match: 'contains', value: 'openai.com' } },
      action: { type: 'intercept' },
    },
  },
];

export function RulesView() {
  const [activeTab, setActiveTab] = useState<Tab>('request');
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [expandedStoreKeys, setExpandedStoreKeys] = useState<Set<string>>(new Set());
  const [datastoreCache, setDatastoreCache] = useState<Map<string, StoredResponse | null>>(new Map());
  const [validStoreKeys, setValidStoreKeys] = useState<Set<string>>(new Set());
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);
  const [refusalRulesCount, setRefusalRulesCount] = useState(0);

  useEffect(() => {
    fetchRules();
    fetchValidStoreKeys();
    fetchRefusalRulesCount();
  }, []);

  const fetchRefusalRulesCount = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/refusal-rules`);
      if (res.ok) {
        const data = await res.json();
        setRefusalRulesCount(data.total || 0);
      }
    } catch {
      // Silently fail
    }
  };

  const fetchValidStoreKeys = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/datastore/responses`);
      if (res.ok) {
        const data = await res.json();
        const keys = new Set<string>((data.items || []).map((i: { key: string }) => i.key));
        setValidStoreKeys(keys);
      }
    } catch {
      // Silently fail - validation is optional
    }
  };

  const fetchRules = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/rules`);
      if (!res.ok) throw new Error('Failed to fetch rules');
      const data = await res.json();
      setRules(data.rules);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEnabled = async (rule: Rule) => {
    try {
      const res = await fetch(`${API_BASE}/api/rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      if (!res.ok) throw new Error('Failed to update rule');
      fetchRules();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (rule: Rule) => {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;

    try {
      const res = await fetch(`${API_BASE}/api/rules/${rule.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete rule');
      fetchRules();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDragStart = (e: React.DragEvent, ruleId: string) => {
    setDraggedId(ruleId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    // Reorder locally first
    const filteredRules = rules.filter(r => r.direction === activeTab);
    const orderedIds = filteredRules.map(r => r.id);
    const draggedIndex = orderedIds.indexOf(draggedId);
    const targetIndex = orderedIds.indexOf(targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    orderedIds.splice(draggedIndex, 1);
    orderedIds.splice(targetIndex, 0, draggedId);

    // Also include rules from other direction in their current order
    const otherRules = rules.filter(r => r.direction !== activeTab).map(r => r.id);
    const allOrderedIds = activeTab === 'request'
      ? [...orderedIds, ...otherRules]
      : [...otherRules, ...orderedIds];

    try {
      const res = await fetch(`${API_BASE}/api/rules/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: allOrderedIds }),
      });
      if (!res.ok) throw new Error('Failed to reorder rules');
      fetchRules();
    } catch (err: any) {
      setError(err.message);
    }

    setDraggedId(null);
  };

  const handleSaveRule = async (rule: Rule) => {
    try {
      const isNew = !rules.some(r => r.id === rule.id);
      const url = isNew ? `${API_BASE}/api/rules` : `${API_BASE}/api/rules/${rule.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save rule');
      }

      setShowEditor(false);
      setEditingRule(null);
      fetchRules();
      fetchValidStoreKeys(); // Refresh datastore keys for validation
    } catch (err: any) {
      throw err; // Let the editor handle the error
    }
  };

  const handleCreateNew = () => {
    setEditingRule(null);
    setShowEditor(true);
  };

  const handleCreateFromTemplate = async (template: RuleTemplate) => {
    setShowTemplateDropdown(false);
    try {
      const newRule: Rule = {
        id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: template.rule.name || template.name,
        enabled: false, // Disabled by default for safety
        direction: template.direction,
        priority: rules.length,
        filter: template.rule.filter || {},
        action: template.rule.action || { type: 'passthrough' },
      };

      const res = await fetch(`${API_BASE}/api/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRule),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create rule from template');
      }

      fetchRules();
      // Switch to the appropriate tab
      setActiveTab(template.direction);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEdit = (rule: Rule) => {
    setEditingRule(rule);
    setShowEditor(true);
  };

  const handleDuplicate = async (rule: Rule) => {
    try {
      const duplicatedRule = {
        ...rule,
        id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: `${rule.name} (Copy)`,
        priority: rules.length, // Add at the end
      };

      const res = await fetch(`${API_BASE}/api/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(duplicatedRule),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to duplicate rule');
      }

      fetchRules();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleExportRules = () => {
    const exportData = {
      version: 1,
      exported_at: new Date().toISOString(),
      rules: rules,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rules-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportRules = async (file: File) => {
    try {
      const content = await file.text();
      const data = JSON.parse(content);

      // Validate structure
      if (!data.rules || !Array.isArray(data.rules)) {
        throw new Error('Invalid file format: expected { rules: [...] }');
      }

      // Import each rule with new IDs to avoid conflicts
      let imported = 0;
      let skipped = 0;

      for (const rule of data.rules) {
        try {
          const newRule = {
            ...rule,
            id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            priority: rules.length + imported,
            enabled: false, // Import as disabled for safety
          };

          const res = await fetch(`${API_BASE}/api/rules`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newRule),
          });

          if (res.ok) {
            imported++;
          } else {
            skipped++;
          }
        } catch {
          skipped++;
        }
      }

      fetchRules();
      alert(`Imported ${imported} rule(s)${skipped > 0 ? `, ${skipped} skipped` : ''}.\n\nImported rules are disabled by default.`);
    } catch (err: any) {
      setError(`Import failed: ${err.message}`);
    }
  };

  const filteredRules = rules.filter(r => r.direction === activeTab);

  const toggleStorePreview = async (storeKey: string) => {
    const newExpanded = new Set(expandedStoreKeys);
    if (newExpanded.has(storeKey)) {
      newExpanded.delete(storeKey);
    } else {
      newExpanded.add(storeKey);
      // Fetch if not in cache
      if (!datastoreCache.has(storeKey)) {
        try {
          const res = await fetch(`${API_BASE}/api/datastore/responses/${storeKey}`);
          if (res.ok) {
            const data = await res.json();
            setDatastoreCache(prev => new Map(prev).set(storeKey, data));
          } else {
            setDatastoreCache(prev => new Map(prev).set(storeKey, null));
          }
        } catch {
          setDatastoreCache(prev => new Map(prev).set(storeKey, null));
        }
      }
    }
    setExpandedStoreKeys(newExpanded);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden" data-testid="rules-view">
      {/* Header with tabs */}
      <div className="border-b border-inspector-border bg-inspector-surface px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex gap-2" role="tablist" aria-label="Rules tabs">
            <TabButton
              active={activeTab === 'request'}
              onClick={() => setActiveTab('request')}
              testId="rules-tab-request"
            >
              Request Rules ({rules.filter(r => r.direction === 'request').length})
            </TabButton>
            <TabButton
              active={activeTab === 'response'}
              onClick={() => setActiveTab('response')}
              testId="rules-tab-response"
            >
              Response Rules ({rules.filter(r => r.direction === 'response').length})
            </TabButton>
            <TabButton
              active={activeTab === 'llm'}
              onClick={() => setActiveTab('llm')}
              testId="rules-tab-llm"
            >
              LLM Rules ({refusalRulesCount})
            </TabButton>
          </div>
          {/* Only show these buttons for request/response tabs */}
          {activeTab !== 'llm' && (
            <div className="flex gap-2">
              {/* Import/Export buttons */}
              <button
                onClick={handleExportRules}
                disabled={rules.length === 0}
                className="text-sm px-3 py-1 rounded bg-inspector-bg hover:bg-inspector-border text-inspector-muted disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                title="Export all rules to JSON"
                data-testid="rules-export-btn"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Export
              </button>
              <label className="text-sm px-3 py-1 rounded bg-inspector-bg hover:bg-inspector-border text-inspector-muted cursor-pointer flex items-center gap-1" data-testid="rules-import-btn">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Import
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  data-testid="rules-import-input"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleImportRules(file);
                      e.target.value = ''; // Reset for same file re-import
                    }
                  }}
                />
              </label>
              <button
                onClick={() => { fetchRules(); fetchValidStoreKeys(); }}
                className="text-sm px-3 py-1 rounded bg-inspector-bg hover:bg-inspector-border text-inspector-muted"
                data-testid="rules-refresh-btn"
              >
                Refresh
              </button>
              {/* Template dropdown */}
              <div className="relative" data-testid="rules-template-dropdown">
                <button
                  onClick={() => setShowTemplateDropdown(!showTemplateDropdown)}
                  className="text-sm px-3 py-1 rounded bg-inspector-bg hover:bg-inspector-border text-inspector-muted flex items-center gap-1"
                  aria-haspopup="true"
                  aria-expanded={showTemplateDropdown}
                  data-testid="rules-template-btn"
                >
                  From Template
                  <svg className={clsx('w-3 h-3 transition-transform', showTemplateDropdown && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showTemplateDropdown && (
                  <>
                    {/* Backdrop to close dropdown */}
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowTemplateDropdown(false)}
                    />
                    <div
                      className="absolute right-0 top-full mt-1 w-72 bg-inspector-surface border border-inspector-border rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto"
                      role="menu"
                      data-testid="rules-template-menu"
                    >
                      <div className="p-2 border-b border-inspector-border">
                        <span className="text-xs text-inspector-muted font-medium uppercase">Rule Templates</span>
                      </div>
                      {RULE_TEMPLATES.map((template, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleCreateFromTemplate(template)}
                          className="w-full text-left px-3 py-2 hover:bg-inspector-bg transition-colors border-b border-inspector-border last:border-b-0"
                          role="menuitem"
                          data-testid={`rules-template-${template.name.toLowerCase().replace(/\s+/g, '-')}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-inspector-text">{template.name}</span>
                            <span className={clsx(
                              'text-xs px-1.5 py-0.5 rounded',
                              template.direction === 'request'
                                ? 'bg-blue-500/20 text-blue-400'
                                : 'bg-green-500/20 text-green-400'
                            )}>
                              {template.direction}
                            </span>
                          </div>
                          <p className="text-xs text-inspector-muted mt-0.5">{template.description}</p>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={handleCreateNew}
                className="text-sm px-3 py-1 rounded bg-inspector-accent hover:bg-inspector-accent/80 text-white"
                data-testid="rules-create-btn"
              >
                + New Rule
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-inspector-error/20 text-inspector-error px-4 py-2 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Content based on active tab */}
      {activeTab === 'llm' ? (
        <LLMRulesTab onRulesChange={fetchRefusalRulesCount} />
      ) : (
        /* Request/Response Rules list */
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-inspector-muted">Loading...</div>
          ) : filteredRules.length === 0 ? (
            <div className="p-8 text-center text-inspector-muted">
              <p>No {activeTab} rules configured.</p>
              <p className="mt-2 text-sm">
                Rules are evaluated in order. Drag to reorder.
              </p>
              <button
                onClick={handleCreateNew}
                className="mt-4 text-sm px-4 py-2 rounded bg-inspector-accent hover:bg-inspector-accent/80 text-white"
              >
                Create First Rule
              </button>
            </div>
          ) : (
            <div className="divide-y divide-inspector-border">
              {filteredRules.map((rule, index) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  index={index}
                  onToggle={() => handleToggleEnabled(rule)}
                  onEdit={() => handleEdit(rule)}
                  onDuplicate={() => handleDuplicate(rule)}
                  onDelete={() => handleDelete(rule)}
                  onDragStart={(e) => handleDragStart(e, rule.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, rule.id)}
                  isDragging={draggedId === rule.id}
                  storeKey={rule.action.store_key}
                  isStoreExpanded={rule.action.store_key ? expandedStoreKeys.has(rule.action.store_key) : false}
                  storeData={rule.action.store_key ? datastoreCache.get(rule.action.store_key) : undefined}
                  onToggleStorePreview={toggleStorePreview}
                  isStoreKeyValid={rule.action.store_key ? validStoreKeys.has(rule.action.store_key) : true}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Rule Editor Modal */}
      {showEditor && (
        <RuleEditor
          rule={editingRule}
          defaultDirection={activeTab}
          onSave={handleSaveRule}
          onClose={() => { setShowEditor(false); setEditingRule(null); }}
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

interface RuleRowProps {
  rule: Rule;
  index: number;
  onToggle: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  isDragging: boolean;
  storeKey?: string;
  isStoreExpanded: boolean;
  storeData?: StoredResponse | null;
  onToggleStorePreview: (storeKey: string) => void;
  isStoreKeyValid: boolean;
}

function RuleRow({
  rule,
  index,
  onToggle,
  onEdit,
  onDuplicate,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
  storeKey,
  isStoreExpanded,
  storeData,
  onToggleStorePreview,
  isStoreKeyValid,
}: RuleRowProps) {
  const hasStoreKey = rule.action.type === 'serve_from_store' && storeKey;
  const hasMissingStoreKey = hasStoreKey && !isStoreKeyValid;

  return (
    <div data-testid={`rule-item-${rule.id}`}>
      <div
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={clsx(
          'px-4 py-3 flex items-center gap-4 hover:bg-inspector-surface transition-colors cursor-move',
          isDragging && 'opacity-50 bg-inspector-surface'
        )}
      >
        {/* Drag handle */}
        <div className="text-inspector-muted">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="6" r="1.5" />
            <circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" />
            <circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" />
            <circle cx="15" cy="18" r="1.5" />
          </svg>
        </div>

        {/* Short ID */}
        <span className="text-xs text-inspector-accent font-mono w-8">
          {rule.shortId || `r${index + 1}`}
        </span>

        {/* Enable toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className={clsx(
            'w-10 h-5 rounded-full relative transition-colors',
            rule.enabled ? 'bg-inspector-success' : 'bg-inspector-border'
          )}
          role="switch"
          aria-checked={rule.enabled}
          aria-label={`Toggle ${rule.name}`}
          data-testid={`rule-toggle-${rule.id}`}
        >
          <span
            className={clsx(
              'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
              rule.enabled ? 'left-5' : 'left-0.5'
            )}
          />
        </button>

        {/* Rule info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {/* Warning icon for missing store key */}
            {hasMissingStoreKey && (
              <span
                className="text-inspector-warning"
                title={`Store key "${storeKey}" not found in datastore`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </span>
            )}
            <span className={clsx(
              'font-medium',
              rule.enabled ? 'text-inspector-text' : 'text-inspector-muted'
            )}>
              {rule.name}
            </span>
            <ActionBadge type={rule.action.type} />
            {/* Store key preview toggle */}
            {hasStoreKey && (
              <button
                onClick={(e) => { e.stopPropagation(); onToggleStorePreview(storeKey!); }}
                className={clsx(
                  'text-xs px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors',
                  isStoreExpanded
                    ? 'bg-purple-500/30 text-purple-300'
                    : 'bg-inspector-bg text-inspector-muted hover:text-purple-400'
                )}
                title={isStoreExpanded ? 'Hide preview' : 'Show stored response preview'}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                </svg>
                {storeKey}
                <svg
                  className={clsx('w-3 h-3 transition-transform', isStoreExpanded && 'rotate-180')}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
          </div>
          <div className="text-xs text-inspector-muted mt-0.5 truncate">
            {formatFilter(rule.filter)}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1 text-inspector-muted hover:text-inspector-accent transition-colors"
            title="Edit"
            aria-label={`Edit ${rule.name}`}
            data-testid={`rule-edit-${rule.id}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
            className="p-1 text-inspector-muted hover:text-inspector-accent transition-colors"
            title="Duplicate"
            aria-label={`Duplicate ${rule.name}`}
            data-testid={`rule-duplicate-${rule.id}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1 text-inspector-muted hover:text-inspector-error transition-colors"
            title="Delete"
            aria-label={`Delete ${rule.name}`}
            data-testid={`rule-delete-${rule.id}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Inline datastore preview */}
      {hasStoreKey && isStoreExpanded && (
        <DatastorePreview storeKey={storeKey!} storeData={storeData} />
      )}
    </div>
  );
}

interface DatastorePreviewProps {
  storeKey: string;
  storeData?: StoredResponse | null;
}

function DatastorePreview({ storeKey, storeData }: DatastorePreviewProps) {
  if (storeData === undefined) {
    return (
      <div className="ml-24 mr-4 mb-3 p-3 bg-inspector-bg rounded-lg border border-inspector-border">
        <div className="text-xs text-inspector-muted animate-pulse">Loading...</div>
      </div>
    );
  }

  if (storeData === null) {
    return (
      <div className="ml-24 mr-4 mb-3 p-3 bg-inspector-error/10 rounded-lg border border-inspector-error/30">
        <div className="text-xs text-inspector-error">
          Store key "{storeKey}" not found in datastore
        </div>
      </div>
    );
  }

  const headersCount = Object.keys(storeData.headers || {}).length;
  const bodyPreview = storeData.body
    ? storeData.body.slice(0, 200) + (storeData.body.length > 200 ? '...' : '')
    : '(empty body)';

  return (
    <div className="ml-24 mr-4 mb-3 p-3 bg-purple-500/10 rounded-lg border border-purple-500/30">
      <div className="flex items-center gap-4 text-xs">
        <span className={clsx(
          'font-mono font-bold px-2 py-0.5 rounded',
          storeData.status_code >= 200 && storeData.status_code < 300
            ? 'bg-inspector-success/20 text-inspector-success'
            : storeData.status_code >= 400
            ? 'bg-inspector-error/20 text-inspector-error'
            : 'bg-inspector-warning/20 text-inspector-warning'
        )}>
          {storeData.status_code}
        </span>
        <span className="text-inspector-muted">
          {headersCount} header{headersCount !== 1 ? 's' : ''}
        </span>
        {storeData.metadata?.description && (
          <span className="text-inspector-muted truncate">
            {storeData.metadata.description}
          </span>
        )}
      </div>
      <div className="mt-2 text-xs font-mono text-inspector-text bg-inspector-bg p-2 rounded max-h-24 overflow-hidden">
        <pre className="whitespace-pre-wrap break-all">{bodyPreview}</pre>
      </div>
    </div>
  );
}

function ActionBadge({ type }: { type: RuleActionType }) {
  const config: Record<RuleActionType, { label: string; color: string }> = {
    passthrough: { label: 'Pass', color: 'bg-gray-500' },
    intercept: { label: 'Intercept', color: 'bg-yellow-500' },
    serve_from_store: { label: 'Mock', color: 'bg-purple-500' },
    modify_static: { label: 'Modify', color: 'bg-blue-500' },
    modify_llm: { label: 'LLM', color: 'bg-green-500' },
  };

  const { label, color } = config[type] || { label: type, color: 'bg-gray-500' };

  return (
    <span className={clsx('text-xs px-1.5 py-0.5 rounded text-white', color)}>
      {label}
    </span>
  );
}

function formatFilter(filter: Rule['filter']): string {
  const parts: string[] = [];

  if (filter.host) {
    parts.push(`host ${filter.host.match} "${filter.host.value}"`);
  }
  if (filter.path) {
    parts.push(`path ${filter.path.match} "${filter.path.value}"`);
  }
  if (filter.method) {
    parts.push(`method ${filter.method.match} "${filter.method.value}"`);
  }
  if (filter.header) {
    parts.push(`header[${filter.header.key}] ${filter.header.match} "${filter.header.value}"`);
  }
  if (filter.is_llm_api !== undefined) {
    parts.push(filter.is_llm_api ? 'LLM API only' : 'non-LLM only');
  }

  return parts.length > 0 ? parts.join(' AND ') : 'Match all traffic';
}
