/**
 * Conversation manager - correlates LLM API calls into conversations
 */

import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import {
  Conversation,
  ConversationTurn,
  ConversationTree,
  ConversationTreeNode,
  ParsedLLMRequest,
  ParsedLLMResponse,
  StreamChunk,
  LLMMessage,
  ContentBlock,
  ToolResultContent,
  ToolUseContent,
  TrafficFlow,
} from './types';
import { storage } from './storage';
import { parseStreamChunk, parseRequest, parseResponse } from './parsers';
import { applyMessageFilters, shouldSkipMessage } from './message-filter';

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

// ============ Branch Detection & Tree Building ============

/**
 * Extract text content from a tool_result's content field
 */
function extractToolResultContent(content: string | ContentBlock[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter(b => b.type === 'text')
    .map(b => (b as any).text)
    .join('\n');
}

/**
 * Extract text content from a message for comparison.
 * Includes text, tool_result, and tool_use content blocks.
 */
function extractMessageText(message: LLMMessage, applyFilters = false): string {
  let text: string;
  if (typeof message.content === 'string') {
    text = message.content;
  } else {
    const parts: string[] = [];

    for (const block of message.content) {
      if (block.type === 'text') {
        parts.push((block as any).text);
      } else if (block.type === 'tool_result') {
        const result = block as ToolResultContent;
        const resultText = extractToolResultContent(result.content);
        const prefix = result.is_error ? '[Tool Result: error]' : '[Tool Result]';
        if (resultText) {
          parts.push(`${prefix} ${resultText}`);
        }
      } else if (block.type === 'tool_use') {
        const toolUse = block as ToolUseContent;
        const inputStr = JSON.stringify(toolUse.input, null, 2);
        parts.push(`[Tool: ${toolUse.name}] ${inputStr}`);
      }
    }

    text = parts.join('\n');
  }
  return applyFilters ? applyMessageFilters(text) : text;
}

/**
 * Extract user message text from a request
 */
function extractUserMessage(request: ParsedLLMRequest): string {
  // Get the last user message (the actual prompt for this turn)
  const userMessages = request.messages.filter(m => m.role === 'user');
  if (userMessages.length === 0) return '';
  const lastUserMsg = userMessages[userMessages.length - 1];
  return extractMessageText(lastUserMsg);
}

/**
 * Extract assistant message text from a response
 */
function extractAssistantMessage(response?: ParsedLLMResponse): string {
  if (!response) return '';
  return response.content
    .filter(b => b.type === 'text')
    .map(b => (b as any).text)
    .join('\n');
}

/**
 * Extract thinking content from a response
 */
function extractThinkingContent(response?: ParsedLLMResponse): string {
  if (!response) return '';
  return response.content
    .filter(b => b.type === 'thinking')
    .map(b => (b as any).thinking)
    .join('\n');
}

/**
 * Extract thinking content from a history message
 */
function extractMessageThinking(message: LLMMessage): string {
  if (typeof message.content === 'string') return '';
  return message.content
    .filter(b => b.type === 'thinking')
    .map(b => (b as any).thinking)
    .join('\n');
}

/**
 * Generate a hash for comparing message history prefixes
 */
function generateMessagePrefixHash(messages: LLMMessage[], upToIndex: number): string {
  const prefix = messages.slice(0, upToIndex + 1);
  const hashInput = prefix.map(m => `${m.role}:${extractMessageText(m).slice(0, 500)}`).join('|');
  return createHash('sha256').update(hashInput).digest('hex').slice(0, 32);
}

/**
 * Find the divergence point between two conversations
 * Returns the turn index where they diverge, or -1 if no common prefix
 */
function findDivergencePoint(conv1: Conversation, conv2: Conversation): number {
  const minTurns = Math.min(conv1.turns.length, conv2.turns.length);

  for (let i = 0; i < minTurns; i++) {
    const turn1 = conv1.turns[i];
    const turn2 = conv2.turns[i];

    // Compare user messages
    const user1 = extractUserMessage(turn1.request);
    const user2 = extractUserMessage(turn2.request);

    if (user1 !== user2) {
      return i; // User messages differ - diverged at this turn
    }

    // Compare assistant responses
    const assistant1 = extractAssistantMessage(turn1.response);
    const assistant2 = extractAssistantMessage(turn2.response);

    if (assistant1 !== assistant2) {
      return i; // Responses differ - this is a "retry" type branch
    }
  }

  // One is a prefix of the other
  return minTurns;
}

/**
 * Determine branch type based on how conversations diverge
 */
function determineBranchType(parent: Conversation, child: Conversation, divergeIndex: number): 'retry' | 'replay' | 'natural' {
  // Check if this was created from replay
  const childTurn = child.turns[divergeIndex];
  if (childTurn) {
    const flow = storage.getTraffic(childTurn.flow_id);
    if (flow?.replay_source) {
      return 'replay';
    }
  }

  // Check if same user message but different response (retry)
  if (divergeIndex < parent.turns.length && divergeIndex < child.turns.length) {
    const parentUser = extractUserMessage(parent.turns[divergeIndex].request);
    const childUser = extractUserMessage(child.turns[divergeIndex].request);
    if (parentUser === childUser) {
      return 'retry';
    }
  }

  return 'natural';
}

/**
 * Detect branches among all conversations
 * Groups conversations by shared message history prefix
 */
export async function detectBranches(): Promise<{ processed: number; branches: number }> {
  const conversations = storage.getAllConversations();
  console.log(`[Conversations] Detecting branches among ${conversations.length} conversations`);

  // Clear existing branch metadata
  for (const conv of conversations) {
    conv.parent_conversation_id = undefined;
    conv.divergence_turn_index = undefined;
    conv.branch_type = undefined;
    conv.children_conversation_ids = undefined;
  }

  // Group conversations by first user message hash (correlation)
  const correlationGroups = new Map<string, Conversation[]>();
  for (const conv of conversations) {
    const hash = (conv as any).correlationHash || '';
    if (!hash) continue;

    const group = correlationGroups.get(hash) || [];
    group.push(conv);
    correlationGroups.set(hash, group);
  }

  let branchesFound = 0;

  // For each group with multiple conversations, find branching relationships
  for (const [hash, group] of correlationGroups.entries()) {
    if (group.length <= 1) continue;

    // Sort by creation time - oldest is the potential parent
    group.sort((a, b) => a.created_at - b.created_at);

    // Compare each conversation to find parent-child relationships
    for (let i = 1; i < group.length; i++) {
      const candidate = group[i];
      let bestParent: Conversation | null = null;
      let bestDivergence = -1;
      let latestCommonPrefix = -1;

      // Find the best parent (most recent common history)
      for (let j = 0; j < i; j++) {
        const potentialParent = group[j];
        const divergeIndex = findDivergencePoint(potentialParent, candidate);

        if (divergeIndex > latestCommonPrefix) {
          latestCommonPrefix = divergeIndex;
          bestParent = potentialParent;
          bestDivergence = divergeIndex;
        }
      }

      if (bestParent && bestDivergence >= 0) {
        // Establish parent-child relationship
        candidate.parent_conversation_id = bestParent.conversation_id;
        candidate.divergence_turn_index = bestDivergence;
        candidate.branch_type = determineBranchType(bestParent, candidate, bestDivergence);

        // Update parent's children list
        if (!bestParent.children_conversation_ids) {
          bestParent.children_conversation_ids = [];
        }
        if (!bestParent.children_conversation_ids.includes(candidate.conversation_id)) {
          bestParent.children_conversation_ids.push(candidate.conversation_id);
        }

        branchesFound++;
      }
    }
  }

  // Also check for replay-linked conversations across different correlation groups
  for (const conv of conversations) {
    if (conv.parent_conversation_id) continue; // Already has a parent

    // Check if any turn was created from a replay
    for (const turn of conv.turns) {
      const flow = storage.getTraffic(turn.flow_id);
      if (flow?.replay_source) {
        // Find the conversation that contains the parent flow
        for (const otherConv of conversations) {
          if (otherConv.conversation_id === conv.conversation_id) continue;

          const parentTurn = otherConv.turns.find(t => t.flow_id === flow.replay_source!.parent_flow_id);
          if (parentTurn) {
            conv.parent_conversation_id = otherConv.conversation_id;
            conv.divergence_turn_index = otherConv.turns.indexOf(parentTurn);
            conv.branch_type = 'replay';

            if (!otherConv.children_conversation_ids) {
              otherConv.children_conversation_ids = [];
            }
            if (!otherConv.children_conversation_ids.includes(conv.conversation_id)) {
              otherConv.children_conversation_ids.push(conv.conversation_id);
            }

            branchesFound++;
            break;
          }
        }
        break; // Only need to find one replay link
      }
    }
  }

  // Save updated conversations
  for (const conv of conversations) {
    storage.updateConversation(conv.conversation_id, conv);
  }

  console.log(`[Conversations] Detected ${branchesFound} branches`);
  return { processed: conversations.length, branches: branchesFound };
}

/**
 * Find the root conversation for a given conversation
 */
export function findRootConversation(conversationId: string): Conversation | null {
  let current = storage.getConversation(conversationId);
  if (!current) return null;

  while (current.parent_conversation_id) {
    const parent = storage.getConversation(current.parent_conversation_id);
    if (!parent) break;
    current = parent;
  }

  return current;
}

/**
 * Extract all messages from a conversation, deduplicating across turns
 * Returns an array of message info with metadata about which turn introduced each message
 */
interface ExtractedMessage {
  role: 'user' | 'assistant';
  content: string;
  thinking: string;             // Thinking/reasoning content (if any)
  messageIndex: number;       // Index in the full message history
  introducedInTurn: number;   // Which turn first included this message
  turn: ConversationTurn;     // The turn that introduced this message
  isModified?: boolean;       // True if this specific message content was changed by intercept/rule
  isSuggestion?: boolean;     // True if this is part of a suggestion mode pair
  isLikelySuggestion?: boolean; // True if short assistant msg following another assistant msg
  likelySuggestions?: ExtractedMessage[]; // Short consecutive assistant messages attached to this node
}

function extractAllMessages(conversation: Conversation, applyFiltersFlag = false): ExtractedMessage[] {
  const messages: ExtractedMessage[] = [];
  const seenMessages = new Set<string>();

  for (let turnIndex = 0; turnIndex < conversation.turns.length; turnIndex++) {
    const turn = conversation.turns[turnIndex];

    // Process request messages (the history)
    for (let msgIndex = 0; msgIndex < turn.request.messages.length; msgIndex++) {
      const msg = turn.request.messages[msgIndex];
      if (msg.role === 'system') continue; // Skip system messages

      const content = extractMessageText(msg, applyFiltersFlag);
      const thinking = extractMessageThinking(msg);

      // Skip whitespace-only messages after filtering
      if (applyFiltersFlag && shouldSkipMessage(content)) {
        continue;
      }

      const key = `${msg.role}:${msgIndex}:${content.slice(0, 200)}`;

      if (!seenMessages.has(key)) {
        seenMessages.add(key);

        // Check if this specific message was modified by comparing with original
        let isModified = false;
        if (turn.request_modified && turn.original_request) {
          const originalMsg = turn.original_request.messages[msgIndex];
          if (!originalMsg) {
            isModified = true; // Message was added (doesn't exist in original)
          } else {
            const originalContent = extractMessageText(originalMsg, applyFiltersFlag);
            isModified = content !== originalContent;
          }
        }

        messages.push({
          role: msg.role as 'user' | 'assistant',
          content,
          thinking,
          messageIndex: messages.length,
          introducedInTurn: turnIndex,
          turn,
          isModified,
        });
      }
    }

    // Process the response (the new assistant message from this turn)
    if (turn.response) {
      let responseContent = extractAssistantMessage(turn.response);
      if (applyFiltersFlag) {
        responseContent = applyMessageFilters(responseContent);
      }
      if (responseContent && !(applyFiltersFlag && shouldSkipMessage(responseContent))) {
        const responseThinking = extractThinkingContent(turn.response);
        const key = `assistant:response:${turnIndex}:${responseContent.slice(0, 200)}`;
        if (!seenMessages.has(key)) {
          seenMessages.add(key);

          // Check if response content was modified
          let isModified = false;
          if (turn.response_modified && turn.original_response) {
            let originalContent = extractAssistantMessage(turn.original_response);
            if (applyFiltersFlag) {
              originalContent = applyMessageFilters(originalContent);
            }
            isModified = responseContent !== originalContent;
          }

          messages.push({
            role: 'assistant',
            content: responseContent,
            thinking: responseThinking,
            messageIndex: messages.length,
            introducedInTurn: turnIndex,
            turn,
            isModified,
          });
        }
      }
    }
  }

  // Structural suggestion mode detection:
  // The [SUGGESTION MODE marker is a definitive signal from Claude Code - it only
  // appears in side-channel suggestion requests. These turns often end up as the
  // last turn in their conversation (because the correlation logic requires
  // increasing message counts, and the post-rejection turn has the same count),
  // so we can't rely on comparing with a "next turn". Instead, simply mark any
  // turn containing [SUGGESTION MODE and its paired response as suggestions.
  if (applyFiltersFlag) {
    for (let i = 0; i < conversation.turns.length; i++) {
      const userMsgs = messages.filter(m => m.introducedInTurn === i && m.role === 'user');
      const hasSuggestionMode = userMsgs.some(m => m.content.includes('[SUGGESTION MODE'));

      if (hasSuggestionMode) {
        userMsgs.forEach(m => { m.isSuggestion = true; });
        // Also mark the paired assistant response from this turn
        const assistantMsg = messages.find(m => m.introducedInTurn === i && m.role === 'assistant');
        if (assistantMsg) {
          assistantMsg.isSuggestion = true;
        }
      }
    }

    // Filter out suggestion messages
    let filtered = messages.filter(m => !m.isSuggestion);

    // Handle consecutive assistant messages:
    // 1. If two consecutive assistant messages are identical, remove the duplicate
    // 2. If the second of two consecutive assistant messages is very short (<150 chars),
    //    collect it as a likely_suggestion on the previous message (instead of dropping)
    const result: ExtractedMessage[] = [];
    for (let i = 0; i < filtered.length; i++) {
      const msg = filtered[i];
      const prev = i > 0 ? filtered[i - 1] : null;

      if (msg.role === 'assistant' && prev?.role === 'assistant') {
        if (msg.content.trim() === prev.content.trim()) {
          continue; // Skip exact duplicates
        }
        if (msg.content.length < 150) {
          // Attach as a likely suggestion to the previous result message
          const prevResult = result[result.length - 1];
          if (prevResult) {
            if (!prevResult.likelySuggestions) {
              prevResult.likelySuggestions = [];
            }
            prevResult.likelySuggestions.push(msg);
          }
          continue;
        }
      }

      result.push(msg);
    }

    return result;
  }

  return messages;
}

/**
 * Get all descendant nodes in DFS order
 */
function getAllDescendants(node: ConversationTreeNode): ConversationTreeNode[] {
  const result: ConversationTreeNode[] = [node];
  for (const child of node.children) {
    result.push(...getAllDescendants(child));
  }
  return result;
}

/**
 * Get the path from a start node to a target node (following children)
 */
function getPathBetween(start: ConversationTreeNode, target: ConversationTreeNode): ConversationTreeNode[] {
  const path: ConversationTreeNode[] = [];

  function findPath(current: ConversationTreeNode): boolean {
    path.push(current);
    if (current.node_id === target.node_id) return true;
    for (const child of current.children) {
      if (findPath(child)) return true;
    }
    path.pop();
    return false;
  }

  findPath(start);
  return path;
}

/**
 * Detect branches that diverge then reconverge, and mark them as alternate_loops
 * on the branch-point node. The alternate branch is removed from the tree children.
 */
function detectAndMarkMergePoints(nodes: ConversationTreeNode[]) {
  for (const node of nodes) {
    if (node.children.length > 1) {
      const loops = findMergeBackLoops(node);
      if (loops.length > 0) {
        node.alternate_loops = loops;
      }
    }
    // Recurse into remaining children
    detectAndMarkMergePoints(node.children);
  }
}

/**
 * Find branches from a branch point that reconverge with the main path
 */
function findMergeBackLoops(branchPoint: ConversationTreeNode): Array<{
  messages: Array<{ role: string; content: string }>;
  merge_point_id: string;
}> {
  const loops: Array<{
    messages: Array<{ role: string; content: string }>;
    merge_point_id: string;
  }> = [];

  // First child is treated as the "main path"
  const mainPath = getAllDescendants(branchPoint.children[0]);

  // Check other branches for convergence
  const branchesToRemove: number[] = [];

  for (let i = 1; i < branchPoint.children.length; i++) {
    const altPath = getAllDescendants(branchPoint.children[i]);

    // Find merge point: a node in the alternate path whose content matches a main-path node
    let foundMerge = false;
    for (const altNode of altPath) {
      const mergeNode = mainPath.find(mainNode =>
        mainNode.full_message === altNode.full_message &&
        mainNode.role === altNode.role
      );

      if (mergeNode) {
        // Found a merge - collect the alternate messages up to (but not including) the merge point
        const altMessages = getPathBetween(branchPoint.children[i], altNode);
        // Exclude the merge node itself (it's on the main path)
        const divergentMessages = altMessages.slice(0, -1);

        if (divergentMessages.length > 1) {
          // Only collapse as a loop if >1 divergent message; a single-message
          // branch is likely a cancelled or refused request and should stay
          // visible as a real branch in the tree.
          loops.push({
            messages: divergentMessages.map(n => ({ role: n.role, content: n.full_message })),
            merge_point_id: mergeNode.node_id,
          });
          branchesToRemove.push(i);
        }
        foundMerge = true;
        break;
      }
    }
  }

  // Remove merged branches from children (iterate in reverse to preserve indices)
  for (let i = branchesToRemove.length - 1; i >= 0; i--) {
    branchPoint.children.splice(branchesToRemove[i], 1);
  }

  return loops;
}

/**
 * Build a tree structure for a conversation using trie-based merging.
 * All conversations in the tree are walked message-by-message;
 * identical messages at the same position are merged into a single node,
 * and branches only appear where content actually diverges.
 */
export function buildConversationTree(conversationId: string): ConversationTree | null {
  // Find the root conversation
  const root = findRootConversation(conversationId);
  if (!root) return null;

  // Collect all conversations in this tree
  const treeConversations: Conversation[] = [root];
  function collectChildren(conv: Conversation) {
    if (conv.children_conversation_ids) {
      for (const childId of conv.children_conversation_ids) {
        const child = storage.getConversation(childId);
        if (child) {
          treeConversations.push(child);
          collectChildren(child);
        }
      }
    }
  }
  collectChildren(root);

  // Extract messages from all conversations (with filtering enabled for tree display)
  const conversationMessages = new Map<string, ExtractedMessage[]>();
  for (const conv of treeConversations) {
    conversationMessages.set(conv.conversation_id, extractAllMessages(conv, true));
  }

  // Sort conversations by creation time (oldest first)
  // so the first conversation's metadata is used for shared nodes
  const sortedConversations = [...treeConversations].sort((a, b) => a.created_at - b.created_at);

  console.log(`[TreeBuild] Building trie from ${sortedConversations.length} conversations`);
  for (const conv of sortedConversations) {
    const msgs = conversationMessages.get(conv.conversation_id) || [];
    console.log(`[TreeBuild]   Conv ${conv.conversation_id.slice(0, 8)} - ${msgs.length} messages`);
    for (let k = 0; k < Math.min(3, msgs.length); k++) {
      const m = msgs[k];
      console.log(`[TreeBuild]     [${k}] ${m.role} (len=${m.content.length}): "${m.content.slice(0, 80).replace(/\n/g, '\\n')}..."`);
    }
  }

  // Build merged trie from all conversation message sequences.
  // Each conversation's messages form a path from root to leaf.
  // When two conversations share the same message (role + content) at the same
  // position, they share a single node. Branches only appear at divergence points.
  const trieRoot: ConversationTreeNode[] = [];
  let nodeCounter = 0;

  for (const conv of sortedConversations) {
    const messages = conversationMessages.get(conv.conversation_id) || [];
    let currentChildren = trieRoot;
    let mergedCount = 0;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      // Find an existing node at this level with matching role and content
      const existing = currentChildren.find(n =>
        n.role === msg.role && n.full_message === msg.content
      );

      if (existing) {
        // Message matches an existing node - follow it (shared prefix)
        mergedCount++;
        currentChildren = existing.children;
      } else {
        // Log divergence details for first few messages
        if (i < 5) {
          console.log(`[TreeBuild] Conv ${conv.conversation_id.slice(0, 8)} diverges at msg[${i}] after ${mergedCount} merged`);
          console.log(`[TreeBuild]   NEW: ${msg.role} (len=${msg.content.length}): "${msg.content.slice(0, 60).replace(/\n/g, '\\n')}..."`);
          for (const n of currentChildren) {
            console.log(`[TreeBuild]   EXISTING: ${n.role} (len=${n.full_message.length}): "${n.full_message.slice(0, 60).replace(/\n/g, '\\n')}..."`);
          }
        }

        // Divergence point - create new nodes for this and all remaining messages
        let parentChildren = currentChildren;
        for (let j = i; j < messages.length; j++) {
          const m = messages[j];
          const turnAnnotation = m.turn.annotation;
          const node: ConversationTreeNode = {
            conversation_id: conv.conversation_id,
            turn_index: m.introducedInTurn,
            message_index: j,
            role: m.role,
            message: m.content.slice(0, 100),
            full_message: m.content,
            thinking: m.thinking || undefined,
            timestamp: m.turn.timestamp,
            is_modified: m.isModified || false,
            model: conv.model,
            provider: conv.provider,
            turn_id: m.turn.turn_id,
            flow_id: m.turn.flow_id,
            node_id: `trie:${nodeCounter++}`,
            children: [],
            has_annotation: !!(turnAnnotation?.title || turnAnnotation?.body),
            tags: m.turn.tags || turnAnnotation?.tags || undefined,
            is_likely_suggestion: m.isLikelySuggestion || undefined,
            likely_suggestions: m.likelySuggestions?.map(s => ({
              content: s.content,
              thinking: s.thinking || undefined,
              timestamp: s.turn.timestamp,
            })),
          };
          parentChildren.push(node);
          parentChildren = node.children;
        }
        break; // Done with this conversation
      }
    }
  }

  // Detect and mark merge-back loops in the trie
  detectAndMarkMergePoints(trieRoot);

  // Log trie result
  function logTrieShape(nodes: ConversationTreeNode[], depth: number) {
    for (const n of nodes) {
      if (depth < 4) {
        const indent = '  '.repeat(depth);
        const childCount = n.children.length;
        console.log(`[TreeBuild] ${indent}${n.role} (len=${n.full_message.length}, children=${childCount}): "${n.full_message.slice(0, 40).replace(/\n/g, '\\n')}..."`);
      }
      logTrieShape(n.children, depth + 1);
    }
  }
  console.log(`[TreeBuild] Trie result: ${trieRoot.length} root nodes, ${nodeCounter} total nodes created`);
  logTrieShape(trieRoot, 0);

  // Count statistics from the merged tree
  const allConversations = new Set<string>();
  let branchPoints = 0;

  function countInTree(nodes: ConversationTreeNode[]) {
    for (const node of nodes) {
      allConversations.add(node.conversation_id);
      if (node.children.length > 1) {
        branchPoints++;
      }
      countInTree(node.children);
    }
  }
  countInTree(trieRoot);

  // Get total tree count
  const allConvs = storage.getAllConversations();
  const rootConvs = allConvs.filter(c => !c.parent_conversation_id);

  // Count related trees (connected via replay)
  const relatedTreeRoots = new Set<string>();
  for (const convId of allConversations) {
    const conv = storage.getConversation(convId);
    if (!conv) continue;

    for (const turn of conv.turns) {
      const flow = storage.getTraffic(turn.flow_id);
      if (flow?.replay_source) {
        for (const otherConv of allConvs) {
          const hasTurn = otherConv.turns.some(t => t.flow_id === flow.replay_source!.parent_flow_id);
          if (hasTurn) {
            const otherRoot = findRootConversation(otherConv.conversation_id);
            if (otherRoot && otherRoot.conversation_id !== root.conversation_id) {
              relatedTreeRoots.add(otherRoot.conversation_id);
            }
          }
        }
      }
    }
  }

  const rootMessages = conversationMessages.get(root.conversation_id) || [];
  const firstUserMsg = rootMessages.find(m => m.role === 'user')?.content || '';

  return {
    root_conversation_id: root.conversation_id,
    root_message: firstUserMsg.slice(0, 100),
    nodes: trieRoot,
    total_conversations: allConversations.size,
    total_branches: branchPoints,
    related_tree_count: relatedTreeRoots.size,
    total_tree_count: rootConvs.length,
  };
}

