/**
 * FilterChips - Display active filters as removable chips
 */

import { clsx } from 'clsx';
import { useFilterStore } from '../../stores/filterStore';
import { getConditionDescription } from '../../utils/trafficFilterEvaluator';

export function FilterChips() {
  const {
    advancedFilter,
    advancedMode,
    removeCondition,
    removeFilterGroup,
    clearAdvancedFilters,
  } = useFilterStore();

  // Only show when in advanced mode with active groups
  if (!advancedMode || !advancedFilter.enabled || advancedFilter.groups.length === 0) {
    return null;
  }

  // Count total conditions
  const totalConditions = advancedFilter.groups.reduce(
    (acc, g) => acc + g.conditions.length,
    0
  );

  if (totalConditions === 0) {
    return null;
  }

  return (
    <div className="px-3 py-2 border-b border-inspector-border bg-inspector-surface/50">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-inspector-muted">Active:</span>

        {advancedFilter.groups.map((group, groupIndex) => (
          <div key={group.id} className="contents">
            {/* Group connector */}
            {groupIndex > 0 && (
              <span
                className={clsx(
                  'px-1.5 py-0.5 text-xs font-medium rounded',
                  advancedFilter.operator === 'AND'
                    ? 'bg-blue-500/10 text-blue-400'
                    : 'bg-green-500/10 text-green-400'
                )}
              >
                {advancedFilter.operator}
              </span>
            )}

            {/* Group wrapper if multiple conditions */}
            {group.conditions.length > 1 && (
              <span className="text-xs text-inspector-muted">(</span>
            )}

            {group.conditions.map((condition, condIndex) => (
              <div key={condition.id} className="contents">
                {/* Condition connector within group */}
                {condIndex > 0 && (
                  <span
                    className={clsx(
                      'px-1 text-xs',
                      group.operator === 'AND' ? 'text-blue-400' : 'text-green-400'
                    )}
                  >
                    {group.operator}
                  </span>
                )}

                {/* Condition chip */}
                <span
                  className={clsx(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs',
                    condition.negate
                      ? 'bg-orange-500/20 text-orange-300'
                      : 'bg-inspector-accent/20 text-inspector-accent'
                  )}
                >
                  <span className="max-w-[200px] truncate">
                    {getConditionDescription(condition)}
                  </span>
                  <button
                    onClick={() => {
                      if (group.conditions.length === 1) {
                        // Last condition in group - remove the group
                        removeFilterGroup(group.id);
                      } else {
                        removeCondition(group.id, condition.id);
                      }
                    }}
                    className="text-current hover:text-inspector-error transition-colors"
                    title="Remove filter"
                  >
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </span>
              </div>
            ))}

            {group.conditions.length > 1 && (
              <span className="text-xs text-inspector-muted">)</span>
            )}
          </div>
        ))}

        {/* Clear all button */}
        <button
          onClick={clearAdvancedFilters}
          className="ml-auto text-xs text-inspector-muted hover:text-inspector-error transition-colors"
          title="Clear all advanced filters"
        >
          Clear all
        </button>
      </div>
    </div>
  );
}
