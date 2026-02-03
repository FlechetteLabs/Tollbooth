/**
 * Conversation manager - correlates LLM API calls into conversations
 */

import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import {
  Conversation,
  ConversationTurn,
  ParsedLLMRequest,
  ParsedLLMResponse,
  StreamChunk,
  LLMMessage,
  ContentBlock,
  TrafficFlow,
} from './types';
import { storage } from './storage';
import { parseStreamChunk, parseRequest, parseResponse } from './parsers';

/**
 * Generate correlation hash from first user message + model
 * Used to identify which conversation a request belongs to
 */
function generateCorrelationHash(request: ParsedLLMRequest): string {
  const firstUserMsg = request.messages.find(m => m.role === 'user');
  if (!firstUserMsg) return '';

  const content = typeof firstUserMsg.content === 'string'
    ? firstUserMsg.content
    : JSON.stringify(firstUserMsg.content);

  const hashInput = `${request.model}:${content.slice(0, 500)}`;
  return createHash('sha256').update(hashInput).digest('hex').slice(0, 16);
}

/**
 * Find existing conversation that this request belongs to
 */
function findMatchingConversation(request: ParsedLLMRequest): Conversation | null {
  const hash = generateCorrelationHash(request);
  if (!hash) return null;

  const conversations = storage.getAllConversations();

  for (const conv of conversations) {
    if ((conv as any).correlationHash !== hash) continue;
    if (conv.model !== request.model) continue;

    // Verify message count is increasing (new request has more messages)
    const lastTurn = conv.turns[conv.turns.length - 1];
    if (lastTurn) {
      const prevMessageCount = lastTurn.request.messages.length;
      if (request.messages.length <= prevMessageCount) continue;
    }

    return conv;
  }

  return null;
}

/**
 * Process a new LLM request and add to conversation
 */
export function processRequest(
  flowId: string,
  timestamp: number,
  request: ParsedLLMRequest,
  options?: {
    originalRequest?: ParsedLLMRequest;
    requestModified?: boolean;
  }
): { conversation: Conversation; turn: ConversationTurn } {
  // Try to find existing conversation
  let conversation = findMatchingConversation(request);

  if (!conversation) {
    // Create new conversation
    conversation = {
      conversation_id: uuidv4(),
      created_at: timestamp,
      updated_at: timestamp,
      model: request.model,
      provider: request.provider,
      turns: [],
      message_count: 0,
    };
    (conversation as any).correlationHash = generateCorrelationHash(request);
    storage.addConversation(conversation);
  }

  // Create new turn
  const turn: ConversationTurn = {
    turn_id: uuidv4(),
    flow_id: flowId,
    timestamp,
    request,
    streaming: request.stream || false,
  };

  // Add original request if modified
  if (options?.requestModified && options?.originalRequest) {
    turn.original_request = options.originalRequest;
    turn.request_modified = true;
  }

  // Update conversation
  conversation.turns.push(turn);
  conversation.updated_at = timestamp;
  conversation.message_count = request.messages.length;

  storage.updateConversation(conversation.conversation_id, conversation);

  return { conversation, turn };
}

/**
 * Process response for a conversation turn
 */
export function processResponse(
  flowId: string,
  response: ParsedLLMResponse,
  options?: {
    originalResponse?: ParsedLLMResponse;
    responseModified?: boolean;
  }
): Conversation | null {
  const conversations = storage.getAllConversations();

  for (const conv of conversations) {
    const turn = conv.turns.find(t => t.flow_id === flowId);
    if (turn) {
      turn.response = response;

      // Add original response if modified
      if (options?.responseModified && options?.originalResponse) {
        turn.original_response = options.originalResponse;
        turn.response_modified = true;
      }

      conv.updated_at = Date.now();
      storage.updateConversation(conv.conversation_id, conv);
      return conv;
    }
  }

  return null;
}

/**
 * Stream accumulator for building responses from chunks
 */
export class StreamAccumulator {
  private flowId: string;
  private host: string;
  private path: string;
  private textBuffer: string = '';
  private thinkingBuffer: string = '';
  private model?: string;
  private stopReason?: string;
  private usage?: { input_tokens: number; output_tokens: number };
  private chunks: StreamChunk[] = [];
  private lastEmitTime: number = 0;
  private emitInterval: number = 100; // 100ms batching
  private onUpdate?: (partial: ParsedLLMResponse) => void;

  constructor(
    flowId: string,
    host: string,
    path: string,
    onUpdate?: (partial: ParsedLLMResponse) => void
  ) {
    this.flowId = flowId;
    this.host = host;
    this.path = path;
    this.onUpdate = onUpdate;
  }

  addChunk(chunk: StreamChunk): void {
    this.chunks.push(chunk);
    storage.addStreamChunk(this.flowId, chunk);

    const parsed = parseStreamChunk(this.host, this.path, chunk.chunk);
    if (!parsed) return;

    // Accumulate content
    if (parsed.content) {
      for (const block of parsed.content) {
        if (block.type === 'text') {
          this.textBuffer += (block as any).text;
        } else if (block.type === 'thinking') {
          this.thinkingBuffer += (block as any).thinking;
        }
      }
    }

    if (parsed.model) this.model = parsed.model;
    if (parsed.stop_reason) this.stopReason = parsed.stop_reason;
    if (parsed.usage) this.usage = parsed.usage;

    // Emit batched update
    const now = Date.now();
    if (now - this.lastEmitTime >= this.emitInterval) {
      this.emitUpdate();
      this.lastEmitTime = now;
    }
  }

