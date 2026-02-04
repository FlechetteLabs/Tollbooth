/**
 * Conversation Tree View - SVG-based vertical tree visualization
 * Fixed: Transform applied to wrapper div for proper pan/zoom
 * Feature: Set any node as view root to focus on subtree
 * Feature: Branch navigation in detail modal
 * Feature: Conversation starring
 */

import { useState, useRef, useCallback, useMemo } from 'react';
import { clsx } from 'clsx';
import { ConversationTree, ConversationTreeNode } from '../../types';
import { TreeNode } from './TreeNode';
import { NodeDetailModal } from './NodeDetailModal';
import { StarButton } from './StarButton';
import { AnnotationPanel } from '../shared/AnnotationPanel';

interface ConversationTreeViewProps {
  tree: ConversationTree;
  onShowRelatedTrees?: () => void;
}

interface PositionedNode {
  node: ConversationTreeNode;
  x: number;
  y: number;
  width: number;
  height: number;
  children: PositionedNode[];
}

// Constants for layout - smaller nodes for messages
const NODE_WIDTH = 200;
const NODE_HEIGHT = 130;
const HORIZONTAL_GAP = 30;
const VERTICAL_GAP = 40;

/**
 * Calculate subtree width recursively
 */
function calculateSubtreeWidth(node: ConversationTreeNode): number {
  if (node.children.length === 0) {
    return NODE_WIDTH;
  }

  const childrenWidth = node.children.reduce(
    (sum, child) => sum + calculateSubtreeWidth(child),
    0
  );
  const gaps = (node.children.length - 1) * HORIZONTAL_GAP;

  return Math.max(NODE_WIDTH, childrenWidth + gaps);
}

/**
 * Position nodes in the tree
 */
function layoutTree(nodes: ConversationTreeNode[]): PositionedNode[] {
  if (nodes.length === 0) return [];

  const positioned: PositionedNode[] = [];

  function positionNode(
    node: ConversationTreeNode,
    centerX: number,
    y: number
  ): PositionedNode {
    const nodeX = centerX - NODE_WIDTH / 2;
    const positionedChildren: PositionedNode[] = [];

    if (node.children.length > 0) {
      const childrenWidths = node.children.map(c => calculateSubtreeWidth(c));
      const totalChildrenWidth = childrenWidths.reduce((a, b) => a + b, 0) +
        (node.children.length - 1) * HORIZONTAL_GAP;

      let childX = centerX - totalChildrenWidth / 2;

      for (let i = 0; i < node.children.length; i++) {
        const childWidth = childrenWidths[i];
        const childCenterX = childX + childWidth / 2;

        const positionedChild = positionNode(
          node.children[i],
          childCenterX,
          y + NODE_HEIGHT + VERTICAL_GAP
        );
        positionedChildren.push(positionedChild);

        childX += childWidth + HORIZONTAL_GAP;
      }
    }

    return {
      node,
      x: nodeX,
      y,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      children: positionedChildren,
    };
  }

  const rootNode = nodes[0];
  const totalWidth = calculateSubtreeWidth(rootNode);
  const centerX = totalWidth / 2;

  positioned.push(positionNode(rootNode, centerX, 0));

  return positioned;
}

/**
 * Collect all nodes from positioned tree
 */
function collectAllNodes(positioned: PositionedNode[]): PositionedNode[] {
  const all: PositionedNode[] = [];

  function collect(node: PositionedNode) {
    all.push(node);
    node.children.forEach(collect);
  }

  positioned.forEach(collect);
  return all;
}

/**
 * Calculate bounding box of all nodes
 */
function calculateBounds(nodes: PositionedNode[]): { minX: number; maxX: number; minY: number; maxY: number } {
  if (nodes.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x + node.width);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y + node.height);
  }

  return { minX, maxX, minY, maxY };
}

/**
 * Count total nodes in tree
 */
function countNodes(nodes: ConversationTreeNode[]): number {
  let count = 0;
  function traverse(n: ConversationTreeNode) {
    count++;
    n.children.forEach(traverse);
  }
  nodes.forEach(traverse);
  return count;
}

