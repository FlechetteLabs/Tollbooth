import React, { useState, useEffect } from 'react';
import { ReplayVariant, TrafficFlow } from '../../types';
import { CreateVariantModal } from './CreateVariantModal';
import { AnnotationPanel } from '../shared/AnnotationPanel';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:2000';

interface VariantWithChildren extends ReplayVariant {
  children?: VariantWithChildren[];
}

interface VariantTreeData {
  flow_id: string;
  variants: VariantWithChildren[];
}

type DetailMode = 'original' | 'variant';

export const ReplayView: React.FC = () => {
  const [flowsWithVariants, setFlowsWithVariants] = useState<string[]>([]);
  const [replayNames, setReplayNames] = useState<Record<string, string>>({});
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<TrafficFlow | null>(null);
  const [variantTree, setVariantTree] = useState<VariantTreeData | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ReplayVariant | null>(null);
  const [resultFlow, setResultFlow] = useState<TrafficFlow | null>(null);
  const [detailMode, setDetailMode] = useState<DetailMode>('original');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [parentVariantForCreate, setParentVariantForCreate] = useState<ReplayVariant | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');

  // Fetch all flows with variants and their names
  useEffect(() => {
    const fetchFlowsWithVariants = async () => {
      setIsLoading(true);
      try {
        const [variantsRes, namesRes] = await Promise.all([
          fetch(`${API_BASE}/api/replay`),
          fetch(`${API_BASE}/api/replay/names`),
        ]);

        if (variantsRes.ok) {
          const data = await variantsRes.json();
          // Extract unique flow IDs
          const flowIds = new Set<string>();
          for (const v of data.variants || []) {
            flowIds.add(v.parent_flow_id);
          }
          setFlowsWithVariants(Array.from(flowIds));
        }

        if (namesRes.ok) {
          const namesData = await namesRes.json();
          setReplayNames(namesData.names || {});
        }
      } catch (err) {
        console.error('Failed to fetch variants:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchFlowsWithVariants();
  }, []);

  // Fetch flow and variant tree when flow selected
  useEffect(() => {
    if (!selectedFlowId) {
      setVariantTree(null);
      setSelectedFlow(null);
      setSelectedVariant(null);
      setResultFlow(null);
      setDetailMode('original');
      return;
    }

    const fetchData = async () => {
      try {
        const [treeRes, flowRes] = await Promise.all([
          fetch(`${API_BASE}/api/replay/tree/${selectedFlowId}`),
          fetch(`${API_BASE}/api/traffic/${selectedFlowId}`),
        ]);

        if (treeRes.ok) {
          const data = await treeRes.json();
          setVariantTree(data);
        }

        if (flowRes.ok) {
          const flowData = await flowRes.json();
          setSelectedFlow(flowData);
        }

        // Reset to original view when selecting a new flow
        setSelectedVariant(null);
        setResultFlow(null);
        setDetailMode('original');
      } catch (err) {
        console.error('Failed to fetch data:', err);
      }
    };
    fetchData();
  }, [selectedFlowId]);

  // Fetch result flow when variant with result is selected
  useEffect(() => {
    if (!selectedVariant?.result?.result_flow_id) {
      setResultFlow(null);
      return;
    }

    const fetchResultFlow = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/traffic/${selectedVariant.result!.result_flow_id}`);
        if (res.ok) {
          const data = await res.json();
          setResultFlow(data);
        }
      } catch (err) {
        console.error('Failed to fetch result flow:', err);
      }
    };
    fetchResultFlow();
  }, [selectedVariant?.result?.result_flow_id]);

  const handleSelectVariant = (variant: ReplayVariant) => {
    setSelectedVariant(variant);
    setDetailMode('variant');
  };

  const handleSelectOriginal = () => {
    setSelectedVariant(null);
    setResultFlow(null);
    setDetailMode('original');
  };

  const handleSendReplay = async (variant: ReplayVariant) => {
    try {
      const res = await fetch(`${API_BASE}/api/replay/${variant.variant_id}/send`, {
        method: 'POST',
      });
      if (res.ok) {
        // Refresh the variant
        const updatedRes = await fetch(`${API_BASE}/api/replay/${variant.variant_id}`);
        if (updatedRes.ok) {
          const updatedVariant = await updatedRes.json();
          setSelectedVariant(updatedVariant);
          // Refresh tree
          if (selectedFlowId) {
            const treeRes = await fetch(`${API_BASE}/api/replay/tree/${selectedFlowId}`);
            if (treeRes.ok) {
              setVariantTree(await treeRes.json());
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to send replay:', err);
    }
  };

  const handleDeleteVariant = async (variant: ReplayVariant) => {
    if (!confirm('Delete this variant?')) return;

    try {
      const res = await fetch(`${API_BASE}/api/replay/${variant.variant_id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setSelectedVariant(null);
        setDetailMode('original');
        // Refresh tree
        if (selectedFlowId) {
          const treeRes = await fetch(`${API_BASE}/api/replay/tree/${selectedFlowId}`);
          if (treeRes.ok) {
            setVariantTree(await treeRes.json());
          }
        }
      }
    } catch (err) {
      console.error('Failed to delete variant:', err);
    }
  };

  const handleCreateVariant = (parentVariant?: ReplayVariant) => {
    setParentVariantForCreate(parentVariant);
    setShowCreateModal(true);
  };

  const handleVariantCreated = (variant: ReplayVariant) => {
    setShowCreateModal(false);
    setSelectedVariant(variant);
    setDetailMode('variant');
    // Refresh tree
    if (selectedFlowId) {
      fetch(`${API_BASE}/api/replay/tree/${selectedFlowId}`)
        .then((res) => res.json())
        .then((data) => setVariantTree(data));
    }
    // Refresh flows list
    fetch(`${API_BASE}/api/replay`)
      .then((res) => res.json())
      .then((data) => {
        const flowIds = new Set<string>();
        for (const v of data.variants || []) {
          flowIds.add(v.parent_flow_id);
        }
        setFlowsWithVariants(Array.from(flowIds));
      });
  };

  const handleToggleIntercept = async (variant: ReplayVariant) => {
    try {
      const res = await fetch(`${API_BASE}/api/replay/${variant.variant_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intercept_on_replay: !variant.intercept_on_replay }),
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedVariant(data.variant);
        // Refresh tree to update cached data
        if (selectedFlowId) {
          const treeRes = await fetch(`${API_BASE}/api/replay/tree/${selectedFlowId}`);
          if (treeRes.ok) {
            setVariantTree(await treeRes.json());
          }
        }
      }
    } catch (err) {
      console.error('Failed to update intercept setting:', err);
    }
  };

  const handleSaveReplayName = async (flowId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/replay/names/${flowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editNameValue }),
      });
      if (res.ok) {
        setReplayNames((prev) => ({
          ...prev,
          [flowId]: editNameValue,
        }));
      }
    } catch (err) {
      console.error('Failed to save replay name:', err);
    }
    setEditingName(null);
    setEditNameValue('');
  };

  const startEditingName = (flowId: string) => {
    setEditingName(flowId);
    setEditNameValue(replayNames[flowId] || '');
  };

  const renderVariantTree = (variants: VariantWithChildren[], depth = 0) => {
    return variants.map((variant) => (
      <div key={variant.variant_id} style={{ marginLeft: depth * 16 }}>
        <button
          onClick={() => handleSelectVariant(variant)}
          className={`w-full text-left px-3 py-2 rounded mb-1 flex items-center gap-2 ${
            selectedVariant?.variant_id === variant.variant_id
              ? 'bg-blue-600'
              : 'hover:bg-gray-700'
          }`}
        >
          <span className="text-gray-400">{depth > 0 ? '\u2514' : '\u25CF'}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white truncate">{variant.description}</div>
            <div className="text-xs text-gray-400">
              {variant.request.method} {(() => {
                try {
                  return new URL(variant.request.url).pathname;
                } catch {
                  return variant.request.url;
                }
              })()}
            </div>
          </div>
          {variant.result && (
            <span
              className={`text-xs px-1.5 py-0.5 rounded ${
                variant.result.status === 'completed'
                  ? 'bg-green-600/30 text-green-400'
                  : variant.result.status === 'failed'
                  ? 'bg-red-600/30 text-red-400'
                  : variant.result.status === 'intercepted'
                  ? 'bg-cyan-600/30 text-cyan-400'
                  : 'bg-yellow-600/30 text-yellow-400'
              }`}
            >
              {variant.result.status}
            </span>
          )}
        </button>
        {variant.children && variant.children.length > 0 && renderVariantTree(variant.children, depth + 1)}
      </div>
    ));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-400';
      case 'failed': return 'text-red-400';
      case 'sent': return 'text-yellow-400';
      case 'intercepted': return 'text-cyan-400';
      default: return 'text-gray-400';
    }
  };

  const formatHeaders = (headers: Record<string, string>) => {
    return Object.entries(headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Flow selector sidebar */}
      <div className="w-64 border-r border-gray-700 flex flex-col">
        <div className="p-3 border-b border-gray-700">
          <h2 className="text-sm font-medium text-gray-300">Flows with Variants</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {flowsWithVariants.length === 0 ? (
            <div className="text-gray-500 text-sm p-2">
              No variants yet. Create one from Traffic view.
            </div>
          ) : (
            flowsWithVariants.map((flowId) => (
              <div
                key={flowId}
                onClick={() => setSelectedFlowId(flowId)}
                className={`w-full text-left px-3 py-2 rounded text-sm mb-1 cursor-pointer ${
                  selectedFlowId === flowId
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                {editingName === flowId ? (
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={editNameValue}
                      onChange={(e) => setEditNameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveReplayName(flowId);
                        if (e.key === 'Escape') setEditingName(null);
                      }}
                      className="flex-1 px-1 py-0.5 bg-gray-900 border border-gray-600 rounded text-xs text-white"
                      placeholder="Enter name..."
                      autoFocus
                    />
                    <button
                      onClick={() => handleSaveReplayName(flowId)}
                      className="px-1.5 bg-green-600 text-white rounded text-xs hover:bg-green-500"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between group">
                    <div className="flex-1 min-w-0">
                      {replayNames[flowId] ? (
                        <>
                          <div className="truncate text-sm">{replayNames[flowId]}</div>
                          <div className="truncate font-mono text-xs text-gray-400">
                            {flowId.substring(0, 16)}...
                          </div>
                        </>
                      ) : (
                        <div className="truncate font-mono text-xs">{flowId.substring(0, 20)}...</div>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditingName(flowId);
                      }}
                      className={`p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                        selectedFlowId === flowId
                          ? 'hover:bg-blue-500 text-white'
                          : 'hover:bg-gray-600 text-gray-400'
                      }`}
                      title="Edit name"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Variant tree */}
      <div className="w-80 border-r border-gray-700 flex flex-col">
        <div className="p-3 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-300">Variants</h2>
          {selectedFlow && (
            <button
              onClick={() => handleCreateVariant()}
              className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-500"
            >
              + New
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {!selectedFlowId ? (
            <div className="text-gray-500 text-sm p-2">Select a flow to see variants</div>
          ) : (
            <>
              {/* Original flow button */}
              {selectedFlow && (
                <button
                  onClick={handleSelectOriginal}
                  className={`w-full text-left px-3 py-2 rounded mb-2 flex items-center gap-2 ${
                    detailMode === 'original'
                      ? 'bg-green-600'
                      : 'hover:bg-gray-700 border border-gray-600'
                  }`}
                >
                  <span className="text-gray-300">\u2605</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white">Original Request</div>
                    <div className="text-xs text-gray-400">
                      {selectedFlow.request.method} {selectedFlow.request.path}
                    </div>
                  </div>
                </button>
              )}

              {/* Variant tree */}
              {variantTree && variantTree.variants.length > 0 ? (
                renderVariantTree(variantTree.variants)
              ) : (
                <div className="text-gray-500 text-sm p-2">No variants yet</div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Detail view */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {detailMode === 'original' && selectedFlow ? (
          <>
            {/* Original flow header */}
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-white flex items-center gap-2">
                  <span className="text-green-400">\u2605</span>
                  Original Request
                </h2>
                <div className="text-sm text-gray-400">
                  {new Date(selectedFlow.timestamp).toLocaleString()}
                </div>
              </div>
              <button
                onClick={() => handleCreateVariant()}
                className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-500"
              >
                Create Variant
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Request details */}
              <div className="bg-gray-800 rounded p-3">
                <h3 className="text-sm font-medium text-gray-300 mb-2">Request</h3>
                <div className="text-sm text-gray-200 mb-2">
                  <span className="text-blue-400 font-medium">{selectedFlow.request.method}</span>{' '}
                  {selectedFlow.request.url}
                </div>
                <div className="space-y-2">
                  <div>
                    <div className="text-xs text-gray-400 mb-1">Headers</div>
                    <pre className="bg-gray-900 p-2 rounded text-xs text-gray-300 overflow-x-auto max-h-32">
                      {formatHeaders(selectedFlow.request.headers)}
                    </pre>
                  </div>
                  {selectedFlow.request.content && (
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Body</div>
                      <pre className="bg-gray-900 p-2 rounded text-xs text-gray-300 overflow-x-auto max-h-64">
                        {selectedFlow.request.content}
                      </pre>
                    </div>
                  )}
                </div>
              </div>

              {/* Response details */}
              {selectedFlow.response && (
                <div className="bg-gray-800 rounded p-3">
                  <h3 className="text-sm font-medium text-gray-300 mb-2">Response</h3>
                  <div className="text-sm text-gray-200 mb-2">
                    <span className={`font-medium ${
                      selectedFlow.response.status_code >= 400 ? 'text-red-400' : 'text-green-400'
                    }`}>
                      {selectedFlow.response.status_code}
                    </span>{' '}
                    {selectedFlow.response.reason}
                  </div>
                  <div className="space-y-2">
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Headers</div>
                      <pre className="bg-gray-900 p-2 rounded text-xs text-gray-300 overflow-x-auto max-h-32">
                        {formatHeaders(selectedFlow.response.headers)}
                      </pre>
                    </div>
                    {selectedFlow.response.content && (
                      <div>
                        <div className="text-xs text-gray-400 mb-1">Body</div>
                        <pre className="bg-gray-900 p-2 rounded text-xs text-gray-300 overflow-x-auto max-h-64">
                          {selectedFlow.response.content.substring(0, 5000)}
                          {selectedFlow.response.content.length > 5000 && '... (truncated)'}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Annotation */}
              <AnnotationPanel
                targetType="traffic"
                targetId={selectedFlow.flow_id}
                defaultCollapsed={true}
              />
            </div>
          </>
        ) : detailMode === 'variant' && selectedVariant ? (
          <>
            {/* Variant header */}
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-white">{selectedVariant.description}</h2>
                <div className="text-sm text-gray-400">
                  Created {new Date(selectedVariant.created_at).toLocaleString()}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleCreateVariant(selectedVariant)}
                  className="px-3 py-1.5 bg-gray-700 text-white rounded text-sm hover:bg-gray-600"
                >
                  Clone
                </button>
                <button
                  onClick={() => handleSendReplay(selectedVariant)}
                  className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-500"
                >
                  Send
                </button>
                <button
                  onClick={() => handleDeleteVariant(selectedVariant)}
                  className="px-3 py-1.5 bg-red-600/20 text-red-400 rounded text-sm hover:bg-red-600/30"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Result status */}
              {selectedVariant.result && (
                <div className="bg-gray-800 rounded p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Status</span>
                    <span className={`text-sm font-medium ${getStatusColor(selectedVariant.result.status)}`}>
                      {selectedVariant.result.status}
                    </span>
                  </div>
                  {selectedVariant.result.sent_at && (
                    <div className="text-xs text-gray-500 mt-1">
                      Sent at {new Date(selectedVariant.result.sent_at).toLocaleString()}
                    </div>
                  )}
                  {selectedVariant.result.error && (
                    <div className="text-xs text-red-400 mt-1">{selectedVariant.result.error}</div>
                  )}
                  {selectedVariant.result.result_flow_id && (
                    <div className="text-xs text-blue-400 mt-1">
                      Result flow: {selectedVariant.result.result_flow_id}
                    </div>
                  )}
                </div>
              )}

              {/* Request details */}
              <div className="bg-gray-800 rounded p-3">
                <h3 className="text-sm font-medium text-gray-300 mb-2">Request (Variant)</h3>
                <div className="text-sm text-gray-200 mb-2">
                  <span className="text-blue-400 font-medium">{selectedVariant.request.method}</span>{' '}
                  {selectedVariant.request.url}
                </div>
                <div className="space-y-2">
                  <div>
                    <div className="text-xs text-gray-400 mb-1">Headers</div>
                    <pre className="bg-gray-900 p-2 rounded text-xs text-gray-300 overflow-x-auto max-h-32">
                      {formatHeaders(selectedVariant.request.headers)}
                    </pre>
                  </div>
                  {selectedVariant.request.body && (
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Body</div>
                      <pre className="bg-gray-900 p-2 rounded text-xs text-gray-300 overflow-x-auto max-h-64">
                        {selectedVariant.request.body}
                      </pre>
                    </div>
                  )}
                </div>
              </div>

              {/* Response from result flow */}
              {resultFlow?.response && (
                <div className="bg-gray-800 rounded p-3">
                  <h3 className="text-sm font-medium text-gray-300 mb-2">Response</h3>
                  <div className="text-sm text-gray-200 mb-2">
                    <span className={`font-medium ${
                      resultFlow.response.status_code >= 400 ? 'text-red-400' : 'text-green-400'
                    }`}>
                      {resultFlow.response.status_code}
                    </span>{' '}
                    {resultFlow.response.reason}
                  </div>
                  <div className="space-y-2">
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Headers</div>
                      <pre className="bg-gray-900 p-2 rounded text-xs text-gray-300 overflow-x-auto max-h-32">
                        {formatHeaders(resultFlow.response.headers)}
                      </pre>
                    </div>
                    {resultFlow.response.content && (
                      <div>
                        <div className="text-xs text-gray-400 mb-1">Body</div>
                        <pre className="bg-gray-900 p-2 rounded text-xs text-gray-300 overflow-x-auto max-h-64">
                          {resultFlow.response.content.substring(0, 5000)}
                          {resultFlow.response.content.length > 5000 && '... (truncated)'}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Settings */}
              <div className="bg-gray-800 rounded p-3">
                <h3 className="text-sm font-medium text-gray-300 mb-2">Settings</h3>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedVariant.intercept_on_replay}
                    onChange={() => handleToggleIntercept(selectedVariant)}
                    className="rounded bg-gray-700 border-gray-600 cursor-pointer"
                  />
                  <span className="text-sm text-gray-300">Intercept response when replayed</span>
                </label>
              </div>

              {/* Annotation */}
              <AnnotationPanel
                targetType="variant"
                targetId={selectedVariant.variant_id}
                defaultCollapsed={true}
              />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            Select a flow to view details
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreateModal && selectedFlow && (
        <CreateVariantModal
          flow={selectedFlow}
          parentVariant={parentVariantForCreate}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleVariantCreated}
        />
      )}
    </div>
  );
};
