/**
 * Rule Editor - create/edit rules in a modal
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { clsx } from 'clsx';
import {
  Rule,
  RuleDirection,
  RuleActionType,
  MatchType,
  RuleFilter,
  RuleFilterV2,
  RuleAction,
  FindReplaceEntry,
  HeaderModification,
  HeaderModificationType,
  StoredResponse,
  RequestMergeMode,
  StoreKeyMode,
  StatusCodeMatch,
  LLMGenerationMode,
  PromptTemplate,
  LLMProviderConfig,
  ALL_PROVIDERS,
  FilterGroup,
  FilterCondition,
  FilterOperator,
  FilterConditionField,
} from '../../types';
import { RuleFilterGroupEditor } from './RuleFilterGroupEditor';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:2000';

interface DatastoreItem {
  key: string;
  data: StoredResponse;
}

interface DatastoreKeySelectorProps {
  value: string;
  onChange: (key: string) => void;
  direction: RuleDirection;
}

function DatastoreKeySelector({ value, onChange, direction }: DatastoreKeySelectorProps) {
  const [items, setItems] = useState<DatastoreItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch datastore items
  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      // For response rules, fetch responses; for request rules, fetch requests
      const endpoint = direction === 'response' ? 'responses' : 'requests';
      const res = await fetch(`${API_BASE}/api/datastore/${endpoint}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error('Failed to fetch datastore items:', err);
    } finally {
      setLoading(false);
    }
  }, [direction]);

  // Fetch on mount and direction change
  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Refresh when dropdown opens
  useEffect(() => {
    if (isOpen) {
      fetchItems();
    }
  }, [isOpen, fetchItems]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setExpandedKey(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedItem = items.find(i => i.key === value);

  // Reset focus when dropdown closes
  useEffect(() => {
    if (!isOpen) {
      setFocusedIndex(-1);
    }
  }, [isOpen]);

  // Scroll focused item into view
  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && listRef.current) {
      const focusedElement = listRef.current.children[focusedIndex] as HTMLElement;
      focusedElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex, isOpen]);

  // Keyboard navigation handler
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setExpandedKey(null);
        triggerRef.current?.focus();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => Math.min(prev + 1, items.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < items.length) {
          onChange(items[focusedIndex].key);
          setIsOpen(false);
          setExpandedKey(null);
          triggerRef.current?.focus();
        }
        break;
      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setFocusedIndex(items.length - 1);
        break;
      case 'Tab':
        setIsOpen(false);
        setExpandedKey(null);
        break;
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString() + ' ' + new Date(timestamp).toLocaleTimeString();
  };

  const truncateBody = (body: string, maxLen = 300) => {
    if (body.length <= maxLen) return body;
    return body.slice(0, maxLen) + '...';
  };

  const listboxId = 'datastore-key-listbox';

  return (
    <div className="relative" ref={dropdownRef} data-testid="datastore-key-selector">
      <div className="flex gap-2">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => {
            setIsOpen(!isOpen);
            if (isOpen) setExpandedKey(null);
          }}
          onKeyDown={handleKeyDown}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listboxId : undefined}
          aria-label="Select datastore key"
          data-testid="datastore-key-trigger"
          className="flex-1 bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-left text-inspector-text font-mono flex items-center justify-between focus:outline-none focus:border-inspector-accent"
        >
          <span className={clsx(!value && 'text-inspector-muted')}>
            {value || 'Select a datastore key...'}
          </span>
          <svg className={clsx('w-4 h-4 transition-transform', isOpen && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            fetchItems();
          }}
          disabled={loading}
          className="px-3 py-2 bg-inspector-bg border border-inspector-border rounded text-inspector-muted hover:text-inspector-text hover:bg-inspector-border focus:outline-none focus:border-inspector-accent disabled:opacity-50 transition-colors"
          title="Refresh datastore list"
          aria-label="Refresh datastore list"
          data-testid="datastore-key-refresh"
        >
          <svg className={clsx('w-4 h-4', loading && 'animate-spin')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {isOpen && (
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label="Datastore keys"
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          className="absolute z-50 mt-1 w-full bg-inspector-surface border border-inspector-border rounded-lg shadow-lg max-h-80 overflow-y-auto"
          data-testid="datastore-key-options"
        >
          {loading ? (
            <div className="p-3 text-center text-inspector-muted text-sm">Loading...</div>
          ) : items.length === 0 ? (
            <div className="p-3 text-center text-inspector-muted text-sm">
              No {direction === 'response' ? 'responses' : 'requests'} in datastore
            </div>
          ) : (
            items.map((item, index) => (
              <div
                key={item.key}
                role="option"
                aria-selected={value === item.key}
                data-testid={`datastore-key-option-${item.key}`}
                className={clsx(
                  'border-b border-inspector-border last:border-b-0',
                  value === item.key && 'bg-inspector-accent/10',
                  focusedIndex === index && 'bg-inspector-border/50'
                )}
              >
                {/* Item header - clickable to select */}
                <div
                  className={clsx(
                    'px-3 py-2 cursor-pointer flex items-center gap-2',
                    'hover:bg-inspector-bg'
                  )}
                  onMouseEnter={() => setFocusedIndex(index)}
                >
                  <div
                    className="flex-1 min-w-0"
                    onClick={() => {
                      onChange(item.key);
                      setIsOpen(false);
                      setExpandedKey(null);
                      triggerRef.current?.focus();
                    }}
                  >
                    <div className="font-mono text-sm text-inspector-text">{item.key}</div>
                    <div className="text-xs text-inspector-muted flex items-center gap-2 mt-0.5">
                      {'status_code' in item.data && (
                        <span className="text-inspector-accent">{item.data.status_code}</span>
                      )}
                      {item.data.metadata?.description && (
                        <span className="truncate">{item.data.metadata.description}</span>
                      )}
                    </div>
                  </div>
                  {/* Expand/collapse button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedKey(expandedKey === item.key ? null : item.key);
                    }}
                    className="p-1 text-inspector-muted hover:text-inspector-text hover:bg-inspector-border rounded"
                    title="Preview"
                    aria-expanded={expandedKey === item.key}
                    aria-label={`Preview ${item.key}`}
                    data-testid={`datastore-key-preview-${item.key}`}
                  >
                    <svg className={clsx('w-4 h-4 transition-transform', expandedKey === item.key && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                {/* Expanded preview */}
                {expandedKey === item.key && (
                  <div className="px-3 pb-3 pt-1 bg-inspector-bg/50 border-t border-inspector-border">
                    <div className="flex gap-4 text-xs mb-2">
                      {'status_code' in item.data && (
                        <span>
                          <span className="text-inspector-muted">Status:</span>{' '}
                          <span className="text-inspector-accent">{item.data.status_code}</span>
                        </span>
                      )}
                      <span>
                        <span className="text-inspector-muted">Headers:</span>{' '}
                        <span className="text-inspector-text">{Object.keys(item.data.headers || {}).length}</span>
                      </span>
                      <span>
                        <span className="text-inspector-muted">Size:</span>{' '}
                        <span className="text-inspector-text">{(item.data.body || '').length} bytes</span>
                      </span>
                    </div>
                    {item.data.metadata?.created_at && (
                      <div className="text-xs text-inspector-muted mb-2">
                        Created: {formatDate(item.data.metadata.created_at)}
                      </div>
                    )}
                    <div className="text-xs text-inspector-muted mb-1">Body preview:</div>
                    <pre className="text-xs font-mono bg-inspector-bg p-2 rounded whitespace-pre-wrap break-all text-inspector-text max-h-40 overflow-y-auto">
                      {truncateBody(item.data.body || '', 500)}
                    </pre>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Show current selection details or warning */}
      {value && !isOpen && (
        selectedItem ? (
          <div className="mt-2 p-2 bg-inspector-bg rounded text-xs">
            {selectedItem.data.metadata?.description && (
              <p className="text-inspector-muted mb-1">{selectedItem.data.metadata.description}</p>
            )}
            <div className="flex items-center gap-3 text-inspector-muted">
              {'status_code' in selectedItem.data && (
                <span>Status: <span className="text-inspector-accent">{selectedItem.data.status_code}</span></span>
              )}
              <span>{Object.keys(selectedItem.data.headers || {}).length} headers</span>
              <span>{(selectedItem.data.body || '').length} bytes</span>
            </div>
          </div>
        ) : !loading && (
          <div
            className="mt-2 p-2 bg-inspector-warning/10 border border-inspector-warning/30 rounded text-xs flex items-center gap-2"
            role="alert"
            data-testid="datastore-key-warning"
          >
            <svg className="w-4 h-4 text-inspector-warning flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-inspector-warning">
              Key "{value}" not found in datastore. The rule will fail silently if this key doesn't exist when traffic is processed.
            </span>
          </div>
        )
      )}
    </div>
  );
}