/**
 * Find a node by ID in the tree
 */
function findNodeById(nodes: ConversationTreeNode[], nodeId: string): ConversationTreeNode | null {
  for (const node of nodes) {
    if (node.node_id === nodeId) {
      return node;
    }
    const found = findNodeById(node.children, nodeId);
    if (found) {
      return found;
    }
  }
  return null;
}

/**
 * Get the path from root to a target node (for breadcrumb)
 */
function getAncestorPath(nodes: ConversationTreeNode[], targetId: string): ConversationTreeNode[] {
  const path: ConversationTreeNode[] = [];

  function findPath(node: ConversationTreeNode, currentPath: ConversationTreeNode[]): boolean {
    currentPath.push(node);

    if (node.node_id === targetId) {
      path.push(...currentPath);
      return true;
    }

    for (const child of node.children) {
      if (findPath(child, currentPath)) {
        return true;
      }
    }

    currentPath.pop();
    return false;
  }

  for (const root of nodes) {
    if (findPath(root, [])) {
      break;
    }
  }

  return path;
}

/**
 * Build a linear branch path through the tree, starting from root and
 * passing through a specific node, then following the first child to a leaf.
 */
function buildLinearBranch(
  rootNodes: ConversationTreeNode[],
  targetNode: ConversationTreeNode,
): ConversationTreeNode[] {
  // Get ancestors (root to target node, exclusive of target)
  const ancestors = getAncestorPath(rootNodes, targetNode.node_id);

  // ancestors already includes targetNode as the last element
  // Now extend from targetNode to a leaf by following first children
  const path = [...ancestors];
  let current = targetNode;
  while (current.children.length > 0) {
    current = current.children[0]; // Follow first branch by default
    path.push(current);
  }

  return path;
}