  private emitUpdate(): void {
    if (!this.onUpdate) return;

    const content: ContentBlock[] = [];
    if (this.thinkingBuffer) {
      content.push({ type: 'thinking', thinking: this.thinkingBuffer });
    }
    if (this.textBuffer) {
      content.push({ type: 'text', text: this.textBuffer });
    }

    this.onUpdate({
      provider: this.host.includes('anthropic') ? 'anthropic' :
               this.host.includes('openai') ? 'openai' :
               this.host.includes('google') ? 'google' : 'unknown',
      content,
      model: this.model,
      stop_reason: this.stopReason,
      usage: this.usage,
      raw: null,
    });
  }

  finalize(): ParsedLLMResponse {
    // Final emit
    this.emitUpdate();

    const content: ContentBlock[] = [];
    if (this.thinkingBuffer) {
      content.push({ type: 'thinking', thinking: this.thinkingBuffer });
    }
    if (this.textBuffer) {
      content.push({ type: 'text', text: this.textBuffer });
    }

    // Clear stored chunks
    storage.clearStreamChunks(this.flowId);

    return {
      provider: this.host.includes('anthropic') ? 'anthropic' :
               this.host.includes('openai') ? 'openai' :
               this.host.includes('google') ? 'google' : 'unknown',
      content,
      model: this.model,
      stop_reason: this.stopReason,
      usage: this.usage,
      raw: { streaming: true, chunks: this.chunks.length },
    };
  }
}

// Active stream accumulators
const streamAccumulators = new Map<string, StreamAccumulator>();

export function getOrCreateAccumulator(
  flowId: string,
  host: string,
  path: string,
  onUpdate?: (partial: ParsedLLMResponse) => void
): StreamAccumulator {
  let accumulator = streamAccumulators.get(flowId);
  if (!accumulator) {
    accumulator = new StreamAccumulator(flowId, host, path, onUpdate);
    streamAccumulators.set(flowId, accumulator);
  }
  return accumulator;
}

export function finalizeStream(flowId: string): ParsedLLMResponse | null {
  const accumulator = streamAccumulators.get(flowId);
  if (!accumulator) return null;

  const response = accumulator.finalize();
  streamAccumulators.delete(flowId);
  return response;
}

/**
 * Rebuild conversations from existing traffic flows
 * This processes all LLM API traffic and correlates into conversations
 */
export async function rebuildConversationsFromTraffic(options?: {
  clearExisting?: boolean;
  onProgress?: (processed: number, total: number) => void;
}): Promise<{ conversationsCreated: number; turnsCreated: number; flowsProcessed: number; errors: number }> {
  const { clearExisting = true, onProgress } = options || {};

  // Clear existing conversations if requested
  if (clearExisting) {
    storage.clearAllConversations();
  }

  // Get all traffic and filter to LLM API calls
  const allTraffic = storage.getAllTraffic();
  const llmTraffic = allTraffic.filter(flow => flow.is_llm_api && flow.request && flow.response);

  // Sort by timestamp (oldest first for proper correlation)
  llmTraffic.sort((a, b) => a.timestamp - b.timestamp);

  console.log(`[Conversations] Rebuilding from ${llmTraffic.length} LLM traffic flows`);

  let turnsCreated = 0;
  let errors = 0;
  const conversationIds = new Set<string>();

  for (let i = 0; i < llmTraffic.length; i++) {
    const flow = llmTraffic[i];

    try {
      // Parse the request (use the actual request that was sent)
      const parsedRequest = parseRequest(flow.request);
      if (!parsedRequest) {
        errors++;
        continue;
      }

      // Check if request was modified - parse original if so
      let originalRequest: ParsedLLMRequest | undefined;
      if (flow.request_modified && flow.original_request) {
        originalRequest = parseRequest(flow.original_request) || undefined;
      }

      // Process request to create/update conversation
      const { conversation } = processRequest(flow.flow_id, flow.timestamp, parsedRequest, {
        originalRequest,
        requestModified: flow.request_modified,
      });
      conversationIds.add(conversation.conversation_id);
      turnsCreated++;

      // Parse and process response if available
      if (flow.response) {
        const parsedResponse = parseResponse(flow.request, flow.response);
        if (parsedResponse) {
          // Check if response was modified - parse original if so
          let originalResponse: ParsedLLMResponse | undefined;
          if (flow.response_modified && flow.original_response) {
            originalResponse = parseResponse(flow.request, flow.original_response) || undefined;
          }

          processResponse(flow.flow_id, parsedResponse, {
            originalResponse,
            responseModified: flow.response_modified,
          });
        }
      }
    } catch (err) {
      console.error(`[Conversations] Error processing flow ${flow.flow_id}:`, err);
      errors++;
    }

    // Report progress
    if (onProgress && (i + 1) % 50 === 0) {
      onProgress(i + 1, llmTraffic.length);
    }
  }

  const result = {
    conversationsCreated: conversationIds.size,
    turnsCreated,
    flowsProcessed: llmTraffic.length,
    errors,
  };

  console.log(`[Conversations] Rebuild complete:`, result);
  return result;
}
