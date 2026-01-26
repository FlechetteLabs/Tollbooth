/**
 * Filter Store - manages traffic filters with localStorage persistence
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TrafficFilters, TrafficFilterPreset } from '../types';

const STORAGE_KEY = 'tollbooth-filter-store';

interface FilterState {
  // Active filters
  activeFilters: TrafficFilters;

  // Saved presets
  presets: TrafficFilterPreset[];

  // Actions
  setFilter: <K extends keyof TrafficFilters>(key: K, value: TrafficFilters[K]) => void;
  setFilters: (filters: Partial<TrafficFilters>) => void;
  clearFilters: () => void;

  // Preset management
  savePreset: (name: string) => string; // Returns preset ID
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
      presets: [],

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

      savePreset: (name) => {
        const id = `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const preset: TrafficFilterPreset = {
          id,
          name,
          filters: { ...get().activeFilters },
        };
        set((state) => ({
          presets: [...state.presets, preset],
        }));
        return id;
      },

      loadPreset: (id) => {
        const preset = get().presets.find((p) => p.id === id);
        if (preset) {
          set({
            activeFilters: { ...preset.filters },
          });
        }
      },

      deletePreset: (id) =>
        set((state) => ({
          presets: state.presets.filter((p) => p.id !== id),
        })),

      updatePresetName: (id, name) =>
        set((state) => ({
          presets: state.presets.map((p) =>
            p.id === id ? { ...p, name } : p
          ),
        })),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        // Only persist presets, not active filters
        presets: state.presets,
      }),
    }
  )
);
