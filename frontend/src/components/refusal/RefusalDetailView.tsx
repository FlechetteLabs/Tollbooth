/**
 * Refusal Detail View - Shows refusal details and action buttons
 */

import { useState } from 'react';
import { clsx } from 'clsx';
import { PendingRefusal } from '../../types';

interface RefusalDetailViewProps {
  refusal: PendingRefusal;
  loading: boolean;
  onApprove: () => void;
  onModify: (response: string) => void;
  onGenerate: () => Promise<string>;
}

export function RefusalDetailView({
  refusal,
  loading,
  onApprove,
  onModify,
  onGenerate,
}: RefusalDetailViewProps) {
  const [alternateResponse, setAlternateResponse] = useState(refusal.modified_response || '');
  const [generating, setGenerating] = useState(false);
  const [showOriginal, setShowOriginal] = useState(true);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const response = await onGenerate();
      setAlternateResponse(response);
      setShowOriginal(false);
    } catch {
      // Error handling is done in parent
    } finally {
      setGenerating(false);
    }
  };

  const handleForwardModified = () => {
    if (alternateResponse.trim()) {
      onModify(alternateResponse);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden" data-testid="refusal-detail-view">
      {/* Header */}
      <div className="p-4 border-b border-inspector-border bg-inspector-surface">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-medium text-inspector-text">
                {refusal.flow.request.method} {refusal.flow.request.host}{refusal.flow.request.path}
              </h3>
              <span className={clsx(
                'text-xs px-2 py-0.5 rounded',
                refusal.analysis.confidence >= 0.8
                  ? 'bg-red-500/20 text-red-400'
                  : refusal.analysis.confidence >= 0.6
                  ? 'bg-orange-500/20 text-orange-400'
                  : 'bg-yellow-500/20 text-yellow-400'
              )}>
                {(refusal.analysis.confidence * 100).toFixed(0)}% confidence
              </span>
            </div>
            <p className="text-sm text-inspector-muted mt-1">
              Matched by: {refusal.matched_rule.name}
            </p>
          </div>
          <div className="text-right text-xs text-inspector-muted">
            <div>Analyzed {refusal.analysis.tokens_analyzed} tokens</div>
            <div>in {refusal.analysis.analysis_time_ms}ms</div>
          </div>
        </div>
      </div>

      {/* Analysis results */}
      <div className="p-4 border-b border-inspector-border bg-inspector-bg">
        <h4 className="text-sm font-medium text-inspector-text mb-2">Classification Labels</h4>
        <div className="flex flex-wrap gap-2">
          {refusal.analysis.labels.map((label, idx) => (
            <span
              key={idx}
              className={clsx(
                'text-xs px-2 py-1 rounded',
                label.score > 0.5
                  ? 'bg-inspector-accent/20 text-inspector-accent'
                  : 'bg-inspector-border text-inspector-muted'
              )}
            >
              {label.label}: {(label.score * 100).toFixed(0)}%
            </span>
          ))}
        </div>
      </div>

      {/* Response content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Tab buttons */}
        <div className="flex gap-2 p-4 border-b border-inspector-border">
          <button
            onClick={() => setShowOriginal(true)}
            className={clsx(
              'px-3 py-1 text-sm rounded transition-colors',
              showOriginal
                ? 'bg-inspector-accent text-white'
                : 'bg-inspector-bg text-inspector-muted hover:text-inspector-text'
            )}
          >
            Original Response
          </button>
          <button
            onClick={() => setShowOriginal(false)}
            className={clsx(
              'px-3 py-1 text-sm rounded transition-colors',
              !showOriginal
                ? 'bg-inspector-accent text-white'
                : 'bg-inspector-bg text-inspector-muted hover:text-inspector-text'
            )}
          >
            {alternateResponse ? 'Alternate Response' : 'Generate Alternate'}
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-4">
          {showOriginal ? (
            <div className="font-mono text-sm whitespace-pre-wrap break-all bg-inspector-bg p-4 rounded border border-inspector-border text-inspector-text">
              {refusal.original_response}
            </div>
          ) : (
            <div className="space-y-4">
              {alternateResponse ? (
                <textarea
                  value={alternateResponse}
                  onChange={(e) => setAlternateResponse(e.target.value)}
                  className="w-full h-64 font-mono text-sm bg-inspector-bg p-4 rounded border border-inspector-border text-inspector-text focus:outline-none focus:border-inspector-accent resize-none"
                  placeholder="Edit the alternate response..."
                />
              ) : (
                <div className="text-center py-12">
                  <p className="text-inspector-muted mb-4">
                    Generate an alternate response using the configured LLM
                  </p>
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="px-4 py-2 bg-inspector-accent hover:bg-inspector-accent/80 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {generating ? 'Generating...' : 'Generate Alternate'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="p-4 border-t border-inspector-border bg-inspector-surface flex items-center justify-between">
        <div className="text-xs text-inspector-muted">
          Auto-forwards in {formatTimeRemaining(refusal.timestamp)} if no action taken
        </div>
        <div className="flex gap-3">
          <button
            onClick={onApprove}
            disabled={loading}
            className="px-4 py-2 bg-inspector-bg hover:bg-inspector-border text-inspector-text rounded disabled:opacity-50 transition-colors"
          >
            Approve Original
          </button>
          <button
            onClick={handleGenerate}
            disabled={loading || generating}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded disabled:opacity-50 transition-colors"
          >
            {generating ? 'Generating...' : 'Generate Alternative'}
          </button>
          <button
            onClick={handleForwardModified}
            disabled={loading || !alternateResponse.trim()}
            className="px-4 py-2 bg-inspector-accent hover:bg-inspector-accent/80 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Forward Modified
          </button>
        </div>
      </div>
    </div>
  );
}

function formatTimeRemaining(timestamp: number): string {
  const elapsed = Date.now() - timestamp;
  const remaining = 5 * 60 * 1000 - elapsed; // 5 minute timeout

  if (remaining <= 0) return 'any moment';

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}
