/**
 * Top-level carve: Conversation → CarveResult.
 * Pure function. No I/O. Portable to browser.
 */

import { Conversation, ConversationTurn, ContentBlock } from '../types';
import {
  CarveResult,
  CarveManifest,
  CarvedCommand,
  CarvedFetch,
  TranscriptEntry,
  UnknownAction,
} from './types';
import { extractToolActions } from './tool-adapters';
import { replayToVFS } from './virtual-fs';

const CARVER_VERSION = '0.1.0';

const SUMMARY_LIMIT = 400;
function summarize(s: string | undefined, limit = SUMMARY_LIMIT): string {
  if (!s) return '';
  if (s.length <= limit) return s;
  return s.slice(0, limit) + `…[${s.length - limit} more chars]`;
}

function buildTranscript(turns: ConversationTurn[]): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  const seenMessageHashes = new Set<string>();

  const hashMsg = (role: string, content: unknown): string => {
    try {
      return role + ':' + JSON.stringify(content).slice(0, 500);
    } catch {
      return role + ':unserializable';
    }
  };

  const emitBlocks = (
    blocks: ContentBlock[] | string,
    role: 'user' | 'assistant',
    turnIdx: number,
    timestamp: number
  ) => {
    const entry: TranscriptEntry = { turn_idx: turnIdx, timestamp, role };
    if (typeof blocks === 'string') {
      entry.text = blocks;
      entries.push(entry);
      return;
    }
    const textParts: string[] = [];
    const thinkingParts: string[] = [];
    for (const b of blocks) {
      if (b.type === 'text') textParts.push(b.text);
      else if (b.type === 'thinking') thinkingParts.push(b.thinking);
      else if (b.type === 'tool_use') {
        (entry.tool_uses ??= []).push({
          id: b.id,
          name: b.name,
          input_summary: summarize(JSON.stringify(b.input)),
        });
      } else if (b.type === 'tool_result') {
        const out = typeof b.content === 'string' ? b.content : JSON.stringify(b.content);
        (entry.tool_results ??= []).push({
          tool_use_id: b.tool_use_id,
          output_summary: summarize(out),
          is_error: b.is_error,
        });
      }
    }
    if (textParts.length) entry.text = textParts.join('\n');
    if (thinkingParts.length) entry.thinking = thinkingParts.join('\n');
    if (entry.text || entry.thinking || entry.tool_uses || entry.tool_results) {
      entries.push(entry);
    }
  };

  turns.forEach((turn, turnIdx) => {
    const ts = turn.timestamp;
    // Walk all messages in the request; dedupe by content hash across turns.
    for (const msg of turn.request.messages) {
      if (msg.role === 'system') continue;
      const h = hashMsg(msg.role, msg.content);
      if (seenMessageHashes.has(h)) continue;
      seenMessageHashes.add(h);
      emitBlocks(msg.content as ContentBlock[] | string, msg.role, turnIdx, ts);
    }
    // Assistant response for this turn.
    if (turn.response) {
      const h = hashMsg('assistant', turn.response.content);
      if (!seenMessageHashes.has(h)) {
        seenMessageHashes.add(h);
        emitBlocks(turn.response.content, 'assistant', turnIdx, ts);
      }
    }
  });

  return entries;
}

function transcriptToMarkdown(entries: TranscriptEntry[], conv: Conversation): string {
  const out: string[] = [];
  out.push(`# Conversation ${conv.conversation_id}`);
  out.push('');
  out.push(`- Provider: ${conv.provider}`);
  out.push(`- Model: ${conv.model}`);
  out.push(`- Turns: ${conv.turns.length}`);
  out.push(`- Started: ${new Date(conv.created_at).toISOString()}`);
  out.push('');
  for (const e of entries) {
    out.push(`## Turn ${e.turn_idx} — ${e.role} — ${new Date(e.timestamp).toISOString()}`);
    if (e.thinking) {
      out.push('');
      out.push('<details><summary>thinking</summary>');
      out.push('');
      out.push('````');
      out.push(e.thinking);
      out.push('````');
      out.push('</details>');
    }
    if (e.text) {
      out.push('');
      out.push(e.text);
    }
    if (e.tool_uses?.length) {
      for (const tu of e.tool_uses) {
        out.push('');
        out.push(`**tool_use** \`${tu.name}\` (${tu.id})`);
        out.push('````json');
        out.push(tu.input_summary);
        out.push('````');
      }
    }
    if (e.tool_results?.length) {
      for (const tr of e.tool_results) {
        out.push('');
        out.push(`**tool_result** ← ${tr.tool_use_id}${tr.is_error ? ' [ERROR]' : ''}`);
        out.push('````');
        out.push(tr.output_summary);
        out.push('````');
      }
    }
    out.push('');
  }
  return out.join('\n');
}

export interface CarveOptions {
  includeThinking?: boolean; // reserved; transcript always includes, UI may filter
}

export function carve(conversation: Conversation, _opts: CarveOptions = {}): CarveResult {
  const actions = extractToolActions(conversation.turns);
  const vfs = replayToVFS(actions);

  const commands: CarvedCommand[] = [];
  const fetches: CarvedFetch[] = [];
  const unknown_tools: UnknownAction[] = [];

  for (const a of actions) {
    if (a.kind === 'bash') {
      commands.push({
        tool_use_id: a.tool_use_id,
        turn_idx: a.turn_idx,
        timestamp: a.timestamp,
        command: a.command,
        output: a.output,
        is_error: a.is_error,
      });
    } else if (a.kind === 'fetch') {
      fetches.push({
        tool_use_id: a.tool_use_id,
        turn_idx: a.turn_idx,
        timestamp: a.timestamp,
        url: a.url,
        prompt: a.prompt,
        output: a.output,
        is_error: a.is_error,
      });
    } else if (a.kind === 'unknown') {
      unknown_tools.push(a);
    }
  }

  const filesEdited = vfs.files_written.filter(f =>
    f.history.some(h => h.op === 'edit')
  ).length;

  const manifest: CarveManifest = {
    conversation_id: conversation.conversation_id,
    carved_at: Date.now(),
    tollbooth_version: CARVER_VERSION,
    provider: conversation.provider,
    model: conversation.model,
    turn_count: conversation.turns.length,
    counts: {
      files_written: vfs.files_written.length,
      files_read: vfs.files_read.length,
      files_edited: filesEdited,
      commands: commands.length,
      fetches: fetches.length,
      unknown_tools: unknown_tools.length,
    },
    warnings: vfs.warnings,
  };

  const transcript = buildTranscript(conversation.turns);
  const transcript_markdown = transcriptToMarkdown(transcript, conversation);

  return {
    manifest,
    files_written: vfs.files_written,
    files_read: vfs.files_read,
    commands,
    fetches,
    unknown_tools,
    transcript,
    transcript_markdown,
  };
}
