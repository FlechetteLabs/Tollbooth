import React, { useState, useEffect } from 'react';
import { ReplayVariant, TrafficFlow } from '../../types';
import { CreateVariantModal } from './CreateVariantModal';
import { AnnotationPanel } from '../shared/AnnotationPanel';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface VariantWithChildren extends ReplayVariant {
  children?: VariantWithChildren[];
}

interface VariantTreeData {
  flow_id: string;
  variants: VariantWithChildren[];
}

export const ReplayView: React.FC = () => {
  const [variants, setVariants] = useState<ReplayVariant[]>([]);
  const [flowsWithVariants, setFlowsWithVariants] = useState<string[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [variantTree, setVariantTree] = useState<VariantTreeData | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ReplayVariant | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<TrafficFlow | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [parentVariantForCreate, setParentVariantForCreate] = useState<ReplayVariant | undefined>();
  const [isLoading, setIsLoading] = useState(true);

  // Fetch all variants
  useEffect(() => {
    const fetchVariants = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/replay`);
        if (res.ok) {
          const data = await res.json();
          setVariants(data.variants || []);

          // Extract unique flow IDs
          const flowIds = new Set<string>();
          for (const v of data.variants || []) {
            flowIds.add(v.parent_flow_id);
          }
          setFlowsWithVariants(Array.from(flowIds));
        }
      } catch (err) {
        console.error('Failed to fetch variants:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchVariants();
  }, []);

  // Fetch variant tree when flow selected
  useEffect(() => {
    if (!selectedFlowId) {
      setVariantTree(null);
      return;
    }

    const fetchTree = async () => {
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
      } catch (err) {
        console.error('Failed to fetch tree:', err);
      }
    };
    fetchTree();
  }, [selectedFlowId]);

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
        // Refresh
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
    // Refresh tree
    if (selectedFlowId) {
      fetch(`${API_BASE}/api/replay/tree/${selectedFlowId}`)
        .then((res) => res.json())
        .then((data) => setVariantTree(data));
    }
  };

  const renderVariantTree = (variants: VariantWithChildren[], depth = 0) => {
    return variants.map((variant) => (
      <div key={variant.variant_id} style={{ marginLeft: depth * 16 }}>
        <button
          onClick={() => setSelectedVariant(variant)}
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
              {variant.request.method} {new URL(variant.request.url).pathname}
            </div>
          </div>
          {variant.result && (
            <span
              className={`text-xs px-1.5 py-0.5 rounded ${
                variant.result.status === 'completed'
                  ? 'bg-green-600/30 text-green-400'
                  : variant.result.status === 'failed'
                  ? 'bg-red-600/30 text-red-400'
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
      default: return 'text-gray-400';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Loading variants...
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
              <button
                key={flowId}
                onClick={() => setSelectedFlowId(flowId)}
                className={`w-full text-left px-3 py-2 rounded text-sm mb-1 ${
                  selectedFlowId === flowId
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                <div className="truncate">{flowId.substring(0, 16)}...</div>
                <div className="text-xs text-gray-400">
                  {variants.filter((v) => v.parent_flow_id === flowId).length} variants
                </div>
              </button>
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
          ) : variantTree && variantTree.variants.length > 0 ? (
            renderVariantTree(variantTree.variants)
          ) : (
            <div className="text-gray-500 text-sm p-2">No variants for this flow</div>
          )}
        </div>
      </div>

      {/* Variant detail */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedVariant ? (
          <>
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
                      Result: {selectedVariant.result.result_flow_id}
                    </div>
                  )}
                </div>
              )}

              {/* Request details */}
              <div className="bg-gray-800 rounded p-3">
                <h3 className="text-sm font-medium text-gray-300 mb-2">Request</h3>
                <div className="text-sm text-gray-200 mb-2">
                  <span className="text-blue-400 font-medium">{selectedVariant.request.method}</span>{' '}
                  {selectedVariant.request.url}
                </div>
                <div className="space-y-2">
                  <div>
                    <div className="text-xs text-gray-400 mb-1">Headers</div>
                    <pre className="bg-gray-900 p-2 rounded text-xs text-gray-300 overflow-x-auto">
                      {JSON.stringify(selectedVariant.request.headers, null, 2)}
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

              {/* Settings */}
              <div className="bg-gray-800 rounded p-3">
                <h3 className="text-sm font-medium text-gray-300 mb-2">Settings</h3>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedVariant.intercept_on_replay}
                    readOnly
                    className="rounded bg-gray-700 border-gray-600"
                  />
                  <span className="text-sm text-gray-400">Intercept response when replayed</span>
                </div>
              </div>

              {/* Annotation */}
              <AnnotationPanel
                targetType="variant"
                targetId={selectedVariant.variant_id}
                defaultCollapsed={false}
              />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            Select a variant to view details
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
