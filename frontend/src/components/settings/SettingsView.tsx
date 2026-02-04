/**
 * Settings View - configure multiple LLM providers and prompt templates
 */

import { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import {
  Settings,
  LLMProviderConfig,
  ProviderConfig,
  ModelInfo,
  ALL_PROVIDERS,
  PromptTemplate,
  PromptTemplateCategory,
  PromptTemplateVariable,
} from '../../types';
import { useAppStore, GlossopetareSeed } from '../../stores/appStore';
import { isGlossopetraeAvailable, initializeGlossopetrae } from '../../utils/glossopetrae';

type SettingsTab = 'providers' | 'templates' | 'glossopetrae';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:2000';

// Default base URLs for each provider
const DEFAULT_BASE_URLS: Record<LLMProviderConfig, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com',
  google: 'https://generativelanguage.googleapis.com',
  ollama: 'http://localhost:11434',
};

// Default models for each provider
const DEFAULT_MODELS: Record<LLMProviderConfig, string> = {
  anthropic: 'claude-sonnet-4-5-20250929',
  openai: 'gpt-4o',
  google: 'gemini-1.5-pro',
  ollama: 'llama2',
};

// Provider display info
const PROVIDER_INFO: Record<LLMProviderConfig, { name: string; description: string; keyHelp: string; requiresKey: boolean }> = {
  anthropic: {
    name: 'Anthropic',
    description: 'Claude models',
    keyHelp: 'Get your API key from console.anthropic.com',
    requiresKey: true,
  },
  openai: {
    name: 'OpenAI',
    description: 'GPT models',
    keyHelp: 'Get your API key from platform.openai.com',
    requiresKey: true,
  },
  google: {
    name: 'Google',
    description: 'Gemini models',
    keyHelp: 'Get your API key from aistudio.google.com',
    requiresKey: true,
  },
  ollama: {
    name: 'Ollama',
    description: 'Local models',
    keyHelp: 'Ollama typically runs locally without authentication',
    requiresKey: false,
  },
};

function getDefaultProviderConfig(provider: LLMProviderConfig): ProviderConfig {
  return {
    apiKey: '',
    model: DEFAULT_MODELS[provider],
    temperature: 0.7,
    maxTokens: 4096,
  };
}

