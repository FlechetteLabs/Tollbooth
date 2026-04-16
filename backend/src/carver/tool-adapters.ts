/**
 * Normalize provider-specific tool_use / tool_result blocks into ToolAction[].
 *
 * Handles Claude Code (Anthropic) and Codex (OpenAI) tool schemas.
 * Parsers.ts has already normalized wire formats into ContentBlock[],
 * so we only need to interpret tool name + input shape here.
 */

import {
  ContentBlock,
  ToolUseContent,
  ToolResultContent,
  ConversationTurn,
} from '../types';
import { ToolAction, ReadAction, WriteAction, EditAction, BashAction, FetchAction, DeleteAction, UnknownAction } from './types';

// Flatten a tool_result content (string | ContentBlock[]) into a single string.
export function flattenToolResult(content: string | ContentBlock[]): string {
  if (typeof content === 'string') return content;
  const parts: string[] = [];
  for (const block of content) {
    if (block.type === 'text') parts.push(block.text);
    else if (block.type === 'image') parts.push(`[image:${block.source?.media_type ?? 'unknown'}]`);
    else parts.push(`[${block.type}]`);
  }
  return parts.join('\n');
}

// Strip Read tool's cat -n style prefix: "   123\tcontent"
export function stripReadLinePrefix(s: string): string {
  const lines = s.split('\n');
  const stripped: string[] = [];
  let matched = 0;
  for (const line of lines) {
    const m = line.match(/^\s*\d+\t(.*)$/);
    if (m) {
      stripped.push(m[1]);
      matched++;
    } else {
      stripped.push(line);
    }
  }
  // Only accept stripped form if majority of lines matched (heuristic).
  if (matched >= lines.length * 0.6) return stripped.join('\n');
  return s;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface AdaptContext {
  toolUse: ToolUseContent;
  toolResult?: ToolResultContent;
  turnIdx: number;
  timestamp: number;
}

export function adaptToolUse(ctx: AdaptContext): ToolAction[] {
  const { toolUse, toolResult, turnIdx, timestamp } = ctx;
  const base = {
    tool_use_id: toolUse.id,
    turn_idx: turnIdx,
    timestamp,
    tool_name: toolUse.name,
    is_error: toolResult?.is_error,
  };
  const name = normalizeName(toolUse.name);
  const input = toolUse.input ?? {};
  const resultText = toolResult ? flattenToolResult(toolResult.content) : undefined;

  // Claude Code: Write
  if (name === 'write') {
    const path = str(input.file_path) ?? str(input.path);
    const content = str(input.content) ?? '';
    if (path) return [{ ...base, kind: 'write', path, content } satisfies WriteAction];
  }

  // Claude Code: Edit
  if (name === 'edit') {
    const path = str(input.file_path) ?? str(input.path);
    const oldS = str(input.old_string) ?? '';
    const newS = str(input.new_string) ?? '';
    const replaceAll = input.replace_all === true;
    if (path) return [{ ...base, kind: 'edit', path, old_string: oldS, new_string: newS, replace_all: replaceAll } satisfies EditAction];
  }

  // Claude Code: MultiEdit — one tool_use, many edits
  if (name === 'multiedit') {
    const path = str(input.file_path) ?? str(input.path);
    const edits = Array.isArray(input.edits) ? input.edits : [];
    if (path) {
      return edits.map((e: any, i: number): EditAction => ({
        ...base,
        tool_use_id: `${toolUse.id}#${i}`,
        kind: 'edit',
        path,
        old_string: String(e?.old_string ?? ''),
        new_string: String(e?.new_string ?? ''),
        replace_all: e?.replace_all === true,
      }));
    }
  }

  // Claude Code: Read
  if (name === 'read') {
    const path = str(input.file_path) ?? str(input.path);
    const raw = resultText;
    const content = raw !== undefined ? stripReadLinePrefix(raw) : undefined;
    if (path) return [{ ...base, kind: 'read', path, content } satisfies ReadAction];
  }

  // Claude Code: Bash / Codex: shell / local_shell / container.exec
  if (name === 'bash' || name === 'shell' || name === 'localshell' || name === 'containerexec') {
    let command: string | undefined;
    if (typeof input.command === 'string') command = input.command;
    else if (Array.isArray(input.command)) {
      const arr = input.command as unknown[];
      // bash -c "..." or sh -c "..." → take the script
      if (arr.length >= 3 && (arr[0] === 'bash' || arr[0] === 'sh') && arr[1] === '-c') {
        command = String(arr[2]);
      } else {
        command = arr.map(String).join(' ');
      }
    } else if (typeof input.cmd === 'string') command = input.cmd;
    if (command !== undefined) {
      return [{ ...base, kind: 'bash', command, output: resultText } satisfies BashAction];
    }
  }

  // Claude Code: WebFetch
  if (name === 'webfetch' || name === 'fetch') {
    const url = str(input.url);
    const prompt = str(input.prompt);
    if (url) return [{ ...base, kind: 'fetch', url, prompt, output: resultText } satisfies FetchAction];
  }

  // Codex: apply_patch
  if (name === 'applypatch' || name === 'patch') {
    const patchText = str(input.patch) ?? str(input.input) ?? '';
    if (patchText) return parseApplyPatch(patchText, base);
  }

  // Unknown tool — preserve for manifest
  return [{
    ...base,
    kind: 'unknown',
    input,
    output: resultText,
  } satisfies UnknownAction];
}

/**
 * Parse an OpenAI-style apply_patch payload.
 * Format:
 *   *** Begin Patch
 *   *** Add File: path
 *   +line
 *   *** Update File: path
 *   @@ context
 *   -old
 *   +new
 *   *** Delete File: path
 *   *** End Patch
 *
 * We convert Add→write, Delete→delete, Update→one edit per hunk.
 */
function parseApplyPatch(patch: string, base: any): ToolAction[] {
  const actions: ToolAction[] = [];
  const lines = patch.split('\n');
  let i = 0;
  let hunkIdx = 0;

  while (i < lines.length) {
    const line = lines[i];
    const addMatch = line.match(/^\*\*\*\s+Add File:\s*(.+)$/);
    const delMatch = line.match(/^\*\*\*\s+Delete File:\s*(.+)$/);
    const updMatch = line.match(/^\*\*\*\s+Update File:\s*(.+)$/);

    if (addMatch) {
      const path = addMatch[1].trim();
      i++;
      const body: string[] = [];
      while (i < lines.length && !lines[i].startsWith('***')) {
        const l = lines[i];
        if (l.startsWith('+')) body.push(l.slice(1));
        i++;
      }
      actions.push({ ...base, tool_use_id: `${base.tool_use_id}#add${hunkIdx++}`, kind: 'write', path, content: body.join('\n') } satisfies WriteAction);
    } else if (delMatch) {
      actions.push({ ...base, tool_use_id: `${base.tool_use_id}#del${hunkIdx++}`, kind: 'delete', path: delMatch[1].trim() } satisfies DeleteAction);
      i++;
    } else if (updMatch) {
      const path = updMatch[1].trim();
      i++;
      let oldBuf: string[] = [];
      let newBuf: string[] = [];
      const flushHunk = () => {
        if (oldBuf.length || newBuf.length) {
          actions.push({
            ...base,
            tool_use_id: `${base.tool_use_id}#upd${hunkIdx++}`,
            kind: 'edit',
            path,
            old_string: oldBuf.join('\n'),
            new_string: newBuf.join('\n'),
            replace_all: false,
          } satisfies EditAction);
          oldBuf = [];
          newBuf = [];
        }
      };
      while (i < lines.length && !lines[i].startsWith('***')) {
        const l = lines[i];
        if (l.startsWith('@@')) {
          flushHunk();
        } else if (l.startsWith('-')) {
          oldBuf.push(l.slice(1));
        } else if (l.startsWith('+')) {
          newBuf.push(l.slice(1));
        } else if (l.startsWith(' ')) {
          // context line — part of both sides
          oldBuf.push(l.slice(1));
          newBuf.push(l.slice(1));
        }
        i++;
      }
      flushHunk();
    } else {
      i++;
    }
  }

  return actions;
}

/**
 * Walk a Conversation's turns earliest-first and emit ToolAction[].
 * - Iterates every turn's request.messages AND response.content
 * - Dedupes by tool_use_id, keeping the earliest sighting
 * - Pairs tool_use (in assistant responses / message history) with tool_result
 *   (in subsequent user messages)
 */
export function extractToolActions(turns: ConversationTurn[]): ToolAction[] {
  // First pass: build { tool_use_id → (toolUse, turnIdx, timestamp) } — earliest wins.
  // Second pass: find tool_result for each id — earliest wins.
  const toolUses = new Map<string, { block: ToolUseContent; turnIdx: number; timestamp: number }>();
  const toolResults = new Map<string, ToolResultContent>();

  const scanBlocks = (blocks: ContentBlock[] | string | undefined, turnIdx: number, timestamp: number) => {
    if (!blocks || typeof blocks === 'string') return;
    for (const b of blocks) {
      if (b.type === 'tool_use' && !toolUses.has(b.id)) {
        toolUses.set(b.id, { block: b, turnIdx, timestamp });
      } else if (b.type === 'tool_result' && !toolResults.has(b.tool_use_id)) {
        toolResults.set(b.tool_use_id, b);
      }
    }
  };

  turns.forEach((turn, turnIdx) => {
    const ts = turn.timestamp;
    // Historical messages embedded in this turn's request (covers compaction).
    for (const msg of turn.request.messages) {
      scanBlocks(typeof msg.content === 'string' ? undefined : msg.content, turnIdx, ts);
    }
    // This turn's fresh response content.
    if (turn.response) {
      scanBlocks(turn.response.content, turnIdx, ts);
    }
  });

  // Now emit actions in tool_use id discovery order (approximates chronological).
  const actions: ToolAction[] = [];
  for (const [id, { block, turnIdx, timestamp }] of toolUses) {
    const result = toolResults.get(id);
    actions.push(...adaptToolUse({ toolUse: block, toolResult: result, turnIdx, timestamp }));
  }
  // Stable sort by turnIdx to approximate execution order.
  actions.sort((a, b) => a.turn_idx - b.turn_idx);
  return actions;
}
