/**
 * Carver — static extraction of artifacts from captured LLM sessions.
 * No inference, no execution, no network I/O.
 */

export type ToolAction =
  | WriteAction
  | EditAction
  | ReadAction
  | BashAction
  | FetchAction
  | DeleteAction
  | UnknownAction;

export interface ActionBase {
  tool_use_id: string;
  turn_idx: number;
  timestamp: number;
  tool_name: string; // raw provider name
  is_error?: boolean;
}

export interface WriteAction extends ActionBase {
  kind: 'write';
  path: string;
  content: string;
}

export interface EditAction extends ActionBase {
  kind: 'edit';
  path: string;
  old_string: string;
  new_string: string;
  replace_all: boolean;
}

export interface ReadAction extends ActionBase {
  kind: 'read';
  path: string;
  content?: string; // from tool_result, stripped of line prefixes when possible
}

export interface BashAction extends ActionBase {
  kind: 'bash';
  command: string;
  output?: string;
}

export interface FetchAction extends ActionBase {
  kind: 'fetch';
  url: string;
  prompt?: string;
  output?: string;
}

export interface DeleteAction extends ActionBase {
  kind: 'delete';
  path: string;
}

export interface UnknownAction extends ActionBase {
  kind: 'unknown';
  input: unknown;
  output?: unknown;
}

export interface CarvedFile {
  path: string;
  content: string;
  origin: 'written' | 'read' | 'edited_partial';
  last_tool_use_id: string;
  last_turn_idx: number;
  history: Array<{
    tool_use_id: string;
    turn_idx: number;
    op: 'write' | 'edit' | 'read' | 'delete';
    note?: string;
  }>;
  partial_reconstruction?: boolean;
  deleted?: boolean;
}

export interface CarvedCommand {
  tool_use_id: string;
  turn_idx: number;
  timestamp: number;
  command: string;
  output?: string;
  is_error?: boolean;
}

export interface CarvedFetch {
  tool_use_id: string;
  turn_idx: number;
  timestamp: number;
  url: string;
  prompt?: string;
  output?: string;
  is_error?: boolean;
}

export interface CarveManifest {
  conversation_id: string;
  carved_at: number;
  tollbooth_version: string;
  provider: string;
  model: string;
  turn_count: number;
  counts: {
    files_written: number;
    files_read: number;
    files_edited: number;
    commands: number;
    fetches: number;
    unknown_tools: number;
  };
  warnings: string[];
}

export interface TranscriptEntry {
  turn_idx: number;
  timestamp: number;
  role: 'user' | 'assistant';
  text?: string;
  thinking?: string;
  tool_uses?: Array<{ id: string; name: string; input_summary: string }>;
  tool_results?: Array<{ tool_use_id: string; output_summary: string; is_error?: boolean }>;
}

export interface CarveResult {
  manifest: CarveManifest;
  files_written: CarvedFile[];
  files_read: CarvedFile[];
  commands: CarvedCommand[];
  fetches: CarvedFetch[];
  unknown_tools: UnknownAction[];
  transcript: TranscriptEntry[];
  transcript_markdown: string;
}