export function ConversationTreeView({ tree, onShowRelatedTrees }: ConversationTreeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [detailNode, setDetailNode] = useState<ConversationTreeNode | null>(null);
  const [comparisonNode, setComparisonNode] = useState<string | null>(null);
  const [viewRootNodeId, setViewRootNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Branch navigation state
  const [branchPath, setBranchPath] = useState<ConversationTreeNode[] | null>(null);

  // Starring state
  const [starred, setStarred] = useState(false);

  // Compute visible tree based on view root
  const visibleTree = useMemo(() => {
    if (!viewRootNodeId) {
      return tree.nodes;
    }
    const viewRoot = findNodeById(tree.nodes, viewRootNodeId);
    return viewRoot ? [viewRoot] : tree.nodes;
  }, [tree.nodes, viewRootNodeId]);

  // Get ancestor path for breadcrumb when viewing subtree
  const ancestorPath = useMemo(() => {
    if (!viewRootNodeId) {
      return [];
    }
    return getAncestorPath(tree.nodes, viewRootNodeId);
  }, [tree.nodes, viewRootNodeId]);

  // Layout the tree
  const positionedTree = layoutTree(visibleTree);
  const allNodes = collectAllNodes(positionedTree);
  const bounds = calculateBounds(allNodes);
  const totalNodeCount = countNodes(tree.nodes);
  const visibleNodeCount = countNodes(visibleTree);

  // Add padding
  const padding = 60;
  const contentWidth = bounds.maxX - bounds.minX + padding * 2;
  const contentHeight = bounds.maxY - bounds.minY + padding * 2;
  const offsetX = -bounds.minX + padding;
  const offsetY = -bounds.minY + padding;

  const handleNodeClick = useCallback((node: ConversationTreeNode) => {
    setSelectedNodeId(node.node_id);
    setDetailNode(node);

    // Build full branch path for navigation
    const path = buildLinearBranch(tree.nodes, node);
    setBranchPath(path);
  }, [tree.nodes]);

  /**
   * Handle branch selection at a fork point in the modal.
   * Rebuilds the branch path by keeping everything up to the parent node,
   * then following the selected child to a leaf.
   */
  const handleBranchSelect = useCallback((parentNodeId: string, childIndex: number) => {
    if (!branchPath) return;

    // Find the parent node in the current branch path
    const parentIdx = branchPath.findIndex(n => n.node_id === parentNodeId);
    if (parentIdx < 0) return;

    const parentNode = branchPath[parentIdx];
    if (childIndex < 0 || childIndex >= parentNode.children.length) return;

    // Keep path up to and including parent, then follow the selected child
    const newPath = branchPath.slice(0, parentIdx + 1);
    let current = parentNode.children[childIndex];
    newPath.push(current);
    while (current.children.length > 0) {
      current = current.children[0]; // Follow first branch from the new child
      newPath.push(current);
    }

    setBranchPath(newPath);
  }, [branchPath]);

  const handleSelectForComparison = useCallback(() => {
    if (detailNode) {
      setComparisonNode(detailNode.node_id);
    }
  }, [detailNode]);

  const handleSetAsRoot = useCallback(() => {
    if (detailNode) {
      setViewRootNodeId(detailNode.node_id);
      // Reset pan/zoom when changing view root
      setPan({ x: 0, y: 0 });
      setZoom(1);
    }
  }, [detailNode]);

  const handleResetToTrueRoot = useCallback(() => {
    setViewRootNodeId(null);
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }, []);

  const handleBreadcrumbClick = useCallback((nodeId: string) => {
    // Navigate to an ancestor node in the breadcrumb
    setViewRootNodeId(nodeId);
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }, []);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Zoom handlers
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.min(Math.max(z * delta, 0.1), 3));
  }, []);

  const handleZoomIn = () => setZoom(z => Math.min(z * 1.2, 3));
  const handleZoomOut = () => setZoom(z => Math.max(z * 0.8, 0.1));
  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Render connection lines
  const renderConnections = (positioned: PositionedNode[]) => {
    const lines: JSX.Element[] = [];

    function renderLines(node: PositionedNode) {
      for (const child of node.children) {
        const startX = node.x + offsetX + node.width / 2;
        const startY = node.y + offsetY + node.height;
        const endX = child.x + offsetX + child.width / 2;
        const endY = child.y + offsetY;

        const midY = (startY + endY) / 2;

        lines.push(
          <path
            key={`${node.node.node_id}-${child.node.node_id}`}
            d={`M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`}
            fill="none"
            stroke="#4b5563"
            strokeWidth="2"
          />
        );

        renderLines(child);
      }
    }

    positioned.forEach(renderLines);
    return lines;
  };

  // Render nodes
  const renderNodes = (positioned: PositionedNode[], isRoot = true) => {
    return positioned.map((pos, idx) => {
      const isSelected = selectedNodeId === pos.node.node_id;
      const isComparisonCandidate = comparisonNode === pos.node.node_id;

      return (
        <g key={pos.node.node_id}>
          <foreignObject
            x={pos.x + offsetX}
            y={pos.y + offsetY}
            width={pos.width}
            height={pos.height}
          >
            <div className={clsx(isComparisonCandidate && 'ring-2 ring-purple-500 rounded-lg')}>
              <TreeNode
                node={pos.node}
                isRoot={isRoot && idx === 0}
                isSelected={isSelected}
                relatedTreeCount={tree.related_tree_count}
                totalTreeCount={tree.total_tree_count}
                onClick={() => handleNodeClick(pos.node)}
                onShowRelated={onShowRelatedTrees}
              />
            </div>
          </foreignObject>
          {renderNodes(pos.children, false)}
        </g>
      );
    });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Controls */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-inspector-border bg-inspector-surface">
        <div className="flex items-center gap-3 text-sm text-inspector-muted">
          <StarButton
            conversationId={tree.root_conversation_id}
            starred={starred}
            onToggle={setStarred}
          />
          {viewRootNodeId ? (
            <>
              {visibleNodeCount} of {totalNodeCount} messages (subtree view)
            </>
          ) : (
            <>
              {totalNodeCount} message{totalNodeCount !== 1 ? 's' : ''} |{' '}
              {tree.total_conversations} conversation{tree.total_conversations !== 1 ? 's' : ''} |{' '}
              {tree.total_branches} branch{tree.total_branches !== 1 ? 'es' : ''}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {viewRootNodeId && (
            <button
              onClick={handleResetToTrueRoot}
              className="px-2 py-1 text-sm bg-cyan-600 text-white rounded hover:bg-cyan-700"
              title="Show full tree"
            >
              Show Full Tree
            </button>
          )}
          <button
            onClick={handleZoomOut}
            className="px-2 py-1 text-sm bg-inspector-surface border border-inspector-border rounded hover:border-inspector-accent"
            title="Zoom out"
          >
            -
          </button>
          <span className="text-sm text-inspector-muted w-16 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="px-2 py-1 text-sm bg-inspector-surface border border-inspector-border rounded hover:border-inspector-accent"
            title="Zoom in"
          >
            +
          </button>
          <button
            onClick={handleResetView}
            className="px-2 py-1 text-sm bg-inspector-surface border border-inspector-border rounded hover:border-inspector-accent"
            title="Reset view"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Conversation-level annotation panel */}
      <div className="shrink-0 px-4 py-1 border-b border-inspector-border bg-inspector-surface/50">
        <AnnotationPanel
          targetType="conversation"
          targetId={tree.root_conversation_id}
          conversationId={tree.root_conversation_id}
          collapsible={true}
          defaultCollapsed={true}
        />
      </div>

      {/* Breadcrumb trail when viewing subtree */}
      {viewRootNodeId && ancestorPath.length > 1 && (
        <div className="shrink-0 px-4 py-2 border-b border-inspector-border bg-inspector-bg/50 flex items-center gap-1 text-sm overflow-x-auto">
          <button
            onClick={handleResetToTrueRoot}
            className="text-cyan-400 hover:text-cyan-300 shrink-0"
          >
            Root
          </button>
          {ancestorPath.slice(0, -1).map((node, idx) => (
            <span key={node.node_id} className="flex items-center gap-1 shrink-0">
              <span className="text-inspector-muted">/</span>
              <button
                onClick={() => handleBreadcrumbClick(node.node_id)}
                className={clsx(
                  'hover:text-cyan-300 truncate max-w-[150px]',
                  node.role === 'user' ? 'text-blue-400' : 'text-green-400'
                )}
                title={node.message}
              >
                {node.role === 'user' ? 'U' : 'A'}{idx + 1}: {node.message.slice(0, 20)}...
              </button>
            </span>
          ))}
          <span className="text-inspector-muted shrink-0">/</span>
          <span className="text-inspector-text font-semibold shrink-0">
            {ancestorPath[ancestorPath.length - 1]?.role === 'user' ? 'U' : 'A'}
            {ancestorPath.length}: Current
          </span>
        </div>
      )}

      {/* Tree canvas - transform applied to wrapper div */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing bg-inspector-bg"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            width: contentWidth,
            height: contentHeight,
          }}
        >
          <svg
            width={contentWidth}
            height={contentHeight}
            style={{ overflow: 'visible' }}
          >
            <g>
              {/* Connection lines */}
              {renderConnections(positionedTree)}
              {/* Nodes */}
              {renderNodes(positionedTree)}
            </g>
          </svg>
        </div>
      </div>

      {/* Node detail modal */}
      {detailNode && branchPath && (
        <NodeDetailModal
          node={detailNode}
          onClose={() => {
            setDetailNode(null);
            setBranchPath(null);
          }}
          branchPath={branchPath}
          onSelectForComparison={handleSelectForComparison}
          isComparisonCandidate={comparisonNode === detailNode.node_id}
          onSetAsRoot={detailNode.children.length > 0 ? handleSetAsRoot : undefined}
          isCurrentViewRoot={viewRootNodeId === detailNode.node_id}
          onBranchSelect={handleBranchSelect}
        />
      )}
    </div>
  );
}
