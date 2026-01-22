/**
 * Toggle for switching between pretty and raw display modes
 */

import { clsx } from 'clsx';
import { useAppStore, DisplayMode } from '../../stores/appStore';

export function DisplayModeToggle() {
  const { displayMode, setDisplayMode } = useAppStore();

  const modes: { id: DisplayMode; label: string; title: string }[] = [
    { id: 'raw', label: 'Raw', title: 'Show content exactly as received' },
    { id: 'pretty', label: 'Pretty', title: 'Format valid JSON with indentation' },
    { id: 'aggressive', label: 'Aggressive', title: 'Find and format all JSON within content (SSE, etc.)' },
    { id: 'insane', label: 'Insane', title: 'Aggressive + render escaped newlines (\\n) as actual newlines' },
  ];

  return (
    <div className="flex items-center gap-1 bg-inspector-bg rounded-lg p-1">
      {modes.map((mode) => (
        <button
          key={mode.id}
          onClick={() => setDisplayMode(mode.id)}
          title={mode.title}
          className={clsx(
            'px-2 py-1 rounded text-xs font-medium transition-colors',
            displayMode === mode.id
              ? 'bg-inspector-accent text-white'
              : 'text-inspector-muted hover:text-inspector-text'
          )}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Try to find and format JSON objects/arrays within a string
 * Used for SSE responses like "data: {"type":"..."}"
 */
function findAndFormatJson(text: string): string {
  // Pattern to find JSON objects or arrays
  // Look for { or [ followed by content and ending with } or ]
  const result: string[] = [];
  let i = 0;

  while (i < text.length) {
    // Look for start of potential JSON
    const startChar = text[i];

    if (startChar === '{' || startChar === '[') {
      // Try to find matching end and parse
      const endChar = startChar === '{' ? '}' : ']';
      let depth = 0;
      let inString = false;
      let escape = false;
      let j = i;

      for (; j < text.length; j++) {
        const c = text[j];

        if (escape) {
          escape = false;
          continue;
        }

        if (c === '\\' && inString) {
          escape = true;
          continue;
        }

        if (c === '"' && !escape) {
          inString = !inString;
          continue;
        }

        if (!inString) {
          if (c === startChar) depth++;
          if (c === endChar) depth--;

          if (depth === 0) {
            // Found potential JSON
            const jsonCandidate = text.slice(i, j + 1);
            try {
              const parsed = JSON.parse(jsonCandidate);
              const formatted = JSON.stringify(parsed, null, 2);
              result.push(formatted);
              i = j + 1;
              break;
            } catch {
              // Not valid JSON, just add the start character and continue
              result.push(startChar);
              i++;
              break;
            }
          }
        }
      }

      // If we reached end without finding match
      if (j >= text.length && depth !== 0) {
        result.push(startChar);
        i++;
      }
    } else {
      // Not a JSON start, just add character
      result.push(text[i]);
      i++;
    }
  }

  return result.join('');
}

/**
 * Render escaped characters as their actual characters
 * Handles: \n -> newline, \t -> tab, \r -> carriage return
 */
function renderEscapedChars(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r');
}

/**
 * Format content based on display mode
 */
export function formatContent(content: string | null | undefined, mode: DisplayMode): string {
  if (!content) return '(empty)';

  if (mode === 'raw') {
    // Raw mode: show content as-is without any formatting
    return content;
  }

  if (mode === 'pretty') {
    // Pretty mode: try to parse and format JSON if the whole content is valid JSON
    try {
      const parsed = JSON.parse(content);
      return JSON.stringify(parsed, null, 2);
    } catch {
      // Not JSON, just return as-is
      return content;
    }
  }

  if (mode === 'aggressive') {
    // Aggressive mode: find and format any JSON within the content
    // First try to parse the whole thing as JSON
    try {
      const parsed = JSON.parse(content);
      return JSON.stringify(parsed, null, 2);
    } catch {
      // Not pure JSON, try to find JSON within the content
      return findAndFormatJson(content);
    }
  }

  if (mode === 'insane') {
    // Insane mode: aggressive formatting + render escaped newlines
    let result: string;
    try {
      const parsed = JSON.parse(content);
      result = JSON.stringify(parsed, null, 2);
    } catch {
      result = findAndFormatJson(content);
    }
    // Render escaped characters as actual characters
    return renderEscapedChars(result);
  }

  return content;
}

/**
 * Check if content is valid JSON
 */
export function isValidJson(content: string | null | undefined): boolean {
  if (!content) return false;
  try {
    JSON.parse(content);
    return true;
  } catch {
    return false;
  }
}
