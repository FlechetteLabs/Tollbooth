/**
 * TransformModal - Transform datastore entries using LLM
 */

import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { PromptTemplate, LLMProviderConfig, ALL_PROVIDERS } from '../../types';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:2000';

interface TransformModalProps {
  datastoreKey: string;
  currentBody: string;
  onClose: () => void;
  onSuccess?: (newKey: string, transformedBody: string) => void;
}

interface TransformResult {
  key: string;
  original_body: string;
  transformed_body: string;
}

export function TransformModal({ datastoreKey, currentBody, onClose, onSuccess }: TransformModalProps) {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Form state
  const [useTemplate, setUseTemplate] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('default_transform');
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({});
  const [customPrompt, setCustomPrompt] = useState('');
  const [provider, setProvider] = useState<LLMProviderConfig | ''>('');
  const [saveAs, setSaveAs] = useState<'replace' | 'new_key'>('new_key');
  const [newKey, setNewKey] = useState(`${datastoreKey}_transformed`);

  // Transform state
  const [transforming, setTransforming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TransformResult | null>(null);

  // Fetch templates on mount
  useEffect(() => {
    fetchTemplates();
  }, []);

  // Update template variables when template changes
  useEffect(() => {
    if (selectedTemplateId) {
      const template = templates.find(t => t.id === selectedTemplateId);
      if (template?.variables) {
        const defaults: Record<string, string> = {};
        for (const v of template.variables) {
          if (v.name === 'content') continue; // Content is auto-filled
          defaults[v.name] = v.default || '';
        }
        setTemplateVariables(defaults);
      }
    }
  }, [selectedTemplateId, templates]);

  const fetchTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch(`${API_BASE}/api/templates`);
      if (res.ok) {
        const data = await res.json();
        // Filter to transformation templates
        const transformTemplates = (data.templates || []).filter(
          (t: PromptTemplate) => t.category === 'transformation' || t.category === 'custom'
        );
        setTemplates(transformTemplates);
      }
    } catch (err) {
      console.error('Failed to fetch templates:', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleTransform = async () => {
    setTransforming(true);
    setError(null);
    setResult(null);

    try {
      const body: any = {
        save_as: saveAs,
        new_key: saveAs === 'new_key' ? newKey : undefined,
      };

      if (useTemplate && selectedTemplateId) {
        body.template_id = selectedTemplateId;
        body.template_variables = templateVariables;
      } else {
        body.prompt = customPrompt;
      }

      if (provider) {
        body.provider = provider;
      }

      const res = await fetch(`${API_BASE}/api/datastore/responses/${encodeURIComponent(datastoreKey)}/transform`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Transform failed');
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTransforming(false);
    }
  };

  const handleDone = () => {
    if (result) {
      onSuccess?.(result.key, result.transformed_body);
    }
    onClose();
  };

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  // Calculate diff preview (simple character count comparison)
  const bodyPreview = currentBody.length > 500 ? currentBody.slice(0, 500) + '...' : currentBody;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-inspector-surface border border-inspector-border rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-inspector-border flex items-center justify-between">
          <h2 className="text-lg font-medium text-inspector-text">
            {result ? 'Transform Complete' : 'Transform with LLM'}
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
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Source info */}
          <div className="bg-inspector-bg rounded p-3">
            <div className="text-sm text-inspector-muted mb-1">Source:</div>
            <div className="font-mono text-sm text-inspector-accent">{datastoreKey}</div>
            <div className="text-xs text-inspector-muted mt-1">{currentBody.length} characters</div>
          </div>

          {error && (
            <div className="bg-inspector-error/20 text-inspector-error px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}

          {!result ? (
            <>
              {/* Current body preview */}
              <div>
                <label className="block text-sm text-inspector-text mb-1">Current content preview:</label>
                <pre className="bg-inspector-bg rounded p-3 text-xs font-mono text-inspector-muted max-h-32 overflow-y-auto">
                  {bodyPreview}
                </pre>
              </div>

              {/* Prompt source */}
              <div>
                <div className="flex gap-4 mb-2">
                  <label className="flex items-center gap-2 text-sm text-inspector-text cursor-pointer">
                    <input
                      type="radio"
                      checked={useTemplate}
                      onChange={() => setUseTemplate(true)}
                      className="text-inspector-accent"
                    />
                    Use Template
                  </label>
                  <label className="flex items-center gap-2 text-sm text-inspector-text cursor-pointer">
                    <input
                      type="radio"
                      checked={!useTemplate}
                      onChange={() => setUseTemplate(false)}
                      className="text-inspector-accent"
                    />
                    Custom Prompt
                  </label>
                </div>

                {useTemplate ? (
                  <div className="space-y-3">
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                      className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text"
                      disabled={loadingTemplates}
                    >
                      {loadingTemplates ? (
                        <option>Loading templates...</option>
                      ) : templates.length === 0 ? (
                        <option value="">No templates available</option>
                      ) : (
                        templates.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))
                      )}
                    </select>

                    {selectedTemplate?.description && (
                      <p className="text-xs text-inspector-muted">{selectedTemplate.description}</p>
                    )}

                    {/* Template variables (excluding 'content' which is auto-filled) */}
                    {selectedTemplate?.variables && selectedTemplate.variables.filter(v => v.name !== 'content').length > 0 && (
                      <div className="space-y-2">
                        <label className="block text-sm text-inspector-text">Variables:</label>
                        {selectedTemplate.variables.filter(v => v.name !== 'content').map(v => (
                          <div key={v.name} className="flex gap-2 items-center">
                            <span className="text-sm text-inspector-muted w-24 font-mono">{v.name}:</span>
                            <input
                              type="text"
                              value={templateVariables[v.name] || ''}
                              onChange={(e) => setTemplateVariables({
                                ...templateVariables,
                                [v.name]: e.target.value,
                              })}
                              placeholder={v.description || v.name}
                              className="flex-1 bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm text-inspector-text"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    rows={4}
                    className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text font-mono text-sm"
                    placeholder="Describe the transformation to apply..."
                  />
                )}
              </div>

              {/* Provider */}
              <div>
                <label className="block text-sm text-inspector-text mb-1">Provider (optional)</label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as LLMProviderConfig | '')}
                  className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text"
                >
                  <option value="">Use default</option>
                  {ALL_PROVIDERS.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* Save options */}
              <div className="space-y-2">
                <label className="block text-sm text-inspector-text">Save as:</label>
                <div className="space-y-2 pl-2">
                  <label className="flex items-center gap-2 text-sm text-inspector-text cursor-pointer">
                    <input
                      type="radio"
                      checked={saveAs === 'replace'}
                      onChange={() => setSaveAs('replace')}
                      className="text-inspector-accent"
                    />
                    Replace original
                  </label>
                  <label className="flex items-center gap-2 text-sm text-inspector-text cursor-pointer">
                    <input
                      type="radio"
                      checked={saveAs === 'new_key'}
                      onChange={() => setSaveAs('new_key')}
                      className="text-inspector-accent"
                    />
                    Save as new key
                  </label>
                </div>

                {saveAs === 'new_key' && (
                  <input
                    type="text"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text font-mono text-sm mt-2"
                    placeholder="new_key_name"
                  />
                )}
              </div>
            </>
          ) : (
            <>
              {/* Success result with diff view */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-inspector-success">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium">Transformation complete</span>
                </div>

                <div className="bg-inspector-bg rounded p-3 space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-inspector-muted">Saved to:</span>
                    <span className="font-mono text-inspector-accent">{result.key}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-inspector-muted">Size change:</span>
                    <span className="font-mono text-inspector-text">
                      {result.original_body.length} → {result.transformed_body.length} characters
                    </span>
                  </div>
                </div>

                {/* Diff preview */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-inspector-muted mb-1">Original:</label>
                    <pre className="bg-red-500/10 border border-red-500/30 rounded p-3 text-xs font-mono text-inspector-text max-h-48 overflow-y-auto">
                      {result.original_body.slice(0, 1000)}
                      {result.original_body.length > 1000 && '...'}
                    </pre>
                  </div>
                  <div>
                    <label className="block text-sm text-inspector-muted mb-1">Transformed:</label>
                    <pre className="bg-green-500/10 border border-green-500/30 rounded p-3 text-xs font-mono text-inspector-text max-h-48 overflow-y-auto">
                      {result.transformed_body.slice(0, 1000)}
                      {result.transformed_body.length > 1000 && '...'}
                    </pre>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-inspector-border flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded bg-inspector-bg hover:bg-inspector-border text-inspector-muted"
          >
            Cancel
          </button>

          {!result ? (
            <button
              onClick={handleTransform}
              disabled={transforming || (useTemplate && !selectedTemplateId) || (!useTemplate && !customPrompt.trim()) || (saveAs === 'new_key' && !newKey.trim())}
              className="px-4 py-2 text-sm rounded bg-inspector-accent hover:bg-inspector-accent/80 text-white disabled:opacity-50 flex items-center gap-2"
            >
              {transforming ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Transforming...
                </>
              ) : (
                'Transform'
              )}
            </button>
          ) : (
            <button
              onClick={handleDone}
              className="px-4 py-2 text-sm rounded bg-inspector-accent hover:bg-inspector-accent/80 text-white"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