interface RuleEditorProps {
  rule: Rule | null;
  defaultDirection: RuleDirection;
  onSave: (rule: Rule) => Promise<void>;
  onClose: () => void;
}

const generateId = () => `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Test input state
interface TestInput {
  url: string;
  method: string;
  headers: { key: string; value: string }[];
  body: string;
  isLlmApi: boolean;
}

interface TestResult {
  matches: boolean;
  explanation: string[];
  actionPreview?: {
    type: string;
    modifiedBody?: string;
    modifiedHeaders?: Record<string, string>;
    storedResponse?: StoredResponse;
  };
}

// Helper: match value against filter (mirrors backend logic)
function matchValue(actual: string, matchType: MatchType, expected: string): boolean {
  switch (matchType) {
    case 'exact':
      return actual === expected;
    case 'contains':
      return actual.includes(expected);
    case 'regex':
      try {
        const regex = new RegExp(expected);
        return regex.test(actual);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

// Helper: apply static modifications (mirrors backend logic)
function applyStaticBodyModification(
  content: string,
  findReplace?: FindReplaceEntry[],
  replaceBody?: string
): string {
  if (replaceBody !== undefined && replaceBody !== '') {
    return replaceBody;
  }

  let result = content;
  if (findReplace) {
    for (const fr of findReplace) {
      const replaceAll = fr.replace_all !== false;
      if (fr.regex) {
        try {
          const flags = replaceAll ? 'g' : '';
          const regex = new RegExp(fr.find, flags);
          result = result.replace(regex, fr.replace);
        } catch {
          // Invalid regex, skip
        }
      } else {
        if (replaceAll) {
          result = result.split(fr.find).join(fr.replace);
        } else {
          result = result.replace(fr.find, fr.replace);
        }
      }
    }
  }
  return result;
}

// Helper: apply header modifications (mirrors backend logic)
function applyHeaderModifications(
  headers: Record<string, string>,
  modifications: HeaderModification[]
): Record<string, string> {
  const result = { ...headers };

  for (const mod of modifications) {
    const key = mod.key;

    switch (mod.type) {
      case 'set':
        if (mod.value !== undefined) {
          result[key] = mod.value;
        }
        break;

      case 'remove':
        delete result[key];
        const lowerKey = key.toLowerCase();
        for (const k of Object.keys(result)) {
          if (k.toLowerCase() === lowerKey) {
            delete result[k];
          }
        }
        break;

      case 'find_replace':
        if (mod.find) {
          let targetKey = key;
          for (const k of Object.keys(result)) {
            if (k.toLowerCase() === key.toLowerCase()) {
              targetKey = k;
              break;
            }
          }

          if (result[targetKey]) {
            const currentValue = result[targetKey];
            const replacement = mod.value || '';

            if (mod.regex) {
              try {
                const regex = new RegExp(mod.find, 'g');
                result[targetKey] = currentValue.replace(regex, replacement);
              } catch {
                // Invalid regex, skip
              }
            } else {
              result[targetKey] = currentValue.split(mod.find).join(replacement);
            }
          }
        }
        break;
    }
  }

  return result;
}

export function RuleEditor({ rule, defaultDirection, onSave, onClose }: RuleEditorProps) {
  const [name, setName] = useState(rule?.name || '');
  const [direction, setDirection] = useState<RuleDirection>(rule?.direction || defaultDirection);
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);

  // Filter state
  const [hostEnabled, setHostEnabled] = useState(!!rule?.filter.host);
  const [hostMatch, setHostMatch] = useState<MatchType>(rule?.filter.host?.match || 'contains');
  const [hostValue, setHostValue] = useState(rule?.filter.host?.value || '');

  const [pathEnabled, setPathEnabled] = useState(!!rule?.filter.path);
  const [pathMatch, setPathMatch] = useState<MatchType>(rule?.filter.path?.match || 'contains');
  const [pathValue, setPathValue] = useState(rule?.filter.path?.value || '');

  const [methodEnabled, setMethodEnabled] = useState(!!rule?.filter.method);
  const [methodMatch, setMethodMatch] = useState<MatchType>(rule?.filter.method?.match || 'exact');
  const [methodValue, setMethodValue] = useState(rule?.filter.method?.value || 'POST');

  const [headerEnabled, setHeaderEnabled] = useState(!!rule?.filter.header);
  const [headerKey, setHeaderKey] = useState(rule?.filter.header?.key || '');
  const [headerMatch, setHeaderMatch] = useState<MatchType>(rule?.filter.header?.match || 'contains');
  const [headerValue, setHeaderValue] = useState(rule?.filter.header?.value || '');

  const [llmApiFilter, setLlmApiFilter] = useState<'any' | 'only' | 'exclude'>(
    rule?.filter.is_llm_api === true ? 'only' :
    rule?.filter.is_llm_api === false ? 'exclude' : 'any'
  );

  // Response-based filters (only for response rules)
  const [statusCodeEnabled, setStatusCodeEnabled] = useState(!!rule?.filter.status_code);
  const [statusCodeMatch, setStatusCodeMatch] = useState<StatusCodeMatch>(rule?.filter.status_code?.match || 'exact');
  const [statusCodeValue, setStatusCodeValue] = useState(rule?.filter.status_code?.value || '200');

  const [responseBodyEnabled, setResponseBodyEnabled] = useState(!!rule?.filter.response_body_contains);
  const [responseBodyValue, setResponseBodyValue] = useState(rule?.filter.response_body_contains?.value || '');
  const [responseBodyRegex, setResponseBodyRegex] = useState(rule?.filter.response_body_contains?.regex || false);

  const [responseHeaderEnabled, setResponseHeaderEnabled] = useState(!!rule?.filter.response_header);
  const [responseHeaderKey, setResponseHeaderKey] = useState(rule?.filter.response_header?.key || '');
  const [responseHeaderMatch, setResponseHeaderMatch] = useState<MatchType>(rule?.filter.response_header?.match || 'contains');
  const [responseHeaderValue, setResponseHeaderValue] = useState(rule?.filter.response_header?.value || '');

  const [responseSizeEnabled, setResponseSizeEnabled] = useState(!!rule?.filter.response_size);
  const [responseSizeOperator, setResponseSizeOperator] = useState<'gt' | 'lt' | 'gte' | 'lte'>(rule?.filter.response_size?.operator || 'gt');
  const [responseSizeBytes, setResponseSizeBytes] = useState(rule?.filter.response_size?.bytes || 1000);

  // Advanced filter mode (AND/OR groups)
  const [advancedFilterMode, setAdvancedFilterMode] = useState(!!rule?.filterV2);
  const [filterGroups, setFilterGroups] = useState<FilterGroup[]>(() => {
    if (rule?.filterV2?.groups && rule.filterV2.groups.length > 0) {
      return rule.filterV2.groups;
    }
    // Default: one group with one host condition
    return [{
      id: generateId(),
      operator: 'AND',
      conditions: [{
        id: generateId(),
        field: 'host',
        match: 'contains',
        value: '',
      }],
    }];
  });
  const [filterGroupsOperator, setFilterGroupsOperator] = useState<FilterOperator>(
    rule?.filterV2?.operator || 'AND'
  );

  // Action state
  const [actionType, setActionType] = useState<RuleActionType>(rule?.action.type || 'passthrough');
  const [storeKey, setStoreKey] = useState(rule?.action.store_key || '');
  const [storeKeys, setStoreKeys] = useState<string[]>(rule?.action.store_keys || []);
  const [storeKeyMode, setStoreKeyMode] = useState<StoreKeyMode>(rule?.action.store_key_mode || 'single');
  const [requestMergeMode, setRequestMergeMode] = useState<RequestMergeMode>(
    rule?.action.request_merge_mode || 'merge'
  );

  // Static modification state
  const [replaceBody, setReplaceBody] = useState(rule?.action.static_modification?.replace_body || '');
  const [findReplaceEntries, setFindReplaceEntries] = useState<FindReplaceEntry[]>(
    rule?.action.static_modification?.find_replace || []
  );
  const [headerModifications, setHeaderModifications] = useState<HeaderModification[]>(
    rule?.action.static_modification?.header_modifications || []
  );
  const [allowIntercept, setAllowIntercept] = useState(
    rule?.action.static_modification?.allow_intercept || false
  );

  // LLM modification state
  const [llmPrompt, setLlmPrompt] = useState(rule?.action.llm_modification?.prompt || '');
  const [llmContext, setLlmContext] = useState<'none' | 'url_only' | 'body_only' | 'headers_only' | 'full'>(
    rule?.action.llm_modification?.context || 'body_only'
  );
  const [llmGenerationMode, setLlmGenerationMode] = useState<LLMGenerationMode>(
    rule?.action.llm_modification?.generation_mode || 'generate_live'
  );
  const [llmCacheKey, setLlmCacheKey] = useState(rule?.action.llm_modification?.cache_key || '');
  const [llmTemplateId, setLlmTemplateId] = useState(rule?.action.llm_modification?.template_id || '');
  const [llmTemplateVariables, setLlmTemplateVariables] = useState<Record<string, string>>(
    rule?.action.llm_modification?.template_variables || {}
  );
  const [llmProvider, setLlmProvider] = useState(rule?.action.llm_modification?.provider || '');
  const [useTemplate, setUseTemplate] = useState(!!rule?.action.llm_modification?.template_id);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Tags to apply when rule matches
  const [actionTags, setActionTags] = useState<string[]>(rule?.action.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [allTags, setAllTags] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Test section state
  const [testExpanded, setTestExpanded] = useState(false);
  const [testInput, setTestInput] = useState<TestInput>({
    url: 'https://api.anthropic.com/v1/messages',
    method: 'POST',
    headers: [{ key: 'Content-Type', value: 'application/json' }],
    body: '{"model": "claude-3-sonnet-20240229", "messages": []}',
    isLlmApi: true,
  });
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // Fetch templates when LLM modification is selected
  useEffect(() => {
    if (actionType === 'modify_llm' && templates.length === 0) {
      fetchTemplates();
    }
  }, [actionType]);

  // Fetch all existing tags for autocomplete
  useEffect(() => {
    const fetchTags = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/annotations/tags`);
        if (res.ok) {
          const data = await res.json();
          setAllTags(data.tags || []);
        }
      } catch (err) {
        console.error('Failed to fetch tags:', err);
      }
    };
    fetchTags();
  }, []);

  const fetchTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch(`${API_BASE}/api/templates`);
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      }
    } catch (err) {
      console.error('Failed to fetch templates:', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  // Update template variables when template changes
  useEffect(() => {
    if (llmTemplateId && templates.length > 0) {
      const template = templates.find(t => t.id === llmTemplateId);
      if (template?.variables) {
        const defaults: Record<string, string> = {};
        for (const v of template.variables) {
          defaults[v.name] = llmTemplateVariables[v.name] || v.default || '';
        }
        setLlmTemplateVariables(defaults);
      }
    }
  }, [llmTemplateId, templates]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Rule name is required');
      return;
    }

    // Build filter
    const filter: RuleFilter = {};
    if (hostEnabled && hostValue) {
      filter.host = { match: hostMatch, value: hostValue };
    }
    if (pathEnabled && pathValue) {
      filter.path = { match: pathMatch, value: pathValue };
    }
    if (methodEnabled && methodValue) {
      filter.method = { match: methodMatch, value: methodValue };
    }
    if (headerEnabled && headerKey && headerValue) {
      filter.header = { key: headerKey, match: headerMatch, value: headerValue };
    }
    if (llmApiFilter === 'only') {
      filter.is_llm_api = true;
    } else if (llmApiFilter === 'exclude') {
      filter.is_llm_api = false;
    }

    // Response-based filters (only for response rules)
    if (direction === 'response') {
      if (statusCodeEnabled && statusCodeValue) {
        filter.status_code = { match: statusCodeMatch, value: statusCodeValue };
      }
      if (responseBodyEnabled && responseBodyValue) {
        filter.response_body_contains = { value: responseBodyValue, regex: responseBodyRegex };
      }
      if (responseHeaderEnabled && responseHeaderKey && responseHeaderValue) {
        filter.response_header = { key: responseHeaderKey, match: responseHeaderMatch, value: responseHeaderValue };
      }
      if (responseSizeEnabled) {
        filter.response_size = { operator: responseSizeOperator, bytes: responseSizeBytes };
      }
    }

    // Build action
    const action: RuleAction = { type: actionType };
    if (actionType === 'serve_from_store') {
      // Handle single vs multi key modes
      if (storeKeyMode === 'single') {
        if (!storeKey.trim()) {
          setError('Store key is required for serve_from_store action');
          return;
        }
        action.store_key = storeKey;
        action.store_key_mode = 'single';
      } else {
        // Multi-key modes
        const validKeys = storeKeys.filter(k => k.trim());
        if (validKeys.length === 0) {
          setError('At least one store key is required for serve_from_store action');
          return;
        }
        action.store_keys = validKeys;
        action.store_key_mode = storeKeyMode;
      }
      // For request rules, include merge mode
      if (direction === 'request') {
        action.request_merge_mode = requestMergeMode;
      }
    } else if (actionType === 'modify_static') {
      const hasReplaceBody = replaceBody.trim().length > 0;
      const hasFindReplace = findReplaceEntries.some(e => e.find.trim());
      const hasHeaderMods = headerModifications.some(h => h.key.trim());
      if (!hasReplaceBody && !hasFindReplace && !hasHeaderMods) {
        setError('At least one modification is required for modify_static action');
        return;
      }
      action.static_modification = {};
      if (hasReplaceBody) {
        action.static_modification.replace_body = replaceBody;
      }
      if (hasFindReplace) {
        action.static_modification.find_replace = findReplaceEntries.filter(e => e.find.trim());
      }
      if (hasHeaderMods) {
        action.static_modification.header_modifications = headerModifications.filter(h => h.key.trim());
      }
      if (allowIntercept) {
        action.static_modification.allow_intercept = true;
      }
    } else if (actionType === 'modify_llm') {
      // Either prompt or template is required
      if (!useTemplate && !llmPrompt.trim()) {
        setError('LLM prompt is required for modify_llm action');
        return;
      }
      if (useTemplate && !llmTemplateId) {
        setError('Please select a template');
        return;
      }

      action.llm_modification = {
        prompt: useTemplate ? '' : llmPrompt,
        context: llmContext,
        generation_mode: llmGenerationMode,
        template_id: useTemplate ? llmTemplateId : undefined,
        template_variables: useTemplate ? llmTemplateVariables : undefined,
        cache_key: llmGenerationMode === 'generate_once' && llmCacheKey.trim() ? llmCacheKey.trim() : undefined,
        provider: llmProvider || undefined,
      };
    }

    // Add tags to action if any are specified
    if (actionTags.length > 0) {
      action.tags = actionTags;
    }

    // Build filterV2 if in advanced mode
    let filterV2: RuleFilterV2 | undefined;
    if (advancedFilterMode) {
      // Clean up empty conditions
      const cleanedGroups = filterGroups.map(g => ({
        ...g,
        conditions: g.conditions.filter(c => {
          // Keep conditions that have meaningful values
          if (c.field === 'is_llm_api') return true; // Boolean fields always valid
          if (c.field === 'response_size') return c.sizeBytes !== undefined;
          if (c.field === 'status_code') return c.value?.trim();
          return c.value?.trim() || (c.key?.trim() && (c.field === 'header' || c.field === 'response_header'));
        }),
      })).filter(g => g.conditions.length > 0);

      if (cleanedGroups.length > 0) {
        filterV2 = {
          operator: filterGroupsOperator,
          groups: cleanedGroups,
        };
      }
    }

    const newRule: Rule = {
      id: rule?.id || generateId(),
      name: name.trim(),
      enabled,
      direction,
      priority: rule?.priority ?? 999,
      filter,
      filterV2,
      action,
    };

    setSaving(true);
    try {
      await onSave(newRule);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const addFindReplaceEntry = () => {
    setFindReplaceEntries([...findReplaceEntries, { find: '', replace: '', regex: false, replace_all: true }]);
  };

  const updateFindReplaceEntry = (index: number, updates: Partial<FindReplaceEntry>) => {
    const newEntries = [...findReplaceEntries];
    newEntries[index] = { ...newEntries[index], ...updates };
    setFindReplaceEntries(newEntries);
  };

  const removeFindReplaceEntry = (index: number) => {
    setFindReplaceEntries(findReplaceEntries.filter((_, i) => i !== index));
  };

  const addHeaderModification = () => {
    setHeaderModifications([...headerModifications, { type: 'set', key: '', value: '' }]);
  };

  const updateHeaderModification = (index: number, updates: Partial<HeaderModification>) => {
    const newMods = [...headerModifications];
    newMods[index] = { ...newMods[index], ...updates };
    setHeaderModifications(newMods);
  };

  const removeHeaderModification = (index: number) => {
    setHeaderModifications(headerModifications.filter((_, i) => i !== index));
  };

  // Advanced filter group helpers
  const addFilterGroup = () => {
    const newGroup: FilterGroup = {
      id: generateId(),
      operator: 'AND',
      conditions: [{
        id: generateId(),
        field: 'host',
        match: 'contains',
        value: '',
      }],
    };
    setFilterGroups([...filterGroups, newGroup]);
  };

  const removeFilterGroup = (groupId: string) => {
    if (filterGroups.length <= 1) return;
    setFilterGroups(filterGroups.filter(g => g.id !== groupId));
  };

  const updateFilterGroupOperator = (groupId: string, operator: FilterOperator) => {
    setFilterGroups(filterGroups.map(g =>
      g.id === groupId ? { ...g, operator } : g
    ));
  };

  const addConditionToGroup = (groupId: string) => {
    const newCondition: FilterCondition = {
      id: generateId(),
      field: 'host',
      match: 'contains',
      value: '',
    };
    setFilterGroups(filterGroups.map(g =>
      g.id === groupId
        ? { ...g, conditions: [...g.conditions, newCondition] }
        : g
    ));
  };

  const updateConditionInGroup = (groupId: string, conditionId: string, updates: Partial<FilterCondition>) => {
    setFilterGroups(filterGroups.map(g =>
      g.id === groupId
        ? {
            ...g,
            conditions: g.conditions.map(c =>
              c.id === conditionId ? { ...c, ...updates } : c
            ),
          }
        : g
    ));
  };

  const removeConditionFromGroup = (groupId: string, conditionId: string) => {
    setFilterGroups(filterGroups.map(g => {
      if (g.id !== groupId) return g;
      if (g.conditions.length <= 1) return g;
      return { ...g, conditions: g.conditions.filter(c => c.id !== conditionId) };
    }));
  };

  // Test rule execution
  const runTest = async () => {
    // Parse URL to extract host and path
    let host = '';
    let path = '';
    try {
      const url = new URL(testInput.url);
      host = url.host;
      path = url.pathname + url.search;
    } catch {
      setTestResult({
        matches: false,
        explanation: ['Invalid URL format'],
      });
      return;
    }

    // Convert headers array to object
    const headersObj: Record<string, string> = {};
    for (const h of testInput.headers) {
      if (h.key.trim()) {
        headersObj[h.key] = h.value;
      }
    }

    // Build explanation array
    const explanation: string[] = [];
    let matches = true;

    // Check host filter
    if (hostEnabled && hostValue) {
      const hostMatches = matchValue(host, hostMatch, hostValue);
      if (hostMatches) {
        explanation.push(`✓ Host "${host}" ${hostMatch}s "${hostValue}"`);
      } else {
        explanation.push(`✗ Host "${host}" does not ${hostMatch} "${hostValue}"`);
        matches = false;
      }
    }

    // Check path filter
    if (pathEnabled && pathValue) {
      const pathMatches = matchValue(path, pathMatch, pathValue);
      if (pathMatches) {
        explanation.push(`✓ Path "${path}" ${pathMatch}s "${pathValue}"`);
      } else {
        explanation.push(`✗ Path "${path}" does not ${pathMatch} "${pathValue}"`);
        matches = false;
      }
    }

    // Check method filter
    if (methodEnabled && methodValue) {
      const methodMatches = matchValue(testInput.method, methodMatch, methodValue);
      if (methodMatches) {
        explanation.push(`✓ Method "${testInput.method}" ${methodMatch}s "${methodValue}"`);
      } else {
        explanation.push(`✗ Method "${testInput.method}" does not ${methodMatch} "${methodValue}"`);
        matches = false;
      }
    }

    // Check header filter
    if (headerEnabled && headerKey && headerValue) {
      const testHeaderValue = headersObj[headerKey] || headersObj[headerKey.toLowerCase()] || '';
      const headerMatches = testHeaderValue && matchValue(testHeaderValue, headerMatch, headerValue);
      if (headerMatches) {
        explanation.push(`✓ Header "${headerKey}": "${testHeaderValue}" ${headerMatch}s "${headerValue}"`);
      } else {
        explanation.push(`✗ Header "${headerKey}": "${testHeaderValue || '(not set)'}" does not ${headerMatch} "${headerValue}"`);
        matches = false;
      }
    }

    // Check LLM API filter
    if (llmApiFilter === 'only') {
      if (testInput.isLlmApi) {
        explanation.push('✓ Is LLM API: true');
      } else {
        explanation.push('✗ Is LLM API: false (filter requires true)');
        matches = false;
      }
    } else if (llmApiFilter === 'exclude') {
      if (!testInput.isLlmApi) {
        explanation.push('✓ Is LLM API: false');
      } else {
        explanation.push('✗ Is LLM API: true (filter requires false)');
        matches = false;
      }
    }

    // If no filters enabled, explain that
    if (!hostEnabled && !pathEnabled && !methodEnabled && !headerEnabled && llmApiFilter === 'any') {
      explanation.push('✓ No filters configured - matches all traffic');
    }

    // Build action preview if matches
    let actionPreview: TestResult['actionPreview'] | undefined;
    if (matches) {
      actionPreview = { type: actionType };

      if (actionType === 'modify_static') {
        // Show modified body
        actionPreview.modifiedBody = applyStaticBodyModification(
          testInput.body,
          findReplaceEntries.filter(e => e.find.trim()),
          replaceBody.trim() || undefined
        );

        // Show modified headers
        if (headerModifications.some(h => h.key.trim())) {
          actionPreview.modifiedHeaders = applyHeaderModifications(
            headersObj,
            headerModifications.filter(h => h.key.trim())
          );
        }
      } else if (actionType === 'serve_from_store' && storeKey) {
        // Fetch stored response for preview
        try {
          const endpoint = direction === 'response' ? 'responses' : 'requests';
          const res = await fetch(`${API_BASE}/api/datastore/${endpoint}/${encodeURIComponent(storeKey)}`);
          if (res.ok) {
            const data = await res.json();
            actionPreview.storedResponse = data;
          } else {
            explanation.push(`⚠ Store key "${storeKey}" not found in datastore`);
          }
        } catch {
          explanation.push(`⚠ Failed to fetch store key "${storeKey}"`);
        }
      }
    }

    setTestResult({
      matches,
      explanation,
      actionPreview,
    });
  };

  // Add test header
  const addTestHeader = () => {
    setTestInput({
      ...testInput,
      headers: [...testInput.headers, { key: '', value: '' }],
    });
  };

  // Remove test header
  const removeTestHeader = (index: number) => {
    setTestInput({
      ...testInput,
      headers: testInput.headers.filter((_, i) => i !== index),
    });
  };

  // Update test header
  const updateTestHeader = (index: number, field: 'key' | 'value', value: string) => {
    const newHeaders = [...testInput.headers];
    newHeaders[index] = { ...newHeaders[index], [field]: value };
    setTestInput({ ...testInput, headers: newHeaders });
  };

  const modalTitleId = 'rule-editor-title';

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby={modalTitleId}
      data-testid="rule-editor-modal"
    >
      <div className="bg-inspector-surface border border-inspector-border rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-inspector-border flex items-center justify-between">
          <h2 id={modalTitleId} className="text-lg font-medium text-inspector-text">
            {rule ? 'Edit Rule' : 'Create Rule'}
          </h2>
          <button
            onClick={onClose}
            className="text-inspector-muted hover:text-inspector-text"
            aria-label="Close"
            data-testid="rule-editor-close-btn"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Error */}
          {error && (
            <div className="bg-inspector-error/20 text-inspector-error px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}

          {/* Basic info */}
          <section className="space-y-4">
            <h3 className="text-sm font-medium text-inspector-muted uppercase tracking-wide">
              Basic Info
            </h3>

            <div>
              <label className="block text-sm text-inspector-text mb-1" htmlFor="rule-name">Name</label>
              <input
                id="rule-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text"
                placeholder="My Rule"
                data-testid="rule-name-input"
              />
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm text-inspector-text mb-1" htmlFor="rule-direction">Direction</label>
                <select
                  id="rule-direction"
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as RuleDirection)}
                  className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text"
                  data-testid="rule-direction-select"
                >
                  <option value="request">Request</option>
                  <option value="response">Response</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="w-4 h-4"
                  data-testid="rule-enabled-checkbox"
                />
                <label htmlFor="enabled" className="text-sm text-inspector-text">
                  Enabled
                </label>
              </div>
            </div>
          </section>

          {/* Filters */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-inspector-muted uppercase tracking-wide">
                Filters
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-inspector-muted">Mode:</span>
                <button
                  type="button"
                  onClick={() => setAdvancedFilterMode(false)}
                  className={clsx(
                    'px-2 py-1 text-xs rounded transition-colors',
                    !advancedFilterMode
                      ? 'bg-inspector-accent text-white'
                      : 'bg-inspector-surface text-inspector-muted hover:text-inspector-text'
                  )}
                >
                  Simple
                </button>
                <button
                  type="button"
                  onClick={() => setAdvancedFilterMode(true)}
                  className={clsx(
                    'px-2 py-1 text-xs rounded transition-colors',
                    advancedFilterMode
                      ? 'bg-inspector-accent text-white'
                      : 'bg-inspector-surface text-inspector-muted hover:text-inspector-text'
                  )}
                >
                  Advanced
                </button>
              </div>
            </div>

            {!advancedFilterMode ? (
              <>
                {/* Simple filter mode - original UI */}
                <p className="text-xs text-inspector-muted">All conditions must match (AND logic)</p>

                {/* Host filter */}
                <FilterRow
                  label="Host"
                  enabled={hostEnabled}
                  onToggle={setHostEnabled}
                  matchType={hostMatch}
                  onMatchChange={setHostMatch}
                  value={hostValue}
                  onValueChange={setHostValue}
                  placeholder="api.anthropic.com"
                  testId="filter-host"
                />

                {/* Path filter */}
                <FilterRow
                  label="Path"
                  enabled={pathEnabled}
                  onToggle={setPathEnabled}
                  matchType={pathMatch}
                  onMatchChange={setPathMatch}
                  value={pathValue}
                  onValueChange={setPathValue}
                  placeholder="/v1/messages"
                  testId="filter-path"
                />

                {/* Method filter */}
                <FilterRow
                  label="Method"
                  enabled={methodEnabled}
                  onToggle={setMethodEnabled}
                  matchType={methodMatch}
                  onMatchChange={setMethodMatch}
                  value={methodValue}
                  onValueChange={setMethodValue}
                  placeholder="POST"
                  testId="filter-method"
                />

                {/* Header filter */}
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={headerEnabled}
                    onChange={(e) => setHeaderEnabled(e.target.checked)}
                    className="mt-2 w-4 h-4"
                  />
                  <div className="flex-1 space-y-2">
                    <span className="text-sm text-inspector-text">Header</span>
                    {headerEnabled && (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={headerKey}
                          onChange={(e) => setHeaderKey(e.target.value)}
                          placeholder="Header name"
                          className="w-32 bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm text-inspector-text"
                        />
                        <select
                          value={headerMatch}
                          onChange={(e) => setHeaderMatch(e.target.value as MatchType)}
                          className="bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm text-inspector-text"
                        >
                          <option value="exact">exact</option>
                          <option value="contains">contains</option>
                          <option value="regex">regex</option>
                        </select>
                        <input
                          type="text"
                          value={headerValue}
                          onChange={(e) => setHeaderValue(e.target.value)}
                          placeholder="Value"
                          className="flex-1 bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm text-inspector-text"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* LLM API filter */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-inspector-text w-20">LLM API:</span>
                  <select
                    value={llmApiFilter}
                    onChange={(e) => setLlmApiFilter(e.target.value as 'any' | 'only' | 'exclude')}
                    className="bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm text-inspector-text"
                  >
                    <option value="any">Any traffic</option>
                    <option value="only">LLM API only</option>
                    <option value="exclude">Non-LLM only</option>
                  </select>
                </div>
              </>
            ) : (
              <>
                {/* Advanced filter mode - AND/OR groups */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-inspector-muted">Match</span>
                  <select
                    value={filterGroupsOperator}
                    onChange={(e) => setFilterGroupsOperator(e.target.value as FilterOperator)}
                    className="px-2 py-1 bg-inspector-bg border border-inspector-border rounded text-xs font-medium focus:outline-none focus:border-inspector-accent"
                  >
                    <option value="AND">ALL (AND)</option>
                    <option value="OR">ANY (OR)</option>
                  </select>
                  <span className="text-xs text-inspector-muted">of the following groups:</span>
                </div>

                <div className="space-y-4">
                  {filterGroups.map((group, index) => (
                    <div key={group.id}>
                      {index > 0 && (
                        <div className="flex items-center justify-center py-2">
                          <span
                            className={clsx(
                              'px-3 py-1 text-xs rounded font-medium',
                              filterGroupsOperator === 'AND'
                                ? 'bg-blue-500/20 text-blue-400'
                                : 'bg-green-500/20 text-green-400'
                            )}
                          >
                            {filterGroupsOperator}
                          </span>
                        </div>
                      )}
                      <RuleFilterGroupEditor
                        group={group}
                        groupIndex={index}
                        onOperatorChange={(op) => updateFilterGroupOperator(group.id, op)}
                        onAddCondition={() => addConditionToGroup(group.id)}
                        onUpdateCondition={(condId, updates) =>
                          updateConditionInGroup(group.id, condId, updates)
                        }
                        onRemoveCondition={(condId) =>
                          removeConditionFromGroup(group.id, condId)
                        }
                        onRemoveGroup={() => removeFilterGroup(group.id)}
                        isOnly={filterGroups.length === 1}
                        direction={direction}
                      />
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addFilterGroup}
                  className="w-full py-2 border border-dashed border-inspector-border rounded text-xs text-inspector-muted hover:text-inspector-text hover:border-inspector-accent transition-colors flex items-center justify-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Filter Group
                </button>
              </>
            )}
          </section>

          {/* Response Filters (only for response rules in simple mode) */}
          {direction === 'response' && !advancedFilterMode && (
            <section className="space-y-4">
              <h3 className="text-sm font-medium text-inspector-muted uppercase tracking-wide">
                Response Filters (optional)
              </h3>
              <p className="text-xs text-inspector-muted">
                Filter based on response characteristics. These filters are evaluated after the response is received.
              </p>

              {/* Status Code filter */}
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={statusCodeEnabled}
                  onChange={(e) => setStatusCodeEnabled(e.target.checked)}
                  className="mt-2 w-4 h-4"
                />
                <div className="flex-1 space-y-2">
                  <span className="text-sm text-inspector-text">Status Code</span>
                  {statusCodeEnabled && (
                    <div className="flex gap-2">
                      <select
                        value={statusCodeMatch}
                        onChange={(e) => setStatusCodeMatch(e.target.value as StatusCodeMatch)}
                        className="bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm text-inspector-text"
                      >
                        <option value="exact">exact</option>
                        <option value="range">range</option>
                        <option value="list">list</option>
                      </select>
                      <input
                        type="text"
                        value={statusCodeValue}
                        onChange={(e) => setStatusCodeValue(e.target.value)}
                        placeholder={statusCodeMatch === 'exact' ? '200' : statusCodeMatch === 'range' ? '>=400 or 4xx' : '500,502,503'}
                        className="flex-1 bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm text-inspector-text"
                      />
                    </div>
                  )}
                  {statusCodeEnabled && (
                    <p className="text-xs text-inspector-muted">
                      {statusCodeMatch === 'exact' && 'Match exact status code (e.g., 200, 404)'}
                      {statusCodeMatch === 'range' && 'Match range: >=400, <=299, 4xx, 5xx, or 400-499'}
                      {statusCodeMatch === 'list' && 'Match any in comma-separated list (e.g., 500,502,503)'}
                    </p>
                  )}
                </div>
              </div>

              {/* Response Body Contains filter */}
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={responseBodyEnabled}
                  onChange={(e) => setResponseBodyEnabled(e.target.checked)}
                  className="mt-2 w-4 h-4"
                />
                <div className="flex-1 space-y-2">
                  <span className="text-sm text-inspector-text">Body Contains</span>
                  {responseBodyEnabled && (
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={responseBodyValue}
                        onChange={(e) => setResponseBodyValue(e.target.value)}
                        placeholder="Search string or regex"
                        className="flex-1 bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm text-inspector-text"
                      />
                      <label className="flex items-center gap-1 text-xs text-inspector-muted whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={responseBodyRegex}
                          onChange={(e) => setResponseBodyRegex(e.target.checked)}
                        />
                        Regex
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* Response Header filter */}
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={responseHeaderEnabled}
                  onChange={(e) => setResponseHeaderEnabled(e.target.checked)}
                  className="mt-2 w-4 h-4"
                />
                <div className="flex-1 space-y-2">
                  <span className="text-sm text-inspector-text">Response Header</span>
                  {responseHeaderEnabled && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={responseHeaderKey}
                        onChange={(e) => setResponseHeaderKey(e.target.value)}
                        placeholder="Header name"
                        className="w-32 bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm text-inspector-text"
                      />
                      <select
                        value={responseHeaderMatch}
                        onChange={(e) => setResponseHeaderMatch(e.target.value as MatchType)}
                        className="bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm text-inspector-text"
                      >
                        <option value="exact">exact</option>
                        <option value="contains">contains</option>
                        <option value="regex">regex</option>
                      </select>
                      <input
                        type="text"
                        value={responseHeaderValue}
                        onChange={(e) => setResponseHeaderValue(e.target.value)}
                        placeholder="Value"
                        className="flex-1 bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm text-inspector-text"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Response Size filter */}
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={responseSizeEnabled}
                  onChange={(e) => setResponseSizeEnabled(e.target.checked)}
                  className="mt-2 w-4 h-4"
                />
                <div className="flex-1 space-y-2">
                  <span className="text-sm text-inspector-text">Response Size</span>
                  {responseSizeEnabled && (
                    <div className="flex gap-2 items-center">
                      <select
                        value={responseSizeOperator}
                        onChange={(e) => setResponseSizeOperator(e.target.value as 'gt' | 'lt' | 'gte' | 'lte')}
                        className="bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm text-inspector-text"
                      >
                        <option value="gt">greater than</option>
                        <option value="gte">greater than or equal</option>
                        <option value="lt">less than</option>
                        <option value="lte">less than or equal</option>
                      </select>
                      <input
                        type="number"
                        value={responseSizeBytes}
                        onChange={(e) => setResponseSizeBytes(parseInt(e.target.value, 10) || 0)}
                        className="w-24 bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm text-inspector-text"
                      />
                      <span className="text-xs text-inspector-muted">bytes</span>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Action */}
          <section className="space-y-4">
            <h3 className="text-sm font-medium text-inspector-muted uppercase tracking-wide">
              Action
            </h3>

            <div>
              <label className="block text-sm text-inspector-text mb-1" htmlFor="rule-action-type">Action Type</label>
              <select
                id="rule-action-type"
                value={actionType}
                onChange={(e) => setActionType(e.target.value as RuleActionType)}
                className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text"
                data-testid="rule-action-type-select"
              >
                <option value="passthrough">Passthrough (log only)</option>
                <option value="intercept">Intercept (manual edit)</option>
                <option value="drop">Drop (block traffic)</option>
                <option value="serve_from_store">Serve from Data Store</option>
                <option value="modify_static">Modify Body & Headers</option>
                <option value="modify_llm">LLM Modification</option>
                <option value="auto_hide">Auto Hide (hide from traffic view)</option>
                <option value="auto_clear">Auto Clear (delete from traffic)</option>
              </select>
            </div>

            {/* Action-specific fields */}
            {actionType === 'serve_from_store' && (
              <div className="space-y-4">
                {/* Selection mode (only for response rules) */}
                {direction === 'response' && (
                  <div>
                    <label className="block text-sm text-inspector-text mb-1">Selection Mode</label>
                    <select
                      value={storeKeyMode}
                      onChange={(e) => setStoreKeyMode(e.target.value as StoreKeyMode)}
                      className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text"
                    >
                      <option value="single">Single - Always serve the same response</option>
                      <option value="round_robin">Round Robin - Cycle through responses in order</option>
                      <option value="random">Random - Randomly select from responses</option>
                      <option value="sequential">Sequential - Serve responses in order (stops at end)</option>
                    </select>
                    <p className="text-xs text-inspector-muted mt-1">
                      {storeKeyMode === 'single' && 'Serves the same stored response every time.'}
                      {storeKeyMode === 'round_robin' && 'Cycles through responses: 1, 2, 3, 1, 2, 3...'}
                      {storeKeyMode === 'random' && 'Randomly picks a response each time. Good for simulating flaky APIs.'}
                      {storeKeyMode === 'sequential' && 'Serves responses in order, staying on the last one. Good for testing pagination.'}
                    </p>
                  </div>
                )}

                {/* Single key selector */}
                {(storeKeyMode === 'single' || direction === 'request') && (
                  <div>
                    <label className="block text-sm text-inspector-text mb-1">Data Store Key</label>
                    <DatastoreKeySelector
                      value={storeKey}
                      onChange={setStoreKey}
                      direction={direction}
                    />
                    <p className="text-xs text-inspector-muted mt-2">
                      Select a stored {direction === 'response' ? 'response' : 'request'} to serve.
                    </p>
                  </div>
                )}

                {/* Multiple keys selector */}
                {storeKeyMode !== 'single' && direction === 'response' && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm text-inspector-text">Data Store Keys</label>
                      <button
                        type="button"
                        onClick={() => setStoreKeys([...storeKeys, ''])}
                        className="text-xs px-2 py-1 rounded bg-inspector-bg hover:bg-inspector-border text-inspector-muted"
                      >
                        + Add Key
                      </button>
                    </div>
                    {storeKeys.length === 0 && (
                      <p className="text-xs text-inspector-muted mb-2">No keys added yet. Click "+ Add Key" to add responses.</p>
                    )}
                    {storeKeys.map((key, i) => (
                      <div key={i} className="flex gap-2 mb-2 items-center">
                        <span className="text-xs text-inspector-muted w-6">{i + 1}.</span>
                        <div className="flex-1">
                          <DatastoreKeySelector
                            value={key}
                            onChange={(newKey) => {
                              const newKeys = [...storeKeys];
                              newKeys[i] = newKey;
                              setStoreKeys(newKeys);
                            }}
                            direction={direction}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setStoreKeys(storeKeys.filter((_, idx) => idx !== i))}
                          className="text-inspector-muted hover:text-inspector-error p-1"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                    <p className="text-xs text-inspector-muted mt-2">
                      Add multiple responses to serve based on the selection mode.
                    </p>
                  </div>
                )}

                {/* Merge mode for request rules */}
                {direction === 'request' && (
                  <div>
                    <label className="block text-sm text-inspector-text mb-1">Header Merge Mode</label>
                    <select
                      value={requestMergeMode}
                      onChange={(e) => setRequestMergeMode(e.target.value as RequestMergeMode)}
                      className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text"
                    >
                      <option value="merge">Merge (stored headers override incoming)</option>
                      <option value="replace">Replace (use only stored headers)</option>
                    </select>
                    <p className="text-xs text-inspector-muted mt-1">
                      Merge: Combines incoming request headers with stored headers (stored takes precedence).
                      Replace: Discards incoming headers and uses only stored headers.
                    </p>
                  </div>
                )}
              </div>
            )}

            {actionType === 'modify_static' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-inspector-text mb-1">Replace Body (optional)</label>
                  <textarea
                    value={replaceBody}
                    onChange={(e) => setReplaceBody(e.target.value)}
                    rows={4}
                    className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text font-mono text-sm"
                    placeholder="Complete body replacement..."
                  />
                  <p className="text-xs text-inspector-muted mt-1">
                    If set, replaces the entire body. Otherwise use find/replace.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm text-inspector-text">Body Find/Replace (optional)</label>
                    <button
                      type="button"
                      onClick={addFindReplaceEntry}
                      className="text-xs px-2 py-1 rounded bg-inspector-bg hover:bg-inspector-border text-inspector-muted"
                    >
                      + Add
                    </button>
                  </div>
                  {findReplaceEntries.map((entry, i) => (
                    <div key={i} className="flex gap-2 mb-2 items-center">
                      <input
                        type="text"
                        value={entry.find}
                        onChange={(e) => updateFindReplaceEntry(i, { find: e.target.value })}
                        placeholder="Find"
                        className="flex-1 bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm text-inspector-text font-mono"
                      />
                      <input
                        type="text"
                        value={entry.replace}
                        onChange={(e) => updateFindReplaceEntry(i, { replace: e.target.value })}
                        placeholder="Replace"
                        className="flex-1 bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm text-inspector-text font-mono"
                      />
                      <label className="flex items-center gap-1 text-xs text-inspector-muted whitespace-nowrap" title="Replace all occurrences (default: on)">
                        <input
                          type="checkbox"
                          checked={entry.replace_all !== false}
                          onChange={(e) => updateFindReplaceEntry(i, { replace_all: e.target.checked })}
                        />
                        All
                      </label>
                      <label className="flex items-center gap-1 text-xs text-inspector-muted whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={entry.regex || false}
                          onChange={(e) => updateFindReplaceEntry(i, { regex: e.target.checked })}
                        />
                        Regex
                      </label>
                      <button
                        type="button"
                        onClick={() => removeFindReplaceEntry(i)}
                        className="text-inspector-muted hover:text-inspector-error"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>

                {/* Header Modifications */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm text-inspector-text">Header Modifications (optional)</label>
                    <button
                      type="button"
                      onClick={addHeaderModification}
                      className="text-xs px-2 py-1 rounded bg-inspector-bg hover:bg-inspector-border text-inspector-muted"
                    >
                      + Add
                    </button>
                  </div>
                  {headerModifications.map((mod, i) => (
                    <div key={i} className="flex gap-2 mb-2 items-center">
                      <select
                        value={mod.type}
                        onChange={(e) => updateHeaderModification(i, { type: e.target.value as HeaderModificationType })}
                        className="bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm text-inspector-text"
                      >
                        <option value="set">Set</option>
                        <option value="remove">Remove</option>
                        <option value="find_replace">Find/Replace</option>
                      </select>
                      <input
                        type="text"
                        value={mod.key}
                        onChange={(e) => updateHeaderModification(i, { key: e.target.value })}
                        placeholder="Header name"
                        className="w-36 bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm text-inspector-text font-mono"
                      />
                      {mod.type === 'set' && (
                        <input
                          type="text"
                          value={mod.value || ''}
                          onChange={(e) => updateHeaderModification(i, { value: e.target.value })}
                          placeholder="Value"
                          className="flex-1 bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm text-inspector-text font-mono"
                        />
                      )}
                      {mod.type === 'find_replace' && (
                        <>
                          <input
                            type="text"
                            value={mod.find || ''}
                            onChange={(e) => updateHeaderModification(i, { find: e.target.value })}
                            placeholder="Find"
                            className="flex-1 bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm text-inspector-text font-mono"
                          />
                          <input
                            type="text"
                            value={mod.value || ''}
                            onChange={(e) => updateHeaderModification(i, { value: e.target.value })}
                            placeholder="Replace"
                            className="flex-1 bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm text-inspector-text font-mono"
                          />
                          <label className="flex items-center gap-1 text-xs text-inspector-muted whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={mod.regex || false}
                              onChange={(e) => updateHeaderModification(i, { regex: e.target.checked })}
                            />
                            Regex
                          </label>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => removeHeaderModification(i)}
                        className="text-inspector-muted hover:text-inspector-error"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  <p className="text-xs text-inspector-muted mt-1">
                    Set: add/overwrite a header. Remove: delete a header. Find/Replace: modify header value.
                  </p>
                </div>

                {/* Allow Intercept Option */}
                <div className="pt-2 border-t border-inspector-border">
                  <label className="flex items-center gap-2 text-sm text-inspector-text cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowIntercept}
                      onChange={(e) => setAllowIntercept(e.target.checked)}
                      className="rounded"
                    />
                    Allow intercept after modification
                  </label>
                  <p className="text-xs text-inspector-muted mt-1 ml-5">
                    Apply modifications, then add to intercept queue for manual review before forwarding
                  </p>
                </div>
              </div>
            )}

            {actionType === 'modify_llm' && (
              <div className="space-y-4">
                {/* Generation Mode */}
                <div>
                  <label className="block text-sm text-inspector-text mb-1">Generation Mode</label>
                  <select
                    value={llmGenerationMode}
                    onChange={(e) => setLlmGenerationMode(e.target.value as LLMGenerationMode)}
                    className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text"
                  >
                    <option value="generate_live">Generate on Every Match</option>
                    <option value="generate_once">Generate Once & Cache</option>
                  </select>
                  <p className="text-xs text-inspector-muted mt-1">
                    {llmGenerationMode === 'generate_once'
                      ? 'Result is cached and reused for subsequent matches'
                      : 'LLM is called every time the rule matches'}
                  </p>
                </div>

                {/* Cache Key (for generate_once) */}
                {llmGenerationMode === 'generate_once' && (
                  <div>
                    <label className="block text-sm text-inspector-text mb-1">Cache Key (optional)</label>
                    <input
                      type="text"
                      value={llmCacheKey}
                      onChange={(e) => setLlmCacheKey(e.target.value)}
                      className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text font-mono text-sm"
                      placeholder="Auto-generated if empty"
                    />
                    <p className="text-xs text-inspector-muted mt-1">
                      Cached result is stored in datastore with this key
                    </p>
                  </div>
                )}

                {/* Prompt Source */}
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
                        value={llmTemplateId}
                        onChange={(e) => setLlmTemplateId(e.target.value)}
                        className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text"
                        disabled={loadingTemplates}
                      >
                        <option value="">Select a template...</option>
                        {loadingTemplates ? (
                          <option disabled>Loading templates...</option>
                        ) : (
                          templates.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))
                        )}
                      </select>

                      {llmTemplateId && templates.find(t => t.id === llmTemplateId)?.description && (
                        <p className="text-xs text-inspector-muted">
                          {templates.find(t => t.id === llmTemplateId)?.description}
                        </p>
                      )}

                      {/* Template variables */}
                      {llmTemplateId && templates.find(t => t.id === llmTemplateId)?.variables && (
                        <div className="space-y-2">
                          <label className="block text-sm text-inspector-text">Template Variables:</label>
                          {templates.find(t => t.id === llmTemplateId)?.variables?.map(v => (
                            <div key={v.name} className="flex gap-2 items-center">
                              <span className="text-sm text-inspector-muted w-28 font-mono truncate" title={v.name}>
                                {v.name}:
                              </span>
                              <input
                                type="text"
                                value={llmTemplateVariables[v.name] || ''}
                                onChange={(e) => setLlmTemplateVariables({
                                  ...llmTemplateVariables,
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
                      value={llmPrompt}
                      onChange={(e) => setLlmPrompt(e.target.value)}
                      rows={4}
                      className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text"
                      placeholder="Modify this response to be more concise..."
                    />
                  )}
                </div>

                {/* Context to Send */}
                <div>
                  <label className="block text-sm text-inspector-text mb-1">Context to Send</label>
                  <select
                    value={llmContext}
                    onChange={(e) => setLlmContext(e.target.value as 'none' | 'url_only' | 'body_only' | 'headers_only' | 'full')}
                    className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text"
                  >
                    <option value="none">None (prompt only)</option>
                    <option value="url_only">URL only (method + URL)</option>
                    <option value="body_only">Body only</option>
                    <option value="headers_only">Headers only</option>
                    <option value="full">Full request/response</option>
                  </select>
                </div>

                {/* Provider Override */}
                <div>
                  <label className="block text-sm text-inspector-text mb-1">Provider (optional)</label>
                  <select
                    value={llmProvider}
                    onChange={(e) => setLlmProvider(e.target.value)}
                    className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text"
                  >
                    <option value="">Use default provider</option>
                    {ALL_PROVIDERS.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <p className="text-xs text-inspector-muted">
                  LLM modification requires LLM provider settings to be configured in Settings.
                </p>
              </div>
            )}

            {/* Tags - available for all action types */}
            <div className="border-t border-inspector-border pt-4 mt-4">
              <label className="block text-sm text-inspector-text mb-1">Tags (optional)</label>
              <p className="text-xs text-inspector-muted mb-2">
                Tags will be automatically applied to matching traffic for easy filtering.
              </p>
              <div className="flex flex-wrap gap-1 mb-2">
                {actionTags.map((tag, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-600/20 text-blue-400 rounded text-xs"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => setActionTags(actionTags.filter((_, idx) => idx !== i))}
                      className="hover:text-blue-200"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && tagInput.trim()) {
                      e.preventDefault();
                      if (!actionTags.includes(tagInput.trim())) {
                        setActionTags([...actionTags, tagInput.trim()]);
                      }
                      setTagInput('');
                    }
                  }}
                  placeholder="Enter tag and press Enter"
                  className="flex-1 bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm text-inspector-text"
                  list="tag-suggestions"
                />
                <datalist id="tag-suggestions">
                  {allTags
                    .filter(t => !actionTags.includes(t) && t.toLowerCase().includes(tagInput.toLowerCase()))
                    .slice(0, 10)
                    .map(t => (
                      <option key={t} value={t} />
                    ))}
                </datalist>
                <button
                  type="button"
                  onClick={() => {
                    if (tagInput.trim() && !actionTags.includes(tagInput.trim())) {
                      setActionTags([...actionTags, tagInput.trim()]);
                      setTagInput('');
                    }
                  }}
                  className="px-3 py-1 bg-inspector-bg border border-inspector-border rounded text-xs text-inspector-muted hover:text-inspector-text hover:border-inspector-accent"
                >
                  Add
                </button>
              </div>
              <p className="text-xs text-inspector-muted mt-1">
                Tip: Use hierarchical tags like "category:subcategory" for organization.
              </p>
            </div>
          </section>

          {/* Test Rule Section */}
          <section className="border border-inspector-border rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setTestExpanded(!testExpanded)}
              className="w-full px-4 py-3 flex items-center justify-between bg-inspector-bg hover:bg-inspector-border/50 transition-colors"
            >
              <span className="text-sm font-medium text-inspector-text flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                Test Rule
              </span>
              <svg className={clsx('w-4 h-4 transition-transform', testExpanded && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {testExpanded && (
              <div className="px-4 py-4 space-y-4 border-t border-inspector-border">
                <p className="text-xs text-inspector-muted">
                  Test if sample traffic would match this rule's filters and preview the action.
                </p>

                {/* Test URL */}
                <div>
                  <label className="block text-sm text-inspector-text mb-1">URL</label>
                  <input
                    type="text"
                    value={testInput.url}
                    onChange={(e) => setTestInput({ ...testInput, url: e.target.value })}
                    className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text font-mono text-sm"
                    placeholder="https://api.anthropic.com/v1/messages"
                  />
                </div>

                {/* Test Method */}
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm text-inspector-text mb-1">Method</label>
                    <select
                      value={testInput.method}
                      onChange={(e) => setTestInput({ ...testInput, method: e.target.value })}
                      className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text"
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="PUT">PUT</option>
                      <option value="PATCH">PATCH</option>
                      <option value="DELETE">DELETE</option>
                    </select>
                  </div>
                  <div className="flex items-end gap-2 pb-1">
                    <input
                      type="checkbox"
                      id="testIsLlmApi"
                      checked={testInput.isLlmApi}
                      onChange={(e) => setTestInput({ ...testInput, isLlmApi: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <label htmlFor="testIsLlmApi" className="text-sm text-inspector-text">
                      Is LLM API
                    </label>
                  </div>
                </div>

                {/* Test Headers */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm text-inspector-text">Headers</label>
                    <button
                      type="button"
                      onClick={addTestHeader}
                      className="text-xs px-2 py-1 rounded bg-inspector-bg hover:bg-inspector-border text-inspector-muted"
                    >
                      + Add
                    </button>
                  </div>
                  {testInput.headers.map((h, i) => (
                    <div key={i} className="flex gap-2 mb-2 items-center">
                      <input
                        type="text"
                        value={h.key}
                        onChange={(e) => updateTestHeader(i, 'key', e.target.value)}
                        placeholder="Header name"
                        className="w-36 bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm text-inspector-text font-mono"
                      />
                      <input
                        type="text"
                        value={h.value}
                        onChange={(e) => updateTestHeader(i, 'value', e.target.value)}
                        placeholder="Value"
                        className="flex-1 bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm text-inspector-text font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => removeTestHeader(i)}
                        className="text-inspector-muted hover:text-inspector-error"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>

                {/* Test Body */}
                <div>
                  <label className="block text-sm text-inspector-text mb-1">Body</label>
                  <textarea
                    value={testInput.body}
                    onChange={(e) => setTestInput({ ...testInput, body: e.target.value })}
                    rows={3}
                    className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2 text-inspector-text font-mono text-sm"
                    placeholder="{}"
                  />
                </div>

                {/* Run Test Button */}
                <button
                  type="button"
                  onClick={runTest}
                  className="px-4 py-2 text-sm rounded bg-inspector-accent hover:bg-inspector-accent/80 text-white flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Run Test
                </button>

                {/* Test Result */}
                {testResult && (
                  <div className={clsx(
                    'rounded-lg p-4',
                    testResult.matches ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'
                  )}>
                    <div className="flex items-center gap-2 mb-3">
                      {testResult.matches ? (
                        <>
                          <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-green-500 font-medium">Rule Matches</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-red-500 font-medium">Rule Does Not Match</span>
                        </>
                      )}
                    </div>

                    {/* Filter explanations */}
                    <div className="space-y-1 text-sm">
                      {testResult.explanation.map((exp, i) => (
                        <div key={i} className={clsx(
                          'font-mono',
                          exp.startsWith('✓') ? 'text-green-400' :
                          exp.startsWith('✗') ? 'text-red-400' :
                          exp.startsWith('⚠') ? 'text-yellow-400' :
                          'text-inspector-muted'
                        )}>
                          {exp}
                        </div>
                      ))}
                    </div>

                    {/* Action preview */}
                    {testResult.matches && testResult.actionPreview && (
                      <div className="mt-4 pt-4 border-t border-inspector-border">
                        <h4 className="text-sm font-medium text-inspector-text mb-2">
                          Action: <span className="text-inspector-accent">{testResult.actionPreview.type}</span>
                        </h4>

                        {testResult.actionPreview.type === 'passthrough' && (
                          <p className="text-sm text-inspector-muted">Traffic will be logged but not modified.</p>
                        )}

                        {testResult.actionPreview.type === 'intercept' && (
                          <p className="text-sm text-inspector-muted">Traffic will be queued for manual review in the Intercept view.</p>
                        )}

                        {testResult.actionPreview.type === 'serve_from_store' && testResult.actionPreview.storedResponse && (
                          <div className="space-y-2">
                            <p className="text-sm text-inspector-muted">Will serve stored response:</p>
                            <div className="bg-inspector-bg rounded p-2 text-xs">
                              <div className="flex gap-4 mb-2">
                                <span>
                                  <span className="text-inspector-muted">Status:</span>{' '}
                                  <span className="text-inspector-accent">{testResult.actionPreview.storedResponse.status_code}</span>
                                </span>
                                <span>
                                  <span className="text-inspector-muted">Headers:</span>{' '}
                                  <span className="text-inspector-text">{Object.keys(testResult.actionPreview.storedResponse.headers || {}).length}</span>
                                </span>
                              </div>
                              <pre className="font-mono text-inspector-text whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                                {(testResult.actionPreview.storedResponse.body || '').slice(0, 500)}
                                {(testResult.actionPreview.storedResponse.body || '').length > 500 && '...'}
                              </pre>
                            </div>
                          </div>
                        )}

                        {testResult.actionPreview.type === 'modify_static' && (
                          <div className="space-y-3">
                            {testResult.actionPreview.modifiedBody !== undefined && testResult.actionPreview.modifiedBody !== testInput.body && (
                              <div>
                                <p className="text-sm text-inspector-muted mb-1">Modified Body:</p>
                                <div className="flex gap-2">
                                  <div className="flex-1 bg-inspector-bg rounded p-2">
                                    <div className="text-xs text-red-400 mb-1">Before:</div>
                                    <pre className="font-mono text-xs text-inspector-text whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
                                      {testInput.body.slice(0, 300)}
                                      {testInput.body.length > 300 && '...'}
                                    </pre>
                                  </div>
                                  <div className="flex-1 bg-inspector-bg rounded p-2">
                                    <div className="text-xs text-green-400 mb-1">After:</div>
                                    <pre className="font-mono text-xs text-inspector-text whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
                                      {testResult.actionPreview.modifiedBody.slice(0, 300)}
                                      {testResult.actionPreview.modifiedBody.length > 300 && '...'}
                                    </pre>
                                  </div>
                                </div>
                              </div>
                            )}
                            {testResult.actionPreview.modifiedBody === testInput.body && !testResult.actionPreview.modifiedHeaders && (
                              <p className="text-sm text-inspector-muted">No body modifications would be applied.</p>
                            )}

                            {testResult.actionPreview.modifiedHeaders && (
                              <div>
                                <p className="text-sm text-inspector-muted mb-1">Modified Headers:</p>
                                <div className="bg-inspector-bg rounded p-2 text-xs font-mono">
                                  {Object.entries(testResult.actionPreview.modifiedHeaders).map(([k, v]) => (
                                    <div key={k} className="text-inspector-text">
                                      <span className="text-inspector-accent">{k}:</span> {v}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {testResult.actionPreview.type === 'modify_llm' && (
                          <p className="text-sm text-inspector-muted">Content will be sent to LLM for modification (preview not available).</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        </form>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-inspector-border flex justify-end gap-2" data-testid="rule-editor-footer">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded bg-inspector-bg hover:bg-inspector-border text-inspector-muted"
            data-testid="rule-cancel-btn"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 text-sm rounded bg-inspector-accent hover:bg-inspector-accent/80 text-white disabled:opacity-50"
            data-testid="rule-save-btn"
          >
            {saving ? 'Saving...' : rule ? 'Update Rule' : 'Create Rule'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface FilterRowProps {
  label: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  matchType: MatchType;
  onMatchChange: (match: MatchType) => void;
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  testId?: string;
}

function FilterRow({
  label,
  enabled,
  onToggle,
  matchType,
  onMatchChange,
  value,
  onValueChange,
  placeholder,
  testId,
}: FilterRowProps) {
  const baseTestId = testId || `filter-${label.toLowerCase()}`;
  return (
    <div className="flex items-center gap-2" data-testid={`${baseTestId}-row`}>
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => onToggle(e.target.checked)}
        className="w-4 h-4"
        aria-label={`Enable ${label} filter`}
        data-testid={`${baseTestId}-checkbox`}
      />
      <span className="text-sm text-inspector-text w-16">{label}</span>
      {enabled && (
        <>
          <select
            value={matchType}
            onChange={(e) => onMatchChange(e.target.value as MatchType)}
            className="bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm text-inspector-text"
            aria-label={`${label} match type`}
            data-testid={`${baseTestId}-match-select`}
          >
            <option value="exact">exact</option>
            <option value="contains">contains</option>
            <option value="regex">regex</option>
          </select>
          <input
            type="text"
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-inspector-bg border border-inspector-border rounded px-2 py-1 text-sm text-inspector-text"
            aria-label={`${label} value`}
            data-testid={`${baseTestId}-value-input`}
          />
        </>
      )}
    </div>
  );
}
