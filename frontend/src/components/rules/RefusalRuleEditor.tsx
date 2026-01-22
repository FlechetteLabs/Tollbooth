/**
 * Refusal Rule Editor - Modal for configuring refusal detection rules
 */

import { useState } from 'react';
import { clsx } from 'clsx';
import { RefusalRule, RefusalAction, MatchType, LLMProvider, LLMProviderConfig } from '../../types';

interface RefusalRuleEditorProps {
  rule: RefusalRule | null;
  onSave: (rule: RefusalRule) => Promise<void>;
  onClose: () => void;
}

const ACTION_OPTIONS: { value: RefusalAction; label: string; description: string }[] = [
  { value: 'prompt_user', label: 'Prompt User', description: 'Hold response and show in pending queue for manual review' },
  { value: 'passthrough', label: 'Log Only', description: 'Add refusal metadata but forward response unchanged' },
  { value: 'modify', label: 'Auto-Modify', description: 'Automatically generate and use an alternate response' },
];

const PROVIDER_OPTIONS: LLMProviderConfig[] = ['anthropic', 'openai', 'google', 'ollama'];

export function RefusalRuleEditor({ rule, onSave, onClose }: RefusalRuleEditorProps) {
  const isNew = !rule;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState(rule?.name || '');
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [confidenceThreshold, setConfidenceThreshold] = useState(rule?.detection.confidence_threshold ?? 0.7);
  const [tokensToAnalyze, setTokensToAnalyze] = useState(rule?.detection.tokens_to_analyze ?? 0);
  const [action, setAction] = useState<RefusalAction>(rule?.action || 'prompt_user');

  // Fallback config (for modify action)
  const [customPrompt, setCustomPrompt] = useState(rule?.fallback_config?.custom_prompt || '');
  const [systemPrompt, setSystemPrompt] = useState(rule?.fallback_config?.system_prompt || '');
  const [provider, setProvider] = useState<LLMProviderConfig | ''>(rule?.fallback_config?.provider || '');

  // Filter state
  const [hostMatch, setHostMatch] = useState<MatchType>(rule?.filter?.host?.match || 'contains');
  const [hostValue, setHostValue] = useState(rule?.filter?.host?.value || '');
  const [pathMatch, setPathMatch] = useState<MatchType>(rule?.filter?.path?.match || 'contains');
  const [pathValue, setPathValue] = useState(rule?.filter?.path?.value || '');
  const [modelMatch, setModelMatch] = useState<MatchType>(rule?.filter?.model?.match || 'contains');
  const [modelValue, setModelValue] = useState(rule?.filter?.model?.value || '');
  const [filterProvider, setFilterProvider] = useState<LLMProvider | ''>(rule?.filter?.provider || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const now = Date.now();
      const ruleData: RefusalRule = {
        id: rule?.id || `refusal_${now}_${Math.random().toString(36).slice(2, 8)}`,
        name: name.trim(),
        enabled,
        priority: rule?.priority ?? 0,
        detection: {
          enabled: true,
          confidence_threshold: confidenceThreshold,
          tokens_to_analyze: tokensToAnalyze,
        },
        action,
        created_at: rule?.created_at || now,
        updated_at: now,
      };

      // Add fallback config if action is modify
      if (action === 'modify') {
        ruleData.fallback_config = {};
        if (customPrompt.trim()) {
          ruleData.fallback_config.custom_prompt = customPrompt.trim();
        }
        if (systemPrompt.trim()) {
          ruleData.fallback_config.system_prompt = systemPrompt.trim();
        }
        if (provider) {
          ruleData.fallback_config.provider = provider as LLMProviderConfig;
        }
      }

      // Add filter if any filter values are set
      const filter: RefusalRule['filter'] = {};
      if (hostValue.trim()) {
        filter.host = { match: hostMatch, value: hostValue.trim() };
      }
      if (pathValue.trim()) {
        filter.path = { match: pathMatch, value: pathValue.trim() };
      }
      if (modelValue.trim()) {
        filter.model = { match: modelMatch, value: modelValue.trim() };
      }
      if (filterProvider) {
        filter.provider = filterProvider as LLMProvider;
      }
      if (Object.keys(filter).length > 0) {
        ruleData.filter = filter;
      }

      await onSave(ruleData);
    } catch (err: any) {
      setError(err.message || 'Failed to save rule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-inspector-surface border border-inspector-border rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-inspector-border flex items-center justify-between">
          <h2 className="text-lg font-medium text-inspector-text">
            {isNew ? 'Create Refusal Rule' : 'Edit Refusal Rule'}
          </h2>
          <button
            onClick={onClose}
            className="text-inspector-muted hover:text-inspector-text transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Error */}
            {error && (
              <div className="bg-inspector-error/20 text-inspector-error px-4 py-2 rounded text-sm">
                {error}
              </div>
            )}

            {/* Basic Info */}
            <section>
              <h3 className="text-sm font-medium text-inspector-text mb-3">Basic Info</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-inspector-muted mb-1">Rule Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-inspector-bg border border-inspector-border rounded text-inspector-text focus:outline-none focus:border-inspector-accent"
                    placeholder="e.g., Detect Claude Refusals"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEnabled(!enabled)}
                    className={clsx(
                      'w-10 h-5 rounded-full relative transition-colors',
                      enabled ? 'bg-inspector-success' : 'bg-inspector-border'
                    )}
                    role="switch"
                    aria-checked={enabled}
                  >
                    <span
                      className={clsx(
                        'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                        enabled ? 'left-5' : 'left-0.5'
                      )}
                    />
                  </button>
                  <span className="text-sm text-inspector-muted">
                    {enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
            </section>

            {/* Detection Settings */}
            <section>
              <h3 className="text-sm font-medium text-inspector-text mb-3">Detection Settings</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-inspector-muted mb-1">
                    Confidence Threshold: {(confidenceThreshold * 100).toFixed(0)}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={confidenceThreshold}
                    onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-inspector-muted mt-1">
                    <span>0% (detect everything)</span>
                    <span>100% (very strict)</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-inspector-muted mb-1">Tokens to Analyze</label>
                  <input
                    type="number"
                    min="0"
                    value={tokensToAnalyze}
                    onChange={(e) => setTokensToAnalyze(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-inspector-bg border border-inspector-border rounded text-inspector-text focus:outline-none focus:border-inspector-accent"
                    placeholder="0 = all tokens"
                  />
                  <p className="text-xs text-inspector-muted mt-1">
                    Set to 0 to analyze the entire response, or specify a number to analyze only the first N tokens.
                  </p>
                </div>
              </div>
            </section>

            {/* Action */}
            <section>
              <h3 className="text-sm font-medium text-inspector-text mb-3">Action When Refusal Detected</h3>
              <div className="space-y-2">
                {ACTION_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={clsx(
                      'flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors',
                      action === option.value
                        ? 'border-inspector-accent bg-inspector-accent/10'
                        : 'border-inspector-border hover:border-inspector-muted'
                    )}
                  >
                    <input
                      type="radio"
                      name="action"
                      value={option.value}
                      checked={action === option.value}
                      onChange={() => setAction(option.value)}
                      className="mt-1"
                    />
                    <div>
                      <div className="text-sm font-medium text-inspector-text">{option.label}</div>
                      <div className="text-xs text-inspector-muted">{option.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </section>

            {/* Fallback Config (for modify action) */}
            {action === 'modify' && (
              <section>
                <h3 className="text-sm font-medium text-inspector-text mb-3">Auto-Modify Configuration</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-inspector-muted mb-1">Custom Prompt (optional)</label>
                    <textarea
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 bg-inspector-bg border border-inspector-border rounded text-inspector-text focus:outline-none focus:border-inspector-accent font-mono text-sm"
                      placeholder="Leave empty to use default prompt. Use {{original_response}} to include the refusal text."
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-inspector-muted mb-1">System Prompt (optional)</label>
                    <textarea
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 bg-inspector-bg border border-inspector-border rounded text-inspector-text focus:outline-none focus:border-inspector-accent font-mono text-sm"
                      placeholder="Override the system prompt for generating alternate responses"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-inspector-muted mb-1">Provider Override (optional)</label>
                    <select
                      value={provider}
                      onChange={(e) => setProvider(e.target.value as LLMProviderConfig | '')}
                      className="w-full px-3 py-2 bg-inspector-bg border border-inspector-border rounded text-inspector-text focus:outline-none focus:border-inspector-accent"
                    >
                      <option value="">Use default provider</option>
                      {PROVIDER_OPTIONS.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>
            )}

            {/* Filter */}
            <section>
              <h3 className="text-sm font-medium text-inspector-text mb-3">Filter (optional)</h3>
              <p className="text-xs text-inspector-muted mb-3">
                Leave all fields empty to analyze all LLM responses.
              </p>
              <div className="space-y-4">
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <select
                    value={hostMatch}
                    onChange={(e) => setHostMatch(e.target.value as MatchType)}
                    className="px-2 py-2 bg-inspector-bg border border-inspector-border rounded text-inspector-text text-sm"
                  >
                    <option value="exact">Host equals</option>
                    <option value="contains">Host contains</option>
                    <option value="regex">Host regex</option>
                  </select>
                  <input
                    type="text"
                    value={hostValue}
                    onChange={(e) => setHostValue(e.target.value)}
                    className="px-3 py-2 bg-inspector-bg border border-inspector-border rounded text-inspector-text focus:outline-none focus:border-inspector-accent"
                    placeholder="e.g., api.anthropic.com"
                  />
                </div>
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <select
                    value={pathMatch}
                    onChange={(e) => setPathMatch(e.target.value as MatchType)}
                    className="px-2 py-2 bg-inspector-bg border border-inspector-border rounded text-inspector-text text-sm"
                  >
                    <option value="exact">Path equals</option>
                    <option value="contains">Path contains</option>
                    <option value="regex">Path regex</option>
                  </select>
                  <input
                    type="text"
                    value={pathValue}
                    onChange={(e) => setPathValue(e.target.value)}
                    className="px-3 py-2 bg-inspector-bg border border-inspector-border rounded text-inspector-text focus:outline-none focus:border-inspector-accent"
                    placeholder="e.g., /v1/messages"
                  />
                </div>
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <select
                    value={modelMatch}
                    onChange={(e) => setModelMatch(e.target.value as MatchType)}
                    className="px-2 py-2 bg-inspector-bg border border-inspector-border rounded text-inspector-text text-sm"
                  >
                    <option value="exact">Model equals</option>
                    <option value="contains">Model contains</option>
                    <option value="regex">Model regex</option>
                  </select>
                  <input
                    type="text"
                    value={modelValue}
                    onChange={(e) => setModelValue(e.target.value)}
                    className="px-3 py-2 bg-inspector-bg border border-inspector-border rounded text-inspector-text focus:outline-none focus:border-inspector-accent"
                    placeholder="e.g., claude-3"
                  />
                </div>
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <label className="px-2 py-2 text-sm text-inspector-muted">Provider</label>
                  <select
                    value={filterProvider}
                    onChange={(e) => setFilterProvider(e.target.value as LLMProvider | '')}
                    className="px-3 py-2 bg-inspector-bg border border-inspector-border rounded text-inspector-text focus:outline-none focus:border-inspector-accent"
                  >
                    <option value="">Any provider</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="openai">OpenAI</option>
                    <option value="google">Google</option>
                    <option value="ollama">Ollama</option>
                  </select>
                </div>
              </div>
            </section>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-inspector-border flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-inspector-muted hover:text-inspector-text transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={saving || !name.trim()}
            className="px-4 py-2 text-sm bg-inspector-accent hover:bg-inspector-accent/80 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : (isNew ? 'Create Rule' : 'Save Changes')}
          </button>
        </div>
      </div>
    </div>
  );
}
