/**
 * URL Log manager - indexes and filters all traffic URLs
 */

import { v4 as uuidv4 } from 'uuid';
import { URLLogEntry, URLLogFilter, TrafficFlow } from './types';
import { storage } from './storage';

/**
 * Add a traffic flow to the URL log
 */
export function addToURLLog(flow: TrafficFlow): URLLogEntry {
  const entry: URLLogEntry = {
    id: uuidv4(),
    timestamp: flow.timestamp,
    method: flow.request.method,
    url: flow.request.url,
    host: flow.request.host,
    path: flow.request.path,
    status_code: flow.response?.status_code,
    content_type: flow.response?.headers?.['content-type'],
    is_llm_api: flow.is_llm_api,
    flow_id: flow.flow_id,
  };

  storage.addURLLogEntry(entry);
  return entry;
}

/**
 * Update URL log entry with response data
 */
export function updateURLLogEntry(flowId: string, flow: TrafficFlow): void {
  // Since we're using in-memory array, we need to find and update
  // For now, the response info gets added when we create a new entry after response
  // This is a simplified approach - full implementation would update existing entries
}

/**
 * Get filtered URL log entries
 */
export function getURLLog(filter?: URLLogFilter): URLLogEntry[] {
  if (!filter) {
    return storage.getURLLog();
  }
  return storage.getURLLogFiltered(filter);
}

/**
 * Export URL log to CSV format
 */
export function exportToCSV(entries: URLLogEntry[]): string {
  const headers = [
    'timestamp',
    'method',
    'url',
    'host',
    'path',
    'status_code',
    'content_type',
    'is_llm_api',
  ];

  const rows = entries.map(entry => [
    new Date(entry.timestamp * 1000).toISOString(),
    entry.method,
    `"${entry.url.replace(/"/g, '""')}"`,
    entry.host,
    entry.path,
    entry.status_code ?? '',
    entry.content_type ?? '',
    entry.is_llm_api,
  ].join(','));

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Export URL log to JSON format
 */
export function exportToJSON(entries: URLLogEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

/**
 * Get unique domains from URL log
 */
export function getUniqueDomains(): string[] {
  const entries = storage.getURLLog();
  const domains = new Set<string>();
  for (const entry of entries) {
    domains.add(entry.host);
  }
  return Array.from(domains).sort();
}

/**
 * Get unique HTTP methods from URL log
 */
export function getUniqueMethods(): string[] {
  const entries = storage.getURLLog();
  const methods = new Set<string>();
  for (const entry of entries) {
    methods.add(entry.method);
  }
  return Array.from(methods).sort();
}

/**
 * Get unique status codes from URL log
 */
export function getUniqueStatusCodes(): number[] {
  const entries = storage.getURLLog();
  const codes = new Set<number>();
  for (const entry of entries) {
    if (entry.status_code !== undefined) {
      codes.add(entry.status_code);
    }
  }
  return Array.from(codes).sort((a, b) => a - b);
}
