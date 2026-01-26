/**
 * FilterGroupEditor - Group of conditions with AND/OR operator
 */

import { clsx } from 'clsx';
import { TrafficFilterGroup, TrafficFilterCondition, FilterOperator } from '../../types';
import { FilterConditionRow } from './FilterConditionRow';

interface FilterGroupEditorProps {
  group: TrafficFilterGroup;
  groupIndex: number;
  onOperatorChange: (operator: FilterOperator) => void;
  onAddCondition: () => void;
  onUpdateCondition: (conditionId: string, updates: Partial<TrafficFilterCondition>) => void;
  onRemoveCondition: (conditionId: string) => void;
  onRemoveGroup: () => void;
  isOnly: boolean;
}

export function FilterGroupEditor({
  group,
  groupIndex,
  onOperatorChange,
  onAddCondition,
  onUpdateCondition,
  onRemoveCondition,
  onRemoveGroup,
  isOnly,
}: FilterGroupEditorProps) {
  return (
    <div className="border border-inspector-border rounded-lg overflow-hidden">
      {/* Group header */}
      <div className="flex items-center justify-between px-3 py-2 bg-inspector-surface border-b border-inspector-border">
        <div className="flex items-center gap-2">
          <span className="text-xs text-inspector-muted font-medium">
            Group {groupIndex + 1}
          </span>
          <span className="text-xs text-inspector-muted">-</span>
          <span className="text-xs text-inspector-muted">Match</span>
          <select
            value={group.operator}
            onChange={(e) => onOperatorChange(e.target.value as FilterOperator)}
            className="px-2 py-0.5 bg-inspector-bg border border-inspector-border rounded text-xs font-medium focus:outline-none focus:border-inspector-accent"
          >
            <option value="AND">ALL (AND)</option>
            <option value="OR">ANY (OR)</option>
          </select>
          <span className="text-xs text-inspector-muted">conditions</span>
        </div>

        <button
          onClick={onRemoveGroup}
          disabled={isOnly}
          className={clsx(
            'p-1 rounded transition-colors',
            isOnly
              ? 'text-inspector-muted/50 cursor-not-allowed'
              : 'text-inspector-muted hover:text-inspector-error hover:bg-red-500/10'
          )}
          title={isOnly ? 'Cannot remove the only group' : 'Remove group'}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Conditions */}
      <div className="p-2 space-y-2">
        {group.conditions.map((condition, index) => (
          <div key={condition.id} className="relative">
            {/* AND/OR connector between conditions */}
            {index > 0 && (
              <div className="flex items-center justify-center py-1">
                <span
                  className={clsx(
                    'px-2 py-0.5 text-xs rounded',
                    group.operator === 'AND'
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-green-500/20 text-green-400'
                  )}
                >
                  {group.operator}
                </span>
              </div>
            )}
            <FilterConditionRow
              condition={condition}
              onChange={(updates) => onUpdateCondition(condition.id, updates)}
              onRemove={() => onRemoveCondition(condition.id)}
              isOnly={group.conditions.length === 1}
            />
          </div>
        ))}

        {/* Add condition button */}
        <button
          onClick={onAddCondition}
          className="w-full py-1.5 border border-dashed border-inspector-border rounded text-xs text-inspector-muted hover:text-inspector-text hover:border-inspector-accent transition-colors flex items-center justify-center gap-1"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Condition
        </button>
      </div>
    </div>
  );
}
