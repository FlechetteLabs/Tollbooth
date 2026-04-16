/**
 * LLM API parsers for Anthropic, OpenAI, and Google
 */

import {
  HttpRequest,
  HttpResponse,
  ParsedLLMRequest,
  ParsedLLMResponse,
  LLMMessage,
  ContentBlock,
  LLMProvider,
} from './types';

export interface APIParser {
  provider: LLMProvider;
  canParse(host: string, path: string): boolean;
  parseRequest(request: HttpRequest): ParsedLLMRequest | null;
  parseResponse(response: HttpResponse): ParsedLLMResponse | null;
  parseStreamChunk(chunk: string): Partial<ParsedLLMResponse> | null;
}

// ============ Anthropic Parser ============

class AnthropicParser implements APIParser {
  provider: LLMProvider = 'anthropic';

  canParse(host: string, path: string): boolean {
    return host.includes('api.anthropic.com') && path.includes('/messages');
  }

  parseRequest(request: HttpRequest): ParsedLLMRequest | null {
    if (!request.content) return null;

    try {
      const body = JSON.parse(request.content);
      const messages: LLMMessage[] = (body.messages || []).map((msg: any) => ({
        role: msg.role,
        content: this.normalizeContent(msg.content),
      }));

      return {
        provider: 'anthropic',
        model: body.model || 'unknown',
        messages,
        system: body.system,
        max_tokens: body.max_tokens,
        temperature: body.temperature,
        stream: body.stream,
        tools: body.tools,
        raw: body,
      };
    } catch {
      return null;
    }
  }

  parseResponse(response: HttpResponse): ParsedLLMResponse | null {
    if (!response.content) return null;

    const content = response.content.trim();

    // Check if it's JSON (non-streaming response)
    if (content.startsWith('{')) {
      try {
        const body = JSON.parse(content);
        const parsedContent = this.parseResponseContent(body);

        return {
          provider: 'anthropic',
          content: parsedContent,
          model: body.model,
          stop_reason: body.stop_reason,
          usage: body.usage ? {
            input_tokens: body.usage.input_tokens,
            output_tokens: body.usage.output_tokens,
          } : undefined,
          raw: body,
        };
      } catch {
        return null;
      }
    }

    // Check if it's SSE (streaming response)
    if (content.includes('event:') || content.includes('data:')) {
      return this.parseSSEContent(content);
    }

    return null;
  }

  /**
   * Parse accumulated SSE events from a streaming response
   */
  private parseSSEContent(content: string): ParsedLLMResponse | null {
    let model: string | undefined;
    let stopReason: string | undefined;
    let usage: { input_tokens: number; output_tokens: number } | undefined;

    // Track content blocks by index
    const contentBlocks: Map<number, { type: string; data: string; id?: string; name?: string }> = new Map();

    // Split into events (double newline separated, but handle single newlines too)
    const events = content.split(/\n\n+/);

    for (const event of events) {
      const lines = event.split('\n');
      let eventType: string | null = null;
      let data: string | null = null;

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('event:')) {
          eventType = trimmedLine.slice(6).trim();
        } else if (trimmedLine.startsWith('data:')) {
          data = trimmedLine.slice(5).trim();
        }
      }

      if (!data || eventType === 'ping') continue;

