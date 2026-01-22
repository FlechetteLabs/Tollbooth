/**
 * Reusable Dropdown component with accessibility features
 * - Full keyboard navigation (Arrow keys, Enter, Escape)
 * - ARIA attributes for screen readers
 * - Outside click detection
 * - data-testid support for automation
 * - Support for async loading and custom item rendering
 */

import { useState, useRef, useEffect, ReactNode, KeyboardEvent, useCallback } from 'react';
import { clsx } from 'clsx';

export interface DropdownOption<T = string> {
  /** Unique value for this option */
  value: T;
  /** Display label (if not provided, value.toString() is used) */
  label?: string;
  /** Optional description shown below label */
  description?: string;
  /** Whether this option is disabled */
  disabled?: boolean;
  /** Custom render content (overrides label/description) */
  render?: ReactNode;
}

export interface DropdownProps<T = string> {
  /** Currently selected value */
  value: T | null;
  /** Called when selection changes */
  onChange: (value: T) => void;
  /** Available options */
  options: DropdownOption<T>[];
  /** Placeholder text when no selection */
  placeholder?: string;
  /** Whether dropdown is disabled */
  disabled?: boolean;
  /** Whether options are loading */
  loading?: boolean;
  /** Error message to display */
  error?: string;
  /** data-testid prefix for automation */
  testId?: string;
  /** Custom class for the trigger button */
  className?: string;
  /** Label for screen readers */
  ariaLabel?: string;
  /** Custom render for selected value display */
  renderValue?: (option: DropdownOption<T> | undefined) => ReactNode;
  /** Whether to show search input */
  searchable?: boolean;
  /** Custom filter function for search */
  filterFn?: (option: DropdownOption<T>, query: string) => boolean;
}

