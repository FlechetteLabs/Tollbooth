/**
 * Filter Store - manages traffic filters with localStorage persistence
 * Supports both simple and advanced (AND/OR) filtering
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  TrafficFilters,
  TrafficFilterPreset,
  AdvancedTrafficFilter,
  TrafficFilterGroup,
  TrafficFilterCondition,
  TrafficFilterPresetV2,
  FilterOperator,
} from '../types';

const STORAGE_KEY = 'tollbooth-filter-store';

// Helper to generate unique IDs
function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Create a default empty condition
function createDefaultCondition(): TrafficFilterCondition {
  return {
    id: generateId(),
    field: 'host',
    scope: 'request',
    match: 'contains',
    value: '',
    negate: false,
  };
}

// Create a default empty group
function createDefaultGroup(): TrafficFilterGroup {
  return {
    id: generateId(),
    operator: 'AND',
    conditions: [createDefaultCondition()],
  };
}

// Create a default empty advanced filter
function createDefaultAdvancedFilter(): AdvancedTrafficFilter {
  return {
    enabled: false,
    operator: 'AND',
    groups: [],
  };
}

interface FilterState {
  // Active simple filters
  activeFilters: TrafficFilters;

  // Advanced filter state
  advancedFilter: AdvancedTrafficFilter;
  advancedMode: boolean;

  // Saved presets (supports both simple and advanced)
  presets: TrafficFilterPresetV2[];

  // Simple filter actions
  setFilter: <K extends keyof TrafficFilters>(key: K, value: TrafficFilters[K]) => void;
  setFilters: (filters: Partial<TrafficFilters>) => void;
  clearFilters: () => void;

  // Advanced filter mode toggle
  setAdvancedMode: (enabled: boolean) => void;

  // Advanced filter actions
  setAdvancedFilter: (filter: AdvancedTrafficFilter) => void;
  setAdvancedFilterEnabled: (enabled: boolean) => void;
  setTopLevelOperator: (op: FilterOperator) => void;

  // Group management
  addFilterGroup: () => void;
  updateFilterGroup: (groupId: string, updates: Partial<TrafficFilterGroup>) => void;
  removeFilterGroup: (groupId: string) => void;
  setGroupOperator: (groupId: string, operator: FilterOperator) => void;

  // Condition management
  addCondition: (groupId: string) => void;
  updateCondition: (
    groupId: string,
    conditionId: string,
    updates: Partial<TrafficFilterCondition>
  ) => void;
  removeCondition: (groupId: string, conditionId: string) => void;

  // Clear advanced filters
  clearAdvancedFilters: () => void;

  // Preset management (updated for V2)
  savePreset: (name: string) => string;
  loadPreset: (id: string) => void;
  deletePreset: (id: string) => void;
  updatePresetName: (id: string, name: string) => void;
}

const defaultFilters: TrafficFilters = {
  domain: undefined,
  method: undefined,
  llmOnly: false,
  searchText: undefined,
  statusCode: undefined,
  provider: undefined,
  hasRefusal: undefined,
  isModified: undefined,
  showHidden: false,
};

export const useFilterStore = create<FilterState>()(
  persist(
    (set, get) => ({
      activeFilters: { ...defaultFilters },
      advancedFilter: createDefaultAdvancedFilter(),
      advancedMode: false,
      presets: [],

      // Simple filter actions
      setFilter: (key, value) =>
        set((state) => ({
          activeFilters: {
            ...state.activeFilters,
            [key]: value,
          },
        })),

      setFilters: (filters) =>
        set((state) => ({
          activeFilters: {
            ...state.activeFilters,
            ...filters,
          },
        })),

      clearFilters: () =>
        set({
          activeFilters: { ...defaultFilters },
        }),

      // Advanced mode toggle
      setAdvancedMode: (enabled) =>
        set((state) => {
          // When enabling advanced mode, also enable the filter if there are groups
          const advancedFilter = { ...state.advancedFilter };
          if (enabled && advancedFilter.groups.length > 0) {
            advancedFilter.enabled = true;
          }
          return {
            advancedMode: enabled,
            advancedFilter,
          };
        }),

      // Advanced filter actions
      setAdvancedFilter: (filter) =>
        set({ advancedFilter: filter }),

      setAdvancedFilterEnabled: (enabled) =>
        set((state) => ({
          advancedFilter: {
            ...state.advancedFilter,
            enabled,
          },
        })),

      setTopLevelOperator: (operator) =>
        set((state) => ({
          advancedFilter: {
            ...state.advancedFilter,
            operator,
          },
        })),

      // Group management
      addFilterGroup: () =>
        set((state) => ({
          advancedFilter: {
            ...state.advancedFilter,
            enabled: true,
            groups: [...state.advancedFilter.groups, createDefaultGroup()],
          },
        })),

      updateFilterGroup: (groupId, updates) =>
        set((state) => ({
          advancedFilter: {
            ...state.advancedFilter,
            groups: state.advancedFilter.groups.map((g) =>
              g.id === groupId ? { ...g, ...updates } : g
            ),
          },
        })),

      removeFilterGroup: (groupId) =>
        set((state) => {
          const newGroups = state.advancedFilter.groups.filter((g) => g.id !== groupId);
          return {
            advancedFilter: {
              ...state.advancedFilter,
              groups: newGroups,
              // Disable filter if no groups remain
              enabled: newGroups.length > 0 ? state.advancedFilter.enabled : false,
            },
          };
        }),

      setGroupOperator: (groupId, operator) =>
        set((state) => ({
          advancedFilter: {
            ...state.advancedFilter,
            groups: state.advancedFilter.groups.map((g) =>
              g.id === groupId ? { ...g, operator } : g
            ),
          },
        })),

      // Condition management
      addCondition: (groupId) =>
        set((state) => ({
          advancedFilter: {
            ...state.advancedFilter,
            groups: state.advancedFilter.groups.map((g) =>
              g.id === groupId
                ? { ...g, conditions: [...g.conditions, createDefaultCondition()] }
                : g
            ),
          },
        })),

      updateCondition: (groupId, conditionId, updates) =>
        set((state) => ({
          advancedFilter: {
            ...state.advancedFilter,
            groups: state.advancedFilter.groups.map((g) =>
              g.id === groupId
                ? {
                    ...g,
                    conditions: g.conditions.map((c) =>
                      c.id === conditionId ? { ...c, ...updates } : c
                    ),
                  }
                : g
            ),
          },
        })),

      removeCondition: (groupId, conditionId) =>
        set((state) => ({
          advancedFilter: {
            ...state.advancedFilter,
            groups: state.advancedFilter.groups.map((g) =>
              g.id === groupId
                ? {
                    ...g,
                    conditions: g.conditions.filter((c) => c.id !== conditionId),
                  }
                : g
            ),
          },
        })),

      clearAdvancedFilters: () =>
        set({
          advancedFilter: createDefaultAdvancedFilter(),
        }),

      // Preset management (V2 - supports both simple and advanced)
      savePreset: (name) => {
        const state = get();
        const id = `preset_${generateId()}`;
        const preset: TrafficFilterPresetV2 = {
          id,
          name,
          isAdvanced: state.advancedMode,
          simpleFilters: state.advancedMode ? undefined : { ...state.activeFilters },
          advancedFilter: state.advancedMode ? { ...state.advancedFilter } : undefined,
        };
        set((s) => ({
          presets: [...s.presets, preset],
        }));
        return id;
      },

      loadPreset: (id) => {
        const preset = get().presets.find((p) => p.id === id);
        if (preset) {
          if (preset.isAdvanced && preset.advancedFilter) {
            set({
              advancedMode: true,
              advancedFilter: { ...preset.advancedFilter },
            });
          } else if (preset.simpleFilters) {
            set({
              advancedMode: false,
              activeFilters: { ...preset.simpleFilters },
            });
          } else if ('filters' in preset) {
            // Handle legacy TrafficFilterPreset format
            set({
              advancedMode: false,
              activeFilters: { ...(preset as unknown as TrafficFilterPreset).filters },
            });
          }
        }
      },

      deletePreset: (id) =>
        set((state) => ({
          presets: state.presets.filter((p) => p.id !== id),
        })),

      updatePresetName: (id, name) =>
        set((state) => ({
          presets: state.presets.map((p) => (p.id === id ? { ...p, name } : p)),
        })),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        // Persist presets and advanced filter state
        presets: state.presets,
        advancedMode: state.advancedMode,
        advancedFilter: state.advancedFilter,
      }),
    }
  )
);