      try {
        const parsed = JSON.parse(data);

        switch (eventType) {
          case 'message_start':
            if (parsed.message) {
              model = parsed.message.model;
              if (parsed.message.usage) {
                usage = {
                  input_tokens: parsed.message.usage.input_tokens || 0,
                  output_tokens: parsed.message.usage.output_tokens || 0,
                };
              }
            }
            break;

          case 'content_block_start':
            if (parsed.content_block && typeof parsed.index === 'number') {
              const block = parsed.content_block;
              contentBlocks.set(parsed.index, {
                type: block.type,
                data: block.type === 'thinking' ? (block.thinking || '') :
                      block.type === 'text' ? (block.text || '') : '',
                id: block.id,
                name: block.name,
              });
            }
            break;

          case 'content_block_delta':
            if (parsed.delta && typeof parsed.index === 'number') {
              const existing = contentBlocks.get(parsed.index);
              if (existing) {
                const delta = parsed.delta;
                if (delta.type === 'text_delta' && delta.text) {
                  existing.data += delta.text;
                } else if (delta.type === 'thinking_delta' && delta.thinking) {
                  existing.data += delta.thinking;
                } else if (delta.type === 'input_json_delta' && delta.partial_json) {
                  existing.data += delta.partial_json;
                }
                // Ignore signature_delta
              }
            }
            break;

          case 'content_block_stop':
            // Block is complete, nothing special to do
            break;

          case 'message_delta':
            if (parsed.delta) {
              stopReason = parsed.delta.stop_reason;
            }
            if (parsed.usage) {
              usage = {
                input_tokens: parsed.usage.input_tokens || 0,
                output_tokens: parsed.usage.output_tokens || 0,
              };
            }
            break;

          case 'message_stop':
            // End of message
            break;
        }
      } catch {
        // Skip malformed JSON
      }
    }

    // Build content array from blocks
    const resultContent: ContentBlock[] = [];
    const sortedIndices = Array.from(contentBlocks.keys()).sort((a, b) => a - b);

    for (const index of sortedIndices) {
      const block = contentBlocks.get(index)!;
      if (block.type === 'text' && block.data) {
        resultContent.push({ type: 'text', text: block.data });
      } else if (block.type === 'thinking' && block.data) {
        resultContent.push({ type: 'thinking', thinking: block.data });
      } else if (block.type === 'tool_use') {
        // For tool_use, data contains accumulated JSON
        try {
          const input = JSON.parse(block.data || '{}');
          resultContent.push({
            type: 'tool_use',
            id: block.id || '',
            name: block.name || '',
            input,
          });
        } catch {
          // Skip malformed tool use
        }
      }
    }

    // Return null if we couldn't parse anything meaningful
    if (resultContent.length === 0 && !stopReason && !model) {
      return null;
    }

    return {
      provider: 'anthropic',
      content: resultContent,
      model,
      stop_reason: stopReason,
      usage,
      raw: content,
    };
  }

  parseStreamChunk(chunk: string): Partial<ParsedLLMResponse> | null {
    // SSE format: "event: <type>\ndata: <json>\n\n"
    const lines = chunk.split('\n');
    let eventType: string | null = null;
    let data: string | null = null;

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7);
      } else if (line.startsWith('data: ')) {
        data = line.slice(6);
      }
    }

    if (!data) return null;

    try {
      const parsed = JSON.parse(data);

      if (eventType === 'content_block_delta') {
        const delta = parsed.delta;
        if (delta?.type === 'text_delta') {
          return {
            content: [{ type: 'text', text: delta.text }],
          };
        } else if (delta?.type === 'thinking_delta') {
          return {
            content: [{ type: 'thinking', thinking: delta.thinking }],
          };
        }
      } else if (eventType === 'message_delta') {
        return {
          stop_reason: parsed.delta?.stop_reason,
          usage: parsed.usage ? {
            input_tokens: parsed.usage.input_tokens || 0,
            output_tokens: parsed.usage.output_tokens || 0,
          } : undefined,
        };
      } else if (eventType === 'message_start') {
        return {
          model: parsed.message?.model,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  private normalizeContent(content: any): string | ContentBlock[] {
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      return content.map((block: any) => {
        if (block.type === 'text') {
          return { type: 'text', text: block.text };
        } else if (block.type === 'image') {
          return { type: 'image', source: block.source };
        } else if (block.type === 'tool_use') {
          return {
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input,
          };
        } else if (block.type === 'tool_result') {
          return {
            type: 'tool_result',
            tool_use_id: block.tool_use_id,
            content: block.content,
            is_error: block.is_error,
          };
        } else if (block.type === 'thinking') {
          return { type: 'thinking', thinking: block.thinking };
        }
        return block;
      });
    }
    return [];
  }

  private parseResponseContent(body: any): ContentBlock[] {
    const content: ContentBlock[] = [];

    if (body.content && Array.isArray(body.content)) {
      for (const block of body.content) {
        if (block.type === 'text') {
          content.push({ type: 'text', text: block.text });
        } else if (block.type === 'tool_use') {
          content.push({
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input,
          });
        } else if (block.type === 'thinking') {
          content.push({ type: 'thinking', thinking: block.thinking });
        }
      }
    }

    return content;
  }
}

// ============ OpenAI Parser ============

export class OpenAIParser implements APIParser {
  provider: LLMProvider = 'openai';

  canParse(host: string, path: string): boolean {
    return host.includes('api.openai.com') && path.includes('/chat/completions');
  }

  parseRequest(request: HttpRequest): ParsedLLMRequest | null {
    if (!request.content) return null;

    try {
      const body = JSON.parse(request.content);
      const messages: LLMMessage[] = (body.messages || []).map((msg: any) => ({
        role: msg.role === 'function' ? 'user' : msg.role,
        content: this.normalizeContent(msg),
      }));

      // Extract system message if present
      let system: string | undefined;
      const systemMsgIndex = messages.findIndex(m => m.role === 'system');
      if (systemMsgIndex !== -1) {
        const systemMsg = messages.splice(systemMsgIndex, 1)[0];
        system = typeof systemMsg.content === 'string' ? systemMsg.content : undefined;
      }

      return {
        provider: 'openai',
        model: body.model || 'unknown',
        messages,
        system,
        max_tokens: body.max_tokens || body.max_completion_tokens,
        temperature: body.temperature,
        stream: body.stream,
        tools: body.tools || body.functions,
        raw: body,
      };
    } catch {
      return null;
    }
  }

  parseResponse(response: HttpResponse): ParsedLLMResponse | null {
    if (!response.content) return null;

    const content = response.content;
    // If the body looks like SSE (streaming accumulated), route to the SSE parser.
    // Chat Completions SSE starts with "data: " lines.
    if (content.startsWith('data: ') || content.includes('\ndata: ')) {
      return this.parseSSEContent(content);
    }

    try {
      const body = JSON.parse(content);
      const choice = body.choices?.[0];
      const message = choice?.message;

      const blocks: ContentBlock[] = [];
      if (message?.content) {
        blocks.push({ type: 'text', text: message.content });
      }
      if (message?.tool_calls) {
        for (const tc of message.tool_calls) {
          blocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: this.safeParseJSON(tc.function.arguments),
          });
        }
      }
      if (message?.function_call) {
        blocks.push({
          type: 'tool_use',
          id: 'legacy_function',
          name: message.function_call.name,
          input: this.safeParseJSON(message.function_call.arguments),
        });
      }

      return {
        provider: 'openai',
        content: blocks,
        model: body.model,
        stop_reason: choice?.finish_reason,
        usage: body.usage ? {
          input_tokens: body.usage.prompt_tokens,
          output_tokens: body.usage.completion_tokens,
        } : undefined,
        raw: body,
      };
    } catch {
      return null;
    }
  }

  private safeParseJSON(s: string | undefined): Record<string, unknown> {
    if (!s) return {};
    try {
      return JSON.parse(s);
    } catch {
      return {};
    }
  }

  /**
   * Parse accumulated Chat Completions SSE stream.
   * Delta tool_calls arrive keyed by `index`; arguments concatenate across chunks.
   * We accumulate by index, then emit one tool_use per index with parsed JSON args.
   */
  private parseSSEContent(content: string): ParsedLLMResponse | null {
    const textParts: string[] = [];
    const toolAcc = new Map<number, { id: string; name: string; args: string }>();
    let stopReason: string | undefined;
    let model: string | undefined;
    let usage: { input_tokens: number; output_tokens: number } | undefined;

    const events = content.split('\n\n');
    for (const ev of events) {
      for (const line of ev.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        let parsed: any;
        try { parsed = JSON.parse(data); } catch { continue; }
        if (parsed.model && !model) model = parsed.model;
        const choice = parsed.choices?.[0];
        if (!choice) {
          if (parsed.usage) {
            usage = {
              input_tokens: parsed.usage.prompt_tokens || 0,
              output_tokens: parsed.usage.completion_tokens || 0,
            };
          }
          continue;
        }
        const delta = choice.delta;
        if (delta?.content) textParts.push(delta.content);
        if (Array.isArray(delta?.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = typeof tc.index === 'number' ? tc.index : 0;
            let entry = toolAcc.get(idx);
            if (!entry) {
              entry = { id: '', name: '', args: '' };
              toolAcc.set(idx, entry);
            }
            if (tc.id) entry.id = tc.id;
            if (tc.function?.name) entry.name = tc.function.name;
            if (typeof tc.function?.arguments === 'string') entry.args += tc.function.arguments;
          }
        }
        if (choice.finish_reason) stopReason = choice.finish_reason;
      }
    }

    const blocks: ContentBlock[] = [];
    if (textParts.length) blocks.push({ type: 'text', text: textParts.join('') });
    for (const idx of Array.from(toolAcc.keys()).sort((a, b) => a - b)) {
      const e = toolAcc.get(idx)!;
      if (!e.name) continue;
      blocks.push({
        type: 'tool_use',
        id: e.id || `stream_${idx}`,
        name: e.name,
        input: this.safeParseJSON(e.args),
      });
    }

    if (blocks.length === 0 && !stopReason) return null;
    return {
      provider: 'openai',
      content: blocks,
      model,
      stop_reason: stopReason,
      usage,
      raw: { streaming: true, length: content.length },
    };
  }

  parseStreamChunk(chunk: string): Partial<ParsedLLMResponse> | null {
    // SSE format: "data: <json>\n\n"
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') {
          return { stop_reason: 'stop' };
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;

          if (delta?.content) {
            return {
              content: [{ type: 'text', text: delta.content }],
            };
          }
          if (delta?.tool_calls) {
            // Tool call streaming
            const tc = delta.tool_calls[0];
            if (tc?.function?.arguments) {
              return {
                content: [{
                  type: 'tool_use',
                  id: tc.id || '',
                  name: tc.function?.name || '',
                  input: {},
                }],
              };
            }
          }
          if (parsed.choices?.[0]?.finish_reason) {
            return {
              stop_reason: parsed.choices[0].finish_reason,
            };
          }

          return null;
        } catch {
          return null;
        }
      }
    }

    return null;
  }

  private normalizeContent(msg: any): string | ContentBlock[] {
    if (typeof msg.content === 'string') {
      return msg.content;
    }
    if (Array.isArray(msg.content)) {
      return msg.content.map((part: any) => {
        if (part.type === 'text') {
          return { type: 'text', text: part.text };
        } else if (part.type === 'image_url') {
          return {
            type: 'image',
            source: { type: 'url', url: part.image_url.url },
          };
        }
        return part;
      });
    }
    // Handle tool results
    if (msg.role === 'tool') {
      return [{
        type: 'tool_result',
        tool_use_id: msg.tool_call_id,
        content: msg.content || '',
      }];
    }
    return msg.content || '';
  }
}

