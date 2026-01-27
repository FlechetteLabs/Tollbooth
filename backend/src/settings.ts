/**
 * Settings manager - persists application settings
 * Supports multiple LLM provider configurations
 */

import { promises as fs } from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { PromptTemplate, PromptTemplateVariable, LLMProvider, ConfigurableLLMProvider } from './types';
import { persistence } from './persistence';

// Re-export for backwards compatibility
export type { LLMProvider, ConfigurableLLMProvider };

// Actual providers that can be configured (excludes 'unknown')
export const ALL_PROVIDERS: ConfigurableLLMProvider[] = ['anthropic', 'openai', 'google', 'ollama'];

// Config for a single provider
export interface ProviderConfig {
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  baseUrl?: string;  // Optional custom base URL (defaults per provider)
  ollamaMode?: 'native' | 'openai-compatible';  // Ollama API mode (default: native)
}

// Combined LLM config (for backward compatibility with LLMClient)
export interface LLMConfig extends ProviderConfig {
  provider: ConfigurableLLMProvider;
}

// LLM settings with multiple provider configs
export interface LLMSettings {
  activeProvider: ConfigurableLLMProvider;
  providers: Partial<Record<ConfigurableLLMProvider, ProviderConfig>>;
}

// Default base URLs for each configurable provider
export const DEFAULT_BASE_URLS: Record<ConfigurableLLMProvider, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com',
  google: 'https://generativelanguage.googleapis.com',
  ollama: 'http://localhost:11434',
};

// Default models for each configurable provider
export const DEFAULT_MODELS: Record<ConfigurableLLMProvider, string> = {
  anthropic: 'claude-sonnet-4-5-20250929',
  openai: 'gpt-4o',
  google: 'gemini-1.5-pro',
  ollama: 'llama2',
};

export interface Settings {
  llm: LLMSettings;
  datastore_path: string;
  promptTemplates: PromptTemplate[];
}

