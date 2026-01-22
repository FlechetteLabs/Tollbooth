/**
 * Traffic list view - shows all captured traffic with filtering and export
 */

import { useState, useMemo } from 'react';
import { clsx } from 'clsx';
import { useAppStore } from '../../stores/appStore';
import { TrafficFlow } from '../../types';

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
  selectedDomain: string;
  selectedMethod: string;
  showLLMOnly: boolean;
  searchText: string;
  onDomainChange: (domain: string) => void;
  onMethodChange: (method: string) => void;
  onLLMOnlyChange: (value: boolean) => void;
  onSearchChange: (text: string) => void;
  onExport: (format: 'csv' | 'json') => void;
  totalCount: number;
  filteredCount: number;
}

function FilterBar({
  domains,
  methods,
  selectedDomain,
  selectedMethod,
  showLLMOnly,
  searchText,
  onDomainChange,
  onMethodChange,
  onLLMOnlyChange,
  onSearchChange,
  onExport,
  totalCount,
  filteredCount,
}: FilterBarProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);

  return (
    <div className="p-3 border-b border-inspector-border bg-inspector-surface space-y-2">
      {/* First row: Search and filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <input
          type="text"
          placeholder="Search URLs, headers, bodies..."
          value={searchText}
          onChange={(e) => onSearchChange(e.target.value)}
          className="px-3 py-1.5 bg-inspector-bg border border-inspector-border rounded text-sm focus:outline-none focus:border-inspector-accent flex-1 min-w-[200px] max-w-[300px]"
        />

        {/* Domain filter */}
        <select
          value={selectedDomain}
          onChange={(e) => onDomainChange(e.target.value)}
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
          value={selectedMethod}
          onChange={(e) => onMethodChange(e.target.value)}
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
            checked={showLLMOnly}
            onChange={(e) => onLLMOnlyChange(e.target.checked)}
            className="w-4 h-4 rounded border-inspector-border"
          />
          <span>LLM only</span>
        </label>

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

      {/* Second row: Count */}
      <div className="text-xs text-inspector-muted">
        {filteredCount === totalCount
          ? `${totalCount} requests`
          : `Showing ${filteredCount} of ${totalCount} requests`}
      </div>
    </div>
  );
}

interface TrafficRowProps {
  flow: TrafficFlow;
  isSelected: boolean;
  onClick: () => void;
}

function TrafficRow({ flow, isSelected, onClick }: TrafficRowProps) {
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
        isSelected
          ? 'bg-inspector-accent/20'
          : 'hover:bg-inspector-surface'
      )}
    >
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
  const { traffic, selectedTrafficId, setSelectedTrafficId } = useAppStore();

  // Filter state
  const [selectedDomain, setSelectedDomain] = useState('');
  const [selectedMethod, setSelectedMethod] = useState('');
  const [showLLMOnly, setShowLLMOnly] = useState(false);
  const [searchText, setSearchText] = useState('');

  // Get all traffic as array
  const allTraffic = useMemo(() => {
    return Array.from(traffic.values()).sort((a, b) => b.timestamp - a.timestamp);
  }, [traffic]);

  // Extract unique domains and methods for filter dropdowns
  const { domains, methods } = useMemo(() => {
    const domainSet = new Set<string>();
    const methodSet = new Set<string>();

    allTraffic.forEach((flow) => {
      domainSet.add(flow.request.host);
      methodSet.add(flow.request.method);
    });

    return {
      domains: Array.from(domainSet).sort(),
      methods: Array.from(methodSet).sort(),
    };
  }, [allTraffic]);

  // Full text search helper - searches URL, headers, and body
  const matchesSearch = (flow: TrafficFlow, search: string): boolean => {
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
  };

  // Filter traffic
  const filteredTraffic = useMemo(() => {
    return allTraffic.filter((flow) => {
      if (selectedDomain && flow.request.host !== selectedDomain) return false;
      if (selectedMethod && flow.request.method !== selectedMethod) return false;
      if (showLLMOnly && !flow.is_llm_api) return false;
      if (searchText && !matchesSearch(flow, searchText)) return false;
      return true;
    });
  }, [allTraffic, selectedDomain, selectedMethod, showLLMOnly, searchText]);

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
        const headers = ['timestamp', 'method', 'url', 'host', 'path', 'status_code', 'is_llm_api'];
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
          selectedDomain=""
          selectedMethod=""
          showLLMOnly={false}
          searchText=""
          onDomainChange={() => {}}
          onMethodChange={() => {}}
          onLLMOnlyChange={() => {}}
          onSearchChange={() => {}}
          onExport={() => {}}
          totalCount={0}
          filteredCount={0}
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
        selectedDomain={selectedDomain}
        selectedMethod={selectedMethod}
        showLLMOnly={showLLMOnly}
        searchText={searchText}
        onDomainChange={setSelectedDomain}
        onMethodChange={setSelectedMethod}
        onLLMOnlyChange={setShowLLMOnly}
        onSearchChange={setSearchText}
        onExport={handleExport}
        totalCount={allTraffic.length}
        filteredCount={filteredTraffic.length}
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
              onClick={() => setSelectedTrafficId(flow.flow_id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
