import React, { useState } from 'react';
import { TrafficFlow, ReplayVariant } from '../../types';

interface CreateVariantModalProps {
  flow: TrafficFlow;
  parentVariant?: ReplayVariant;
  onClose: () => void;
  onCreated: (variant: ReplayVariant) => void;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const CreateVariantModal: React.FC<CreateVariantModalProps> = ({
  flow,
  parentVariant,
  onClose,
  onCreated,
}) => {
  const sourceRequest = parentVariant?.request || {
    method: flow.request.method,
    url: flow.request.url,
    headers: { ...flow.request.headers },
    body: flow.request.content || '',
  };

  const [description, setDescription] = useState('');
  const [method, setMethod] = useState(sourceRequest.method);
  const [url, setUrl] = useState(sourceRequest.url);
  const [headers, setHeaders] = useState(JSON.stringify(sourceRequest.headers, null, 2));
  const [body, setBody] = useState(sourceRequest.body);
  const [interceptOnReplay, setInterceptOnReplay] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!description.trim()) {
      setError('Description is required');
      return;
    }

    let parsedHeaders: Record<string, string>;
    try {
      parsedHeaders = JSON.parse(headers);
    } catch {
      setError('Invalid headers JSON');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/replay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parent_flow_id: flow.flow_id,
          parent_variant_id: parentVariant?.variant_id,
          request: {
            method,
            url,
            headers: parsedHeaders,
            body,
          },
          description,
          intercept_on_replay: interceptOnReplay,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create variant');
      }

      const data = await res.json();
      onCreated(data.variant);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-medium text-white">
            {parentVariant ? 'Create Variant from Variant' : 'Create Replay Variant'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto max-h-[calc(90vh-120px)]">
          {error && (
            <div className="p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-1">Description *</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Test with different API key"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-[100px_1fr] gap-2">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Method</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 focus:outline-none focus:border-blue-500"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
                <option value="PATCH">PATCH</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">URL</label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Headers (JSON)</label>
            <textarea
              value={headers}
              onChange={(e) => setHeaders(e.target.value)}
              rows={5}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 font-mono focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 font-mono focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="interceptOnReplay"
              checked={interceptOnReplay}
              onChange={(e) => setInterceptOnReplay(e.target.checked)}
              className="rounded bg-gray-700 border-gray-600"
            />
            <label htmlFor="interceptOnReplay" className="text-sm text-gray-300">
              Intercept response when replayed
            </label>
          </div>
        </form>

        <div className="px-4 py-3 border-t border-gray-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50"
          >
            {isSubmitting ? 'Creating...' : 'Create Variant'}
          </button>
        </div>
      </div>
    </div>
  );
};