// Default prompt templates
const DEFAULT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'default_mock_api',
    name: 'Generate API Mock Response',
    description: 'Generate a realistic mock JSON response for an API endpoint',
    category: 'mock_generation',
    template: 'Generate a realistic mock JSON response for this API endpoint.\n\nRequest:\n{{method}} {{url}}\n\n{{description}}',
    variables: [
      { name: 'method', description: 'HTTP method', default: 'GET' },
      { name: 'url', description: 'Request URL', default: '' },
      { name: 'description', description: 'What the response should contain', default: '' },
    ],
    systemPrompt: 'You are an API mocking assistant. Return only valid JSON without markdown formatting or code blocks. The JSON should be realistic and match what the API would return.',
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  {
    id: 'default_error_response',
    name: 'Generate Error Response',
    description: 'Generate a realistic error response with a specific status code',
    category: 'mock_generation',
    template: 'Generate a realistic error response with status code {{status_code}}.\n\nOriginal request: {{method}} {{url}}\nError reason: {{reason}}',
    variables: [
      { name: 'status_code', description: 'HTTP status code', default: '500' },
      { name: 'method', description: 'HTTP method', default: 'GET' },
      { name: 'url', description: 'Request URL', default: '' },
      { name: 'reason', description: 'Error reason', default: 'Internal server error' },
    ],
    systemPrompt: 'You are an API mocking assistant. Return only valid JSON without markdown formatting. Generate a realistic error response that matches the error code and reason.',
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  {
    id: 'default_transform',
    name: 'Transform Response',
    description: 'Apply a transformation to existing content',
    category: 'transformation',
    template: '{{instruction}}\n\nContent to transform:\n{{content}}',
    variables: [
      { name: 'instruction', description: 'What transformation to apply', default: '' },
      { name: 'content', description: 'Content to transform', default: '' },
    ],
    systemPrompt: 'You are a data transformation assistant. Apply the requested transformation and return only the transformed content without explanation or formatting.',
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  {
    id: 'default_anonymize',
    name: 'Anonymize PII',
    description: 'Remove personally identifiable information from content',
    category: 'transformation',
    template: 'Remove all personally identifiable information (PII) from the following content. Replace names with fake names, email addresses with fake emails, phone numbers with fake numbers, etc. Maintain the structure and format of the data.\n\nContent:\n{{content}}',
    variables: [
      { name: 'content', description: 'Content to anonymize', default: '' },
    ],
    systemPrompt: 'You are a data privacy assistant. Remove all PII while maintaining the structure and format. Return only the anonymized content.',
    created_at: Date.now(),
    updated_at: Date.now(),
  },
];

// Default provider config
function getDefaultProviderConfig(provider: ConfigurableLLMProvider): ProviderConfig {
  return {
    apiKey: '',
    model: DEFAULT_MODELS[provider],
    temperature: 0.7,
    maxTokens: 4096,
  };
}

const DEFAULT_SETTINGS: Settings = {
  llm: {
    activeProvider: 'anthropic',
    providers: {
      anthropic: getDefaultProviderConfig('anthropic'),
      openai: getDefaultProviderConfig('openai'),
      google: getDefaultProviderConfig('google'),
      ollama: getDefaultProviderConfig('ollama'),
    },
  },
  datastore_path: './datastore',
  promptTemplates: DEFAULT_TEMPLATES,
};

// Legacy single-provider config format (for migration)
interface LegacyLLMConfig {
  provider: ConfigurableLLMProvider;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  baseUrl?: string;
  ollamaMode?: 'native' | 'openai-compatible';
}

interface LegacySettings {
  llm: LegacyLLMConfig;
  datastore_path: string;
}

export class SettingsManager extends EventEmitter {
  private settings: Settings;
  private settingsFilePath: string;
  private loaded = false;

  constructor() {
    super();
    // Get path from persistence layer (handles /data vs legacy paths)
    this.settingsFilePath = persistence.getSettingsFilePath();
    this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }

  /**
   * Load settings from file, migrating from legacy format if needed
   */
  async load(): Promise<Settings> {
    try {
      const content = await fs.readFile(this.settingsFilePath, 'utf-8');
      const loaded = JSON.parse(content);

      // Check if this is legacy format (has llm.provider instead of llm.activeProvider)
      if (loaded.llm && 'provider' in loaded.llm && !('activeProvider' in loaded.llm)) {
        console.log('Migrating from legacy settings format...');
        this.settings = this.migrateFromLegacy(loaded as LegacySettings);
      } else {
        // New format - merge with defaults
        this.settings = this.mergeWithDefaults(loaded);
      }

      this.loaded = true;
      console.log('Settings loaded from', this.settingsFilePath);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        // File doesn't exist, use defaults
        this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        this.loaded = true;
        console.log('No settings file found, using defaults');
      } else {
        throw err;
      }
    }
    return this.settings;
  }

  /**
   * Migrate from legacy single-provider format to multi-provider format
   */
  private migrateFromLegacy(legacy: LegacySettings): Settings {
    const settings: Settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

    // Set the active provider from legacy
    settings.llm.activeProvider = legacy.llm.provider;

    // Copy the legacy config to the appropriate provider
    const providerConfig: ProviderConfig = {
      apiKey: legacy.llm.apiKey || '',
      model: legacy.llm.model || DEFAULT_MODELS[legacy.llm.provider],
      temperature: legacy.llm.temperature ?? 0.7,
      maxTokens: legacy.llm.maxTokens ?? 4096,
      baseUrl: legacy.llm.baseUrl,
      ollamaMode: legacy.llm.ollamaMode,
    };

    settings.llm.providers[legacy.llm.provider] = providerConfig;
    settings.datastore_path = legacy.datastore_path || './datastore';

    return settings;
  }

  /**
   * Merge loaded settings with defaults to ensure all fields exist
   */
  private mergeWithDefaults(loaded: Partial<Settings>): Settings {
    const settings: Settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

    if (loaded.llm) {
      if (loaded.llm.activeProvider) {
        settings.llm.activeProvider = loaded.llm.activeProvider;
      }

      if (loaded.llm.providers) {
        for (const provider of ALL_PROVIDERS) {
          if (loaded.llm.providers[provider]) {
            settings.llm.providers[provider] = {
              ...getDefaultProviderConfig(provider),
              ...loaded.llm.providers[provider],
            };
          }
        }
      }
    }

    if (loaded.datastore_path) {
      settings.datastore_path = loaded.datastore_path;
    }

    // Merge prompt templates - keep user templates, add any missing defaults
    if (loaded.promptTemplates && Array.isArray(loaded.promptTemplates)) {
      const loadedIds = new Set(loaded.promptTemplates.map(t => t.id));
      // Keep all user templates
      settings.promptTemplates = [...loaded.promptTemplates];
      // Add any default templates that don't exist (in case new defaults were added)
      for (const defaultTemplate of DEFAULT_TEMPLATES) {
        if (!loadedIds.has(defaultTemplate.id)) {
          settings.promptTemplates.push(defaultTemplate);
        }
      }
    }

    return settings;
  }

  /**
   * Save settings to file
   */
  async save(settings: Settings): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.settingsFilePath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(this.settingsFilePath, JSON.stringify(settings, null, 2), 'utf-8');
    this.settings = settings;
    this.emit('settings_changed', settings);
  }

  /**
   * Get current settings
   */
  get(): Settings {
    return JSON.parse(JSON.stringify(this.settings));
  }

  /**
   * Get settings with API keys redacted (for sending to frontend)
   */
  getRedacted(): Settings {
    const redacted: Settings = JSON.parse(JSON.stringify(this.settings));

    for (const provider of ALL_PROVIDERS) {
      if (redacted.llm.providers[provider]) {
        redacted.llm.providers[provider]!.apiKey =
          redacted.llm.providers[provider]!.apiKey ? '••••••••' : '';
      }
    }

    return redacted;
  }

  /**
   * Update settings partially
   */
  async update(updates: Partial<Settings>): Promise<Settings> {
    if (updates.llm) {
      // Update active provider
      if (updates.llm.activeProvider) {
        this.settings.llm.activeProvider = updates.llm.activeProvider;
      }

      // Update provider configs
      if (updates.llm.providers) {
        for (const provider of ALL_PROVIDERS) {
          const updateConfig = updates.llm.providers[provider];
          if (updateConfig) {
            const existingConfig = this.settings.llm.providers[provider] || getDefaultProviderConfig(provider);

            // If API key is redacted marker, keep the existing key
            if (updateConfig.apiKey === '••••••••') {
              updateConfig.apiKey = existingConfig.apiKey;
            }

            this.settings.llm.providers[provider] = {
              ...existingConfig,
              ...updateConfig,
            };
          }
        }
      }
    }

    // Apply other updates
    if (updates.datastore_path !== undefined) {
      this.settings.datastore_path = updates.datastore_path;
    }

    await this.save(this.settings);
    return this.settings;
  }

  /**
   * Update a single provider's config
   */
  async updateProvider(provider: ConfigurableLLMProvider, config: Partial<ProviderConfig>): Promise<ProviderConfig> {
    const existingConfig = this.settings.llm.providers[provider] || getDefaultProviderConfig(provider);

    // If API key is redacted marker, keep the existing key
    if (config.apiKey === '••••••••') {
      config.apiKey = existingConfig.apiKey;
    }

    const newConfig: ProviderConfig = {
      ...existingConfig,
      ...config,
    };

    this.settings.llm.providers[provider] = newConfig;
    await this.save(this.settings);

    return newConfig;
  }

  /**
   * Set the active provider
   */
  async setActiveProvider(provider: ConfigurableLLMProvider): Promise<void> {
    this.settings.llm.activeProvider = provider;
    await this.save(this.settings);
  }

  /**
   * Check if a specific provider is configured (has API key, or is Ollama)
   */
  isProviderConfigured(provider: ConfigurableLLMProvider): boolean {
    // Ollama doesn't require an API key
    if (provider === 'ollama') {
      return true;
    }
    const config = this.settings.llm.providers[provider];
    return !!config?.apiKey;
  }

  /**
   * Check if the active provider is configured
   */
  isLLMConfigured(): boolean {
    return this.isProviderConfigured(this.settings.llm.activeProvider);
  }

  /**
   * Get the active provider
   */
  getActiveProvider(): ConfigurableLLMProvider {
    return this.settings.llm.activeProvider;
  }

  /**
   * Get config for a specific provider (for making LLM calls)
   */
  getProviderConfig(provider: ConfigurableLLMProvider): ProviderConfig {
    return {
      ...getDefaultProviderConfig(provider),
      ...this.settings.llm.providers[provider],
    };
  }

  /**
   * Get full LLMConfig for a provider (includes provider field for LLMClient)
   */
  getLLMConfig(provider?: ConfigurableLLMProvider): LLMConfig {
    const p = provider || this.settings.llm.activeProvider;
    const config = this.getProviderConfig(p);
    return {
      provider: p,
      ...config,
    };
  }

  /**
   * Get list of configured providers
   */
  getConfiguredProviders(): ConfigurableLLMProvider[] {
    return ALL_PROVIDERS.filter(p => this.isProviderConfigured(p));
  }

  // ============ Prompt Template Methods ============

  /**
   * Get all prompt templates
   */
  getTemplates(): PromptTemplate[] {
    return this.settings.promptTemplates || DEFAULT_TEMPLATES;
  }

  /**
   * Get a single template by ID
   */
  getTemplate(id: string): PromptTemplate | undefined {
    const templates = this.getTemplates();
    return templates.find(t => t.id === id);
  }

  /**
   * Add a new template
   */
  async addTemplate(template: Omit<PromptTemplate, 'id' | 'created_at' | 'updated_at'>): Promise<PromptTemplate> {
    const now = Date.now();
    const newTemplate: PromptTemplate = {
      ...template,
      id: `template_${now}_${Math.random().toString(36).substr(2, 9)}`,
      created_at: now,
      updated_at: now,
    };

    if (!this.settings.promptTemplates) {
      this.settings.promptTemplates = [...DEFAULT_TEMPLATES];
    }
    this.settings.promptTemplates.push(newTemplate);
    await this.save(this.settings);

    return newTemplate;
  }

  /**
   * Update an existing template
   */
  async updateTemplate(id: string, updates: Partial<Omit<PromptTemplate, 'id' | 'created_at'>>): Promise<PromptTemplate | null> {
    if (!this.settings.promptTemplates) {
      this.settings.promptTemplates = [...DEFAULT_TEMPLATES];
    }

    const index = this.settings.promptTemplates.findIndex(t => t.id === id);
    if (index === -1) {
      return null;
    }

    this.settings.promptTemplates[index] = {
      ...this.settings.promptTemplates[index],
      ...updates,
      updated_at: Date.now(),
    };

    await this.save(this.settings);
    return this.settings.promptTemplates[index];
  }

  /**
   * Delete a template
   */
  async deleteTemplate(id: string): Promise<boolean> {
    if (!this.settings.promptTemplates) {
      return false;
    }

    const initialLength = this.settings.promptTemplates.length;
    this.settings.promptTemplates = this.settings.promptTemplates.filter(t => t.id !== id);

    if (this.settings.promptTemplates.length < initialLength) {
      await this.save(this.settings);
      return true;
    }

    return false;
  }

  /**
   * Interpolate template variables
   * Replaces {{variable}} placeholders with provided values
   */
  interpolateTemplate(templateId: string, variables: Record<string, string>): string | null {
    const template = this.getTemplate(templateId);
    if (!template) {
      return null;
    }

    return this.interpolateString(template.template, variables);
  }

  /**
   * Interpolate a raw string with variables
   */
  interpolateString(templateString: string, variables: Record<string, string>): string {
    let result = templateString;

    // Replace all {{variable}} placeholders
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, value);
    }

    return result;
  }

  /**
   * Get system prompt for a template
   */
  getTemplateSystemPrompt(templateId: string): string | undefined {
    const template = this.getTemplate(templateId);
    return template?.systemPrompt;
  }
}

// Singleton instance
export const settingsManager = new SettingsManager();

// Load settings on module initialization
settingsManager.load().catch(err => {
  console.error('Failed to load settings:', err);
});
