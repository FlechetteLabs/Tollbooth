/**
 * LLM API Client - supports multiple providers (Anthropic, OpenAI, Google, Ollama)
 */

import { LLMConfig, LLMProvider, ConfigurableLLMProvider, DEFAULT_BASE_URLS } from './settings';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface ModelInfo {
  id: string;
  name: string;
  created?: number;
}

// Static model lists for providers that don't support dynamic listing
export const STATIC_MODELS: Record<string, ModelInfo[]> = {
  anthropic: [
    // Latest models
    { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5' },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
    { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5' },
    // Legacy models
    { id: 'claude-opus-4-1-20250805', name: 'Claude Opus 4.1' },
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
    { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet' },
    { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
  ],
  google: [
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
    { id: 'gemini-pro', name: 'Gemini Pro' },
  ],
};

export class LLMClient {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  /**
   * Get the base URL for the current provider
   */
  private getBaseUrl(): string {
    return this.config.baseUrl || DEFAULT_BASE_URLS[this.config.provider];
  }

  /**
   * Send a chat message and get a response
   */
  async chat(messages: ChatMessage[]): Promise<ChatResponse> {
    // Ollama doesn't require an API key
    if (this.config.provider !== 'ollama' && !this.config.apiKey) {
      throw new Error('API key not configured');
    }

    switch (this.config.provider) {
      case 'anthropic':
        return this.chatAnthropic(messages);
      case 'openai':
        return this.chatOpenAI(messages);
      case 'google':
        return this.chatGoogle(messages);
      case 'ollama':
        if (this.config.ollamaMode === 'openai-compatible') {
          return this.chatOllamaOpenAI(messages);
        }
        return this.chatOllamaNative(messages);
      default:
        throw new Error(`Unknown provider: ${this.config.provider}`);
    }
  }

  /**
   * Simple completion (single prompt -> response)
   */
  async complete(prompt: string): Promise<string> {
    const response = await this.chat([{ role: 'user', content: prompt }]);
    return response.content;
  }

  /**
   * List available models for the current provider
   * Returns static list for providers that don't support dynamic listing
   */
  async listModels(): Promise<ModelInfo[]> {
    switch (this.config.provider) {
      case 'ollama':
        return this.listOllamaModels();
      case 'openai':
        return this.listOpenAIModels();
      case 'anthropic':
        return STATIC_MODELS.anthropic;
      case 'google':
        return STATIC_MODELS.google;
      default:
        return [];
    }
  }

  // ============ Model Listing Implementations ============

  private async listOllamaModels(): Promise<ModelInfo[]> {
    try {
      const baseUrl = this.getBaseUrl();
      const response = await fetch(`${baseUrl}/api/tags`);

      if (!response.ok) {
        console.error(`Ollama model list error: ${response.status}`);
        return [];
      }

      const data: any = await response.json();
      return (data.models || []).map((m: any) => ({
        id: m.name,
        name: m.name,
        created: m.modified_at ? new Date(m.modified_at).getTime() : undefined,
      }));
    } catch (err) {
      console.error('Failed to list Ollama models:', err);
      return [];
    }
  }

  private async listOpenAIModels(): Promise<ModelInfo[]> {
    if (!this.config.apiKey) {
      return [];
    }

    try {
      const baseUrl = this.getBaseUrl();
      const response = await fetch(`${baseUrl}/v1/models`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
      });

      if (!response.ok) {
        console.error(`OpenAI model list error: ${response.status}`);
        return [];
      }

      const data: any = await response.json();
      // Filter to chat models and sort by created date
      const chatModels = (data.data || [])
        .filter((m: any) => m.id.includes('gpt') || m.id.includes('o1') || m.id.includes('o3'))
        .sort((a: any, b: any) => (b.created || 0) - (a.created || 0));

      return chatModels.map((m: any) => ({
        id: m.id,
        name: m.id,
        created: m.created ? m.created * 1000 : undefined,
      }));
    } catch (err) {
      console.error('Failed to list OpenAI models:', err);
      return [];
    }
  }

  // ============ Chat Implementations ============

  private async chatAnthropic(messages: ChatMessage[]): Promise<ChatResponse> {
    // Extract system message if present
    let systemMessage: string | undefined;
    const chatMessages = messages.filter(m => {
      if (m.role === 'system') {
        systemMessage = m.content;
        return false;
      }
      return true;
    });

    const body: any = {
      model: this.config.model,
      max_tokens: this.config.maxTokens || 4096,
      messages: chatMessages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    };

    if (systemMessage) {
      body.system = systemMessage;
    }

    if (this.config.temperature !== undefined) {
      body.temperature = this.config.temperature;
    }

    const baseUrl = this.getBaseUrl();
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data: any = await response.json();

    // Extract text content
    let content = '';
    for (const block of data.content || []) {
      if (block.type === 'text') {
        content += block.text;
      }
    }

    return {
      content,
      model: data.model,
      usage: data.usage ? {
        input_tokens: data.usage.input_tokens,
        output_tokens: data.usage.output_tokens,
      } : undefined,
    };
  }

  private async chatOpenAI(messages: ChatMessage[]): Promise<ChatResponse> {
    const body = {
      model: this.config.model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: this.config.maxTokens || 4096,
      temperature: this.config.temperature,
    };

    const baseUrl = this.getBaseUrl();
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data: any = await response.json();
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content || '',
      model: data.model,
      usage: data.usage ? {
        input_tokens: data.usage.prompt_tokens,
        output_tokens: data.usage.completion_tokens,
      } : undefined,
    };
  }

  private async chatGoogle(messages: ChatMessage[]): Promise<ChatResponse> {
    // Google Gemini API
    // Extract system instruction if present
    let systemInstruction: string | undefined;
    const chatMessages = messages.filter(m => {
      if (m.role === 'system') {
        systemInstruction = m.content;
        return false;
      }
      return true;
    });

    // Convert messages to Gemini format
    const contents = chatMessages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const body: any = {
      contents,
      generationConfig: {
        maxOutputTokens: this.config.maxTokens || 4096,
        temperature: this.config.temperature,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const baseUrl = this.getBaseUrl();
    const response = await fetch(
      `${baseUrl}/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google API error: ${response.status} - ${error}`);
    }

    const data: any = await response.json();
    const candidate = data.candidates?.[0];
    const content = candidate?.content?.parts
      ?.map((p: any) => p.text)
      .join('') || '';

    return {
      content,
      model: this.config.model,
      usage: data.usageMetadata ? {
        input_tokens: data.usageMetadata.promptTokenCount || 0,
        output_tokens: data.usageMetadata.candidatesTokenCount || 0,
      } : undefined,
    };
  }

  /**
   * Ollama native API (/api/chat)
   */
  private async chatOllamaNative(messages: ChatMessage[]): Promise<ChatResponse> {
    const body = {
      model: this.config.model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      stream: false,
      options: {
        temperature: this.config.temperature,
        num_predict: this.config.maxTokens,
      },
    };

    const baseUrl = this.getBaseUrl();
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${error}`);
    }

    const data: any = await response.json();

    return {
      content: data.message?.content || '',
      model: data.model || this.config.model,
      usage: data.eval_count !== undefined ? {
        input_tokens: data.prompt_eval_count || 0,
        output_tokens: data.eval_count || 0,
      } : undefined,
    };
  }

  /**
   * Ollama OpenAI-compatible API (/v1/chat/completions)
   */
  private async chatOllamaOpenAI(messages: ChatMessage[]): Promise<ChatResponse> {
    const body = {
      model: this.config.model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: this.config.maxTokens || 4096,
      temperature: this.config.temperature,
    };

    const baseUrl = this.getBaseUrl();
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama OpenAI-compatible API error: ${response.status} - ${error}`);
    }

    const data: any = await response.json();
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content || '',
      model: data.model || this.config.model,
      usage: data.usage ? {
        input_tokens: data.usage.prompt_tokens || 0,
        output_tokens: data.usage.completion_tokens || 0,
      } : undefined,
    };
  }
}

/**
 * Create an LLM client from config
 */
export function createLLMClient(config: LLMConfig): LLMClient {
  return new LLMClient(config);
}

/**
 * Fetch models for a provider (standalone function for API endpoint)
 */
export async function fetchModelsForProvider(
  provider: ConfigurableLLMProvider,
  apiKey?: string,
  baseUrl?: string
): Promise<ModelInfo[]> {
  const config: LLMConfig = {
    provider,
    apiKey: apiKey || '',
    model: '',
    baseUrl,
  };
  const client = new LLMClient(config);
  return client.listModels();
}
