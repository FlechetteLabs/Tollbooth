/**
 * Smoke test: feeds synthesized Chat Completions (streaming) and Codex
 * Responses API fixtures through parseResponse/parseRequest, builds a
 * Conversation, runs carve(), and asserts expected ToolAction output.
 *
 * Run inside the backend container:
 *   docker compose run --rm backend node dist/carver/smoke-test.js
 */

import { OpenAIParser, CodexParser } from '../parsers';
import { carve } from './carve';
import { Conversation, ConversationTurn, HttpRequest, HttpResponse } from '../types';

let failures = 0;
function assertEq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.log(`  ✗ ${msg}`);
    console.log(`    expected: ${e}`);
    console.log(`    actual:   ${a}`);
    failures++;
  }
}
function assertTrue(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.log(`  ✗ ${msg}`); failures++; }
}

function mkFlowParts(reqBody: any, resBody: string, resIsJSON = false) {
  const request: HttpRequest = {
    method: 'POST',
    url: '',
    host: '',
    port: 443,
    path: '',
    headers: {},
    content: JSON.stringify(reqBody),
  };
  const response: HttpResponse = {
    status_code: 200,
    reason: 'OK',
    headers: { 'content-type': resIsJSON ? 'application/json' : 'text/event-stream' },
    content: resBody,
  };
  return { request, response };
}

// ============ Test 1: OpenAI Chat Completions streaming with tool_calls ============
function testOpenAIStreaming() {
  console.log('\n[Test 1] OpenAI Chat Completions streaming tool_calls');

  // Two tool_calls streamed by index, args split across chunks.
  const sse = [
    `data: ${JSON.stringify({ model: 'gpt-4o', choices: [{ index: 0, delta: { role: 'assistant' } }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "I'll write the file." } }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'write', arguments: '{"file_path":"/w/a.txt"' } }] } }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: ',"content":"hi"}' } }] } }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [{ index: 1, id: 'call_2', function: { name: 'bash', arguments: '{"command":"ls"}' } }] } }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })}\n\n`,
    `data: [DONE]\n\n`,
  ].join('');

  const parser = new OpenAIParser();
  const parts = mkFlowParts(
    { model: 'gpt-4o', messages: [{ role: 'user', content: 'write a.txt and ls' }], stream: true },
    sse
  );
  const req = parser.parseRequest(parts.request);
  const res = parser.parseResponse(parts.response);

  assertTrue(!!res, 'parsed response');
  assertTrue(!!res?.content, 'has content');
  const tools = (res?.content || []).filter(b => b.type === 'tool_use');
  assertEq(tools.length, 2, 'two tool_uses emitted');
  assertEq((tools[0] as any).name, 'write', 'first tool name=write');
  assertEq((tools[0] as any).input, { file_path: '/w/a.txt', content: 'hi' }, 'first tool args reassembled');
  assertEq((tools[1] as any).name, 'bash', 'second tool name=bash');
  assertEq((tools[1] as any).input, { command: 'ls' }, 'second tool args');

  // Build a single-turn Conversation and carve it. The tool_result for these
  // calls would arrive in a follow-up turn; for this test we verify the parser
  // surface only.
  const turn: ConversationTurn = {
    turn_id: 't1', flow_id: 'f1', timestamp: 1, streaming: true,
    request: req!, response: res!,
  };
  const conv: Conversation = {
    conversation_id: 'c1', created_at: 1, updated_at: 1,
    model: 'gpt-4o', provider: 'openai',
    turns: [turn], message_count: 2,
  };
  const result = carve(conv);
  assertEq(result.manifest.counts.files_written, 1, 'carve: 1 file written');
  assertEq(result.files_written[0].path, '/w/a.txt', 'file path');
  assertEq(result.files_written[0].content, 'hi', 'file content');
  assertEq(result.manifest.counts.commands, 1, 'carve: 1 command (ls, no output yet)');
  assertEq(result.commands[0].command, 'ls', 'command text');
}

