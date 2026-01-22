/**
 * GenerateMockModal - Generate mock responses using LLM
 */

import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { HttpRequest, PromptTemplate, LLMProviderConfig, ALL_PROVIDERS } from '../../types';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:2000';

interface GenerateMockModalProps {
  request: {
    method: string;
    url: string;
    host: string;
    path: string;
    headers: Record<string, string>;
    body?: string;
  };
  onClose: () => void;
  onSuccess?: (datastoreKey: string, ruleId?: string) => void;
}

interface GeneratedResult {
  datastore_key: string;
  rule_id?: string;
  generated_response: {
    status_code: number;
    headers: Record<string, string>;
    body: string;
  };
}

export function GenerateMockModal({ request, onClose, onSuccess }: GenerateMockModalProps) {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Form state
  const [useTemplate, setUseTemplate] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('default_mock_api');
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({});
  const [customPrompt, setCustomPrompt] = useState('');
  const [provider, setProvider] = useState<LLMProviderConfig | ''>('');
  const [createRule, setCreateRule] = useState(true);
  const [datastoreKey, setDatastoreKey] = useState('');

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [editedBody, setEditedBody] = useState<string>('');

  // Fetch templates on mount
  useEffect(() => {
    fetchTemplates();
    generateDefaultKey();
  }, []);

  // Update template variables when template changes
  useEffect(() => {
    if (selectedTemplateId) {
      const template = templates.find(t => t.id === selectedTemplateId);
      if (template?.variables) {
        const defaults: Record<string, string> = {};
        for (const v of template.variables) {
          // Auto-fill known variables
          if (v.name === 'method') defaults[v.name] = request.method;
          else if (v.name === 'url') defaults[v.name] = request.url;
          else if (v.name === 'host') defaults[v.name] = request.host;
          else if (v.name === 'path') defaults[v.name] = request.path;
          else defaults[v.name] = v.default || '';
        }
        setTemplateVariables(defaults);
      }
    }
  }, [selectedTemplateId, templates, request]);

  const fetchTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch(`${API_BASE}/api/templates`);
      if (res.ok) {
        const data = await res.json();
        // Filter to mock_generation templates
        const mockTemplates = (data.templates || []).filter(
          (t: PromptTemplate) => t.category === 'mock_generation' || t.category === 'custom'
        );
        setTemplates(mockTemplates);
      }
    } catch (err) {
      console.error('Failed to fetch templates:', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const generateDefaultKey = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/datastore/generate-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: request.method,
          host: request.host,
          path: request.path,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setDatastoreKey(data.key);
      }
    } catch (err) {
      console.error('Failed to generate key:', err);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setResult(null);

    try {
      const body: any = {
        request: {
          method: request.method,
          url: request.url,
          host: request.host,
          path: request.path,
          headers: request.headers,
          body: request.body,
        },
        create_rule: createRule,
        datastore_key: datastoreKey || undefined,
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

      const res = await fetch(`${API_BASE}/api/generate-mock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Generation failed');
      }

      setResult(data);
      setEditedBody(data.generated_response.body);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveEdited = async () => {
    if (!result) return;

    setGenerating(true);
    setError(null);

    try {
      // Update the datastore entry with edited body
      const res = await fetch(`${API_BASE}/api/datastore/responses/${encodeURIComponent(result.datastore_key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            ...result.generated_response,
            body: editedBody,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      onSuccess?.(result.datastore_key, result.rule_id);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleDone = () => {
    if (result) {
      onSuccess?.(result.datastore_key, result.rule_id);
    }
    onClose();
  };

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-inspector-surface border border-inspector-border rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-inspector-border flex items-center justify-between">
          <h2 className="text-lg font-medium text-inspector-text">
            {result ? 'Mock Generated Successfully' : 'Generate Mock Response'}
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
          {/* Request info */}
          <div className="bg-inspector-bg rounded p-3">
            <div className="text-sm text-inspector-muted mb-1">Request:</div>
            <div className="font-mono text-sm text-inspector-text">
              <span className="text-inspector-accent">{request.method}</span>{' '}
              {request.url}
            </div>
          </div>

          {error && (
            <div className="bg-inspector-error/20 text-inspector-error px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}

          {!result ? (
            <>
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

                    {/* Template variables */}
                    {selectedTemplate?.variables && selectedTemplate.variables.length > 0 && (
                      <div className="space-y-2">
                        <label className="block text-sm text-inspector-text">Variables:</label>
                        {selectedTemplate.variables.map(v => (
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
                    placeholder="Describe what the mock response should contain..."
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

              {/* Options */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-inspector-text cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createRule}
                    onChange={(e) => setCreateRule(e.target.checked)}
                    className="text-inspector-accent"
                  />
                  Create response rule automatically
                </label>

                <div>
                  <label className="block text-sm text-inspector-text mb-1">Datastore key:</label>
                  <input
                    type="text"
                    value={datastoreKey}
                    onChange={(e) => setDatastoreKey(e.target.value)}
                    className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text font-mono text-sm"
                    placeholder="Auto-generated if empty"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Success result */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-inspector-success">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium">Mock response generated</span>
                </div>

                <div className="bg-inspector-bg rounded p-3 space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-inspector-muted">Saved to datastore:</span>
                    <span className="font-mono text-inspector-accent">{result.datastore_key}</span>
                  </div>
                  {result.rule_id && (
                    <div className="flex items-center gap-2">
                      <span className="text-inspector-muted">Created rule:</span>
                      <span className="font-mono text-inspector-text">{result.rule_id}</span>
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm text-inspector-text">Response body:</label>
                    <span className="text-xs text-inspector-muted">
                      Status: <span className="text-inspector-accent">{result.generated_response.status_code}</span>
                    </span>
                  </div>
                  <textarea
                    value={editedBody}
                    onChange={(e) => setEditedBody(e.target.value)}
                    rows={12}
                    className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text font-mono text-sm"
                  />
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
              onClick={handleGenerate}
              disabled={generating || (useTemplate && !selectedTemplateId) || (!useTemplate && !customPrompt.trim())}
              className="px-4 py-2 text-sm rounded bg-inspector-accent hover:bg-inspector-accent/80 text-white disabled:opacity-50 flex items-center gap-2"
            >
              {generating ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generate Mock
                </>
              )}
            </button>
          ) : (
            <>
              {editedBody !== result.generated_response.body && (
                <button
                  onClick={handleSaveEdited}
                  disabled={generating}
                  className="px-4 py-2 text-sm rounded bg-inspector-warning hover:bg-inspector-warning/80 text-white disabled:opacity-50"
                >
                  Save Changes
                </button>
              )}
              <button
                onClick={handleDone}
                className="px-4 py-2 text-sm rounded bg-inspector-accent hover:bg-inspector-accent/80 text-white"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