// ============ Google Parser ============

class GoogleParser implements APIParser {
  provider: LLMProvider = 'google';

  canParse(host: string, path: string): boolean {
    return host.includes('generativelanguage.googleapis.com');
  }

  parseRequest(request: HttpRequest): ParsedLLMRequest | null {
    if (!request.content) return null;

    try {
      const body = JSON.parse(request.content);
      const messages: LLMMessage[] = [];

      // Parse contents array
      for (const content of body.contents || []) {
        const role = content.role === 'model' ? 'assistant' : 'user';
        const parts: ContentBlock[] = [];

        for (const part of content.parts || []) {
          if (part.text) {
            parts.push({ type: 'text', text: part.text });
          } else if (part.inlineData) {
            parts.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: part.inlineData.mimeType,
                data: part.inlineData.data,
              },
            });
          }
        }

        messages.push({
          role,
          content: parts.length === 1 && parts[0].type === 'text'
            ? (parts[0] as any).text
            : parts,
        });
      }

      // Extract model from URL
      const modelMatch = request.path.match(/models\/([^:]+)/);
      const model = modelMatch ? modelMatch[1] : 'unknown';

      return {
        provider: 'google',
        model,
        messages,
        system: body.systemInstruction?.parts?.[0]?.text,
        max_tokens: body.generationConfig?.maxOutputTokens,
        temperature: body.generationConfig?.temperature,
        stream: request.path.includes('streamGenerateContent'),
        tools: body.tools,
        raw: body,
      };
    } catch {
      return null;
    }
  }

  parseResponse(response: HttpResponse): ParsedLLMResponse | null {
    if (!response.content) return null;

    try {
      const body = JSON.parse(response.content);
      const candidate = body.candidates?.[0];
      const content: ContentBlock[] = [];

      for (const part of candidate?.content?.parts || []) {
        if (part.text) {
          content.push({ type: 'text', text: part.text });
        }
      }

      return {
        provider: 'google',
        content,
        stop_reason: candidate?.finishReason,
        usage: body.usageMetadata ? {
          input_tokens: body.usageMetadata.promptTokenCount,
          output_tokens: body.usageMetadata.candidatesTokenCount,
        } : undefined,
        raw: body,
      };
    } catch {
      return null;
    }
  }

  parseStreamChunk(chunk: string): Partial<ParsedLLMResponse> | null {
    // Google uses JSON array streaming or SSE
    try {
      // Try to parse as JSON (they send partial JSON arrays)
      const cleaned = chunk.replace(/^\[|\]$/g, '').trim();
      if (!cleaned || cleaned === ',') return null;

      const parsed = JSON.parse(cleaned.replace(/^,/, ''));
      const candidate = parsed.candidates?.[0];

      if (candidate?.content?.parts) {
        const content: ContentBlock[] = [];
        for (const part of candidate.content.parts) {
          if (part.text) {
            content.push({ type: 'text', text: part.text });
          }
        }
        return { content };
      }

      if (candidate?.finishReason) {
        return { stop_reason: candidate.finishReason };
      }

      return null;
    } catch {
      return null;
    }
  }
}

