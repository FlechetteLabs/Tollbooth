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
} from './types';
import { storage } from './storage';
import { parseStreamChunk } from './parsers';

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
  request: ParsedLLMRequest
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
  response: ParsedLLMResponse
): Conversation | null {
  const conversations = storage.getAllConversations();

  for (const conv of conversations) {
    const turn = conv.turns.find(t => t.flow_id === flowId);
    if (turn) {
      turn.response = response;
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
