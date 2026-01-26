/**
 * Core types for Tollbooth
 */

// ============ Traffic Types ============

export interface HttpRequest {
  method: string;
  url: string;
  host: string;
  port: number;
  path: string;
  headers: Record<string, string>;
  content: string | null;
}

export interface HttpResponse {
  status_code: number;
  reason: string;
  headers: Record<string, string>;
  content: string | null;
}

export interface RuleReference {
  id: string;
  name: string;
}

export interface TrafficFlow {
  flow_id: string;
  timestamp: number;
  request: HttpRequest;
  response?: HttpResponse;
  is_llm_api: boolean;
  stream_complete?: boolean;
  parsed?: ParsedLLMRequest;
  // Original data before any modifications (only set if modified)
  original_request?: HttpRequest;
  original_response?: HttpResponse;
  request_modified?: boolean;
  response_modified?: boolean;
  // Which rule modified the request/response
  request_modified_by_rule?: RuleReference;
  response_modified_by_rule?: RuleReference;
  // Refusal detection metadata
  refusal?: RefusalMetadata;
  // Hidden/visibility state
  hidden?: boolean;
  hidden_at?: number;
  hidden_by_rule?: RuleReference;
  // Annotation reference
  annotation_id?: string;
  // Replay source (if this flow was created from a replay)
  replay_source?: { variant_id: string; parent_flow_id: string };
}

// ============ Intercept Types ============

export type InterceptMode = 'passthrough' | 'intercept_llm' | 'intercept_all';

export interface PendingIntercept {
  flow_id: string;
  timestamp: number;
  flow: TrafficFlow;
  type: 'request' | 'response';
}

export interface InterceptModifications {
  body?: string;
  headers?: Record<string, string>;
  status_code?: number;
  drop?: boolean;
}

// ============ LLM Message Types ============

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image';
  source: {
    type: string;
    media_type?: string;
    data?: string;
    url?: string;
  };
}

export interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string | ContentBlock[];
  is_error?: boolean;
}

export interface ThinkingContent {
  type: 'thinking';
  thinking: string;
}

export type ContentBlock =
  | TextContent
  | ImageContent
  | ToolUseContent
  | ToolResultContent
  | ThinkingContent;

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
}

// ============ Parsed LLM Types ============

// LLMProvider for API traffic detection (includes 'unknown' for unrecognized APIs)
export type LLMProvider = 'anthropic' | 'openai' | 'google' | 'ollama' | 'unknown';

export interface ParsedLLMRequest {
  provider: LLMProvider;
  model: string;
  messages: LLMMessage[];
  system?: string;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: unknown[];
  raw: unknown;
}

export interface ParsedLLMResponse {
  provider: LLMProvider;
  content: ContentBlock[];
  model?: string;
  stop_reason?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  raw: unknown;
}

export interface StreamChunk {
  flow_id: string;
  chunk: string;
  timestamp: number;
}

// ============ Conversation Types ============

export interface ConversationTurn {
  turn_id: string;
  flow_id: string;
  timestamp: number;
  request: ParsedLLMRequest;
  response?: ParsedLLMResponse;
  streaming: boolean;
  stream_chunks?: StreamChunk[];
  refusal?: RefusalMetadata;
}

export interface Conversation {
  conversation_id: string;
  created_at: number;
  updated_at: number;
  model: string;
  provider: LLMProvider;
  turns: ConversationTurn[];
  message_count: number;
}

// ============ URL Log Types ============

export interface URLLogEntry {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  host: string;
  path: string;
  status_code?: number;
  content_type?: string;
  is_llm_api: boolean;
  flow_id: string;
}

export interface URLLogFilter {
  domain?: string;
  method?: string;
  status_code?: number;
  is_llm_api?: boolean;
  search?: string;
}

// ============ WebSocket Message Types ============

export interface ProxyMessage {
  type: 'request' | 'response' | 'stream_chunk' | 'intercept_request' | 'intercept_response' | 'request_modified' | 'replay_response' | 'replay_complete';
  data: TrafficFlow | StreamChunk | RequestModifiedData | ReplayResponseData | ReplayCompleteData;
}

export interface RequestModifiedData {
  flow_id: string;
  original_request: HttpRequest;
  modified_request: HttpRequest;
}

export interface ReplayResponseData {
  replay_id: string;
  variant_id: string;
  flow_id?: string;
  error?: string;
}

export interface ReplayCompleteData {
  replay_id: string;
  variant_id: string;
  flow_id: string;
  success: boolean;
}

