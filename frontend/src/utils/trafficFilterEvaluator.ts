/**
 * Traffic Filter Evaluator - client-side evaluation of advanced filters
 * Ports backend logic from rules.ts for consistent filtering behavior
 */

import {
  TrafficFlow,
  AdvancedTrafficFilter,
  TrafficFilterGroup,
  TrafficFilterCondition,
  MatchType,
  StatusCodeMatch,
} from '../types';

/**
 * Evaluate an advanced filter against a traffic flow
 */
export function evaluateAdvancedFilter(
  flow: TrafficFlow,
  filter: AdvancedTrafficFilter
): boolean {
  if (!filter.enabled || filter.groups.length === 0) {
    return true;
  }

  const groupResults = filter.groups.map((g) => evaluateGroup(flow, g));

  return filter.operator === 'AND'
    ? groupResults.every((r) => r)
    : groupResults.some((r) => r);
}

/**
 * Evaluate a filter group against a traffic flow
 */
function evaluateGroup(flow: TrafficFlow, group: TrafficFilterGroup): boolean {
  if (group.conditions.length === 0) {
    return true;
  }

  const results = group.conditions.map((c) => evaluateCondition(flow, c));

  return group.operator === 'AND'
    ? results.every((r) => r)
    : results.some((r) => r);
}

/**
 * Evaluate a single condition against a traffic flow
 */
function evaluateCondition(
  flow: TrafficFlow,
  cond: TrafficFilterCondition
): boolean {
  let result = false;

  switch (cond.scope) {
    case 'request':
      result = evaluateOnRequest(flow, cond);
      break;
    case 'response':
      result = evaluateOnResponse(flow, cond);
      break;
    case 'either':
      result = evaluateOnRequest(flow, cond) || evaluateOnResponse(flow, cond);
      break;
  }

  return cond.negate ? !result : result;
}

/**
 * Evaluate a condition against request data
 */
function evaluateOnRequest(
  flow: TrafficFlow,
  cond: TrafficFilterCondition
): boolean {
  const { request } = flow;

  switch (cond.field) {
    case 'host':
      return matchValue(request.host, cond.match || 'contains', cond.value || '');

    case 'path':
      return matchValue(request.path, cond.match || 'contains', cond.value || '');

    case 'method':
      return matchValue(request.method, cond.match || 'exact', cond.value || '');

    case 'header':
      if (cond.key) {
        const headerValue =
          request.headers[cond.key] ||
          request.headers[cond.key.toLowerCase()] ||
          '';
        return matchValue(headerValue, cond.match || 'contains', cond.value || '');
      }
      return false;

    case 'request_body_contains':
      if (request.content) {
        if (cond.match === 'regex') {
          try {
            const regex = new RegExp(cond.value || '');
            return regex.test(request.content);
          } catch {
            return false;
          }
        } else {
          return request.content.includes(cond.value || '');
        }
      }
      return false;

    case 'request_body_size':
      if (request.content) {
        const size = request.content.length;
        const bytes = cond.sizeBytes || 0;
        return evaluateSizeCondition(size, cond.sizeOperator || 'gt', bytes);
      }
      return false;

    case 'is_llm_api':
      return flow.is_llm_api === (cond.boolValue ?? true);

    case 'has_refusal':
      return (flow.refusal?.detected ?? false) === (cond.boolValue ?? true);

    case 'is_modified':
      const isModified = flow.request_modified || flow.response_modified || false;
      return isModified === (cond.boolValue ?? true);

    case 'has_any_tag':
      const hasAnyTag = flow.tags && flow.tags.length > 0;
      return hasAnyTag === (cond.boolValue ?? true);

    case 'has_tag':
      return matchTag(flow.tags, cond.match || 'contains', cond.value || '');

    default:
      return false;
  }
}

/**
 * Evaluate a condition against response data
 */
function evaluateOnResponse(
  flow: TrafficFlow,
  cond: TrafficFilterCondition
): boolean {
  const { response } = flow;

  // Many response conditions require response to exist
  if (!response && ['status_code', 'response_body_contains', 'response_size', 'header'].includes(cond.field)) {
    return false;
  }

  switch (cond.field) {
    case 'status_code':
      if (response) {
        return matchStatusCode(
          response.status_code,
          cond.statusMatch || 'exact',
          cond.value || ''
        );
      }
      return false;

    case 'response_body_contains':
      if (response && response.content) {
        if (cond.match === 'regex') {
          try {
            const regex = new RegExp(cond.value || '');
            return regex.test(response.content);
          } catch {
            return false;
          }
        } else {
          return response.content.includes(cond.value || '');
        }
      }
      return false;

    case 'response_size':
      if (response && response.content) {
        const size = response.content.length;
        const bytes = cond.sizeBytes || 0;
        return evaluateSizeCondition(size, cond.sizeOperator || 'gt', bytes);
      }
      return false;

    case 'header':
      if (response && cond.key) {
        const headerValue =
          response.headers[cond.key] ||
          response.headers[cond.key.toLowerCase()] ||
          '';
        return matchValue(headerValue, cond.match || 'contains', cond.value || '');
      }
      return false;

    case 'is_llm_api':
      return flow.is_llm_api === (cond.boolValue ?? true);

    case 'has_refusal':
      return (flow.refusal?.detected ?? false) === (cond.boolValue ?? true);

    case 'is_modified':
      const isModifiedResp = flow.request_modified || flow.response_modified || false;
      return isModifiedResp === (cond.boolValue ?? true);

    case 'has_any_tag':
      const hasAnyTagResp = flow.tags && flow.tags.length > 0;
      return hasAnyTagResp === (cond.boolValue ?? true);

    case 'has_tag':
      return matchTag(flow.tags, cond.match || 'contains', cond.value || '');

    default:
      return false;
  }
}

