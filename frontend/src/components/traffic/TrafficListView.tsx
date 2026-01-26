/**
 * Traffic list view - shows all captured traffic with advanced filtering,
 * hide/clear functionality, and saved filter presets
 */

import { useState, useMemo, useCallback } from 'react';
import { clsx } from 'clsx';
import { useAppStore } from '../../stores/appStore';
import { useFilterStore } from '../../stores/filterStore';
import { TrafficFlow, LLMProvider } from '../../types';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:2000';

function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleTimeString();
}

function getStatusColor(statusCode?: number): string {
  if (!statusCode) return 'text-inspector-muted';
  if (statusCode >= 200 && statusCode < 300) return 'text-inspector-success';
  if (statusCode >= 300 && statusCode < 400) return 'text-inspector-warning';
  if (statusCode >= 400) return 'text-inspector-error';
  return 'text-inspector-muted';
}

function getMethodColor(method: string): string {
  switch (method) {
    case 'GET':
      return 'bg-blue-600';
    case 'POST':
      return 'bg-green-600';
    case 'PUT':
      return 'bg-yellow-600';
    case 'DELETE':
      return 'bg-red-600';
    case 'PATCH':
      return 'bg-purple-600';
    default:
      return 'bg-gray-600';
  }
}

interface FilterBarProps {
  domains: string[];
  methods: string[];
  providers: LLMProvider[];
  onExport: (format: 'csv' | 'json') => void;
  totalCount: number;
  filteredCount: number;
  hiddenCount: number;
  selectedCount: number;
  onHideSelected: () => void;
  onClearSelected: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  hasSelection: boolean;
}