export interface BackendCommand {
  cmd: 'set_intercept_mode' | 'forward' | 'forward_modified' | 'drop' | 'forward_response' | 'forward_response_modified' | 'approve_refusal' | 'modify_refusal' | 'generate_alternate';
  mode?: InterceptMode;
  flow_id?: string;
  modifications?: InterceptModifications;
  refusal_id?: string;
  modified_response?: string;
}

export interface FrontendMessage {
  type: 'traffic' | 'intercept' | 'conversation' | 'stream_update' | 'intercept_mode_changed' | 'pending_refusal' | 'refusal_resolved';
  data: unknown;
}

// ============ Data Store Types ============

export interface StoredResponseMetadata {
  created_at: number;
  description?: string;
  shortId?: string;  // Permanent short ID (ds1, ds2, ...) - assigned once, never changes
}

export interface StoredResponse {
  metadata: StoredResponseMetadata;
  status_code: number;
  headers: Record<string, string>;
  body: string;
}

export interface StoredRequestMetadata {
  created_at: number;
  description?: string;
  shortId?: string;  // Permanent short ID (rq1, rq2, ...) - assigned once, never changes
}

export interface StoredRequest {
  metadata: StoredRequestMetadata;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

// ============ Rules Engine Types ============

export type RuleDirection = 'request' | 'response';
export type MatchType = 'exact' | 'contains' | 'regex';
export type RuleActionType = 'passthrough' | 'intercept' | 'serve_from_store' | 'modify_static' | 'modify_llm' | 'auto_hide' | 'auto_clear';

export interface MatchCondition {
  match: MatchType;
  value: string;
}

export type StatusCodeMatch = 'exact' | 'range' | 'list';

export interface StatusCodeCondition {
  match: StatusCodeMatch;
  value: string;  // For exact: "200", range: ">=400" or "4xx", list: "500,502,503"
}

export interface ResponseSizeCondition {
  operator: 'gt' | 'lt' | 'gte' | 'lte';  // greater than, less than, etc.
  bytes: number;
}

export interface RuleFilter {
  // Request-based filters
  host?: MatchCondition;
  path?: MatchCondition;
  method?: MatchCondition;
  header?: {
    key: string;
    match: MatchType;
    value: string;
  };
  is_llm_api?: boolean;

  // Response-based filters (only apply to response rules)
  status_code?: StatusCodeCondition;
  response_body_contains?: {
    value: string;
    regex?: boolean;
  };
  response_header?: {
    key: string;
    match: MatchType;
    value: string;
  };
  response_size?: ResponseSizeCondition;
}

// ============ AND/OR Filter Types (V2) ============

export type FilterOperator = 'AND' | 'OR';

export type FilterConditionField =
  | 'host'
  | 'path'
  | 'method'
  | 'header'
  | 'is_llm_api'
  | 'status_code'
  | 'response_body_contains'
  | 'response_header'
  | 'response_size';

export interface FilterCondition {
  field: FilterConditionField;
  // For string matches (host, path, method, header values, response_body_contains)
  match?: MatchType;
  value?: string;
  // For header conditions
  key?: string;
  // For boolean conditions (is_llm_api)
  boolValue?: boolean;
  // For status_code conditions
  statusMatch?: StatusCodeMatch;
  // For response_size conditions
  sizeOperator?: 'gt' | 'lt' | 'gte' | 'lte';
  sizeBytes?: number;
  // Whether to negate this condition (NOT)
  negate?: boolean;
}

export interface FilterGroup {
  id: string;  // Unique ID for UI
  operator: FilterOperator;
  conditions: FilterCondition[];
}

export interface RuleFilterV2 {
  operator: FilterOperator;  // Combines groups
  groups: FilterGroup[];
}

export interface FindReplaceEntry {
  find: string;
  replace: string;
  regex?: boolean;
  replace_all?: boolean; // Default true - replace all instances; false for first only
}

export type HeaderModificationType = 'set' | 'remove' | 'find_replace';

export interface HeaderModification {
  type: HeaderModificationType;
  key: string;
  value?: string;  // Required for 'set', optional for 'find_replace' (used as replacement)
  find?: string;   // Required for 'find_replace'
  regex?: boolean; // For find_replace
}

export interface StaticModification {
  find_replace?: FindReplaceEntry[];
  replace_body?: string;
  header_modifications?: HeaderModification[];
}

export type LLMGenerationMode = 'generate_once' | 'generate_live';

// Configurable LLM providers (mirrors settings.ts but defined here for shared types)
export type ConfigurableLLMProvider = 'anthropic' | 'openai' | 'google' | 'ollama';

export interface LLMModification {
  prompt: string;
  template_id?: string;  // Use a saved template instead of raw prompt
  template_variables?: Record<string, string>;
  context: 'none' | 'url_only' | 'body_only' | 'headers_only' | 'full';
  generation_mode?: LLMGenerationMode;
  cache_key?: string;  // For generate_once: custom cache key
  provider?: ConfigurableLLMProvider;  // Override default provider
}

// ============ Prompt Template Types ============

export type PromptTemplateCategory = 'mock_generation' | 'transformation' | 'custom';

export interface PromptTemplateVariable {
  name: string;
  description?: string;
  default?: string;
}

export interface PromptTemplate {
  id: string;
  name: string;
  description?: string;
  category?: PromptTemplateCategory;
  template: string;  // Text with {{variable}} placeholders
  variables?: PromptTemplateVariable[];
  systemPrompt?: string;
  created_at: number;
  updated_at: number;
}

export type RequestMergeMode = 'replace' | 'merge';
export type StoreKeyMode = 'single' | 'round_robin' | 'random' | 'sequential';

export interface RuleAction {
  type: RuleActionType;
  store_key?: string;  // For serve_from_store (single mode)
  store_keys?: string[];  // For serve_from_store (multi mode)
  store_key_mode?: StoreKeyMode;  // Selection mode for multiple store keys
  request_merge_mode?: RequestMergeMode;  // For serve_from_store on requests: how to merge stored data
  static_modification?: StaticModification;  // For modify_static
  llm_modification?: LLMModification;  // For modify_llm
}

export interface Rule {
  id: string;
  shortId?: string;          // Permanent short ID (r1, r2, ...) - assigned once, never changes
  name: string;
  enabled: boolean;
  direction: RuleDirection;
  priority: number;
  filter: RuleFilter;        // Legacy filter (backwards compat)
  filterV2?: RuleFilterV2;   // New grouped filter (takes precedence if present)
  action: RuleAction;
}

export interface RuleMatch {
  rule: Rule;
  action: RuleActionType;
  store_key?: string;
}

// ============ API Response Types ============

export interface TrafficListResponse {
  traffic: TrafficFlow[];
  total: number;
}

export interface URLLogResponse {
  urls: URLLogEntry[];
  total: number;
}

export interface ConversationListResponse {
  conversations: Conversation[];
  total: number;
}

export interface DataStoreListResponse {
  items: Array<{ key: string; data: StoredResponse | StoredRequest }>;
  total: number;
}

// ============ Refusal Detection Types ============

export type RefusalAction = 'prompt_user' | 'passthrough' | 'modify';

export interface RefusalRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;