// ============ Codex Parser (OpenAI Codex CLI) ============

export class CodexParser implements APIParser {
  provider: LLMProvider = 'openai';  // Codex is an OpenAI product

  canParse(host: string, path: string): boolean {
    return host.includes('chatgpt.com') && path.includes('/backend-api/codex/responses');
  }

  parseRequest(request: HttpRequest): ParsedLLMRequest | null {
    if (!request.content) return null;

    try {
      const body = JSON.parse(request.content);
      const messages: LLMMessage[] = [];

      // Parse input array (Codex uses "input" instead of "messages").
      // Codex emits top-level function_call / function_call_output items interleaved
      // with message items; we lift each into a synthetic assistant/user message
      // carrying a single tool_use / tool_result block, preserving chronological order.
      for (const item of body.input || []) {
        if (item.type === 'message') {
          const role = this.mapRole(item.role);
          const content = this.normalizeContent(item.content);
          messages.push({ role, content });
        } else if (item.type === 'function_call') {
          let input: Record<string, unknown> = {};
          try { input = typeof item.arguments === 'string' ? JSON.parse(item.arguments) : (item.arguments || {}); } catch {}
          messages.push({
            role: 'assistant',
            content: [{
              type: 'tool_use',
              id: item.call_id || item.id || '',
              name: item.name || '',
              input,
            }],
          });
        } else if (item.type === 'local_shell_call') {
          const action = item.action || {};
          messages.push({
            role: 'assistant',
            content: [{
              type: 'tool_use',
              id: item.call_id || item.id || '',
              name: 'local_shell_call',
              input: {
                command: action.command,
                working_directory: action.working_directory,
                timeout_ms: action.timeout_ms,
                env: action.env,
                user: action.user,
              },
            }],
          });
        } else if (item.type === 'function_call_output' || item.type === 'local_shell_call_output') {
          const out = item.output;
          const content: string | ContentBlock[] = typeof out === 'string'
            ? out
            : Array.isArray(out)
              ? out.map((x: any) => x?.text ?? JSON.stringify(x)).join('\n')
              : JSON.stringify(out ?? '');
          messages.push({
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: item.call_id || '',
              content,
            }],
          });
        }
      }

