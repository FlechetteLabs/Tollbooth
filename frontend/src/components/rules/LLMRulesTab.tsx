/**
 * LLM Rules Tab - Manage refusal detection rules
 */

import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { RefusalRule, RefusalAction } from '../../types';
import { RefusalRuleEditor } from './RefusalRuleEditor';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:2000';

interface LLMRulesTabProps {
  onRulesChange?: () => void;
}

export function LLMRulesTab({ onRulesChange }: LLMRulesTabProps) {
  const [rules, setRules] = useState<RefusalRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<RefusalRule | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/refusal-rules`);
      if (!res.ok) throw new Error('Failed to fetch refusal rules');
      const data = await res.json();
      setRules(data.rules);
      onRulesChange?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEnabled = async (rule: RefusalRule) => {
    try {
      const res = await fetch(`${API_BASE}/api/refusal-rules/${rule.id}`, {
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

  const handleDelete = async (rule: RefusalRule) => {
    if (!confirm(`Delete refusal rule "${rule.name}"?`)) return;

    try {
      const res = await fetch(`${API_BASE}/api/refusal-rules/${rule.id}`, {
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

    // Reorder locally
    const orderedIds = rules.map(r => r.id);
    const draggedIndex = orderedIds.indexOf(draggedId);
    const targetIndex = orderedIds.indexOf(targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    orderedIds.splice(draggedIndex, 1);
    orderedIds.splice(targetIndex, 0, draggedId);

    // Update priorities
    try {
      for (let i = 0; i < orderedIds.length; i++) {
        await fetch(`${API_BASE}/api/refusal-rules/${orderedIds[i]}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priority: i }),
        });
      }
      fetchRules();
    } catch (err: any) {
      setError(err.message);
    }

    setDraggedId(null);
  };

  const handleSaveRule = async (rule: RefusalRule) => {
    try {
      const isNew = !rules.some(r => r.id === rule.id);
      const url = isNew ? `${API_BASE}/api/refusal-rules` : `${API_BASE}/api/refusal-rules/${rule.id}`;
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
    } catch (err: any) {
      throw err;
    }
  };

  const handleCreateNew = () => {
    setEditingRule(null);
    setShowEditor(true);
  };

  const handleEdit = (rule: RefusalRule) => {
    setEditingRule(rule);
    setShowEditor(true);
  };

  const handleDuplicate = async (rule: RefusalRule) => {
    try {
      const duplicatedRule = {
        ...rule,
        id: `refusal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: `${rule.name} (Copy)`,
        priority: rules.length,
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      const res = await fetch(`${API_BASE}/api/refusal-rules`, {
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

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden" data-testid="llm-rules-tab">
      {/* Header */}
      <div className="border-b border-inspector-border bg-inspector-surface px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-inspector-text">Refusal Detection Rules</h3>
            <p className="text-xs text-inspector-muted mt-0.5">
              Detect and handle LLM response refusals using zero-shot classification
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchRules}
              className="text-sm px-3 py-1 rounded bg-inspector-bg hover:bg-inspector-border text-inspector-muted"
            >
              Refresh
            </button>
            <button
              onClick={handleCreateNew}
              className="text-sm px-3 py-1 rounded bg-inspector-accent hover:bg-inspector-accent/80 text-white"
              data-testid="llm-rules-create-btn"
            >
              + New Rule
            </button>
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-inspector-error/20 text-inspector-error px-4 py-2 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Rules list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-inspector-muted">Loading...</div>
        ) : rules.length === 0 ? (
          <div className="p-8 text-center text-inspector-muted">
            <div className="text-4xl mb-4">🛡️</div>
            <p>No refusal detection rules configured.</p>
            <p className="mt-2 text-sm">
              Create a rule to detect when LLM responses contain refusals and handle them automatically.
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
            {rules.map((rule, index) => (
              <RefusalRuleRow
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
              />
            ))}
          </div>
        )}
      </div>

      {/* Rule Editor Modal */}
      {showEditor && (
        <RefusalRuleEditor
          rule={editingRule}
          onSave={handleSaveRule}
          onClose={() => { setShowEditor(false); setEditingRule(null); }}
        />
      )}
    </div>
  );
}

interface RefusalRuleRowProps {
  rule: RefusalRule;
  index: number;
  onToggle: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  isDragging: boolean;
}

function RefusalRuleRow({
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
}: RefusalRuleRowProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={clsx(
        'px-4 py-3 flex items-center gap-4 hover:bg-inspector-surface transition-colors cursor-move',
        isDragging && 'opacity-50 bg-inspector-surface'
      )}
      data-testid={`refusal-rule-${rule.id}`}
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

      {/* Priority number */}
      <span className="text-xs text-inspector-muted w-6 text-center">
        #{index + 1}
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
          <span className={clsx(
            'font-medium',
            rule.enabled ? 'text-inspector-text' : 'text-inspector-muted'
          )}>
            {rule.name}
          </span>
          <ActionBadge action={rule.action} />
          <span className="text-xs text-inspector-muted">
            {(rule.detection.confidence_threshold * 100).toFixed(0)}% threshold
          </span>
        </div>
        <div className="text-xs text-inspector-muted mt-0.5 truncate">
          {formatFilter(rule)}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="p-1 text-inspector-muted hover:text-inspector-accent transition-colors"
          title="Edit"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
          className="p-1 text-inspector-muted hover:text-inspector-accent transition-colors"
          title="Duplicate"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1 text-inspector-muted hover:text-inspector-error transition-colors"
          title="Delete"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function ActionBadge({ action }: { action: RefusalAction }) {
  const config: Record<RefusalAction, { label: string; color: string }> = {
    prompt_user: { label: 'Prompt', color: 'bg-yellow-500' },
    passthrough: { label: 'Log Only', color: 'bg-gray-500' },
    modify: { label: 'Auto-Fix', color: 'bg-purple-500' },
  };

  const { label, color } = config[action] || { label: action, color: 'bg-gray-500' };

  return (
    <span className={clsx('text-xs px-1.5 py-0.5 rounded text-white', color)}>
      {label}
    </span>
  );
}

function formatFilter(rule: RefusalRule): string {
  const parts: string[] = [];

  if (rule.filter?.host) {
    parts.push(`host ${rule.filter.host.match} "${rule.filter.host.value}"`);
  }
  if (rule.filter?.path) {
    parts.push(`path ${rule.filter.path.match} "${rule.filter.path.value}"`);
  }
  if (rule.filter?.model) {
    parts.push(`model ${rule.filter.model.match} "${rule.filter.model.value}"`);
  }
  if (rule.filter?.provider) {
    parts.push(`provider = ${rule.filter.provider}`);
  }

  if (rule.detection.tokens_to_analyze > 0) {
    parts.push(`first ${rule.detection.tokens_to_analyze} tokens`);
  }

  return parts.length > 0 ? parts.join(' AND ') : 'Analyze all LLM responses';
}