  // Detection config
  detection: {
    enabled: boolean;
    confidence_threshold: number;  // 0-1, default 0.7
    tokens_to_analyze: number;     // 0 = all tokens
  };

  // Action when refusal detected
  action: RefusalAction;

  // For 'modify' action - auto-generate replacement
  fallback_config?: {
    prompt_template_id?: string;
    custom_prompt?: string;
    provider?: ConfigurableLLMProvider;
    system_prompt?: string;
  };

  // Filter (which responses to analyze)
  filter?: {
    host?: MatchCondition;
    path?: MatchCondition;
    model?: MatchCondition;
    provider?: LLMProvider;
  };

  created_at: number;
  updated_at: number;
}

export interface RefusalAnalysisResult {
  is_refusal: boolean;
  confidence: number;
  analyzed_text: string;
  tokens_analyzed: number;
  labels: { label: string; score: number }[];
  analysis_time_ms: number;
}

export interface PendingRefusal {
  id: string;
  flow_id: string;
  timestamp: number;
  flow: TrafficFlow;
  analysis: RefusalAnalysisResult;
  matched_rule: { id: string; name: string };
  status: 'pending' | 'approved' | 'rejected' | 'modified';
  original_response: string;
  modified_response?: string;
}

export interface RefusalMetadata {
  detected: boolean;
  confidence: number;
  rule_id: string;
  rule_name: string;
  action_taken: RefusalAction;
  original_content?: string;
  was_modified: boolean;
}

// ============ Annotation Types ============

export type AnnotationTargetType = 'traffic' | 'variant' | 'conversation';

export interface Annotation {
  id: string;
  target_type: AnnotationTargetType;
  target_id: string;
  title: string;
  body?: string;
  tags: string[];  // e.g., ["refusal:soft", "test"]
  created_at: number;
  updated_at: number;
}

// ============ Replay Types ============

export type ReplayStatus = 'pending' | 'sent' | 'intercepted' | 'completed' | 'failed';

export interface ReplayVariant {
  variant_id: string;
  parent_flow_id: string;
  parent_variant_id?: string;  // For chained variants
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string;
  };
  description: string;
  created_at: number;
  intercept_on_replay: boolean;
  result?: {
    sent_at: number;
    result_flow_id?: string;
    status: ReplayStatus;
    error?: string;
  };
}