      return {
        provider: 'openai',
        model: body.model || 'unknown',
        messages,
        system: body.instructions,  // Codex uses "instructions" for system prompt
        max_tokens: body.max_tokens,
        temperature: body.temperature,
        stream: body.stream,
        tools: body.tools,
        raw: body,
      };
    } catch {
      return null;
    }
  }

  parseResponse(response: HttpResponse): ParsedLLMResponse | null {
    if (!response.content) return null;

    try {
      // Codex streaming responses come as SSE - try to parse the accumulated content
      // For complete responses, we may have accumulated SSE data or JSON
      const content = response.content;

      // Check if it's a JSON error response
      if (content.startsWith('{')) {
        const body = JSON.parse(content);
        if (body.error) {
          return {
            provider: 'openai',
            content: [{ type: 'text', text: `Error: ${body.error.message || JSON.stringify(body.error)}` }],
            stop_reason: 'error',
            raw: body,
          };
        }
      }

      // Try to parse as accumulated SSE events
      const parsed = this.parseSSEContent(content);
      if (parsed) {
        return parsed;
      }

      return null;
    } catch {
      return null;
    }
  }

  parseStreamChunk(chunk: string): Partial<ParsedLLMResponse> | null {
    // SSE format: "event: <type>\ndata: <json>\n\n"
    const lines = chunk.split('\n');
    let eventType: string | null = null;
    let data: string | null = null;

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        data = line.slice(6);
      }
    }

    if (!data || data === '[DONE]') {
      if (data === '[DONE]') {
        return { stop_reason: 'stop' };
      }
      return null;
    }

    try {
      const parsed = JSON.parse(data);

      // Handle different Codex/Responses API event types
      if (eventType === 'response.output_text.delta' || parsed.type === 'response.output_text.delta') {
        const delta = parsed.delta || '';
        if (delta) {
          return {
            content: [{ type: 'text', text: delta }],
          };
        }
      }

      // Handle content part added
      if (eventType === 'response.content_part.added' || parsed.type === 'response.content_part.added') {
        const part = parsed.part;
        if (part?.type === 'output_text' && part.text) {
          return {
            content: [{ type: 'text', text: part.text }],
          };
        }
      }

      // Handle response completed
      if (eventType === 'response.completed' || parsed.type === 'response.completed') {
        const response = parsed.response;
        return {
          stop_reason: response?.status || 'stop',
          model: response?.model,
          usage: response?.usage ? {
            input_tokens: response.usage.input_tokens || 0,
            output_tokens: response.usage.output_tokens || 0,
          } : undefined,
        };
      }

      // Handle function/tool calls
      if (eventType === 'response.function_call_arguments.delta' || parsed.type === 'response.function_call_arguments.delta') {
        // Tool call streaming - accumulate arguments
        return null; // Let the complete event handle it
      }

      // Handle output item added (for tool calls)
      if (eventType === 'response.output_item.added' || parsed.type === 'response.output_item.added') {
        const item = parsed.item;
        if (item?.type === 'function_call') {
          return {
            content: [{
              type: 'tool_use',
              id: item.call_id || item.id || '',
              name: item.name || '',
              input: {},
            }],
          };
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private mapRole(role: string): 'user' | 'assistant' | 'system' {
    switch (role) {
      case 'developer':
      case 'system':
        return 'system';
      case 'assistant':
      case 'model':
        return 'assistant';
      default:
        return 'user';
    }
  }

  private normalizeContent(content: any): string | ContentBlock[] {
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      const blocks: ContentBlock[] = [];
      for (const item of content) {
        if (item.type === 'input_text' && item.text) {
          blocks.push({ type: 'text', text: item.text });
        } else if (item.type === 'text' && item.text) {
          blocks.push({ type: 'text', text: item.text });
        } else if (item.type === 'image' || item.type === 'input_image') {
          blocks.push({
            type: 'image',
            source: {
              type: item.image_url ? 'url' : 'base64',
              url: item.image_url?.url,
              data: item.data,
              media_type: item.media_type,
            },
          });
        }
      }
      // If all blocks are text, collapse to single string
      if (blocks.length > 0 && blocks.every(b => b.type === 'text')) {
        return blocks.map(b => (b as any).text).join('\n');
      }
      return blocks;
    }
    return '';
  }

  private parseSSEContent(content: string): ParsedLLMResponse | null {
    // Parse accumulated SSE events to extract final response
    const textParts: string[] = [];
    let model: string | undefined;
    let stopReason: string | undefined;
    let usage: { input_tokens: number; output_tokens: number } | undefined;
    const toolCalls: ContentBlock[] = [];

    const events = content.split('\n\n');
    for (const event of events) {
      const lines = event.split('\n');
      let eventType: string | null = null;
      let data: string | null = null;

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          data = line.slice(6);
        }
      }

      if (!data || data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        const type = eventType || parsed.type;

        if (type === 'response.output_text.delta') {
          const delta = parsed.delta || '';
          if (delta) textParts.push(delta);
        }

        if (type === 'response.content_part.added') {
          const part = parsed.part;
          if (part?.type === 'output_text' && part.text) {
            textParts.push(part.text);
          }
        }

        if (type === 'response.completed') {
          const response = parsed.response;
          model = response?.model;
          stopReason = response?.status || 'stop';
          if (response?.usage) {
            usage = {
              input_tokens: response.usage.input_tokens || 0,
              output_tokens: response.usage.output_tokens || 0,
            };
          }
        }

        if (type === 'response.output_item.done') {
          const item = parsed.item;
          if (item?.type === 'function_call') {
            let input = {};
            try {
              input = JSON.parse(item.arguments || '{}');
            } catch {}
            toolCalls.push({
              type: 'tool_use',
              id: item.call_id || item.id || '',
              name: item.name || '',
              input,
            });
          } else if (item?.type === 'local_shell_call') {
            const action = item.action || {};
            toolCalls.push({
              type: 'tool_use',
              id: item.call_id || item.id || '',
              name: 'local_shell_call',
              input: {
                command: action.command,
                working_directory: action.working_directory,
                timeout_ms: action.timeout_ms,
                env: action.env,
                user: action.user,
              },
            });
          } else if (item?.type === 'reasoning') {
            const parts: string[] = [];
            if (Array.isArray(item.summary)) {
              for (const s of item.summary) {
                if (s?.text) parts.push(s.text);
              }
            }
            if (Array.isArray(item.content)) {
              for (const c of item.content) {
                if (c?.text) parts.push(c.text);
              }
            }
            if (parts.length) {
              textParts.push(''); // nothing; we emit a thinking block separately below
              toolCalls.push({ type: 'thinking', thinking: parts.join('\n') } as any);
            }
          }
        }
      } catch {
        // Skip malformed events
      }
    }

    const responseContent: ContentBlock[] = [];
    if (textParts.length > 0) {
      responseContent.push({ type: 'text', text: textParts.join('') });
    }
    responseContent.push(...toolCalls);

    if (responseContent.length === 0 && !stopReason) {
      return null;
    }

    return {
      provider: 'openai',
      content: responseContent,
      model,
      stop_reason: stopReason,
      usage,
      raw: content,
    };
  }
}

