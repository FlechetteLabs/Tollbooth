/**
 * Frontend types - mirrors backend types
 */

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
  // Tags from annotation (denormalized for easy access)
  tags?: string[];
  // Replay source (if this flow was created from a replay)
  replay_source?: { variant_id: string; parent_flow_id: string };
}

export type InterceptMode = 'passthrough' | 'intercept_llm' | 'intercept_all';

export interface PendingIntercept {
  flow_id: string;
  timestamp: number;
  flow: TrafficFlow;
  type: 'request' | 'response';
}

export interface ConversationTurn {
  turn_id: string;
  flow_id: string;
  timestamp: number;
  request: ParsedLLMRequest;
  response?: ParsedLLMResponse;
  streaming: boolean;
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

export type View = 'traffic' | 'conversations' | 'intercept' | 'refusals' | 'replay' | 'data-store' | 'rules' | 'chat' | 'settings';

// ============ Traffic Filtering Types ============

export interface TrafficFilters {
  domain?: string;
  method?: string;
  llmOnly?: boolean;
  searchText?: string;
  statusCode?: string;
  provider?: LLMProvider;
  hasRefusal?: boolean;
  isModified?: boolean;
  showHidden?: boolean;
}

export interface TrafficFilterPreset {
  id: string;
  name: string;
  filters: TrafficFilters;
}

// ============ Advanced Traffic Filtering Types ============

// Scope for conditions - which part of the traffic to match
export type FilterScope = 'request' | 'response' | 'either';

// Extended filter condition field types for traffic view
export type TrafficFilterField =
  | 'host'
  | 'path'
  | 'method'
  | 'header'
  | 'request_body_contains'
  | 'request_body_size'
  | 'status_code'
  | 'response_body_contains'
  | 'response_size'
  | 'is_llm_api'
  | 'has_refusal'
  | 'is_modified'
  | 'has_tag';

// Extended filter condition for traffic view
export interface TrafficFilterCondition {
  id: string;  // For React keys
  field: TrafficFilterField;
  scope: FilterScope;
  match?: MatchType;  // 'exact' | 'contains' | 'regex'
  value?: string;
  key?: string;  // For header conditions
  boolValue?: boolean;  // For boolean fields
  statusMatch?: StatusCodeMatch;
  sizeOperator?: 'gt' | 'lt' | 'gte' | 'lte';
  sizeBytes?: number;
  negate?: boolean;  // NOT modifier
}

// Filter group with operator
export interface TrafficFilterGroup {
  id: string;
  operator: FilterOperator;  // 'AND' | 'OR'
  conditions: TrafficFilterCondition[];
}

// Complete advanced filter configuration
export interface AdvancedTrafficFilter {
  enabled: boolean;
  operator: FilterOperator;  // Top-level operator between groups
  groups: TrafficFilterGroup[];
}

// Updated preset supporting both simple and advanced
export interface TrafficFilterPresetV2 {
  id: string;
  name: string;
  simpleFilters?: TrafficFilters;
  advancedFilter?: AdvancedTrafficFilter;
  isAdvanced: boolean;
}

// ============ Data Store Types ============

export interface StoredResponseMetadata {
  created_at: number;
  description?: string;
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
}

export interface StoredRequest {
  metadata: StoredRequestMetadata;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface StoredItem<T> {
  key: string;
  data: T;
  shortId?: string;  // Sequential short ID (ds1, rq1, ...)
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
  id: string;  // For React keys
  field: FilterConditionField;
  match?: MatchType;
  value?: string;
  key?: string;
  boolValue?: boolean;
  statusMatch?: StatusCodeMatch;
  sizeOperator?: 'gt' | 'lt' | 'gte' | 'lte';
  sizeBytes?: number;
  negate?: boolean;
}

export interface FilterGroup {
  id: string;
  operator: FilterOperator;
  conditions: FilterCondition[];
}

export interface RuleFilterV2 {
  operator: FilterOperator;
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

export interface LLMModification {
  prompt: string;
  template_id?: string;  // Use a saved template instead of raw prompt
  template_variables?: Record<string, string>;
  context: 'none' | 'url_only' | 'body_only' | 'headers_only' | 'full';
  generation_mode?: LLMGenerationMode;
  cache_key?: string;  // For generate_once: custom cache key
  provider?: LLMProviderConfig;  // Override default provider
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
  static_modification?: StaticModification;
  llm_modification?: LLMModification;
  tags?: string[];  // Tags to add to matching traffic (works with any action type)
}

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  direction: RuleDirection;
  priority: number;
  filter: RuleFilter;        // Legacy filter (backwards compat)
  filterV2?: RuleFilterV2;   // New grouped filter (takes precedence if present)
  action: RuleAction;
  shortId?: string;  // Sequential short ID (r1, r2, ...)
}

// ============ Settings Types ============

export type LLMProviderConfig = 'anthropic' | 'openai' | 'google' | 'ollama';

export const ALL_PROVIDERS: LLMProviderConfig[] = ['anthropic', 'openai', 'google', 'ollama'];

// Config for a single provider
export interface ProviderConfig {
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  baseUrl?: string;  // Optional custom base URL (defaults per provider)
  ollamaMode?: 'native' | 'openai-compatible';  // Ollama API mode (default: native)
}

// Legacy single-provider config (kept for compatibility)
export interface LLMConfig extends ProviderConfig {
  provider: LLMProviderConfig;
}

// Multi-provider LLM settings
export interface LLMSettings {
  activeProvider: LLMProviderConfig;
  providers: Partial<Record<LLMProviderConfig, ProviderConfig>>;
}

// Model info from the API
export interface ModelInfo {
  id: string;
  name: string;
  created?: number;
}

export interface Settings {
  llm: LLMSettings;
  datastore_path: string;
}

// ============ Chat Types ============

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
    provider?: LLMProviderConfig;
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
  tags: string[];
  created_at: number;
  updated_at: number;
}

// ============ Replay Types ============

export type ReplayStatus = 'pending' | 'sent' | 'intercepted' | 'completed' | 'failed';

export interface ReplayVariant {
  variant_id: string;
  parent_flow_id: string;
  parent_variant_id?: string;
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
