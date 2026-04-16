/**
 * VirtualFS — in-memory file-state replay from ToolAction[].
 * Pure: no real filesystem I/O.
 */

import { ToolAction, CarvedFile } from './types';

interface VFSEntry {
  path: string;
  currentContent: string | null; // null = deleted
  initialRead?: string;
  origin: 'written' | 'read' | 'edited_partial';
  last_tool_use_id: string;
  last_turn_idx: number;
  history: CarvedFile['history'];
  partial_reconstruction?: boolean;
  deleted?: boolean;
}

export interface VFSResult {
  files_written: CarvedFile[]; // touched via write/edit (final state)
  files_read: CarvedFile[];    // touched via read only, never modified
  warnings: string[];
}

export function replayToVFS(actions: ToolAction[]): VFSResult {
  const entries = new Map<string, VFSEntry>();
  const touchedByWrite = new Set<string>();
  const warnings: string[] = [];

  const getOrInit = (path: string, origin: VFSEntry['origin']): VFSEntry => {
    let e = entries.get(path);
    if (!e) {
      e = {
        path,
        currentContent: null,
        origin,
        last_tool_use_id: '',
        last_turn_idx: -1,
        history: [],
      };
      entries.set(path, e);
    }
    return e;
  };

  for (const a of actions) {
    if (a.kind === 'read') {
      const e = getOrInit(a.path, 'read');
      if (a.content !== undefined && e.initialRead === undefined && e.currentContent === null && !touchedByWrite.has(a.path)) {
        e.initialRead = a.content;
        e.currentContent = a.content;
      }
      e.last_tool_use_id = a.tool_use_id;
      e.last_turn_idx = a.turn_idx;
      e.history.push({ tool_use_id: a.tool_use_id, turn_idx: a.turn_idx, op: 'read' });
    } else if (a.kind === 'write') {
      const e = getOrInit(a.path, 'written');
      e.origin = 'written';
      e.currentContent = a.content;
      e.deleted = false;
      e.last_tool_use_id = a.tool_use_id;
      e.last_turn_idx = a.turn_idx;
      e.history.push({ tool_use_id: a.tool_use_id, turn_idx: a.turn_idx, op: 'write' });
      touchedByWrite.add(a.path);
    } else if (a.kind === 'edit') {
      const e = getOrInit(a.path, 'written');
      let note: string | undefined;
      if (e.currentContent === null) {
        // No prior Read/Write captured — partial reconstruction.
        // Seed with new_string as an approximation of the post-edit region.
        e.partial_reconstruction = true;
        e.currentContent = a.new_string;
        e.origin = 'edited_partial';
        note = 'no_prior_content';
        warnings.push(`Edit on ${a.path} without prior content (tool_use ${a.tool_use_id}); partial reconstruction.`);
      } else {
        if (a.replace_all) {
          if (!e.currentContent.includes(a.old_string)) {
            note = 'old_string_not_found';
            warnings.push(`replace_all Edit on ${a.path}: old_string not found.`);
          } else {
            e.currentContent = e.currentContent.split(a.old_string).join(a.new_string);
          }
        } else {
          const idx = e.currentContent.indexOf(a.old_string);
          if (idx === -1) {
            note = 'old_string_not_found';
            warnings.push(`Edit on ${a.path}: old_string not found.`);
          } else {
            const next = e.currentContent.indexOf(a.old_string, idx + a.old_string.length);
            if (next !== -1) {
              note = 'ambiguous_edit';
              warnings.push(`Edit on ${a.path}: old_string matched multiple times; applied first.`);
            }
            e.currentContent = e.currentContent.slice(0, idx) + a.new_string + e.currentContent.slice(idx + a.old_string.length);
          }
        }
        if (e.origin === 'read') e.origin = 'written';
      }
      e.deleted = false;
      e.last_tool_use_id = a.tool_use_id;
      e.last_turn_idx = a.turn_idx;
      e.history.push({ tool_use_id: a.tool_use_id, turn_idx: a.turn_idx, op: 'edit', note });
      touchedByWrite.add(a.path);
    } else if (a.kind === 'delete') {
      const e = getOrInit(a.path, 'written');
      e.currentContent = null;
      e.deleted = true;
      e.last_tool_use_id = a.tool_use_id;
      e.last_turn_idx = a.turn_idx;
      e.history.push({ tool_use_id: a.tool_use_id, turn_idx: a.turn_idx, op: 'delete' });
      touchedByWrite.add(a.path);
    }
  }

  const files_written: CarvedFile[] = [];
  const files_read: CarvedFile[] = [];

  for (const e of entries.values()) {
    const carved: CarvedFile = {
      path: e.path,
      content: e.currentContent ?? '',
      origin: e.origin,
      last_tool_use_id: e.last_tool_use_id,
      last_turn_idx: e.last_turn_idx,
      history: e.history,
      partial_reconstruction: e.partial_reconstruction,
      deleted: e.deleted,
    };
    if (touchedByWrite.has(e.path)) {
      files_written.push(carved);
    } else if (e.origin === 'read' && e.initialRead !== undefined) {
      files_read.push(carved);
    }
  }

  return { files_written, files_read, warnings };
}
