/**
 * AdvancedFilterPanel - Collapsible panel for advanced AND/OR filtering
 */

import { useState } from 'react';
import { clsx } from 'clsx';
import { useFilterStore } from '../../stores/filterStore';
import { FilterGroupEditor } from './FilterGroupEditor';
import { FilterOperator } from '../../types';

interface AdvancedFilterPanelProps {
  onClose: () => void;
}

export function AdvancedFilterPanel({ onClose }: AdvancedFilterPanelProps) {
  const [newPresetName, setNewPresetName] = useState('');

  const {
    advancedFilter,
    setTopLevelOperator,
    addFilterGroup,
    setGroupOperator,
    addCondition,
    updateCondition,
    removeCondition,
    removeFilterGroup,
    clearAdvancedFilters,
    savePreset,
  } = useFilterStore();

  const handleSavePreset = () => {
    if (newPresetName.trim()) {
      savePreset(newPresetName.trim());
      setNewPresetName('');
    }
  };

  const hasGroups = advancedFilter.groups.length > 0;

  return (
    <div className="border border-inspector-border rounded-lg bg-inspector-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-inspector-border bg-inspector-bg">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium">Advanced Filters</h3>
          {hasGroups && (
            <span className="px-2 py-0.5 text-xs rounded bg-inspector-accent/20 text-inspector-accent">
              {advancedFilter.groups.length} group{advancedFilter.groups.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 text-inspector-muted hover:text-inspector-text rounded transition-colors"
          title="Close advanced filters"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Top-level operator */}
        {advancedFilter.groups.length > 1 && (
          <div className="flex items-center gap-2 pb-2 border-b border-inspector-border/50">
            <span className="text-sm text-inspector-muted">Match</span>
            <select
              value={advancedFilter.operator}
              onChange={(e) => setTopLevelOperator(e.target.value as FilterOperator)}
              className="px-2 py-1 bg-inspector-bg border border-inspector-border rounded text-sm font-medium focus:outline-none focus:border-inspector-accent"
            >
              <option value="AND">ALL (AND)</option>
              <option value="OR">ANY (OR)</option>
            </select>
            <span className="text-sm text-inspector-muted">of the following groups:</span>
          </div>
        )}

        {/* Groups */}
        <div className="space-y-4">
          {advancedFilter.groups.map((group, index) => (
            <div key={group.id} className="relative">
              {/* AND/OR connector between groups */}
              {index > 0 && (
                <div className="flex items-center justify-center py-2">
                  <span
                    className={clsx(
                      'px-3 py-1 text-xs font-medium rounded',
                      advancedFilter.operator === 'AND'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-green-500/20 text-green-400'
                    )}
                  >
                    {advancedFilter.operator}
                  </span>
                </div>
              )}
              <FilterGroupEditor
                group={group}
                groupIndex={index}
                onOperatorChange={(op) => setGroupOperator(group.id, op)}
                onAddCondition={() => addCondition(group.id)}
                onUpdateCondition={(condId, updates) => updateCondition(group.id, condId, updates)}
                onRemoveCondition={(condId) => removeCondition(group.id, condId)}
                onRemoveGroup={() => removeFilterGroup(group.id)}
                isOnly={advancedFilter.groups.length === 1}
              />
            </div>
          ))}
        </div>

        {/* Empty state / Add group button */}
        {!hasGroups ? (
          <div className="text-center py-8">
            <p className="text-inspector-muted text-sm mb-4">
              No filter groups. Add a group to start filtering.
            </p>
            <button
              onClick={addFilterGroup}
              className="px-4 py-2 bg-inspector-accent text-white rounded text-sm hover:bg-inspector-accent/80 transition-colors"
            >
              Add Filter Group
            </button>
          </div>
        ) : (
          <button
            onClick={addFilterGroup}
            className="w-full py-2 border border-dashed border-inspector-border rounded text-sm text-inspector-muted hover:text-inspector-text hover:border-inspector-accent transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Group
          </button>
        )}

        {/* Actions */}
        {hasGroups && (
          <div className="flex items-center justify-between pt-4 border-t border-inspector-border/50">
            <button
              onClick={clearAdvancedFilters}
              className="px-3 py-1.5 text-xs text-inspector-muted hover:text-inspector-error transition-colors"
            >
              Clear All
            </button>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Preset name..."
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
                className="px-2 py-1 bg-inspector-bg border border-inspector-border rounded text-xs w-32 focus:outline-none focus:border-inspector-accent"
              />
              <button
                onClick={handleSavePreset}
                disabled={!newPresetName.trim()}
                className="px-3 py-1 bg-inspector-accent text-white text-xs rounded hover:bg-inspector-accent/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save Preset
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
