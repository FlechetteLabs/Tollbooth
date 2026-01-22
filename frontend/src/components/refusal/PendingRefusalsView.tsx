/**
 * Pending Refusals View - Queue of detected refusals awaiting user action
 */

import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { PendingRefusal } from '../../types';
import { useAppStore } from '../../stores/appStore';
import { RefusalDetailView } from './RefusalDetailView';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:2000';

export function PendingRefusalsView() {
  const { pendingRefusals, selectedRefusalId, setSelectedRefusalId } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refusalsList = Array.from(pendingRefusals.values());
  const selectedRefusal = selectedRefusalId ? pendingRefusals.get(selectedRefusalId) : null;

  // Select first refusal if none selected
  useEffect(() => {
    if (!selectedRefusalId && refusalsList.length > 0) {
      setSelectedRefusalId(refusalsList[0].id);
    }
  }, [refusalsList, selectedRefusalId, setSelectedRefusalId]);

  const handleApprove = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/pending-refusals/${id}/approve`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to approve refusal');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleModify = async (id: string, response: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/pending-refusals/${id}/modify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response }),
      });
      if (!res.ok) throw new Error('Failed to modify refusal');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async (id: string): Promise<string> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/pending-refusals/${id}/generate`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to generate alternate');
      const data = await res.json();
      return data.alternate_response;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex h-full overflow-hidden" data-testid="pending-refusals-view">
      {/* Left panel - Queue list */}
      <div className="w-80 border-r border-inspector-border flex flex-col bg-inspector-surface">
        <div className="p-4 border-b border-inspector-border">
          <h2 className="text-lg font-medium text-inspector-text">Pending Refusals</h2>
          <p className="text-xs text-inspector-muted mt-1">
            {refusalsList.length} refusal{refusalsList.length !== 1 ? 's' : ''} awaiting action
          </p>
        </div>

        {error && (
          <div className="bg-inspector-error/20 text-inspector-error px-4 py-2 text-sm">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {refusalsList.length === 0 ? (
            <div className="p-8 text-center text-inspector-muted">
              <div className="text-4xl mb-4">🎉</div>
              <p>No pending refusals</p>
              <p className="mt-2 text-sm">
                Detected refusals will appear here when LLM Rules are configured with "Prompt User" action.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-inspector-border">
              {refusalsList.map((refusal) => (
                <RefusalCard
                  key={refusal.id}
                  refusal={refusal}
                  isSelected={selectedRefusalId === refusal.id}
                  onClick={() => setSelectedRefusalId(refusal.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right panel - Detail view */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedRefusal ? (
          <RefusalDetailView
            refusal={selectedRefusal}
            loading={loading}
            onApprove={() => handleApprove(selectedRefusal.id)}
            onModify={(response) => handleModify(selectedRefusal.id, response)}
            onGenerate={() => handleGenerate(selectedRefusal.id)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-inspector-muted">
            <div className="text-center">
              <div className="text-4xl mb-4">👈</div>
              <p>Select a pending refusal to view details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface RefusalCardProps {
  refusal: PendingRefusal;
  isSelected: boolean;
  onClick: () => void;
}

function RefusalCard({ refusal, isSelected, onClick }: RefusalCardProps) {
  const timeAgo = formatTimeAgo(refusal.timestamp);
  const confidencePercent = (refusal.analysis.confidence * 100).toFixed(0);

  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left px-4 py-3 transition-colors',
        isSelected
          ? 'bg-inspector-accent/20 border-l-2 border-l-inspector-accent'
          : 'hover:bg-inspector-bg'
      )}
      data-testid={`refusal-card-${refusal.id}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-inspector-text truncate">
          {refusal.flow.request.host}
        </span>
        <span className={clsx(
          'text-xs px-1.5 py-0.5 rounded',
          parseFloat(confidencePercent) >= 80
            ? 'bg-red-500/20 text-red-400'
            : parseFloat(confidencePercent) >= 60
            ? 'bg-orange-500/20 text-orange-400'
            : 'bg-yellow-500/20 text-yellow-400'
        )}>
          {confidencePercent}%
        </span>
      </div>
      <div className="text-xs text-inspector-muted mt-1 truncate">
        {refusal.flow.request.method} {refusal.flow.request.path}
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-inspector-muted">
          Rule: {refusal.matched_rule.name}
        </span>
        <span className="text-xs text-inspector-muted">
          {timeAgo}
        </span>
      </div>
    </button>
  );
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
