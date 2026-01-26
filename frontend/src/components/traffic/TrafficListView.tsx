/**
 * Traffic list view - shows all captured traffic with advanced filtering,
 * hide/clear functionality, and saved filter presets
 */

import { useState, useMemo, useCallback, useRef } from 'react';
import { clsx } from 'clsx';
import { useAppStore } from '../../stores/appStore';
import { useFilterStore } from '../../stores/filterStore';
import { TrafficFlow, LLMProvider } from '../../types';
import { evaluateAdvancedFilter } from '../../utils/trafficFilterEvaluator';
import { AdvancedFilterPanel } from './AdvancedFilterPanel';
import { FilterChips } from './FilterChips';
import { AnnotationPopover } from './AnnotationPopover';

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
  allTags: string[];
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
  showAdvancedPanel: boolean;
  onToggleAdvancedPanel: () => void;
}

function FilterBar({
  domains,
  methods,
  providers,
  allTags,
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
  showAdvancedPanel,
  onToggleAdvancedPanel,
}: FilterBarProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showSimpleAdvanced, setShowSimpleAdvanced] = useState(false);
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [showTagAutocomplete, setShowTagAutocomplete] = useState(false);
  const [tagFilter, setTagFilter] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const {
    activeFilters,
    setFilter,
    clearFilters,
    presets,
    savePreset,
    loadPreset,
    deletePreset,
    advancedMode,
    setAdvancedMode,
    advancedFilter,
  } = useFilterStore();

  // Filter tags for autocomplete
  const filteredTags = useMemo(() => {
    if (!tagFilter) return allTags.slice(0, 10);
    const filterLower = tagFilter.toLowerCase();
    return allTags
      .filter(tag => tag.toLowerCase().includes(filterLower))
      .slice(0, 10);
  }, [allTags, tagFilter]);

  // Handle search input change with tag detection
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFilter('searchText', value || undefined);

    // Check if user is typing a tag
    const cursorPos = e.target.selectionStart || value.length;
    const textBeforeCursor = value.substring(0, cursorPos);
    const hashMatch = textBeforeCursor.match(/#(!?)(\S*)$/);

    if (hashMatch) {
      setTagFilter(hashMatch[2]);
      setShowTagAutocomplete(true);
    } else {
      setShowTagAutocomplete(false);
    }
  };

  // Insert tag from autocomplete
  const insertTag = (tag: string) => {
    const value = activeFilters.searchText || '';
    const cursorPos = searchInputRef.current?.selectionStart || value.length;
    const textBeforeCursor = value.substring(0, cursorPos);
    const textAfterCursor = value.substring(cursorPos);

    // Find where the current tag input starts
    const hashMatch = textBeforeCursor.match(/#(!?)(\S*)$/);
    if (hashMatch) {
      const tagStart = cursorPos - hashMatch[0].length;
      const negatePrefix = hashMatch[1];
      const newValue = value.substring(0, tagStart) + `#${negatePrefix}${tag}` + textAfterCursor;
      setFilter('searchText', newValue || undefined);
    }

    setShowTagAutocomplete(false);
    searchInputRef.current?.focus();
  };

  const handleSavePreset = () => {
    if (newPresetName.trim()) {
      savePreset(newPresetName.trim());
      setNewPresetName('');
      setShowPresetMenu(false);
    }
  };

  const hasActiveSimpleFilters = activeFilters.domain ||
    activeFilters.method ||
    activeFilters.llmOnly ||
    activeFilters.searchText ||
    activeFilters.statusCode ||
    activeFilters.provider ||
    activeFilters.hasRefusal !== undefined ||
    activeFilters.isModified !== undefined;

  const hasActiveAdvancedFilters = advancedFilter.enabled && advancedFilter.groups.length > 0;

  const hasActiveFilters = advancedMode ? hasActiveAdvancedFilters : hasActiveSimpleFilters;

  return (
    <div className="p-3 border-b border-inspector-border bg-inspector-surface space-y-2">
      {/* First row: Search, basic filters, and action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search with tag autocomplete */}
        <div className="relative flex-1 min-w-[200px] max-w-[300px]">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search URLs, bodies, #tags..."
            value={activeFilters.searchText || ''}
            onChange={handleSearchChange}
            onBlur={() => setTimeout(() => setShowTagAutocomplete(false), 200)}
            onKeyDown={(e) => {
              if (showTagAutocomplete && filteredTags.length > 0) {
                if (e.key === 'Tab' || e.key === 'Enter') {
                  e.preventDefault();
                  insertTag(filteredTags[0]);
                } else if (e.key === 'Escape') {
                  setShowTagAutocomplete(false);
                }
              }
            }}
            className="w-full px-3 py-1.5 bg-inspector-bg border border-inspector-border rounded text-sm focus:outline-none focus:border-inspector-accent"
          />
          {/* Tag autocomplete dropdown */}
          {showTagAutocomplete && filteredTags.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-inspector-surface border border-inspector-border rounded shadow-lg z-20 max-h-48 overflow-y-auto">
              {filteredTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => insertTag(tag)}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-inspector-bg flex items-center gap-2"
                >
                  <span className="text-inspector-accent">#</span>
                  <span>{tag}</span>
                </button>
              ))}
              {allTags.length > filteredTags.length && (
                <div className="px-3 py-1 text-xs text-inspector-muted border-t border-inspector-border">
                  {allTags.length - filteredTags.length} more tags...
                </div>
              )}
            </div>
          )}
        </div>

        {/* Simple filters - only when not in advanced mode */}
        {!advancedMode && (
          <>
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

            {/* Simple advanced filters toggle */}
            <button
              onClick={() => setShowSimpleAdvanced(!showSimpleAdvanced)}
              className={clsx(
                'px-2 py-1.5 text-sm rounded transition-colors flex items-center gap-1',
                showSimpleAdvanced
                  ? 'bg-inspector-accent text-white'
                  : 'bg-inspector-bg border border-inspector-border hover:bg-inspector-border'
              )}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              More
            </button>
          </>
        )}

        {/* Advanced mode toggle */}
        <button
          onClick={() => {
            setAdvancedMode(!advancedMode);
            if (!advancedMode) {
              onToggleAdvancedPanel();
            }
          }}
          className={clsx(
            'px-2 py-1.5 text-sm rounded transition-colors flex items-center gap-1',
            advancedMode
              ? 'bg-purple-500 text-white'
              : 'bg-inspector-bg border border-inspector-border hover:bg-inspector-border'
          )}
          title={advancedMode ? 'Switch to simple filters' : 'Switch to advanced filters'}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          {advancedMode ? 'Advanced' : 'Advanced'}
        </button>

        {/* Show/hide advanced panel (only when in advanced mode) */}
        {advancedMode && (
          <button
            onClick={onToggleAdvancedPanel}
            className={clsx(
              'px-2 py-1.5 text-sm rounded transition-colors',
              showAdvancedPanel
                ? 'bg-inspector-accent text-white'
                : 'bg-inspector-bg border border-inspector-border hover:bg-inspector-border'
            )}
            title={showAdvancedPanel ? 'Hide filter panel' : 'Show filter panel'}
          >
            {showAdvancedPanel ? 'Hide Panel' : 'Edit Filters'}
          </button>
        )}

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
                        className="flex-1 text-left text-sm truncate flex items-center gap-2"
                      >
                        <span className="truncate">{preset.name}</span>
                        {preset.isAdvanced && (
                          <span className="px-1 py-0.5 text-xs bg-purple-500/20 text-purple-400 rounded shrink-0">
                            Adv
                          </span>
                        )}
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

      {/* Simple advanced filters row (when not in advanced mode) */}
      {!advancedMode && showSimpleAdvanced && (
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

      {/* Show hidden toggle for advanced mode */}
      {advancedMode && (
        <div className="flex items-center gap-2 pt-2 border-t border-inspector-border/50">
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

      {/* Tags with annotation popover */}
      {flow.tags && flow.tags.length > 0 && flow.annotation && (
        <AnnotationPopover annotation={flow.annotation}>
          <div className="flex items-center gap-1 shrink-0 cursor-pointer">
            {flow.tags.slice(0, 2).map((tag, i) => (
              <span
                key={i}
                className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs max-w-[80px] truncate"
              >
                {tag}
              </span>
            ))}
            {flow.tags.length > 2 && (
              <span className="text-xs text-inspector-muted">
                +{flow.tags.length - 2}
              </span>
            )}
          </div>
        </AnnotationPopover>
      )}

      {/* Tags without annotation (shouldn't happen normally but handle gracefully) */}
      {flow.tags && flow.tags.length > 0 && !flow.annotation && (
        <div className="flex items-center gap-1 shrink-0">
          {flow.tags.slice(0, 2).map((tag, i) => (
            <span
              key={i}
              className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs max-w-[80px] truncate"
            >
              {tag}
            </span>
          ))}
          {flow.tags.length > 2 && (
            <span className="text-xs text-inspector-muted">
              +{flow.tags.length - 2}
            </span>
          )}
        </div>
      )}

      {/* Annotation indicator (no tags but has annotation) */}
      {flow.annotation && (!flow.tags || flow.tags.length === 0) && (
        <AnnotationPopover annotation={flow.annotation}>
          <span className="shrink-0 text-blue-400 cursor-pointer">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
          </span>
        </AnnotationPopover>
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
  const { activeFilters, advancedFilter, advancedMode } = useFilterStore();

  // Selection state for bulk operations
  const [selectedFlowIds, setSelectedFlowIds] = useState<Set<string>>(new Set());

  // Advanced panel visibility
  const [showAdvancedPanel, setShowAdvancedPanel] = useState(false);

  // Get all traffic as array
  const allTraffic = useMemo(() => {
    return Array.from(traffic.values()).sort((a, b) => b.timestamp - a.timestamp);
  }, [traffic]);

  // Count hidden traffic
  const hiddenCount = useMemo(() => {
    return allTraffic.filter(f => f.hidden).length;
  }, [allTraffic]);

  // Extract unique domains, methods, providers, and tags for filter dropdowns
  const { domains, methods, providers, allTags } = useMemo(() => {
    const domainSet = new Set<string>();
    const methodSet = new Set<string>();
    const providerSet = new Set<LLMProvider>();
    const tagSet = new Set<string>();

    allTraffic.forEach((flow) => {
      domainSet.add(flow.request.host);
      methodSet.add(flow.request.method);
      if (flow.parsed?.provider) {
        providerSet.add(flow.parsed.provider);
      }
      // Collect tags
      if (flow.tags) {
        for (const tag of flow.tags) {
          tagSet.add(tag);
          // Also add parent tags for hierarchical tags
          const parts = tag.split(':');
          let current = '';
          for (const part of parts) {
            current = current ? `${current}:${part}` : part;
            tagSet.add(current);
          }
        }
      }
    });

    return {
      domains: Array.from(domainSet).sort(),
      methods: Array.from(methodSet).sort(),
      providers: Array.from(providerSet).sort(),
      allTags: Array.from(tagSet).sort(),
    };
  }, [allTraffic]);

  // Parse search text for #tag syntax
  // Returns { textSearch: string, tags: { tag: string, negate: boolean }[] }
  const parseSearchText = useCallback((search: string) => {
    const tagRegex = /#(!?)(\S+)/g;
    const tags: { tag: string; negate: boolean }[] = [];
    let textSearch = search;

    let match;
    while ((match = tagRegex.exec(search)) !== null) {
      tags.push({
        tag: match[2].toLowerCase(),
        negate: match[1] === '!',
      });
    }

    // Remove tag patterns from text search
    textSearch = search.replace(tagRegex, '').trim();

    return { textSearch, tags };
  }, []);

  // Check if a flow matches a tag (with prefix matching)
  const flowMatchesTag = useCallback((flow: TrafficFlow, tag: string): boolean => {
    if (!flow.tags || flow.tags.length === 0) return false;
    const tagLower = tag.toLowerCase();
    return flow.tags.some(t => {
      const tLower = t.toLowerCase();
      // Exact match or prefix match (e.g., "refusal" matches "refusal:soft")
      return tLower === tagLower || tLower.startsWith(tagLower + ':');
    });
  }, []);

  // Full text search helper - searches URL, headers, and body
  const matchesTextSearch = useCallback((flow: TrafficFlow, search: string): boolean => {
    if (!search) return true;
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

  // Combined search helper - handles both text search and #tag syntax
  const matchesSearch = useCallback((flow: TrafficFlow, search: string): boolean => {
    const { textSearch, tags } = parseSearchText(search);

    // Check text search
    if (textSearch && !matchesTextSearch(flow, textSearch)) return false;

    // Check all tags (AND logic)
    for (const { tag, negate } of tags) {
      const matches = flowMatchesTag(flow, tag);
      if (negate) {
        // #!tag - must NOT have this tag
        if (matches) return false;
      } else {
        // #tag - must have this tag
        if (!matches) return false;
      }
    }

    return true;
  }, [parseSearchText, matchesTextSearch, flowMatchesTag]);

  // Filter traffic
  const filteredTraffic = useMemo(() => {
    return allTraffic.filter((flow) => {
      // Hidden filter - always check
      if (!activeFilters.showHidden && flow.hidden) return false;

      // Search text - always applied
      if (activeFilters.searchText && !matchesSearch(flow, activeFilters.searchText)) return false;

      // Use advanced filter when in advanced mode
      if (advancedMode && advancedFilter.enabled) {
        return evaluateAdvancedFilter(flow, advancedFilter);
      }

      // Simple filters when not in advanced mode
      if (activeFilters.domain && flow.request.host !== activeFilters.domain) return false;
      if (activeFilters.method && flow.request.method !== activeFilters.method) return false;
      if (activeFilters.llmOnly && !flow.is_llm_api) return false;

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
  }, [allTraffic, activeFilters, advancedFilter, advancedMode, matchesSearch]);

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
          allTags={[]}
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
          showAdvancedPanel={showAdvancedPanel}
          onToggleAdvancedPanel={() => setShowAdvancedPanel(!showAdvancedPanel)}
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
        allTags={allTags}
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
        showAdvancedPanel={showAdvancedPanel}
        onToggleAdvancedPanel={() => setShowAdvancedPanel(!showAdvancedPanel)}
      />

      {/* Filter chips for advanced mode */}
      <FilterChips />

      {/* Advanced filter panel */}
      {advancedMode && showAdvancedPanel && (
        <div className="p-3 border-b border-inspector-border bg-inspector-bg">
          <AdvancedFilterPanel onClose={() => setShowAdvancedPanel(false)} />
        </div>
      )}

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
