/**
 * FilterConditionRow - Single filter condition editor
 */

import { clsx } from 'clsx';
import {
  TrafficFilterCondition,
  TrafficFilterField,
  FilterScope,
  MatchType,
  StatusCodeMatch,
} from '../../types';

interface FieldOption {
  value: TrafficFilterField;
  label: string;
  scopes: FilterScope[];
  matchTypes?: MatchType[];
  isBoolean?: boolean;
  isStatus?: boolean;
  isSize?: boolean;
}

interface FieldGroup {
  group: string;
  fields: FieldOption[];
}

const fieldOptions: FieldGroup[] = [
  {
    group: 'URL',
    fields: [
      { value: 'host', label: 'Host', scopes: ['request'], matchTypes: ['exact', 'contains', 'regex'] },
      { value: 'path', label: 'Path', scopes: ['request'], matchTypes: ['exact', 'contains', 'regex'] },
    ],
  },
  {
    group: 'Request',
    fields: [
      { value: 'method', label: 'Method', scopes: ['request'], matchTypes: ['exact', 'contains'] },
      { value: 'header', label: 'Header', scopes: ['request', 'response', 'either'], matchTypes: ['exact', 'contains', 'regex'] },
      { value: 'request_body_contains', label: 'Body Contains', scopes: ['request'], matchTypes: ['contains', 'regex'] },
      { value: 'request_body_size', label: 'Body Size', scopes: ['request'], isSize: true },
    ],
  },
  {
    group: 'Response',
    fields: [
      { value: 'status_code', label: 'Status Code', scopes: ['response'], isStatus: true },
      { value: 'response_body_contains', label: 'Body Contains', scopes: ['response'], matchTypes: ['contains', 'regex'] },
      { value: 'response_size', label: 'Body Size', scopes: ['response'], isSize: true },
    ],
  },
  {
    group: 'Metadata',
    fields: [
      { value: 'is_llm_api', label: 'LLM API', scopes: ['either'], isBoolean: true },
      { value: 'has_refusal', label: 'Has Refusal', scopes: ['either'], isBoolean: true },
      { value: 'is_modified', label: 'Modified', scopes: ['either'], isBoolean: true },
    ],
  },
];

// Flatten for quick lookup
const allFields = fieldOptions.flatMap((g) => g.fields);

interface FilterConditionRowProps {
  condition: TrafficFilterCondition;
  onChange: (updates: Partial<TrafficFilterCondition>) => void;
  onRemove: () => void;
  isOnly: boolean;
}