export function Dropdown<T = string>({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  disabled = false,
  loading = false,
  error,
  testId = 'dropdown',
  className,
  ariaLabel,
  renderValue,
  searchable = false,
  filterFn,
}: DropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [searchQuery, setSearchQuery] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Find selected option
  const selectedOption = options.find(opt => opt.value === value);

  // Filter options based on search
  const filteredOptions = searchable && searchQuery
    ? options.filter(opt => {
        if (filterFn) return filterFn(opt, searchQuery);
        const label = opt.label || String(opt.value);
        return label.toLowerCase().includes(searchQuery.toLowerCase());
      })
    : options;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Reset focus when options change
  useEffect(() => {
    if (isOpen) {
      setFocusedIndex(-1);
    }
  }, [filteredOptions.length, isOpen]);

  // Focus search input when opened with search
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchable]);

  const openDropdown = useCallback(() => {
    if (!disabled && !loading) {
      setIsOpen(true);
      setFocusedIndex(-1);
      setSearchQuery('');
    }
  }, [disabled, loading]);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setSearchQuery('');
    triggerRef.current?.focus();
  }, []);

  const selectOption = useCallback((option: DropdownOption<T>) => {
    if (!option.disabled) {
      onChange(option.value);
      closeDropdown();
    }
  }, [onChange, closeDropdown]);

  const handleTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    switch (e.key) {
      case 'Enter':
      case ' ':
      case 'ArrowDown':
        e.preventDefault();
        openDropdown();
        break;
      case 'ArrowUp':
        e.preventDefault();
        openDropdown();
        // Focus last option
        setFocusedIndex(filteredOptions.length - 1);
        break;
    }
  };

  const handleListKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        closeDropdown();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => {
          const next = prev + 1;
          // Skip disabled options
          let idx = next;
          while (idx < filteredOptions.length && filteredOptions[idx]?.disabled) {
            idx++;
          }
          return idx < filteredOptions.length ? idx : prev;
        });
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => {
          const next = prev - 1;
          // Skip disabled options
          let idx = next;
          while (idx >= 0 && filteredOptions[idx]?.disabled) {
            idx--;
          }
          return idx >= 0 ? idx : prev;
        });
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < filteredOptions.length) {
          selectOption(filteredOptions[focusedIndex]);
        }
        break;
      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setFocusedIndex(filteredOptions.length - 1);
        break;
      case 'Tab':
        // Allow Tab to close dropdown and move focus
        closeDropdown();
        break;
    }
  };

  // Scroll focused option into view
  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && listRef.current) {
      const focusedElement = listRef.current.children[focusedIndex] as HTMLElement;
      focusedElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex, isOpen]);

  const listboxId = `${testId}-listbox`;

  return (
    <div ref={containerRef} className="relative" data-testid={`${testId}-container`}>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => isOpen ? closeDropdown() : openDropdown()}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled || loading}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-label={ariaLabel}
        data-testid={`${testId}-trigger`}
        className={clsx(
          'w-full bg-inspector-bg border border-inspector-border rounded px-3 py-2',
          'text-left font-mono flex items-center justify-between',
          'focus:outline-none focus:border-inspector-accent',
          'transition-colors',
          disabled || loading
            ? 'opacity-50 cursor-not-allowed text-inspector-muted'
            : 'text-inspector-text hover:border-inspector-accent/50',
          error && 'border-inspector-error',
          className
        )}
      >
        <span className={clsx(!value && 'text-inspector-muted')}>
          {loading ? (
            'Loading...'
          ) : renderValue ? (
            renderValue(selectedOption)
          ) : selectedOption ? (
            selectedOption.label || String(selectedOption.value)
          ) : (
            placeholder
          )}
        </span>
        <svg
          className={clsx(
            'w-4 h-4 transition-transform flex-shrink-0 ml-2',
            isOpen && 'rotate-180'
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Error message */}
      {error && (
        <div
          className="text-inspector-error text-xs mt-1"
          data-testid={`${testId}-error`}
        >
          {error}
        </div>
      )}

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          className="absolute z-50 mt-1 w-full bg-inspector-surface border border-inspector-border rounded-lg shadow-xl overflow-hidden"
          data-testid={`${testId}-panel`}
        >
          {/* Search Input */}
          {searchable && (
            <div className="p-2 border-b border-inspector-border">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleListKeyDown}
                placeholder="Search..."
                className="w-full bg-inspector-bg border border-inspector-border rounded px-3 py-1.5 text-sm text-inspector-text focus:outline-none focus:border-inspector-accent"
                data-testid={`${testId}-search`}
              />
            </div>
          )}

          {/* Options List */}
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel || placeholder}
            onKeyDown={handleListKeyDown}
            tabIndex={searchable ? -1 : 0}
            className="max-h-60 overflow-y-auto"
            data-testid={`${testId}-options`}
          >
            {filteredOptions.length === 0 ? (
              <li className="px-3 py-2 text-inspector-muted text-sm">
                {searchQuery ? 'No matching options' : 'No options available'}
              </li>
            ) : (
              filteredOptions.map((option, index) => {
                const isSelected = option.value === value;
                const isFocused = index === focusedIndex;
                const label = option.label || String(option.value);

                return (
                  <li
                    key={String(option.value)}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled}
                    onClick={() => selectOption(option)}
                    onMouseEnter={() => setFocusedIndex(index)}
                    data-testid={`${testId}-option-${String(option.value).replace(/[^a-zA-Z0-9-_]/g, '_')}`}
                    className={clsx(
                      'px-3 py-2 cursor-pointer transition-colors',
                      option.disabled && 'opacity-50 cursor-not-allowed',
                      isFocused && !option.disabled && 'bg-inspector-border/50',
                      isSelected && 'bg-inspector-accent/10',
                      !option.disabled && 'hover:bg-inspector-border/50 active:bg-inspector-accent/20'
                    )}
                  >
                    {option.render || (
                      <div>
                        <div className={clsx(
                          'text-sm font-mono',
                          isSelected ? 'text-inspector-accent' : 'text-inspector-text'
                        )}>
                          {label}
                        </div>
                        {option.description && (
                          <div className="text-xs text-inspector-muted mt-0.5">
                            {option.description}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Async Dropdown variant that loads options on demand
 */
export interface AsyncDropdownProps<T = string> extends Omit<DropdownProps<T>, 'options' | 'loading'> {
  /** Function to load options */
  loadOptions: () => Promise<DropdownOption<T>[]>;
  /** Whether to reload on each open (default: false, loads once) */
  reloadOnOpen?: boolean;
}

export function AsyncDropdown<T = string>({
  loadOptions,
  reloadOnOpen = false,
  ...props
}: AsyncDropdownProps<T>) {
  const [options, setOptions] = useState<DropdownOption<T>[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const fetchOptions = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(undefined);
    try {
      const result = await loadOptions();
      setOptions(result);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load options');
    } finally {
      setLoading(false);
    }
  }, [loadOptions, loading]);

  // Load on mount
  useEffect(() => {
    if (!loaded && !loading) {
      fetchOptions();
    }
  }, [fetchOptions, loaded, loading]);

  return (
    <Dropdown
      {...props}
      options={options}
      loading={loading}
      error={props.error || error}
    />
  );
}

export default Dropdown;
