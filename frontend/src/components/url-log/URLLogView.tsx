/**
 * URL Log view - shows all traffic URLs with filtering and export
 */

import { useState, useEffect, useMemo } from 'react';
import { clsx } from 'clsx';
import { URLLogEntry } from '../../types';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:2000';

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
}: FilterBarProps) {
  return (
    <div className="p-4 border-b border-inspector-border flex flex-wrap items-center gap-3">
      {/* Search */}
      <input
        type="text"
        placeholder="Search URLs..."
        value={searchText}
        onChange={(e) => onSearchChange(e.target.value)}
        className="px-3 py-2 bg-inspector-bg border border-inspector-border rounded-lg text-sm focus:outline-none focus:border-inspector-accent w-64"
      />

      {/* Domain filter */}
      <select
        value={selectedDomain}
        onChange={(e) => onDomainChange(e.target.value)}
        className="px-3 py-2 bg-inspector-bg border border-inspector-border rounded-lg text-sm focus:outline-none focus:border-inspector-accent"
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
        className="px-3 py-2 bg-inspector-bg border border-inspector-border rounded-lg text-sm focus:outline-none focus:border-inspector-accent"
      >
        <option value="">All methods</option>
        {methods.map((method) => (
          <option key={method} value={method}>
            {method}
          </option>
        ))}
      </select>

      {/* LLM only toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={showLLMOnly}
          onChange={(e) => onLLMOnlyChange(e.target.checked)}
          className="w-4 h-4 rounded border-inspector-border"
        />
        <span className="text-sm">LLM only</span>
      </label>

      {/* Export buttons */}
      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={() => onExport('csv')}
          className="px-3 py-2 bg-inspector-surface text-sm rounded-lg hover:bg-inspector-border transition-colors"
        >
          Export CSV
        </button>
        <button
          onClick={() => onExport('json')}
          className="px-3 py-2 bg-inspector-surface text-sm rounded-lg hover:bg-inspector-border transition-colors"
        >
          Export JSON
        </button>
      </div>
    </div>
  );
}

export function URLLogView() {
  const [urls, setUrls] = useState<URLLogEntry[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [methods, setMethods] = useState<string[]>([]);
  const [selectedDomain, setSelectedDomain] = useState('');
  const [selectedMethod, setSelectedMethod] = useState('');
  const [showLLMOnly, setShowLLMOnly] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);

  // Fetch URLs and filter options
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [urlsRes, filtersRes] = await Promise.all([
          fetch(`${API_URL}/api/urls`),
          fetch(`${API_URL}/api/urls/filters`),
        ]);
        const urlsData = await urlsRes.json();
        const filtersData = await filtersRes.json();

        setUrls(urlsData.urls || []);
        setDomains(filtersData.domains || []);
        setMethods(filtersData.methods || []);
      } catch (err) {
        console.error('Failed to fetch URL log:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // Refresh every 5 seconds
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  // Filter URLs
  const filteredUrls = useMemo(() => {
    return urls.filter((entry) => {
      if (selectedDomain && entry.host !== selectedDomain) return false;
      if (selectedMethod && entry.method !== selectedMethod) return false;
      if (showLLMOnly && !entry.is_llm_api) return false;
      if (searchText && !entry.url.toLowerCase().includes(searchText.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [urls, selectedDomain, selectedMethod, showLLMOnly, searchText]);

  // Export function
  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const response = await fetch(`${API_URL}/api/urls/export?format=${format}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `url-log.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-inspector-muted">
        <p>Loading URL log...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
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
      />

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full table-fixed">
          <thead className="bg-inspector-surface sticky top-0">
            <tr className="text-left text-sm text-inspector-muted">
              <th className="px-4 py-3 font-medium w-24">Time</th>
              <th className="px-4 py-3 font-medium w-20">Method</th>
              <th className="px-4 py-3 font-medium">URL</th>
              <th className="px-4 py-3 font-medium w-20">Status</th>
              <th className="px-4 py-3 font-medium w-16">Type</th>
            </tr>
          </thead>
          <tbody>
            {filteredUrls.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-inspector-muted">
                  {urls.length === 0
                    ? 'No URLs logged yet'
                    : 'No URLs match the current filters'}
                </td>
              </tr>
            ) : (
              filteredUrls.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-inspector-border hover:bg-inspector-surface transition-colors"
                >
                  <td className="px-4 py-3 text-sm text-inspector-muted whitespace-nowrap">
                    {formatTime(entry.timestamp)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={clsx(
                        'px-2 py-0.5 rounded text-xs font-bold text-white',
                        getMethodColor(entry.method)
                      )}
                    >
                      {entry.method}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm">
                    <div className="truncate" title={entry.url}>
                      <span className="text-inspector-text">{entry.host}</span>
                      <span className="text-inspector-muted">{entry.path}</span>
                    </div>
                  </td>
                  <td
                    className={clsx(
                      'px-4 py-3 text-sm font-mono',
                      getStatusColor(entry.status_code)
                    )}
                  >
                    {entry.status_code || '-'}
                  </td>
                  <td className="px-4 py-3">
                    {entry.is_llm_api && (
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-purple-600 text-white">
                        LLM
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer with count */}
      <div className="px-4 py-2 border-t border-inspector-border text-sm text-inspector-muted">
        Showing {filteredUrls.length} of {urls.length} URLs
      </div>
    </div>
  );
}
