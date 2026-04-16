import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:2000';

interface CarveManifest {
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

interface CarvedFile {
  path: string;
  content: string;
  origin: string;
  partial_reconstruction?: boolean;
  deleted?: boolean;
}

interface CarvedCommand {
  tool_use_id: string;
  turn_idx: number;
  command: string;
  output?: string;
  is_error?: boolean;
}

interface CarveResult {
  manifest: CarveManifest;
  files_written: CarvedFile[];
  files_read: CarvedFile[];
  commands: CarvedCommand[];
  fetches: any[];
  unknown_tools: any[];
  transcript_markdown: string;
}

interface Props {
  conversationId: string;
  onClose: () => void;
}

export function CarveModal({ conversationId, onClose }: Props) {
  const [result, setResult] = useState<CarveResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<CarvedFile | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/conversations/${conversationId}/carve`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setResult)
      .catch(e => setError(String(e)));
  }, [conversationId]);

  const downloadBundle = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `carve-${conversationId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadFile = (f: CarvedFile) => {
    const blob = new Blob([f.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.path.split('/').pop() || 'file.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadTranscript = () => {
    if (!result) return;
    const blob = new Blob([result.transcript_markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${conversationId.slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCommands = () => {
    if (!result) return;
    const lines = result.commands.map(c => JSON.stringify(c)).join('\n');
    const blob = new Blob([lines], { type: 'application/x-ndjson' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `commands-${conversationId.slice(0, 8)}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-inspector-surface border border-inspector-border rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between p-4 border-b border-inspector-border">
          <h2 className="text-lg font-semibold">Carve Session Artifacts</h2>
          <button onClick={onClose} className="text-inspector-muted hover:text-inspector-text">✕</button>
        </div>

        <div className="flex-1 overflow-auto p-4 min-h-0">
          {error && <div className="text-red-400 text-sm">Error: {error}</div>}
          {!result && !error && <div className="text-inspector-muted text-sm">Carving…</div>}
          {result && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <Stat label="Files written" value={result.manifest.counts.files_written} />
                <Stat label="Files edited" value={result.manifest.counts.files_edited} />
                <Stat label="Files read" value={result.manifest.counts.files_read} />
                <Stat label="Bash commands" value={result.manifest.counts.commands} />
                <Stat label="Web fetches" value={result.manifest.counts.fetches} />
                <Stat label="Unknown tools" value={result.manifest.counts.unknown_tools} />
              </div>

              {result.manifest.warnings.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-yellow-400">
                    {result.manifest.warnings.length} warning(s)
                  </summary>
                  <ul className="mt-2 ml-4 list-disc text-inspector-muted">
                    {result.manifest.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </details>
              )}

              <div className="flex gap-2 flex-wrap">
                <button onClick={downloadBundle} className="px-3 py-1.5 rounded text-sm bg-inspector-accent text-white hover:opacity-90">
                  Download bundle (JSON)
                </button>
                <button onClick={downloadTranscript} className="px-3 py-1.5 rounded text-sm bg-inspector-surface border border-inspector-border hover:border-inspector-accent">
                  Download transcript.md
                </button>
                <button onClick={downloadCommands} disabled={!result.commands.length} className="px-3 py-1.5 rounded text-sm bg-inspector-surface border border-inspector-border hover:border-inspector-accent disabled:opacity-50">
                  Download commands.jsonl
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FileList title="Files written" files={result.files_written} onPick={setSelectedFile} />
                <FileList title="Files read" files={result.files_read} onPick={setSelectedFile} />
              </div>

              {result.commands.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-sm font-semibold">Bash commands ({result.commands.length})</summary>
                  <div className="mt-2 space-y-2 max-h-64 overflow-auto">
                    {result.commands.map(c => (
                      <div key={c.tool_use_id} className="text-xs border border-inspector-border rounded p-2">
                        <div className={`font-mono ${c.is_error ? 'text-red-400' : ''}`}>$ {c.command}</div>
                        {c.output && <pre className="mt-1 text-inspector-muted whitespace-pre-wrap max-h-32 overflow-auto">{c.output.slice(0, 2000)}</pre>}
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {selectedFile && (
                <div className="border border-inspector-border rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-mono text-sm truncate">{selectedFile.path}</div>
                    <div className="flex gap-2">
                      <button onClick={() => downloadFile(selectedFile)} className="text-xs px-2 py-1 rounded bg-inspector-surface border border-inspector-border">Download</button>
                      <button onClick={() => setSelectedFile(null)} className="text-xs text-inspector-muted">close</button>
                    </div>
                  </div>
                  {selectedFile.partial_reconstruction && (
                    <div className="text-xs text-yellow-400 mb-1">⚠ partial reconstruction (no prior Read captured)</div>
                  )}
                  {selectedFile.deleted && <div className="text-xs text-red-400 mb-1">deleted</div>}
                  <pre className="text-xs whitespace-pre-wrap max-h-96 overflow-auto bg-black/30 p-2 rounded">{selectedFile.content.slice(0, 20000)}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-inspector-border rounded px-3 py-2">
      <div className="text-xs text-inspector-muted">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function FileList({ title, files, onPick }: { title: string; files: CarvedFile[]; onPick: (f: CarvedFile) => void }) {
  return (
    <div>
      <div className="text-sm font-semibold mb-1">{title} ({files.length})</div>
      <div className="border border-inspector-border rounded max-h-64 overflow-auto">
        {files.length === 0 && <div className="text-xs text-inspector-muted p-2">none</div>}
        {files.map(f => (
          <button
            key={f.path}
            onClick={() => onPick(f)}
            className="w-full text-left px-2 py-1 text-xs font-mono hover:bg-inspector-accent/20 border-b border-inspector-border truncate block"
            title={f.path}
          >
            {f.partial_reconstruction && '⚠ '}
            {f.deleted && '🗑 '}
            {f.path}
          </button>
        ))}
      </div>
    </div>
  );
}