/**
 * Match a tag against a pattern
 */
function matchTag(tags: string[] | undefined, matchType: MatchType, pattern: string): boolean {
  if (!tags || tags.length === 0) return false;

  const patternLower = pattern.toLowerCase();

  switch (matchType) {
    case 'exact':
      // Exact match - tag must equal pattern exactly
      return tags.some((t) => t.toLowerCase() === patternLower);
    case 'contains':
      // Substring match - pattern must be found within any tag
      return tags.some((t) => t.toLowerCase().includes(patternLower));
    case 'regex':
      // Regex match against any tag
      try {
        const regex = new RegExp(pattern, 'i');
        return tags.some((t) => regex.test(t));
      } catch {
        return false;
      }
    default:
      return false;
  }
}

/**
 * Match a value against a pattern with a specified match type
 */
function matchValue(actual: string, matchType: MatchType, expected: string): boolean {
  switch (matchType) {
    case 'exact':
      return actual === expected;
    case 'contains':
      return actual.toLowerCase().includes(expected.toLowerCase());
    case 'regex':
      try {
        const regex = new RegExp(expected, 'i');
        return regex.test(actual);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

/**
 * Match a status code against various patterns
 */
function matchStatusCode(
  statusCode: number,
  matchType: StatusCodeMatch,
  value: string
): boolean {
  switch (matchType) {
    case 'exact':
      return statusCode === parseInt(value, 10);

    case 'range': {
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
          case '>=':
            return statusCode >= num;
          case '>':
            return statusCode > num;
          case '<=':
            return statusCode <= num;
          case '<':
            return statusCode < num;
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
      const codes = value.split(',').map((s) => parseInt(s.trim(), 10));
      return codes.includes(statusCode);
    }

    default:
      return false;
  }
}

/**
 * Evaluate a size condition
 */
function evaluateSizeCondition(
  size: number,
  operator: 'gt' | 'lt' | 'gte' | 'lte',
  bytes: number
): boolean {
  switch (operator) {
    case 'gt':
      return size > bytes;
    case 'lt':
      return size < bytes;
    case 'gte':
      return size >= bytes;
    case 'lte':
      return size <= bytes;
    default:
      return false;
  }
}

/**
 * Get a human-readable description of a condition for display
 */
export function getConditionDescription(cond: TrafficFilterCondition): string {
  const negatePrefix = cond.negate ? 'NOT ' : '';
  const scopeLabel =
    cond.scope === 'request' ? 'Req' : cond.scope === 'response' ? 'Res' : 'Any';

  switch (cond.field) {
    case 'host':
      return `${negatePrefix}Host ${getMatchLabel(cond.match)} "${cond.value}"`;
    case 'path':
      return `${negatePrefix}Path ${getMatchLabel(cond.match)} "${cond.value}"`;
    case 'method':
      return `${negatePrefix}Method = ${cond.value}`;
    case 'header':
      return `${negatePrefix}${scopeLabel} Header "${cond.key}" ${getMatchLabel(cond.match)} "${cond.value}"`;
    case 'request_body_contains':
      return `${negatePrefix}Req Body ${getMatchLabel(cond.match)} "${cond.value}"`;
    case 'request_body_size':
      return `${negatePrefix}Req Body Size ${getSizeLabel(cond.sizeOperator)} ${formatBytes(cond.sizeBytes || 0)}`;
    case 'status_code':
      return `${negatePrefix}Status ${getStatusMatchLabel(cond.statusMatch)} ${cond.value}`;
    case 'response_body_contains':
      return `${negatePrefix}Res Body ${getMatchLabel(cond.match)} "${cond.value}"`;
    case 'response_size':
      return `${negatePrefix}Res Size ${getSizeLabel(cond.sizeOperator)} ${formatBytes(cond.sizeBytes || 0)}`;
    case 'is_llm_api':
      return `${negatePrefix}LLM API`;
    case 'has_refusal':
      return `${negatePrefix}Has Refusal`;
    case 'is_modified':
      return `${negatePrefix}Modified`;
    case 'has_any_tag':
      return `${negatePrefix}Has Tags`;
    case 'has_tag':
      return `${negatePrefix}Tag ${getMatchLabel(cond.match)} "${cond.value}"`;
    default:
      return 'Unknown condition';
  }
}

function getMatchLabel(match?: MatchType): string {
  switch (match) {
    case 'exact':
      return '=';
    case 'contains':
      return '~';
    case 'regex':
      return '=~';
    default:
      return '~';
  }
}

function getSizeLabel(op?: 'gt' | 'lt' | 'gte' | 'lte'): string {
  switch (op) {
    case 'gt':
      return '>';
    case 'lt':
      return '<';
    case 'gte':
      return '>=';
    case 'lte':
      return '<=';
    default:
      return '>';
  }
}

function getStatusMatchLabel(match?: StatusCodeMatch): string {
  switch (match) {
    case 'exact':
      return '=';
    case 'range':
      return 'in';
    case 'list':
      return 'in';
    default:
      return '=';
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