// ============ Parser Manager ============

const parsers: APIParser[] = [
  new AnthropicParser(),
  new OpenAIParser(),
  new GoogleParser(),
  new CodexParser(),
];

export function getParser(host: string, path: string): APIParser | null {
  for (const parser of parsers) {
    const canParse = parser.canParse(host, path);
    console.log(`[getParser] ${parser.provider}.canParse(${host}, ${path}) = ${canParse}`);
    if (canParse) {
      return parser;
    }
  }
  console.log(`[getParser] No parser matched for host=${host} path=${path}`);
  return null;
}

export function parseRequest(request: HttpRequest): ParsedLLMRequest | null {
  const parser = getParser(request.host, request.path);
  if (!parser) {
    console.log(`[parseRequest] No parser for ${request.host}${request.path}`);
    return null;
  }
  try {
    const result = parser.parseRequest(request);
    console.log(`[parseRequest] ${parser.provider} parsed: ${result ? 'success' : 'null'}`);
    return result;
  } catch (err) {
    console.log(`[parseRequest] ${parser.provider} error: ${err}`);
    return null;
  }
}

export function parseResponse(
  request: HttpRequest,
  response: HttpResponse
): ParsedLLMResponse | null {
  const parser = getParser(request.host, request.path);
  if (!parser) {
    console.log(`[parseResponse] No parser for ${request.host}${request.path}`);
    return null;
  }
  try {
    const result = parser.parseResponse(response);
    console.log(`[parseResponse] ${parser.provider} parsed: ${result ? 'success' : 'null'}`);
    return result;
  } catch (err) {
    console.log(`[parseResponse] ${parser.provider} error: ${err}`);
    return null;
  }
}

export function parseStreamChunk(
  host: string,
  path: string,
  chunk: string
): Partial<ParsedLLMResponse> | null {
  const parser = getParser(host, path);
  if (!parser) return null;
  return parser.parseStreamChunk(chunk);
}
