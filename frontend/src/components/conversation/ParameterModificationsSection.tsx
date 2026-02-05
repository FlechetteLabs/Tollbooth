/**
 * Parameter Modifications Section - displays diffs for modified parameters
 * Shows system prompt, tools, temperature, max_tokens, and model changes
 *
 * Display strategy:
 * - Simple values (temperature, max_tokens, model): inline "oldValue → newValue"
 * - System prompt: summary with char count, expandable to show diff
 * - Tools: summary "3 → 4 (+toolName)", expandable to show tool names
 */

import { useState } from 'react';
import { clsx } from 'clsx';
import { ParameterModifications, ParameterModification } from '../../types';

interface Props {
  modifications: ParameterModifications;
}

/**
 * Format a simple value for inline display
 */
function formatSimpleValue(value: any): string {
  if (value === undefined || value === null) {
    return '(not set)';
  }
  return String(value);
}

/**
 * Extract text from a system prompt value which could be:
 * - A simple string: "You are a helpful assistant"
 * - An array of content blocks: [{type: "text", text: "You are..."}]
 * - A single content block object: {type: "text", text: "..."}
 */
function extractSystemPromptText(value: any): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    // Array of content blocks
    return value
      .map(block => {
        if (typeof block === 'string') return block;
        if (block?.type === 'text' && typeof block.text === 'string') return block.text;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (typeof value === 'object') {
    // Single content block
    if (value.type === 'text' && typeof value.text === 'string') {
      return value.text;
    }
    // Fallback: stringify it
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

/**
 * Get tool names from a tools array
 */
function getToolNames(tools: any[] | undefined | null): string[] {
  if (!tools || !Array.isArray(tools)) return [];
  return tools.map(t => {
    // Handle different tool formats (Anthropic, OpenAI, etc.)
    if (typeof t === 'object' && t !== null) {
      return t.name || t.function?.name || '(unnamed)';
    }
    return '(unknown)';
  });
}

/**
 * Compute the difference between two tool arrays
 */
function getToolsDiff(oldTools: any[] | undefined, newTools: any[] | undefined): {
  added: string[];
  removed: string[];
  oldCount: number;
  newCount: number;
} {
  const oldNames = getToolNames(oldTools);
  const newNames = getToolNames(newTools);
  const oldSet = new Set(oldNames);
  const newSet = new Set(newNames);

  const added = newNames.filter(name => !oldSet.has(name));
  const removed = oldNames.filter(name => !newSet.has(name));

  return {
    added,
    removed,
    oldCount: oldNames.length,
    newCount: newNames.length,
  };
}

/**
 * Find the changed portion of a system prompt
 */
function getSystemPromptDiff(oldValue: string | undefined, newValue: string | undefined): {
  changeDescription: string;
  oldLength: number;
  newLength: number;
  changedChars: number;
} {
  const old = oldValue || '';
  const newer = newValue || '';

  const oldLength = old.length;
  const newLength = newer.length;

  // Simple heuristic: count differing characters
  let changedChars = Math.abs(newLength - oldLength);
  const minLen = Math.min(oldLength, newLength);
  for (let i = 0; i < minLen; i++) {
    if (old[i] !== newer[i]) {
      changedChars++;
    }
  }

  let changeDescription: string;
  if (!old && newer) {
    changeDescription = `Added (${newLength} chars)`;
  } else if (old && !newer) {
    changeDescription = `Removed (was ${oldLength} chars)`;
  } else if (newLength > oldLength) {
    changeDescription = `+${newLength - oldLength} chars (${oldLength} → ${newLength})`;
  } else if (newLength < oldLength) {
    changeDescription = `-${oldLength - newLength} chars (${oldLength} → ${newLength})`;
  } else {
    changeDescription = `Modified (~${changedChars} chars changed)`;
  }

  return { changeDescription, oldLength, newLength, changedChars };
}

/**
 * Simple value display (temperature, max_tokens, model)
 */
function SimpleValueDiff({ mod }: { mod: ParameterModification }) {
  const oldVal = formatSimpleValue(mod.oldValue);
  const newVal = formatSimpleValue(mod.newValue);

  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-inspector-muted text-xs">{getFieldLabel(mod.field)}:</span>
      <span className="font-mono text-xs">
        <span className="text-red-400 line-through">{oldVal}</span>
        <span className="text-inspector-muted mx-1">→</span>
        <span className="text-green-400">{newVal}</span>
      </span>
      <ModificationBadge type={mod.modificationType} />
    </div>
  );
}

/**
 * Tools array display with summary and expandable details
 */
function ToolsDiff({ mod }: { mod: ParameterModification }) {
  const [expanded, setExpanded] = useState(false);
  const diff = getToolsDiff(mod.oldValue, mod.newValue);

  // Build summary text
  let summaryParts: string[] = [];
  if (diff.added.length > 0) {
    summaryParts.push(`+${diff.added.slice(0, 2).join(', ')}${diff.added.length > 2 ? ` +${diff.added.length - 2} more` : ''}`);
  }
  if (diff.removed.length > 0) {
    summaryParts.push(`-${diff.removed.slice(0, 2).join(', ')}${diff.removed.length > 2 ? ` +${diff.removed.length - 2} more` : ''}`);
  }

  return (
    <div className="py-1">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-inspector-muted text-xs hover:text-inspector-text"
        >
          <span className="text-[10px]">{expanded ? '▼' : '▶'}</span>
          <span>Tools:</span>
        </button>
        <span className="font-mono text-xs">
          <span className="text-red-400">{diff.oldCount}</span>
          <span className="text-inspector-muted mx-1">→</span>
          <span className="text-green-400">{diff.newCount}</span>
        </span>
        {summaryParts.length > 0 && (
          <span className="text-xs text-inspector-muted">
            ({summaryParts.join(', ')})
          </span>
        )}
        <ModificationBadge type={mod.modificationType} />
      </div>

      {expanded && (
        <div className="mt-2 ml-4 p-2 bg-inspector-bg rounded text-xs font-mono">
          {diff.removed.length > 0 && (
            <div className="mb-1">
              <span className="text-red-400">Removed: </span>
              <span className="text-red-400/70">{diff.removed.join(', ')}</span>
            </div>
          )}
          {diff.added.length > 0 && (
            <div>
              <span className="text-green-400">Added: </span>
              <span className="text-green-400/70">{diff.added.join(', ')}</span>
            </div>
          )}
          {diff.added.length === 0 && diff.removed.length === 0 && (
            <span className="text-inspector-muted">Tools reordered or modified</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * System prompt display with summary and expandable full diff
 */
function SystemPromptDiff({ mod }: { mod: ParameterModification }) {
  const [expanded, setExpanded] = useState(false);

  // Extract text from potentially complex system prompt values
  const oldText = extractSystemPromptText(mod.oldValue);
  const newText = extractSystemPromptText(mod.newValue);
  const diff = getSystemPromptDiff(oldText, newText);

  return (
    <div className="py-1">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-inspector-muted text-xs hover:text-inspector-text"
        >
          <span className="text-[10px]">{expanded ? '▼' : '▶'}</span>
          <span>System Prompt:</span>
        </button>
        <span className="text-xs text-yellow-400">{diff.changeDescription}</span>
        <ModificationBadge type={mod.modificationType} />
      </div>

      {expanded && (
        <div className="mt-2 ml-4 space-y-2">
          {oldText && (
            <div className="p-2 bg-red-500/10 border border-red-500/20 rounded">
              <div className="text-[10px] text-red-400 mb-1 font-semibold">Previous:</div>
              <pre className="text-xs text-red-300/80 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                {oldText}
              </pre>
            </div>
          )}
          {newText && (
            <div className="p-2 bg-green-500/10 border border-green-500/20 rounded">
              <div className="text-[10px] text-green-400 mb-1 font-semibold">New:</div>
              <pre className="text-xs text-green-300/80 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                {newText}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Badge showing modification type
 */
function ModificationBadge({ type }: { type: 'intercept' | 'between_turn' }) {
  return (
    <span className={clsx(
      'px-1.5 py-0.5 rounded text-[10px] font-bold ml-auto',
      type === 'intercept'
        ? 'bg-orange-600 text-white'
        : 'bg-blue-600 text-white'
    )}>
      {type === 'intercept' ? 'Rule' : 'Turn'}
    </span>
  );
}

function getFieldLabel(field: ParameterModification['field']): string {
  switch (field) {
    case 'system':
      return 'System Prompt';
    case 'tools':
      return 'Tools';
    case 'temperature':
      return 'Temperature';
    case 'max_tokens':
      return 'Max Tokens';
    case 'model':
      return 'Model';
    default:
      return field;
  }
}

/**
 * Route to the appropriate diff component based on field type
 */
function ParameterDiff({ mod }: { mod: ParameterModification }) {
  switch (mod.field) {
    case 'system':
      return <SystemPromptDiff mod={mod} />;
    case 'tools':
      return <ToolsDiff mod={mod} />;
    case 'temperature':
    case 'max_tokens':
    case 'model':
      return <SimpleValueDiff mod={mod} />;
    default:
      return <SimpleValueDiff mod={mod} />;
  }
}

export function ParameterModificationsSection({ modifications }: Props) {
  const [expanded, setExpanded] = useState(false);

  // Build a concise summary for the collapsed state
  const summaryParts: string[] = [];
  for (const mod of modifications.modifications) {
    switch (mod.field) {
      case 'system':
        summaryParts.push('system');
        break;
      case 'tools': {
        const diff = getToolsDiff(mod.oldValue, mod.newValue);
        summaryParts.push(`tools ${diff.oldCount}→${diff.newCount}`);
        break;
      }
      case 'temperature':
        summaryParts.push(`temp ${formatSimpleValue(mod.oldValue)}→${formatSimpleValue(mod.newValue)}`);
        break;
      case 'max_tokens':
        summaryParts.push(`tokens ${formatSimpleValue(mod.oldValue)}→${formatSimpleValue(mod.newValue)}`);
        break;
      case 'model':
        summaryParts.push(`model`);
        break;
    }
  }

  const hasIntercept = modifications.modifications.some(m => m.modificationType === 'intercept');

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs font-semibold text-yellow-400 hover:text-yellow-300 transition-colors w-full"
      >
        <span className="text-[10px]">{expanded ? '▼' : '▶'}</span>
        <span>Parameters Changed</span>
        <span className="text-inspector-muted font-normal font-mono">
          {summaryParts.join(', ')}
        </span>
        {hasIntercept && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-600 text-white ml-auto">
            Rule
          </span>
        )}
      </button>

      {expanded && (
        <div className="mt-2 border rounded-lg p-3 bg-yellow-900/10 border-yellow-500/30">
          <div className="mb-3 p-2 bg-orange-900/20 border border-orange-500/30 rounded text-xs text-orange-300">
            Parameter changes affect how the model interprets this turn's context
          </div>

          <div className="space-y-1">
            {modifications.modifications.map((mod, idx) => (
              <ParameterDiff key={idx} mod={mod} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