function FilterBar({
  domains,
  methods,
  providers,
  onExport,
  totalCount,
  filteredCount,
  hiddenCount,
  selectedCount,
  onHideSelected,
  onClearSelected,
  onSelectAll,
  onDeselectAll,
  hasSelection,
}: FilterBarProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  const {
    activeFilters,
    setFilter,
    clearFilters,
    presets,
    savePreset,
    loadPreset,
    deletePreset,
  } = useFilterStore();

  const handleSavePreset = () => {
    if (newPresetName.trim()) {
      savePreset(newPresetName.trim());
      setNewPresetName('');
      setShowPresetMenu(false);
    }
  };

  const hasActiveFilters = activeFilters.domain ||
    activeFilters.method ||
    activeFilters.llmOnly ||
    activeFilters.searchText ||
    activeFilters.statusCode ||
    activeFilters.provider ||
    activeFilters.hasRefusal !== undefined ||
    activeFilters.isModified !== undefined;

  return (
    <div className="p-3 border-b border-inspector-border bg-inspector-surface space-y-2">
      {/* First row: Search, basic filters, and action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <input
          type="text"
          placeholder="Search URLs, headers, bodies..."
          value={activeFilters.searchText || ''}
          onChange={(e) => setFilter('searchText', e.target.value || undefined)}
          className="px-3 py-1.5 bg-inspector-bg border border-inspector-border rounded text-sm focus:outline-none focus:border-inspector-accent flex-1 min-w-[200px] max-w-[300px]"
        />

        {/* Domain filter */}
        <select
          value={activeFilters.domain || ''}
          onChange={(e) => setFilter('domain', e.target.value || undefined)}
          className="px-2 py-1.5 bg-inspector-bg border border-inspector-border rounded text-sm focus:outline-none focus:border-inspector-accent"
        >
          <option value="">All domains</option>
          {domains.map((domain) => (
            <option key={domain} value={domain}>
              {domain}
            </option>
          ))}
        </select>

        {/* Method filter */}
        <select
          value={activeFilters.method || ''}
          onChange={(e) => setFilter('method', e.target.value || undefined)}
          className="px-2 py-1.5 bg-inspector-bg border border-inspector-border rounded text-sm focus:outline-none focus:border-inspector-accent"
        >
          <option value="">All methods</option>
          {methods.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>

        {/* LLM only toggle */}
        <label className="flex items-center gap-1.5 cursor-pointer text-sm">
          <input
            type="checkbox"
            checked={activeFilters.llmOnly || false}
            onChange={(e) => setFilter('llmOnly', e.target.checked || undefined)}
            className="w-4 h-4 rounded border-inspector-border"
          />
          <span>LLM only</span>
        </label>

        {/* Advanced filters toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={clsx(
            'px-2 py-1.5 text-sm rounded transition-colors flex items-center gap-1',
            showAdvanced
              ? 'bg-inspector-accent text-white'
              : 'bg-inspector-bg border border-inspector-border hover:bg-inspector-border'
          )}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          More
        </button>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="px-2 py-1.5 text-sm text-inspector-muted hover:text-inspector-text transition-colors"
          >
            Clear filters
          </button>
        )}

        {/* Preset menu */}
        <div className="relative">
          <button
            onClick={() => setShowPresetMenu(!showPresetMenu)}
            onBlur={() => setTimeout(() => setShowPresetMenu(false), 200)}
            className="px-2 py-1.5 bg-inspector-bg border border-inspector-border text-sm rounded hover:bg-inspector-border transition-colors flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            Presets
          </button>
          {showPresetMenu && (
            <div className="absolute right-0 top-full mt-1 bg-inspector-surface border border-inspector-border rounded shadow-lg z-10 min-w-[200px]">
              {/* Save current */}
              <div className="p-2 border-b border-inspector-border">
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    placeholder="Preset name..."
                    className="flex-1 px-2 py-1 bg-inspector-bg border border-inspector-border rounded text-xs"
                    onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
                  />
                  <button
                    onClick={handleSavePreset}
                    disabled={!newPresetName.trim()}
                    className="px-2 py-1 bg-inspector-accent text-white text-xs rounded disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>
              {/* Saved presets */}
              {presets.length > 0 ? (
                <div className="max-h-48 overflow-y-auto">
                  {presets.map((preset) => (
                    <div
                      key={preset.id}
                      className="flex items-center justify-between px-3 py-2 hover:bg-inspector-bg group"
                    >
                      <button
                        onClick={() => {
                          loadPreset(preset.id);
                          setShowPresetMenu(false);
                        }}
                        className="flex-1 text-left text-sm truncate"
                      >
                        {preset.name}
                      </button>
                      <button
                        onClick={() => deletePreset(preset.id)}
                        className="text-inspector-muted hover:text-inspector-error opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-2 text-xs text-inspector-muted">
                  No saved presets
                </div>
              )}
            </div>
          )}
        </div>

        {/* Export dropdown */}
        <div className="relative ml-auto">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            onBlur={() => setTimeout(() => setShowExportMenu(false), 150)}
            className="px-3 py-1.5 bg-inspector-bg border border-inspector-border text-sm rounded hover:bg-inspector-border transition-colors flex items-center gap-1"
          >
            Export
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showExportMenu && (
            <div className="absolute right-0 top-full mt-1 bg-inspector-surface border border-inspector-border rounded shadow-lg z-10">
              <button
                onClick={() => { onExport('csv'); setShowExportMenu(false); }}
                className="block w-full text-left px-4 py-2 text-sm hover:bg-inspector-bg whitespace-nowrap"
              >
                Export as CSV
              </button>
              <button
                onClick={() => { onExport('json'); setShowExportMenu(false); }}
                className="block w-full text-left px-4 py-2 text-sm hover:bg-inspector-bg whitespace-nowrap"
              >
                Export as JSON
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Advanced filters row */}
      {showAdvanced && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-inspector-border/50">
          {/* Status code filter */}
          <select
            value={activeFilters.statusCode || ''}
            onChange={(e) => setFilter('statusCode', e.target.value || undefined)}
            className="px-2 py-1.5 bg-inspector-bg border border-inspector-border rounded text-sm focus:outline-none focus:border-inspector-accent"
          >
            <option value="">All status codes</option>
            <option value="2xx">2xx Success</option>
            <option value="3xx">3xx Redirect</option>
            <option value="4xx">4xx Client Error</option>
            <option value="5xx">5xx Server Error</option>
          </select>

          {/* Provider filter */}
          <select
            value={activeFilters.provider || ''}
            onChange={(e) => setFilter('provider', (e.target.value || undefined) as LLMProvider | undefined)}
            className="px-2 py-1.5 bg-inspector-bg border border-inspector-border rounded text-sm focus:outline-none focus:border-inspector-accent"
          >
            <option value="">All providers</option>
            {providers.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>

          {/* Has refusal toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={activeFilters.hasRefusal === true}
              onChange={(e) => setFilter('hasRefusal', e.target.checked ? true : undefined)}
              className="w-4 h-4 rounded border-inspector-border"
            />
            <span>Has refusal</span>
          </label>

          {/* Is modified toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={activeFilters.isModified === true}
              onChange={(e) => setFilter('isModified', e.target.checked ? true : undefined)}
              className="w-4 h-4 rounded border-inspector-border"
            />
            <span>Modified</span>
          </label>

          {/* Show hidden toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer text-sm ml-auto">
            <input
              type="checkbox"
              checked={activeFilters.showHidden || false}
              onChange={(e) => setFilter('showHidden', e.target.checked || undefined)}
              className="w-4 h-4 rounded border-inspector-border"
            />
            <span>Show hidden ({hiddenCount})</span>
          </label>
        </div>
      )}

      {/* Selection actions row */}
      {hasSelection && (
        <div className="flex items-center gap-2 pt-2 border-t border-inspector-border/50">
          <span className="text-xs text-inspector-muted">
            {selectedCount} selected
          </span>
          <button
            onClick={onHideSelected}
            className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-400 rounded hover:bg-yellow-500/30 transition-colors"
          >
            Hide Selected
          </button>
          <button
            onClick={onClearSelected}
            className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
          >
            Clear Selected
          </button>
          <button
            onClick={onSelectAll}
            className="px-2 py-1 text-xs text-inspector-muted hover:text-inspector-text transition-colors"
          >
            Select All
          </button>
          <button
            onClick={onDeselectAll}
            className="px-2 py-1 text-xs text-inspector-muted hover:text-inspector-text transition-colors"
          >
            Deselect All
          </button>
        </div>
      )}

      {/* Count row */}
      <div className="text-xs text-inspector-muted">
        {filteredCount === totalCount
          ? `${totalCount} requests`
          : `Showing ${filteredCount} of ${totalCount} requests`}
        {hiddenCount > 0 && !activeFilters.showHidden && ` (${hiddenCount} hidden)`}
      </div>
    </div>
  );
}

interface TrafficRowProps {
  flow: TrafficFlow;
  isSelected: boolean;
  isChecked: boolean;
  onToggleCheck: (e: React.MouseEvent) => void;
  onClick: () => void;
}

function TrafficRow({ flow, isSelected, isChecked, onToggleCheck, onClick }: TrafficRowProps) {
  // Build tooltip for modified indicator
  const getModifiedTooltip = (): string | null => {
    const parts: string[] = [];
    if (flow.request_modified_by_rule) {
      parts.push(`Request: ${flow.request_modified_by_rule.name}`);
    } else if (flow.request_modified) {
      parts.push('Request modified');
    }
    if (flow.response_modified_by_rule) {
      parts.push(`Response: ${flow.response_modified_by_rule.name}`);
    } else if (flow.response_modified) {
      parts.push('Response modified');
    }
    return parts.length > 0 ? parts.join('\n') : null;
  };

  const isModified = flow.request_modified || flow.response_modified;
  const modifiedTooltip = getModifiedTooltip();

  return (
    <div
      onClick={onClick}
      className={clsx(
        'flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-inspector-border transition-colors',
        flow.hidden && 'opacity-50',
        isSelected
          ? 'bg-inspector-accent/20'
          : 'hover:bg-inspector-surface'
      )}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={isChecked}
        onClick={onToggleCheck}
        onChange={() => {}}
        className="w-4 h-4 rounded border-inspector-border shrink-0"
      />

      {/* Method badge */}
      <span
        className={clsx(
          'px-2 py-0.5 rounded text-xs font-bold text-white shrink-0',
          getMethodColor(flow.request.method)
        )}
      >
        {flow.request.method}
      </span>

      {/* LLM API indicator */}
      {flow.is_llm_api && (
        <span className="px-2 py-0.5 rounded text-xs font-bold bg-purple-600 text-white shrink-0">
          LLM
        </span>
      )}

      {/* Replay indicator */}
      {flow.replay_source && (
        <span
          className="shrink-0 text-cyan-400"
          title={`Replay of variant from flow ${flow.replay_source.parent_flow_id}`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </span>
      )}

      {/* Hidden indicator */}
      {flow.hidden && (
        <span
          className="shrink-0 text-yellow-400"
          title={flow.hidden_by_rule ? `Hidden by: ${flow.hidden_by_rule.name}` : 'Hidden'}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
          </svg>
        </span>
      )}

      {/* Modified indicator */}
      {isModified && (
        <span
          className="shrink-0 text-orange-400"
          title={modifiedTooltip || 'Modified by rule'}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </span>
      )}

      {/* Refusal indicator */}
      {flow.refusal?.detected && (
        <span
          className={clsx(
            'px-1.5 py-0.5 rounded text-xs shrink-0',
            flow.refusal.was_modified
              ? 'bg-purple-500/20 text-purple-400'
              : 'bg-orange-500/20 text-orange-400'
          )}
          title={`Refusal ${flow.refusal.was_modified ? 'modified' : 'detected'} (${(flow.refusal.confidence * 100).toFixed(0)}%)`}
        >
          {flow.refusal.was_modified ? 'Modified' : 'Refusal'}
        </span>
      )}

      {/* URL */}
      <span className="flex-1 min-w-0 truncate text-sm font-mono">
        {flow.request.host}
        <span className="text-inspector-muted">{flow.request.path}</span>
      </span>

      {/* Status */}
      <span className={clsx('text-sm font-mono shrink-0', getStatusColor(flow.response?.status_code))}>
        {flow.response?.status_code || '...'}
      </span>

      {/* Time */}
      <span className="text-xs text-inspector-muted shrink-0">
        {formatTime(flow.timestamp)}
      </span>
    </div>
  );
}

export function TrafficListView() {
  const { traffic, selectedTrafficId, setSelectedTrafficId, removeTraffic } = useAppStore();
  const { activeFilters } = useFilterStore();

  // Selection state for bulk operations
  const [selectedFlowIds, setSelectedFlowIds] = useState<Set<string>>(new Set());

  // Get all traffic as array
  const allTraffic = useMemo(() => {
    return Array.from(traffic.values()).sort((a, b) => b.timestamp - a.timestamp);
  }, [traffic]);

  // Count hidden traffic
  const hiddenCount = useMemo(() => {
    return allTraffic.filter(f => f.hidden).length;
  }, [allTraffic]);

  // Extract unique domains, methods, and providers for filter dropdowns
  const { domains, methods, providers } = useMemo(() => {
    const domainSet = new Set<string>();
    const methodSet = new Set<string>();
    const providerSet = new Set<LLMProvider>();

    allTraffic.forEach((flow) => {
      domainSet.add(flow.request.host);
      methodSet.add(flow.request.method);
      if (flow.parsed?.provider) {
        providerSet.add(flow.parsed.provider);
      }
    });

    return {
      domains: Array.from(domainSet).sort(),
      methods: Array.from(methodSet).sort(),
      providers: Array.from(providerSet).sort(),
    };
  }, [allTraffic]);

  // Full text search helper - searches URL, headers, and body
  const matchesSearch = useCallback((flow: TrafficFlow, search: string): boolean => {
    const searchLower = search.toLowerCase();

    // Search URL
    if (flow.request.url.toLowerCase().includes(searchLower)) return true;

    // Search request headers
    for (const [key, value] of Object.entries(flow.request.headers)) {
      if (key.toLowerCase().includes(searchLower)) return true;
      if (value.toLowerCase().includes(searchLower)) return true;
    }

    // Search request body
    if (flow.request.content?.toLowerCase().includes(searchLower)) return true;

    // Search response headers
    if (flow.response?.headers) {
      for (const [key, value] of Object.entries(flow.response.headers)) {
        if (key.toLowerCase().includes(searchLower)) return true;
        if (value.toLowerCase().includes(searchLower)) return true;
      }
    }

    // Search response body
    if (flow.response?.content?.toLowerCase().includes(searchLower)) return true;

    return false;
  }, []);

  // Filter traffic
  const filteredTraffic = useMemo(() => {
    return allTraffic.filter((flow) => {
      // Hidden filter
      if (!activeFilters.showHidden && flow.hidden) return false;

      // Basic filters
      if (activeFilters.domain && flow.request.host !== activeFilters.domain) return false;
      if (activeFilters.method && flow.request.method !== activeFilters.method) return false;
      if (activeFilters.llmOnly && !flow.is_llm_api) return false;
      if (activeFilters.searchText && !matchesSearch(flow, activeFilters.searchText)) return false;

      // Status code filter
      if (activeFilters.statusCode) {
        const status = flow.response?.status_code;
        if (!status) return false;
        switch (activeFilters.statusCode) {
          case '2xx': if (status < 200 || status >= 300) return false; break;
          case '3xx': if (status < 300 || status >= 400) return false; break;
          case '4xx': if (status < 400 || status >= 500) return false; break;
          case '5xx': if (status < 500 || status >= 600) return false; break;
        }
      }

      // Provider filter
      if (activeFilters.provider && flow.parsed?.provider !== activeFilters.provider) return false;

      // Refusal filter
      if (activeFilters.hasRefusal && !flow.refusal?.detected) return false;

      // Modified filter
      if (activeFilters.isModified && !flow.request_modified && !flow.response_modified) return false;

      return true;
    });
  }, [allTraffic, activeFilters, matchesSearch]);

  // Toggle selection for a flow
  const toggleSelection = useCallback((flowId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFlowIds(prev => {
      const next = new Set(prev);
      if (next.has(flowId)) {
        next.delete(flowId);
      } else {
        next.add(flowId);
      }
      return next;
    });
  }, []);

  // Select all visible flows
  const selectAll = useCallback(() => {
    setSelectedFlowIds(new Set(filteredTraffic.map(f => f.flow_id)));
  }, [filteredTraffic]);

  // Deselect all
  const deselectAll = useCallback(() => {
    setSelectedFlowIds(new Set());
  }, []);

  // Hide selected flows
  const hideSelected = useCallback(async () => {
    if (selectedFlowIds.size === 0) return;
    try {
      await fetch(`${API_BASE}/api/traffic/hide-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow_ids: Array.from(selectedFlowIds) }),
      });
      setSelectedFlowIds(new Set());
    } catch (err) {
      console.error('Failed to hide traffic:', err);
    }
  }, [selectedFlowIds]);

  // Clear (delete) selected flows
  const clearSelected = useCallback(async () => {
    if (selectedFlowIds.size === 0) return;
    if (!confirm(`Delete ${selectedFlowIds.size} traffic flow(s)? This cannot be undone.`)) return;
    try {
      await fetch(`${API_BASE}/api/traffic/clear-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow_ids: Array.from(selectedFlowIds) }),
      });
      // Remove from local state
      for (const flowId of selectedFlowIds) {
        removeTraffic(flowId);
      }
      setSelectedFlowIds(new Set());
    } catch (err) {
      console.error('Failed to clear traffic:', err);
    }
  }, [selectedFlowIds, removeTraffic]);

  // Export function
  const handleExport = async (format: 'csv' | 'json') => {
    try {
      // Build export data from filtered traffic
      const exportData = filteredTraffic.map((flow) => ({
        timestamp: flow.timestamp,
        method: flow.request.method,
        url: flow.request.url,
        host: flow.request.host,
        path: flow.request.path,
        status_code: flow.response?.status_code || null,
        is_llm_api: flow.is_llm_api,
        provider: flow.parsed?.provider || null,
        has_refusal: flow.refusal?.detected || false,
        is_modified: flow.request_modified || flow.response_modified || false,
      }));

      let content: string;
      let mimeType: string;
      let filename: string;

      if (format === 'json') {
        content = JSON.stringify(exportData, null, 2);
        mimeType = 'application/json';
        filename = 'traffic-export.json';
      } else {
        // CSV format
        const headers = ['timestamp', 'method', 'url', 'host', 'path', 'status_code', 'is_llm_api', 'provider', 'has_refusal', 'is_modified'];
        const rows = exportData.map((row) =>
          headers.map((h) => {
            const val = row[h as keyof typeof row];
            // Escape quotes and wrap in quotes if contains comma
            const strVal = String(val ?? '');
            if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
              return `"${strVal.replace(/"/g, '""')}"`;
            }
            return strVal;
          }).join(',')
        );
        content = [headers.join(','), ...rows].join('\n');
        mimeType = 'text/csv';
        filename = 'traffic-export.csv';
      }

      // Download
      const blob = new Blob([content], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export:', err);
    }
  };

  if (allTraffic.length === 0) {
    return (
      <div className="flex-1 flex flex-col">
        <FilterBar
          domains={[]}
          methods={[]}
          providers={[]}
          onExport={() => {}}
          totalCount={0}
          filteredCount={0}
          hiddenCount={0}
          selectedCount={0}
          onHideSelected={() => {}}
          onClearSelected={() => {}}
          onSelectAll={() => {}}
          onDeselectAll={() => {}}
          hasSelection={false}
        />
        <div className="flex-1 flex items-center justify-center text-inspector-muted">
          <div className="text-center">
            <p className="text-4xl mb-4">📡</p>
            <p>No traffic captured yet</p>
            <p className="text-sm mt-2">Configure your agent to use the proxy at localhost:8080</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <FilterBar
        domains={domains}
        methods={methods}
        providers={providers}
        onExport={handleExport}
        totalCount={allTraffic.filter(f => !f.hidden).length}
        filteredCount={filteredTraffic.length}
        hiddenCount={hiddenCount}
        selectedCount={selectedFlowIds.size}
        onHideSelected={hideSelected}
        onClearSelected={clearSelected}
        onSelectAll={selectAll}
        onDeselectAll={deselectAll}
        hasSelection={selectedFlowIds.size > 0}
      />

      <div className="flex-1 min-h-0 overflow-y-auto">
        {filteredTraffic.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-inspector-muted">
            No traffic matches the current filters
          </div>
        ) : (
          filteredTraffic.map((flow) => (
            <TrafficRow
              key={flow.flow_id}
              flow={flow}
              isSelected={selectedTrafficId === flow.flow_id}
              isChecked={selectedFlowIds.has(flow.flow_id)}
              onToggleCheck={(e) => toggleSelection(flow.flow_id, e)}
              onClick={() => setSelectedTrafficId(flow.flow_id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