export function SettingsView() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Main settings tab (providers vs templates)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('providers');

  // Currently selected provider tab for editing
  const [selectedProvider, setSelectedProvider] = useState<LLMProviderConfig>('anthropic');

  // Templates state
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null);
  const [isNewTemplate, setIsNewTemplate] = useState(false);

  // Form state for the selected provider
  const [providerConfigs, setProviderConfigs] = useState<Record<LLMProviderConfig, ProviderConfig>>({
    anthropic: getDefaultProviderConfig('anthropic'),
    openai: getDefaultProviderConfig('openai'),
    google: getDefaultProviderConfig('google'),
    ollama: getDefaultProviderConfig('ollama'),
  });

  const [activeProvider, setActiveProvider] = useState<LLMProviderConfig>('anthropic');
  const [useCustomUrl, setUseCustomUrl] = useState<Record<LLMProviderConfig, boolean>>({
    anthropic: false,
    openai: false,
    google: false,
    ollama: false,
  });

  // Models state per provider
  const [models, setModels] = useState<Record<LLMProviderConfig, ModelInfo[]>>({
    anthropic: [],
    openai: [],
    google: [],
    ollama: [],
  });
  const [loadingModels, setLoadingModels] = useState<Record<LLMProviderConfig, boolean>>({
    anthropic: false,
    openai: false,
    google: false,
    ollama: false,
  });

  useEffect(() => {
    fetchSettings();
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch(`${API_BASE}/api/templates`);
      if (!res.ok) throw new Error('Failed to fetch templates');
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (err: any) {
      console.error('Failed to fetch templates:', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleSaveTemplate = async (template: Partial<PromptTemplate>) => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const url = isNewTemplate
        ? `${API_BASE}/api/templates`
        : `${API_BASE}/api/templates/${template.id}`;
      const method = isNewTemplate ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save template');
      }

      setSuccess(isNewTemplate ? 'Template created successfully' : 'Template updated successfully');
      setEditingTemplate(null);
      setIsNewTemplate(false);
      fetchTemplates();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      const res = await fetch(`${API_BASE}/api/templates/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete template');
      }

      setSuccess('Template deleted successfully');
      fetchTemplates();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const startNewTemplate = () => {
    setEditingTemplate({
      id: '',
      name: '',
      description: '',
      category: 'custom',
      template: '',
      variables: [],
      systemPrompt: '',
      created_at: Date.now(),
      updated_at: Date.now(),
    });
    setIsNewTemplate(true);
  };

  const fetchModels = useCallback(async (provider: LLMProviderConfig, config?: ProviderConfig) => {
    const currentConfig = config || providerConfigs[provider];

    setLoadingModels(prev => ({ ...prev, [provider]: true }));

    try {
      const params = new URLSearchParams({ provider });
      if (currentConfig.apiKey && currentConfig.apiKey !== '••••••••' && PROVIDER_INFO[provider].requiresKey) {
        params.set('apiKey', currentConfig.apiKey);
      }
      if (currentConfig.baseUrl) {
        params.set('baseUrl', currentConfig.baseUrl);
      }

      const res = await fetch(`${API_BASE}/api/llm/models?${params}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch models');
      }

      const data = await res.json();
      setModels(prev => ({ ...prev, [provider]: data.models || [] }));
    } catch (err: any) {
      console.error(`Failed to fetch models for ${provider}:`, err);
      setModels(prev => ({ ...prev, [provider]: [] }));
    } finally {
      setLoadingModels(prev => ({ ...prev, [provider]: false }));
    }
  }, [providerConfigs]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/settings`);
      if (!res.ok) throw new Error('Failed to fetch settings');
      const data: Settings = await res.json();
      setSettings(data);

      // Update form state from loaded settings
      setActiveProvider(data.llm.activeProvider);
      setSelectedProvider(data.llm.activeProvider);

      const newConfigs: Record<LLMProviderConfig, ProviderConfig> = {
        anthropic: getDefaultProviderConfig('anthropic'),
        openai: getDefaultProviderConfig('openai'),
        google: getDefaultProviderConfig('google'),
        ollama: getDefaultProviderConfig('ollama'),
      };

      const newUseCustomUrl: Record<LLMProviderConfig, boolean> = {
        anthropic: false,
        openai: false,
        google: false,
        ollama: false,
      };

      for (const provider of ALL_PROVIDERS) {
        if (data.llm.providers[provider]) {
          newConfigs[provider] = {
            ...getDefaultProviderConfig(provider),
            ...data.llm.providers[provider],
          };
          newUseCustomUrl[provider] = !!data.llm.providers[provider]?.baseUrl;
        }
      }

      setProviderConfigs(newConfigs);
      setUseCustomUrl(newUseCustomUrl);

      // Fetch models for all providers
      for (const provider of ALL_PROVIDERS) {
        fetchModels(provider, newConfigs[provider]);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      // Build the providers object, clearing baseUrl if not using custom
      const providers: Partial<Record<LLMProviderConfig, ProviderConfig>> = {};
      for (const provider of ALL_PROVIDERS) {
        providers[provider] = {
          ...providerConfigs[provider],
          baseUrl: useCustomUrl[provider] ? providerConfigs[provider].baseUrl : '',
        };
      }

      const updates: Partial<Settings> = {
        llm: {
          activeProvider,
          providers,
        },
      };

      const res = await fetch(`${API_BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save settings');
      }

      setSuccess('Settings saved successfully');
      fetchSettings(); // Refresh to get redacted keys
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const updateProviderConfig = (provider: LLMProviderConfig, updates: Partial<ProviderConfig>) => {
    setProviderConfigs(prev => ({
      ...prev,
      [provider]: { ...prev[provider], ...updates },
    }));
  };

  const isProviderConfigured = (provider: LLMProviderConfig): boolean => {
    if (provider === 'ollama') return true;
    return !!providerConfigs[provider].apiKey;
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-inspector-muted">
        Loading settings...
      </div>
    );
  }

  const currentConfig = providerConfigs[selectedProvider];
  const currentProviderInfo = PROVIDER_INFO[selectedProvider];
  const currentModels = models[selectedProvider];
  const isLoadingModels = loadingModels[selectedProvider];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-inspector-text">Settings</h1>
          <p className="text-inspector-muted mt-1">
            Configure LLM providers and prompt templates
          </p>
        </div>

        {/* Main Settings Tabs */}
        <div className="flex border-b border-inspector-border">
          <button
            onClick={() => setSettingsTab('providers')}
            className={clsx(
              'px-4 py-2 text-sm font-medium transition-colors',
              settingsTab === 'providers'
                ? 'text-inspector-accent border-b-2 border-inspector-accent'
                : 'text-inspector-muted hover:text-inspector-text'
            )}
          >
            LLM Providers
          </button>
          <button
            onClick={() => setSettingsTab('templates')}
            className={clsx(
              'px-4 py-2 text-sm font-medium transition-colors',
              settingsTab === 'templates'
                ? 'text-inspector-accent border-b-2 border-inspector-accent'
                : 'text-inspector-muted hover:text-inspector-text'
            )}
          >
            Prompt Templates
          </button>
          <button
            onClick={() => setSettingsTab('glossopetrae')}
            className={clsx(
              'px-4 py-2 text-sm font-medium transition-colors',
              settingsTab === 'glossopetrae'
                ? 'text-inspector-accent border-b-2 border-inspector-accent'
                : 'text-inspector-muted hover:text-inspector-text'
            )}
          >
            🗣️ Glossopetrae
          </button>
        </div>

        {/* Status messages */}
        {error && (
          <div className="bg-inspector-error/20 text-inspector-error rounded-lg p-3 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-inspector-success/20 text-inspector-success rounded-lg p-3 text-sm">
            {success}
          </div>
        )}

        {settingsTab === 'providers' && (
          <>
        {/* Active Provider Selection */}
        <section className="bg-inspector-surface border border-inspector-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-medium text-inspector-text">Default Provider</h2>
              <p className="text-xs text-inspector-muted mt-1">
                Used by default in Chat (can be overridden per-conversation)
              </p>
            </div>
            <select
              value={activeProvider}
              onChange={(e) => setActiveProvider(e.target.value as LLMProviderConfig)}
              className="bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text"
            >
              {ALL_PROVIDERS.map(p => (
                <option key={p} value={p} disabled={!isProviderConfigured(p)}>
                  {PROVIDER_INFO[p].name} {!isProviderConfigured(p) && '(not configured)'}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Provider Tabs */}
        <section className="bg-inspector-surface border border-inspector-border rounded-lg overflow-hidden">
          {/* Tab Headers */}
          <div className="flex border-b border-inspector-border">
            {ALL_PROVIDERS.map(provider => (
              <button
                key={provider}
                onClick={() => setSelectedProvider(provider)}
                className={clsx(
                  'flex-1 px-4 py-3 text-sm font-medium transition-colors',
                  selectedProvider === provider
                    ? 'bg-inspector-bg text-inspector-text border-b-2 border-inspector-accent'
                    : 'text-inspector-muted hover:text-inspector-text hover:bg-inspector-bg/50'
                )}
              >
                <div className="flex items-center justify-center gap-2">
                  {PROVIDER_INFO[provider].name}
                  {isProviderConfigured(provider) && (
                    <span className="w-2 h-2 rounded-full bg-inspector-success" title="Configured" />
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Provider Config Form */}
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-inspector-text">{currentProviderInfo.name}</h3>
                <p className="text-xs text-inspector-muted">{currentProviderInfo.description}</p>
              </div>
              {isProviderConfigured(selectedProvider) ? (
                <span className="text-xs text-inspector-success flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-inspector-success" />
                  Configured
                </span>
              ) : (
                <span className="text-xs text-inspector-muted flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-inspector-muted" />
                  Not configured
                </span>
              )}
            </div>

            {/* API Key */}
            <div>
              <label className="block text-sm text-inspector-text mb-1">
                API Key {!currentProviderInfo.requiresKey && '(Optional)'}
              </label>
              <input
                type="password"
                value={currentConfig.apiKey}
                onChange={(e) => updateProviderConfig(selectedProvider, { apiKey: e.target.value })}
                placeholder={currentProviderInfo.requiresKey ? 'Enter your API key' : 'Optional'}
                className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text font-mono"
              />
              <p className="text-xs text-inspector-muted mt-1">
                {currentProviderInfo.keyHelp}
              </p>
            </div>

            {/* Base URL */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <label className="block text-sm text-inspector-text">Base URL</label>
                <label className="flex items-center gap-1 text-xs text-inspector-muted">
                  <input
                    type="checkbox"
                    checked={useCustomUrl[selectedProvider]}
                    onChange={(e) => {
                      setUseCustomUrl(prev => ({ ...prev, [selectedProvider]: e.target.checked }));
                      if (!e.target.checked) {
                        updateProviderConfig(selectedProvider, { baseUrl: '' });
                      }
                    }}
                    className="rounded"
                  />
                  Custom URL
                </label>
              </div>
              <input
                type="text"
                value={useCustomUrl[selectedProvider] ? (currentConfig.baseUrl || '') : DEFAULT_BASE_URLS[selectedProvider]}
                onChange={(e) => updateProviderConfig(selectedProvider, { baseUrl: e.target.value })}
                disabled={!useCustomUrl[selectedProvider]}
                placeholder={DEFAULT_BASE_URLS[selectedProvider]}
                className={clsx(
                  'w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text font-mono text-sm',
                  !useCustomUrl[selectedProvider] && 'opacity-60'
                )}
              />
              <p className="text-xs text-inspector-muted mt-1">
                Default: {DEFAULT_BASE_URLS[selectedProvider]}
              </p>
            </div>

            {/* Ollama Mode - only show for Ollama */}
            {selectedProvider === 'ollama' && (
              <div>
                <label className="block text-sm text-inspector-text mb-1">API Mode</label>
                <select
                  value={currentConfig.ollamaMode || 'native'}
                  onChange={(e) => updateProviderConfig(selectedProvider, { ollamaMode: e.target.value as 'native' | 'openai-compatible' })}
                  className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text"
                >
                  <option value="native">Native (/api/chat)</option>
                  <option value="openai-compatible">OpenAI-compatible (/v1/chat/completions)</option>
                </select>
                <p className="text-xs text-inspector-muted mt-1">
                  Native mode is recommended. OpenAI-compatible mode can be useful for compatibility testing.
                </p>
              </div>
            )}

            {/* Model */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm text-inspector-text">Model</label>
                <button
                  onClick={() => fetchModels(selectedProvider)}
                  disabled={isLoadingModels}
                  className="text-xs text-inspector-accent hover:text-inspector-accent/80 disabled:opacity-50 flex items-center gap-1"
                >
                  {isLoadingModels ? (
                    <>
                      <span className="animate-spin">⟳</span>
                      Loading...
                    </>
                  ) : (
                    <>⟳ Refresh</>
                  )}
                </button>
              </div>

              <select
                value={currentConfig.model}
                onChange={(e) => updateProviderConfig(selectedProvider, { model: e.target.value })}
                className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text"
                disabled={isLoadingModels}
              >
                {currentModels.length === 0 && !isLoadingModels && (
                  <option value={currentConfig.model}>{currentConfig.model}</option>
                )}
                {currentModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name !== m.id ? `${m.name} (${m.id})` : m.id}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={currentConfig.model}
                onChange={(e) => updateProviderConfig(selectedProvider, { model: e.target.value })}
                placeholder="Or enter custom model name"
                className="w-full mt-2 bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text font-mono text-sm"
              />
            </div>

            {/* Temperature */}
            <div>
              <label className="block text-sm text-inspector-text mb-1">
                Temperature: {currentConfig.temperature ?? 0.7}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={currentConfig.temperature ?? 0.7}
                onChange={(e) => updateProviderConfig(selectedProvider, { temperature: parseFloat(e.target.value) })}
                className="w-full"
              />
            </div>

            {/* Max Tokens */}
            <div>
              <label className="block text-sm text-inspector-text mb-1">Max Tokens</label>
              <input
                type="number"
                min="1"
                max="128000"
                value={currentConfig.maxTokens ?? 4096}
                onChange={(e) => updateProviderConfig(selectedProvider, { maxTokens: parseInt(e.target.value) || 4096 })}
                className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text"
              />
            </div>
          </div>
        </section>

        {/* Data Store Info */}
        <section className="bg-inspector-surface border border-inspector-border rounded-lg p-6">
          <h2 className="text-lg font-medium text-inspector-text mb-4">
            Data Store
          </h2>

          <div>
            <label className="block text-sm text-inspector-text mb-1">Path</label>
            <input
              type="text"
              value={settings?.datastore_path || './datastore'}
              readOnly
              className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-muted font-mono"
            />
            <p className="text-xs text-inspector-muted mt-1">
              Data store path is configured via Docker volume mount
            </p>
          </div>
        </section>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className={clsx(
              'px-6 py-2 rounded-lg text-white font-medium',
              saving
                ? 'bg-inspector-accent/50 cursor-not-allowed'
                : 'bg-inspector-accent hover:bg-inspector-accent/80'
            )}
          >
            {saving ? 'Saving...' : 'Save All Settings'}
          </button>
        </div>
          </>
        )}

        {/* Prompt Templates Tab */}
        {settingsTab === 'templates' && (
          <section className="bg-inspector-surface border border-inspector-border rounded-lg overflow-hidden">
            <div className="p-4 border-b border-inspector-border flex items-center justify-between">
              <div>
                <h2 className="font-medium text-inspector-text">Prompt Templates</h2>
                <p className="text-xs text-inspector-muted mt-1">
                  Reusable prompts for mock generation, transformations, and LLM rules
                </p>
              </div>
              <button
                onClick={startNewTemplate}
                className="px-3 py-1.5 text-sm rounded bg-inspector-accent hover:bg-inspector-accent/80 text-white flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Template
              </button>
            </div>

            {loadingTemplates ? (
              <div className="p-8 text-center text-inspector-muted">Loading templates...</div>
            ) : templates.length === 0 ? (
              <div className="p-8 text-center text-inspector-muted">
                No templates found. Click "New Template" to create one.
              </div>
            ) : (
              <div className="divide-y divide-inspector-border">
                {templates.map(template => (
                  <div
                    key={template.id}
                    className="p-4 hover:bg-inspector-bg/50 cursor-pointer"
                    onClick={() => {
                      setEditingTemplate(template);
                      setIsNewTemplate(false);
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-inspector-text">{template.name}</span>
                          {template.category && (
                            <span className={clsx(
                              'text-xs px-1.5 py-0.5 rounded',
                              template.category === 'mock_generation' && 'bg-blue-500/20 text-blue-400',
                              template.category === 'transformation' && 'bg-purple-500/20 text-purple-400',
                              template.category === 'custom' && 'bg-gray-500/20 text-gray-400'
                            )}>
                              {template.category.replace('_', ' ')}
                            </span>
                          )}
                          {template.id.startsWith('default_') && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-inspector-border text-inspector-muted">
                              built-in
                            </span>
                          )}
                        </div>
                        {template.description && (
                          <p className="text-sm text-inspector-muted mt-1 truncate">
                            {template.description}
                          </p>
                        )}
                        <p className="text-xs text-inspector-muted mt-1 font-mono truncate">
                          {template.template.slice(0, 80)}...
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingTemplate(template);
                            setIsNewTemplate(false);
                          }}
                          className="p-1.5 text-inspector-muted hover:text-inspector-text hover:bg-inspector-border rounded"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        {!template.id.startsWith('default_') && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTemplate(template.id);
                            }}
                            className="p-1.5 text-inspector-muted hover:text-inspector-error hover:bg-inspector-error/10 rounded"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Glossopetrae Tab */}
        {settingsTab === 'glossopetrae' && (
          <GlossopetraeSettings />
        )}

        {/* Template Editor Modal */}
        {editingTemplate && (
          <TemplateEditorModal
            template={editingTemplate}
            isNew={isNewTemplate}
            onSave={handleSaveTemplate}
            onClose={() => {
              setEditingTemplate(null);
              setIsNewTemplate(false);
            }}
            saving={saving}
          />
        )}
      </div>
    </div>
  );
}

// Glossopetrae Settings Component
function GlossopetraeSettings() {
  const {
    glossopetraeAvailable,
    setGlossopetraeAvailable,
    glossopetraeEnabled,
    setGlossopetraeEnabled,
    glossopetraeSeeds,
    addGlossopetaeSeed,
    updateGlossopetaeSeed,
    removeGlossopetaeSeed,
  } = useAppStore();

  const [newSeedName, setNewSeedName] = useState('');
  const [newSeedValue, setNewSeedValue] = useState('');
  const [isChecking, setIsChecking] = useState(false);

  // Check if Glossopetrae is available on mount
  useEffect(() => {
    const checkAvailability = async () => {
      setIsChecking(true);
      const available = await initializeGlossopetrae();
      setGlossopetraeAvailable(available);
      setIsChecking(false);
    };
    checkAvailability();
  }, [setGlossopetraeAvailable]);

  const handleAddSeed = () => {
    if (!newSeedName.trim() || !newSeedValue.trim()) return;

    addGlossopetaeSeed({
      id: crypto.randomUUID(),
      name: newSeedName.trim(),
      seed: newSeedValue.trim(),
      active: true,
    });

    setNewSeedName('');
    setNewSeedValue('');
  };

  return (
    <div className="space-y-6">
      {/* Status Section */}
      <section className="bg-inspector-surface border border-inspector-border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium text-inspector-text">Glossopetrae Status</h2>
            <p className="text-xs text-inspector-muted mt-1">
              Procedural xenolinguistics engine for decoding conlang text
            </p>
          </div>
          {isChecking ? (
            <span className="text-xs text-inspector-muted animate-pulse">Checking...</span>
          ) : glossopetraeAvailable ? (
            <span className="text-xs text-green-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              Installed
            </span>
          ) : (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-gray-500" />
              Not Installed
            </span>
          )}
        </div>

        {!glossopetraeAvailable && (
          <div className="mt-4 p-3 bg-gray-800/50 rounded-lg text-sm text-inspector-muted">
            <p className="font-medium text-inspector-text mb-1">How to enable Glossopetrae:</p>
            <code className="block bg-black/30 p-2 rounded mt-2 font-mono text-xs">
              ENABLE_GLOSSOPETRAE=true docker compose build
            </code>
            <p className="mt-2 text-xs">
              Then restart the containers with <code className="bg-black/30 px-1 rounded">docker compose up</code>
            </p>
          </div>
        )}
      </section>

      {/* Enable/Disable Toggle */}
      <section className="bg-inspector-surface border border-inspector-border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium text-inspector-text">Enable Decoding</h2>
            <p className="text-xs text-inspector-muted mt-1">
              Show decode buttons in conversation and traffic views
            </p>
          </div>
          <button
            onClick={() => setGlossopetraeEnabled(!glossopetraeEnabled)}
            disabled={!glossopetraeAvailable}
            className={clsx(
              'relative w-12 h-6 rounded-full transition-colors',
              glossopetraeEnabled && glossopetraeAvailable
                ? 'bg-cyan-600'
                : 'bg-gray-600',
              !glossopetraeAvailable && 'opacity-50 cursor-not-allowed'
            )}
          >
            <span
              className={clsx(
                'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                glossopetraeEnabled && glossopetraeAvailable ? 'left-7' : 'left-1'
              )}
            />
          </button>
        </div>
      </section>

      {/* Seeds Configuration */}
      <section className="bg-inspector-surface border border-inspector-border rounded-lg overflow-hidden">
        <div className="p-4 border-b border-inspector-border">
          <h2 className="font-medium text-inspector-text">Language Seeds</h2>
          <p className="text-xs text-inspector-muted mt-1">
            Configure seeds to decode conlang text. The same seed produces the same language.
          </p>
        </div>

        {/* Existing Seeds */}
        <div className="divide-y divide-inspector-border">
          {glossopetraeSeeds.length === 0 ? (
            <div className="p-4 text-center text-inspector-muted text-sm">
              No seeds configured. Add a seed below to enable decoding.
            </div>
          ) : (
            glossopetraeSeeds.map((seed) => (
              <div key={seed.id} className="p-4 flex items-center gap-4">
                <button
                  onClick={() => updateGlossopetaeSeed(seed.id, { active: !seed.active })}
                  className={clsx(
                    'w-5 h-5 rounded border flex items-center justify-center',
                    seed.active
                      ? 'bg-cyan-600 border-cyan-600 text-white'
                      : 'bg-transparent border-inspector-border'
                  )}
                >
                  {seed.active && '✓'}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-inspector-text">{seed.name}</div>
                  <div className="text-xs text-inspector-muted font-mono truncate">{seed.seed}</div>
                </div>
                <button
                  onClick={() => removeGlossopetaeSeed(seed.id)}
                  className="p-1.5 text-inspector-muted hover:text-inspector-error hover:bg-inspector-error/10 rounded"
                  title="Remove seed"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Add New Seed */}
        <div className="p-4 bg-inspector-bg/50 border-t border-inspector-border">
          <div className="flex gap-2">
            <input
              type="text"
              value={newSeedName}
              onChange={(e) => setNewSeedName(e.target.value)}
              placeholder="Name (e.g., Agent Protocol)"
              className="flex-1 bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-sm text-inspector-text"
            />
            <input
              type="text"
              value={newSeedValue}
              onChange={(e) => setNewSeedValue(e.target.value)}
              placeholder="Seed value"
              className="flex-1 bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-sm text-inspector-text font-mono"
            />
            <button
              onClick={handleAddSeed}
              disabled={!newSeedName.trim() || !newSeedValue.trim()}
              className="px-4 py-2 text-sm rounded bg-cyan-600 hover:bg-cyan-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Seed
            </button>
          </div>
        </div>
      </section>

      {/* Info Section */}
      <section className="bg-inspector-surface border border-inspector-border rounded-lg p-4">
        <h2 className="font-medium text-inspector-text mb-2">About Glossopetrae</h2>
        <p className="text-sm text-inspector-muted">
          Glossopetrae is a procedural language generation engine that creates complete,
          internally-consistent constructed languages from a single numeric seed.
          When agents communicate using Glossopetrae-generated languages, you can decode
          their messages by configuring the same seed used to generate the language.
        </p>
        <p className="text-sm text-inspector-muted mt-2">
          Learn more at{' '}
          <a
            href="https://github.com/elder-plinius/GLOSSOPETRAE"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:underline"
          >
            github.com/elder-plinius/GLOSSOPETRAE
          </a>
        </p>
      </section>
    </div>
  );
}

// Template Editor Modal Component
interface TemplateEditorModalProps {
  template: PromptTemplate;
  isNew: boolean;
  onSave: (template: Partial<PromptTemplate>) => Promise<void>;
  onClose: () => void;
  saving: boolean;
}

function TemplateEditorModal({ template, isNew, onSave, onClose, saving }: TemplateEditorModalProps) {
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description || '');
  const [category, setCategory] = useState<PromptTemplateCategory>(template.category || 'custom');
  const [templateText, setTemplateText] = useState(template.template);
  const [variables, setVariables] = useState<PromptTemplateVariable[]>(template.variables || []);
  const [systemPrompt, setSystemPrompt] = useState(template.systemPrompt || '');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Template name is required');
      return;
    }
    if (!templateText.trim()) {
      setError('Template content is required');
      return;
    }

    await onSave({
      id: template.id,
      name: name.trim(),
      description: description.trim() || undefined,
      category,
      template: templateText,
      variables: variables.filter(v => v.name.trim()),
      systemPrompt: systemPrompt.trim() || undefined,
    });
  };

  const addVariable = () => {
    setVariables([...variables, { name: '', description: '', default: '' }]);
  };

  const updateVariable = (index: number, updates: Partial<PromptTemplateVariable>) => {
    const newVars = [...variables];
    newVars[index] = { ...newVars[index], ...updates };
    setVariables(newVars);
  };

  const removeVariable = (index: number) => {
    setVariables(variables.filter((_, i) => i !== index));
  };

  // Extract variables from template text
  const extractVariables = () => {
    const matches = templateText.match(/\{\{(\w+)\}\}/g) || [];
    const varNames = matches.map(m => m.replace(/\{\{|\}\}/g, ''));
    const uniqueVars = [...new Set(varNames)];

    // Add any missing variables
    const existingNames = new Set(variables.map(v => v.name));
    const newVars = [...variables];
    for (const varName of uniqueVars) {
      if (!existingNames.has(varName)) {
        newVars.push({ name: varName, description: '', default: '' });
      }
    }
    setVariables(newVars);
  };

  const isBuiltIn = template.id.startsWith('default_');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-inspector-surface border border-inspector-border rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-inspector-border flex items-center justify-between">
          <h2 className="text-lg font-medium text-inspector-text">
            {isNew ? 'New Template' : 'Edit Template'}
            {isBuiltIn && (
              <span className="ml-2 text-xs text-inspector-muted">(built-in templates cannot be deleted)</span>
            )}
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="bg-inspector-error/20 text-inspector-error px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm text-inspector-text mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text"
              placeholder="My Template"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm text-inspector-text mb-1">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text"
              placeholder="What this template does..."
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm text-inspector-text mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as PromptTemplateCategory)}
              className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text"
            >
              <option value="mock_generation">Mock Generation</option>
              <option value="transformation">Transformation</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          {/* Template */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm text-inspector-text">Template</label>
              <button
                type="button"
                onClick={extractVariables}
                className="text-xs text-inspector-accent hover:text-inspector-accent/80"
              >
                Extract Variables
              </button>
            </div>
            <textarea
              value={templateText}
              onChange={(e) => setTemplateText(e.target.value)}
              rows={6}
              className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text font-mono text-sm"
              placeholder="Generate a response for {{method}} {{url}}..."
            />
            <p className="text-xs text-inspector-muted mt-1">
              Use {'{{variable}}'} syntax for placeholders
            </p>
          </div>

          {/* Variables */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm text-inspector-text">Variables</label>
              <button
                type="button"
                onClick={addVariable}
                className="text-xs px-2 py-1 rounded bg-inspector-bg hover:bg-inspector-border text-inspector-muted"
              >
                + Add Variable
              </button>
            </div>
            {variables.length === 0 ? (
              <p className="text-xs text-inspector-muted">No variables defined. Click "Extract Variables" to auto-detect from template.</p>
            ) : (
              <div className="space-y-2">
                {variables.map((v, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={v.name}
                      onChange={(e) => updateVariable(i, { name: e.target.value })}
                      placeholder="name"
                      className="w-28 bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm text-inspector-text font-mono"
                    />
                    <input
                      type="text"
                      value={v.description || ''}
                      onChange={(e) => updateVariable(i, { description: e.target.value })}
                      placeholder="description"
                      className="flex-1 bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm text-inspector-text"
                    />
                    <input
                      type="text"
                      value={v.default || ''}
                      onChange={(e) => updateVariable(i, { default: e.target.value })}
                      placeholder="default"
                      className="w-32 bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm text-inspector-text"
                    />
                    <button
                      type="button"
                      onClick={() => removeVariable(i)}
                      className="text-inspector-muted hover:text-inspector-error"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* System Prompt */}
          <div>
            <label className="block text-sm text-inspector-text mb-1">System Prompt (optional)</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={3}
              className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text font-mono text-sm"
              placeholder="You are a helpful assistant..."
            />
            <p className="text-xs text-inspector-muted mt-1">
              Sent as system message to the LLM when using this template
            </p>
          </div>
        </form>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-inspector-border flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded bg-inspector-bg hover:bg-inspector-border text-inspector-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 text-sm rounded bg-inspector-accent hover:bg-inspector-accent/80 text-white disabled:opacity-50"
          >
            {saving ? 'Saving...' : isNew ? 'Create Template' : 'Update Template'}
          </button>
        </div>
      </div>
    </div>
  );
}