// ============ Test 2: Codex Responses API with local_shell_call + apply_patch ============
function testCodexFullFlow() {
  console.log('\n[Test 2] Codex Responses API: local_shell_call + apply_patch across turns');

  const parser = new CodexParser();

  // --- Turn 1 response: assistant emits local_shell_call for `ls` ---
  const sseT1 = [
    `event: response.output_item.done\ndata: ${JSON.stringify({
      type: 'response.output_item.done',
      item: {
        type: 'local_shell_call',
        call_id: 'sh_1',
        status: 'completed',
        action: { type: 'exec', command: ['ls', '/w'], working_directory: '/w', timeout_ms: 5000 },
      },
    })}\n\n`,
    `event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response: { status: 'completed', model: 'gpt-5-codex' } })}\n\n`,
  ].join('');

  // --- Turn 2 request: includes prior local_shell_call and its output in input[] ---
  const reqT2 = {
    model: 'gpt-5-codex',
    instructions: 'you are codex',
    input: [
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'list files and write hello.txt' }] },
      { type: 'local_shell_call', call_id: 'sh_1', status: 'completed',
        action: { type: 'exec', command: ['ls', '/w'] } },
      { type: 'function_call_output', call_id: 'sh_1', output: 'Exit code: 0\n\nhello.txt\nother.txt' },
    ],
    stream: true,
  };

  // --- Turn 2 response: assistant emits apply_patch function_call writing a new file ---
  const patchText = '*** Begin Patch\n*** Add File: /w/hello.txt\n+Hello, carve!\n*** End Patch';
  const sseT2 = [
    `event: response.output_item.done\ndata: ${JSON.stringify({
      type: 'response.output_item.done',
      item: {
        type: 'function_call',
        call_id: 'ap_1',
        name: 'apply_patch',
        arguments: JSON.stringify({ input: patchText }),
      },
    })}\n\n`,
    `event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response: { status: 'completed' } })}\n\n`,
  ].join('');

  // --- Turn 3 request: has the apply_patch output too, so carver sees it complete ---
  const reqT3 = {
    model: 'gpt-5-codex',
    input: [
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'list files and write hello.txt' }] },
      { type: 'local_shell_call', call_id: 'sh_1', action: { type: 'exec', command: ['ls', '/w'] } },
      { type: 'function_call_output', call_id: 'sh_1', output: 'Exit code: 0\n\nhello.txt\nother.txt' },
      { type: 'function_call', call_id: 'ap_1', name: 'apply_patch', arguments: JSON.stringify({ input: patchText }) },
      { type: 'function_call_output', call_id: 'ap_1', output: 'Success' },
    ],
    stream: true,
  };

  // Parse
  const reqT1 = { model: 'gpt-5-codex', input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'list files and write hello.txt' }] }], stream: true };
  const p1 = mkFlowParts(reqT1, sseT1);
  const p2 = mkFlowParts(reqT2, sseT2);
  const p3 = mkFlowParts(reqT3, '');

  const t1 = { turn_id: 't1', flow_id: 'f1', timestamp: 1, streaming: true,
    request: parser.parseRequest(p1.request)!, response: parser.parseResponse(p1.response)! };
  const t2 = { turn_id: 't2', flow_id: 'f2', timestamp: 2, streaming: true,
    request: parser.parseRequest(p2.request)!, response: parser.parseResponse(p2.response)! };
  const t3 = { turn_id: 't3', flow_id: 'f3', timestamp: 3, streaming: true,
    request: parser.parseRequest(p3.request)!, response: undefined };

  // Sanity-check parser output before carving
  assertTrue(!!t1.response, 'T1 response parsed');
  const t1Tools = (t1.response?.content || []).filter(b => b.type === 'tool_use');
  assertEq(t1Tools.length, 1, 'T1: 1 tool_use');
  assertEq((t1Tools[0] as any).name, 'local_shell_call', 'T1 tool name=local_shell_call');
  assertEq((t1Tools[0] as any).input.command, ['ls', '/w'], 'T1 command array');

  // T2 request should have the function_call_output from T1 as a tool_result in message history
  const t2Msgs = t2.request.messages;
  const hasToolResult = t2Msgs.some(m => Array.isArray(m.content) && m.content.some(b => b.type === 'tool_result' && b.tool_use_id === 'sh_1'));
  assertTrue(hasToolResult, 'T2 request carries tool_result for sh_1');

  // Build conversation and carve
  const conv: Conversation = {
    conversation_id: 'c2', created_at: 1, updated_at: 3,
    model: 'gpt-5-codex', provider: 'openai',
    turns: [t1, t2, t3] as ConversationTurn[], message_count: 6,
  };
  const result = carve(conv);

  console.log('  counts:', JSON.stringify(result.manifest.counts));
  console.log('  warnings:', result.manifest.warnings);

  // Expectations:
  //  - 1 bash command (ls /w) with output "Exit code: 0\n\nhello.txt\nother.txt"
  //  - 1 file written (/w/hello.txt from apply_patch with content "Hello, carve!")
  //  - 0 unknown tools
  assertEq(result.manifest.counts.commands, 1, '1 bash command carved');
  assertEq(result.commands[0].command, 'ls /w', 'command joined from array');
  assertTrue((result.commands[0].output || '').includes('hello.txt'), 'bash output contains hello.txt');
  assertEq(result.manifest.counts.files_written, 1, '1 file written from apply_patch');
  assertEq(result.files_written[0].path, '/w/hello.txt', 'patch path');
  assertEq(result.files_written[0].content, 'Hello, carve!', 'patch content');
  assertEq(result.manifest.counts.unknown_tools, 0, '0 unknown tools');
}

testOpenAIStreaming();
testCodexFullFlow();

console.log('\n' + (failures === 0 ? 'ALL PASS' : `${failures} FAILURES`));
process.exit(failures === 0 ? 0 : 1);
