/**
 * Rules Engine - matches traffic against rules and determines actions
 */

import { promises as fs } from 'fs';
import { EventEmitter } from 'events';
import {
  Rule,
  RuleDirection,
  RuleFilter,
  RuleMatch,
  RuleActionType,
  MatchType,
  TrafficFlow,
  StaticModification,
  HeaderModification,
} from './types';

export class RulesEngine extends EventEmitter {
  private rules: Rule[] = [];
  private rulesFilePath: string;
  private loaded = false;

  constructor(filePath: string = './datastore/rules.json') {
    super();
    this.rulesFilePath = filePath;
  }

  /**
   * Load rules from file
   */
  async loadRules(): Promise<void> {
    try {
      const content = await fs.readFile(this.rulesFilePath, 'utf-8');
      this.rules = JSON.parse(content);
      this.sortByPriority();
      this.loaded = true;
      console.log(`Loaded ${this.rules.length} rules from ${this.rulesFilePath}`);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        // File doesn't exist yet, start with empty rules
        this.rules = [];
        this.loaded = true;
        console.log('No rules file found, starting with empty rules');
      } else {
        throw err;
      }
    }
  }

  /**
   * Save rules to file
   */
  async saveRules(): Promise<void> {
    const content = JSON.stringify(this.rules, null, 2);
    await fs.writeFile(this.rulesFilePath, content, 'utf-8');
    this.emit('rules_changed', this.rules);
  }

  /**
   * Add a new rule
   */
  addRule(rule: Rule): void {
    // Ensure unique ID
    if (this.rules.some(r => r.id === rule.id)) {
      throw new Error(`Rule with ID ${rule.id} already exists`);
    }
    this.rules.push(rule);
    this.sortByPriority();
  }

  /**
   * Update an existing rule
   */
  updateRule(id: string, updates: Partial<Rule>): void {
    const index = this.rules.findIndex(r => r.id === id);
    if (index === -1) {
      throw new Error(`Rule with ID ${id} not found`);
    }
    this.rules[index] = { ...this.rules[index], ...updates, id }; // Preserve ID
    this.sortByPriority();
  }

  /**
   * Delete a rule
   */
  deleteRule(id: string): boolean {
    const index = this.rules.findIndex(r => r.id === id);
    if (index === -1) {
      return false;
    }
    this.rules.splice(index, 1);
    return true;
  }

  /**
   * Reorder rules by providing ordered IDs
   */
  reorderRules(orderedIds: string[]): void {
    const ruleMap = new Map(this.rules.map(r => [r.id, r]));
    const newRules: Rule[] = [];

    for (let i = 0; i < orderedIds.length; i++) {
      const rule = ruleMap.get(orderedIds[i]);
      if (rule) {
        rule.priority = i;
        newRules.push(rule);
        ruleMap.delete(orderedIds[i]);
      }
    }

    // Add any rules not in the ordered list at the end
    for (const rule of ruleMap.values()) {
      rule.priority = newRules.length;
      newRules.push(rule);
    }

    this.rules = newRules;
  }

  /**
   * Get all rules, optionally filtered by direction
   */
  getRules(direction?: RuleDirection): Rule[] {
    if (direction) {
      return this.rules.filter(r => r.direction === direction);
    }
    return [...this.rules];
  }

  /**
   * Get a single rule by ID
   */
  getRule(id: string): Rule | null {
    return this.rules.find(r => r.id === id) || null;
  }

  /**
   * Evaluate request against rules
   * Returns the first matching rule's action
   */
  evaluateRequest(flow: TrafficFlow): RuleMatch | null {
    return this.evaluate(flow, 'request');
  }

  /**
   * Evaluate response against rules
   * Returns the first matching rule's action
   */
  evaluateResponse(flow: TrafficFlow): RuleMatch | null {
    return this.evaluate(flow, 'response');
  }

  /**
   * Interpolate dynamic variables in a string
   * Supported variables:
   * - {{timestamp}} - Current Unix timestamp in milliseconds
   * - {{timestamp_iso}} - Current ISO 8601 timestamp
   * - {{uuid}} - Random UUID v4
   * - {{random_int:min:max}} - Random integer in range [min, max]
   * - {{request.method}} - Request method
   * - {{request.host}} - Request host
   * - {{request.path}} - Request path
   * - {{request.header:name}} - Specific request header value
   * - {{env:VAR_NAME}} - Environment variable
   */
  interpolateVariables(text: string, flow?: TrafficFlow): string {
    return text.replace(/\{\{([^}]+)\}\}/g, (match, variable: string) => {
      const trimmed = variable.trim();

      // Timestamp (Unix ms)
      if (trimmed === 'timestamp') {
        return String(Date.now());
      }

      // Timestamp ISO
      if (trimmed === 'timestamp_iso') {
        return new Date().toISOString();
      }

      // UUID v4
      if (trimmed === 'uuid') {
        return this.generateUUID();
      }

      // Random integer: {{random_int:min:max}}
      if (trimmed.startsWith('random_int:')) {
        const parts = trimmed.split(':');
        if (parts.length === 3) {
          const min = parseInt(parts[1], 10);
          const max = parseInt(parts[2], 10);
          if (!isNaN(min) && !isNaN(max) && min <= max) {
            return String(Math.floor(Math.random() * (max - min + 1)) + min);
          }
        }
        return match; // Invalid format, leave as-is
      }

      // Request properties
      if (trimmed.startsWith('request.') && flow) {
        const prop = trimmed.substring(8); // Remove 'request.'

        if (prop === 'method') {
          return flow.request.method;
        }
        if (prop === 'host') {
          return flow.request.host;
        }
        if (prop === 'path') {
          return flow.request.path;
        }
        if (prop === 'url') {
          return flow.request.url;
        }

        // Request header: {{request.header:name}}
        if (prop.startsWith('header:')) {
          const headerName = prop.substring(7);
          const headerValue = flow.request.headers[headerName] ||
                              flow.request.headers[headerName.toLowerCase()];
          return headerValue || '';
        }
      }

      // Environment variable: {{env:VAR_NAME}}
      if (trimmed.startsWith('env:')) {
        const envName = trimmed.substring(4);
        return process.env[envName] || '';
      }

      // Unknown variable, leave as-is
      return match;
    });
  }

  /**
   * Generate a UUID v4
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Apply static modification to content
   * @param content - The original content
   * @param mod - The modification to apply
   * @param flow - Optional flow context for variable interpolation
   */
  applyStaticModification(content: string, mod: StaticModification, flow?: TrafficFlow): string {
    let result = content;

    // Full body replacement takes precedence
    if (mod.replace_body !== undefined) {
      // Interpolate variables in the replacement body
      return this.interpolateVariables(mod.replace_body, flow);
    }

    // Apply find/replace operations
    if (mod.find_replace) {
      for (const fr of mod.find_replace) {
        // Default to replace_all=true if not specified
        const replaceAll = fr.replace_all !== false;
        // Interpolate variables in the replacement string
        const replacement = this.interpolateVariables(fr.replace, flow);

        if (fr.regex) {
          try {
            // For regex, 'g' flag controls global replacement
            const flags = replaceAll ? 'g' : '';
            const regex = new RegExp(fr.find, flags);
            result = result.replace(regex, replacement);
          } catch (err) {
            console.error(`Invalid regex in find/replace: ${fr.find}`, err);
          }
        } else {
          if (replaceAll) {
            // Replace all instances
            result = result.split(fr.find).join(replacement);
          } else {
            // Replace first instance only
            result = result.replace(fr.find, replacement);
          }
        }
      }
    }

    return result;
  }

  /**
   * Apply header modifications to headers object
   * Returns a new headers object with modifications applied
   * @param headers - Original headers object
   * @param modifications - Array of modifications to apply
   * @param flow - Optional flow context for variable interpolation
   */
  applyHeaderModifications(
    headers: Record<string, string>,
    modifications: HeaderModification[],
    flow?: TrafficFlow
  ): Record<string, string> {
    const result = { ...headers };

    for (const mod of modifications) {
      const key = mod.key;

      switch (mod.type) {
        case 'set':
          // Set or overwrite header - interpolate variables in value
          if (mod.value !== undefined) {
            result[key] = this.interpolateVariables(mod.value, flow);
          }
          break;

        case 'remove':
          // Remove header (try both exact case and lowercase)
          delete result[key];
          // Also try lowercase version
          const lowerKey = key.toLowerCase();
          for (const k of Object.keys(result)) {
            if (k.toLowerCase() === lowerKey) {
              delete result[k];
            }
          }
          break;

        case 'find_replace':
          // Find and replace within header value
          if (mod.find) {
            // Find the header (case-insensitive key matching)
            let targetKey = key;
            for (const k of Object.keys(result)) {
              if (k.toLowerCase() === key.toLowerCase()) {
                targetKey = k;
                break;
              }
            }

            if (result[targetKey]) {
              const currentValue = result[targetKey];
              // Interpolate variables in the replacement value
              const replacement = this.interpolateVariables(mod.value || '', flow);

              if (mod.regex) {
                try {
                  const regex = new RegExp(mod.find, 'g');
                  result[targetKey] = currentValue.replace(regex, replacement);
                } catch (err) {
                  console.error(`Invalid regex in header find/replace: ${mod.find}`, err);
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

  /**
   * Generate a unique rule ID
   */
  generateId(): string {
    return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // ============ Private Methods ============

  private evaluate(flow: TrafficFlow, direction: RuleDirection): RuleMatch | null {
    // Only evaluate enabled rules with matching direction
    const applicableRules = this.rules.filter(
      r => r.enabled && r.direction === direction
    );

    for (const rule of applicableRules) {
      if (this.matchesFilter(flow, rule.filter)) {
        return {
          rule,
          action: rule.action.type,
          store_key: rule.action.store_key,
        };
      }
    }

    return null;
  }

  private matchesFilter(flow: TrafficFlow, filter: RuleFilter): boolean {
    const { request, response } = flow;

    // ============ Request-based filters ============

    // Check host filter
    if (filter.host) {
      if (!this.matchValue(request.host, filter.host.match, filter.host.value)) {
        return false;
      }
    }

    // Check path filter
    if (filter.path) {
      if (!this.matchValue(request.path, filter.path.match, filter.path.value)) {
        return false;
      }
    }

    // Check method filter
    if (filter.method) {
      if (!this.matchValue(request.method, filter.method.match, filter.method.value)) {
        return false;
      }
    }

    // Check header filter
    if (filter.header) {
      const headerValue = request.headers[filter.header.key] ||
                         request.headers[filter.header.key.toLowerCase()];
      if (!headerValue || !this.matchValue(headerValue, filter.header.match, filter.header.value)) {
        return false;
      }
    }

    // Check is_llm_api filter
    if (filter.is_llm_api !== undefined) {
      if (flow.is_llm_api !== filter.is_llm_api) {
        return false;
      }
    }

    // ============ Response-based filters ============
    // These only apply if we have a response

    // Check status code filter
    if (filter.status_code) {
      if (!response) return false;  // Can't match without response
      if (!this.matchStatusCode(response.status_code, filter.status_code)) {
        return false;
      }
    }

    // Check response body contains filter
    if (filter.response_body_contains) {
      if (!response || !response.content) return false;
      const body = response.content;
      const searchValue = filter.response_body_contains.value;

      if (filter.response_body_contains.regex) {
        try {
          const regex = new RegExp(searchValue);
          if (!regex.test(body)) return false;
        } catch {
          return false;  // Invalid regex
        }
      } else {
        if (!body.includes(searchValue)) return false;
      }
    }

    // Check response header filter
    if (filter.response_header) {
      if (!response) return false;
      const headerValue = response.headers[filter.response_header.key] ||
                         response.headers[filter.response_header.key.toLowerCase()];
      if (!headerValue || !this.matchValue(headerValue, filter.response_header.match, filter.response_header.value)) {
        return false;
      }
    }

    // Check response size filter
    if (filter.response_size) {
      if (!response || !response.content) return false;
      const size = response.content.length;
      const { operator, bytes } = filter.response_size;

      switch (operator) {
        case 'gt':
          if (!(size > bytes)) return false;
          break;
        case 'lt':
          if (!(size < bytes)) return false;
          break;
        case 'gte':
          if (!(size >= bytes)) return false;
          break;
        case 'lte':
          if (!(size <= bytes)) return false;
          break;
      }
    }

    return true;
  }

  /**
   * Match status code against a status code condition
   */
  private matchStatusCode(statusCode: number, condition: { match: string; value: string }): boolean {
    const { match, value } = condition;

    switch (match) {
      case 'exact':
        return statusCode === parseInt(value, 10);

      case 'range': {
        // Support formats: ">=400", "<=299", ">500", "<400", "4xx", "5xx"
        const trimmed = value.trim();

        // Pattern match like "4xx", "5xx"
        if (/^[1-5]xx$/i.test(trimmed)) {
          const prefix = parseInt(trimmed[0], 10);
          return Math.floor(statusCode / 100) === prefix;
        }

        // Operator patterns: ">=400", "<=299", ">500", "<400"
        const operatorMatch = trimmed.match(/^(>=?|<=?)(\d+)$/);
        if (operatorMatch) {
          const [, op, numStr] = operatorMatch;
          const num = parseInt(numStr, 10);
          switch (op) {
            case '>=': return statusCode >= num;
            case '>': return statusCode > num;
            case '<=': return statusCode <= num;
            case '<': return statusCode < num;
          }
        }

        // Range pattern: "400-499"
        const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
        if (rangeMatch) {
          const [, minStr, maxStr] = rangeMatch;
          const min = parseInt(minStr, 10);
          const max = parseInt(maxStr, 10);
          return statusCode >= min && statusCode <= max;
        }

        return false;
      }

      case 'list': {
        // Comma-separated list: "500,502,503"
        const codes = value.split(',').map(s => parseInt(s.trim(), 10));
        return codes.includes(statusCode);
      }

      default:
        return false;
    }
  }

  private matchValue(actual: string, matchType: MatchType, expected: string): boolean {
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

  private sortByPriority(): void {
    this.rules.sort((a, b) => a.priority - b.priority);
  }
}

// Singleton instance
const rulesFilePath = process.env.RULES_FILE_PATH || './datastore/rules.json';
export const rulesEngine = new RulesEngine(rulesFilePath);

// Load rules on module initialization
rulesEngine.loadRules().catch(err => {
  console.error('Failed to load rules:', err);
});