export function FilterConditionRow({
  condition,
  onChange,
  onRemove,
  isOnly,
}: FilterConditionRowProps) {
  const fieldConfig = allFields.find((f) => f.value === condition.field);
  const availableScopes = fieldConfig?.scopes || ['request'];
  const isBoolean = fieldConfig?.isBoolean || false;
  const isStatus = fieldConfig?.isStatus || false;
  const isSize = fieldConfig?.isSize || false;
  const matchTypes = fieldConfig?.matchTypes;

  // Determine if we need a header key input
  const needsHeaderKey = condition.field === 'header';

  // Handle field change - reset related fields
  const handleFieldChange = (newField: TrafficFilterField) => {
    const newConfig = allFields.find((f) => f.value === newField);
    const updates: Partial<TrafficFilterCondition> = { field: newField };

    // Reset value-related fields
    updates.value = '';
    updates.key = undefined;
    updates.boolValue = undefined;
    updates.statusMatch = undefined;
    updates.sizeOperator = undefined;
    updates.sizeBytes = undefined;

    // Set default scope if current scope not available
    if (newConfig && !newConfig.scopes.includes(condition.scope)) {
      updates.scope = newConfig.scopes[0];
    }

    // Set default match type
    if (newConfig?.matchTypes && newConfig.matchTypes.length > 0) {
      updates.match = newConfig.matchTypes[0];
    } else {
      updates.match = undefined;
    }

    // Set defaults for special types
    if (newConfig?.isBoolean) {
      updates.boolValue = true;
    }
    if (newConfig?.isStatus) {
      updates.statusMatch = 'exact';
    }
    if (newConfig?.isSize) {
      updates.sizeOperator = 'gt';
      updates.sizeBytes = 1024;
    }

    onChange(updates);
  };

  return (
    <div className="flex items-center gap-2 p-2 bg-inspector-bg rounded">
      {/* Field dropdown */}
      <select
        value={condition.field}
        onChange={(e) => handleFieldChange(e.target.value as TrafficFilterField)}
        className="px-2 py-1 bg-inspector-surface border border-inspector-border rounded text-xs focus:outline-none focus:border-inspector-accent min-w-[100px]"
      >
        {fieldOptions.map((group) => (
          <optgroup key={group.group} label={group.group}>
            {group.fields.map((field) => (
              <option key={field.value} value={field.value}>
                {field.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {/* Scope dropdown - only show if field supports multiple scopes */}
      {availableScopes.length > 1 && (
        <select
          value={condition.scope}
          onChange={(e) => onChange({ scope: e.target.value as FilterScope })}
          className="px-2 py-1 bg-inspector-surface border border-inspector-border rounded text-xs focus:outline-none focus:border-inspector-accent"
        >
          {availableScopes.includes('request') && <option value="request">Request</option>}
          {availableScopes.includes('response') && <option value="response">Response</option>}
          {availableScopes.includes('either') && <option value="either">Either</option>}
        </select>
      )}

      {/* Header key input */}
      {needsHeaderKey && (
        <input
          type="text"
          placeholder="Header name"
          value={condition.key || ''}
          onChange={(e) => onChange({ key: e.target.value })}
          className="px-2 py-1 bg-inspector-surface border border-inspector-border rounded text-xs focus:outline-none focus:border-inspector-accent w-28"
        />
      )}

      {/* Match type dropdown */}
      {matchTypes && matchTypes.length > 0 && (
        <select
          value={condition.match || matchTypes[0]}
          onChange={(e) => onChange({ match: e.target.value as MatchType })}
          className="px-2 py-1 bg-inspector-surface border border-inspector-border rounded text-xs focus:outline-none focus:border-inspector-accent"
        >
          {matchTypes.includes('exact') && <option value="exact">exact</option>}
          {matchTypes.includes('contains') && <option value="contains">contains</option>}
          {matchTypes.includes('regex') && <option value="regex">regex</option>}
        </select>
      )}

      {/* Status match type dropdown */}
      {isStatus && (
        <select
          value={condition.statusMatch || 'exact'}
          onChange={(e) => onChange({ statusMatch: e.target.value as StatusCodeMatch })}
          className="px-2 py-1 bg-inspector-surface border border-inspector-border rounded text-xs focus:outline-none focus:border-inspector-accent"
        >
          <option value="exact">exact</option>
          <option value="range">range</option>
          <option value="list">list</option>
        </select>
      )}

      {/* Size operator dropdown */}
      {isSize && (
        <select
          value={condition.sizeOperator || 'gt'}
          onChange={(e) => onChange({ sizeOperator: e.target.value as 'gt' | 'lt' | 'gte' | 'lte' })}
          className="px-2 py-1 bg-inspector-surface border border-inspector-border rounded text-xs focus:outline-none focus:border-inspector-accent"
        >
          <option value="gt">&gt;</option>
          <option value="lt">&lt;</option>
          <option value="gte">&gt;=</option>
          <option value="lte">&lt;=</option>
        </select>
      )}

      {/* Value input - for text-based conditions */}
      {!isBoolean && !isSize && (
        <input
          type="text"
          placeholder={isStatus ? 'e.g., 200, 4xx, >=400' : 'Value'}
          value={condition.value || ''}
          onChange={(e) => onChange({ value: e.target.value })}
          className="px-2 py-1 bg-inspector-surface border border-inspector-border rounded text-xs focus:outline-none focus:border-inspector-accent flex-1 min-w-[100px]"
        />
      )}

      {/* Size value input */}
      {isSize && (
        <div className="flex items-center gap-1">
          <input
            type="number"
            min="0"
            placeholder="1024"
            value={condition.sizeBytes || ''}
            onChange={(e) => onChange({ sizeBytes: parseInt(e.target.value, 10) || 0 })}
            className="px-2 py-1 bg-inspector-surface border border-inspector-border rounded text-xs focus:outline-none focus:border-inspector-accent w-20"
          />
          <span className="text-xs text-inspector-muted">bytes</span>
        </div>
      )}

      {/* Boolean value toggle */}
      {isBoolean && (
        <select
          value={condition.boolValue === false ? 'false' : 'true'}
          onChange={(e) => onChange({ boolValue: e.target.value === 'true' })}
          className="px-2 py-1 bg-inspector-surface border border-inspector-border rounded text-xs focus:outline-none focus:border-inspector-accent"
        >
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      )}

      {/* NOT toggle */}
      <button
        onClick={() => onChange({ negate: !condition.negate })}
        className={clsx(
          'px-2 py-1 text-xs rounded border transition-colors',
          condition.negate
            ? 'bg-orange-500/20 text-orange-400 border-orange-500/50'
            : 'bg-inspector-surface border-inspector-border text-inspector-muted hover:text-inspector-text'
        )}
        title={condition.negate ? 'Remove negation' : 'Negate condition (NOT)'}
      >
        NOT
      </button>

      {/* Remove button */}
      <button
        onClick={onRemove}
        disabled={isOnly}
        className={clsx(
          'p-1 rounded transition-colors',
          isOnly
            ? 'text-inspector-muted/50 cursor-not-allowed'
            : 'text-inspector-muted hover:text-inspector-error hover:bg-red-500/10'
        )}
        title={isOnly ? 'Cannot remove the only condition' : 'Remove condition'}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