/**
 * Get related trees connected via replay links
 */
export function getRelatedTrees(conversationId: string): Conversation[] {
  const root = findRootConversation(conversationId);
  if (!root) return [];

  const allConvs = storage.getAllConversations();
  const relatedRoots = new Set<string>();

  // Collect all conversation IDs in this tree
  const treeConvIds = new Set<string>([root.conversation_id]);
  function collectTreeConvs(convId: string) {
    const conv = storage.getConversation(convId);
    if (!conv) return;
    if (conv.children_conversation_ids) {
      for (const childId of conv.children_conversation_ids) {
        treeConvIds.add(childId);
        collectTreeConvs(childId);
      }
    }
  }
  collectTreeConvs(root.conversation_id);

  // Find related trees via replay links
  for (const convId of treeConvIds) {
    const conv = storage.getConversation(convId);
    if (!conv) continue;

    for (const turn of conv.turns) {
      const flow = storage.getTraffic(turn.flow_id);
      if (flow?.replay_source) {
        for (const otherConv of allConvs) {
          const hasTurn = otherConv.turns.some(t => t.flow_id === flow.replay_source!.parent_flow_id);
          if (hasTurn) {
            const otherRoot = findRootConversation(otherConv.conversation_id);
            if (otherRoot && otherRoot.conversation_id !== root.conversation_id) {
              relatedRoots.add(otherRoot.conversation_id);
            }
          }
        }
      }
    }
  }

  return Array.from(relatedRoots)
    .map(id => storage.getConversation(id))
    .filter((c): c is Conversation => c !== undefined);
}

/**
 * Get all root conversations (no parent)
 */
export function getRootConversations(): Conversation[] {
  return storage.getAllConversations().filter(c => !c.parent_conversation_id);
}

/**
 * Get total count of conversation trees
 */
export function getTotalTreeCount(): number {
  return getRootConversations().length;
}
