/**
 * Message Filtering - strips noise content from messages via configurable patterns
 *
 * Loads filter patterns from a JSON config file and applies them to message content.
 * Supports both regex and literal string patterns.
 */

import { MessageFilterConfig } from './types';
import { persistence } from './persistence';

const DEFAULT_CONFIG: MessageFilterConfig = {
  enabled: true,
  filters: [
    {
      id: 'system-reminder',
      name: 'System Reminders',
      pattern: '<system-reminder>[\\s\\S]*?</system-reminder>',
      regex: true,
      enabled: true,
    },
  ],
  skipWhitespaceOnly: true,
};

let filterConfig: MessageFilterConfig | null = null;

/**
 * Load filter config from persistence (or use defaults)
 */
export async function loadFilterConfig(): Promise<MessageFilterConfig> {
  if (!filterConfig) {
    filterConfig = await persistence.loadConfigFile<MessageFilterConfig>(
      'messageFilters',
      DEFAULT_CONFIG
    );
  }
  return filterConfig;
}

/**
 * Get the current filter config (synchronous, returns cached or default)
 */
export function getFilterConfig(): MessageFilterConfig {
  return filterConfig || DEFAULT_CONFIG;
}

/**
 * Reload filter config from disk
 */
export async function reloadFilterConfig(): Promise<MessageFilterConfig> {
  filterConfig = null;
  return loadFilterConfig();
}

/**
 * Apply all enabled filters to content, stripping matched patterns
 */
export function applyMessageFilters(content: string): string {
  const config = getFilterConfig();
  if (!config.enabled) return content;

  let filtered = content;
  for (const filter of config.filters) {
    if (!filter.enabled) continue;

    if (filter.regex) {
      try {
        const regex = new RegExp(filter.pattern, 'gs');
        filtered = filtered.replace(regex, '');
      } catch (err) {
        console.error(`[MessageFilter] Invalid regex pattern in filter "${filter.name}":`, err);
      }
    } else {
      filtered = filtered.replaceAll(filter.pattern, '');
    }
  }

  return filtered;
}

/**
 * Check if content is whitespace-only (should be skipped)
 */
export function shouldSkipMessage(content: string): boolean {
  const config = getFilterConfig();
  if (!config.skipWhitespaceOnly) return false;
  return content.trim().length === 0;
}
