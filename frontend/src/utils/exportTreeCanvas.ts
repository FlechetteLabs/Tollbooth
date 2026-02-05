/**
 * Export conversation tree as Obsidian Canvas format (.canvas)
 * https://jsoncanvas.org/
 */

import { ConversationTree, ConversationTreeNode } from '../types';

interface CanvasNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'text';
  text: string;
  color?: string;
}

interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide: 'top' | 'bottom' | 'left' | 'right';
  toNode: string;
  toSide: 'top' | 'bottom' | 'left' | 'right';
  label?: string;
}

interface Canvas {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

// Layout constants
const NODE_WIDTH = 400;
const NODE_HEIGHT_BASE = 100;
const NODE_HEIGHT_PER_CHAR = 0.15; // Approximate height per character
const NODE_MAX_HEIGHT = 600;
const HORIZONTAL_GAP = 80;
const VERTICAL_GAP = 60;
const ANNOTATION_OFFSET_X = 450;
const ANNOTATION_WIDTH = 300;

// Colors matching Tree UI (Obsidian canvas color format)
// Obsidian uses color presets: 1=red, 2=orange, 3=yellow, 4=green, 5=cyan, 6=purple
// Or hex colors
const COLOR_USER = '5'; // cyan
const COLOR_ASSISTANT = '4'; // green
const COLOR_MODIFIED = '2'; // orange
const COLOR_ANNOTATION = '6'; // purple

/**
 * Estimate node height based on content length
 */
function estimateNodeHeight(text: string): number {
  const lineCount = text.split('\n').length;
  const charEstimate = text.length * NODE_HEIGHT_PER_CHAR;
  const lineEstimate = lineCount * 20;
  return Math.min(NODE_MAX_HEIGHT, Math.max(NODE_HEIGHT_BASE, charEstimate, lineEstimate));
}

/**
 * Generate a unique ID for canvas elements
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 18);
}

/**
 * Format node content with role label and metadata
 */
function formatNodeContent(node: ConversationTreeNode): string {
  const lines: string[] = [];

  // Role header
  const role = node.role.toUpperCase();
  lines.push(`**${role}** | ${node.provider} | ${node.model}`);
  lines.push('');

  // Thinking content (if any)
  if (node.thinking) {
    lines.push('*Thinking:*');
    lines.push('```');
    lines.push(node.thinking.slice(0, 2000) + (node.thinking.length > 2000 ? '...' : ''));
    lines.push('```');
    lines.push('');
  }

  // Main message
  lines.push(node.full_message || '(empty)');

  // Parameter modifications
  if (node.parameter_modifications?.hasModifications) {
    lines.push('');
    lines.push('---');
    lines.push('*Parameter changes:*');
    for (const mod of node.parameter_modifications.modifications) {
      const oldVal = mod.oldValue === undefined ? '(none)' : String(mod.oldValue).slice(0, 50);
      const newVal = mod.newValue === undefined ? '(none)' : String(mod.newValue).slice(0, 50);
      lines.push(`- ${mod.field}: ${oldVal} → ${newVal}`);
    }
  }

  // Request ID (for assistant nodes)
  if (node.request_id) {
    lines.push('');
    lines.push(`*Request ID: ${node.request_id}*`);
  }

  return lines.join('\n');
}

/**
 * Get color for a node based on role and modification status
 */
function getNodeColor(node: ConversationTreeNode): string {
  if (node.is_modified) {
    return COLOR_MODIFIED;
  }
  return node.role === 'user' ? COLOR_USER : COLOR_ASSISTANT;
}

interface PositionedCanvasNode {
  node: ConversationTreeNode;
  canvasNode: CanvasNode;
  annotationNode?: CanvasNode;
  children: PositionedCanvasNode[];
}

/**
 * Calculate subtree width for layout
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
 * Layout tree nodes and create canvas elements
 */
function layoutTree(
  nodes: ConversationTreeNode[],
  annotations: Map<string, { title?: string; body?: string; tags?: string[] }>
): { canvasNodes: CanvasNode[]; edges: CanvasEdge[] } {
  const canvasNodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];

  if (nodes.length === 0) return { canvasNodes, edges };

  function positionNode(
    node: ConversationTreeNode,
    centerX: number,
    y: number,
    parentId?: string
  ): void {
    const content = formatNodeContent(node);
    const height = estimateNodeHeight(content);
    const nodeX = centerX - NODE_WIDTH / 2;
    const nodeId = generateId();

    // Create the main node
    const canvasNode: CanvasNode = {
      id: nodeId,
      x: nodeX,
      y: y,
      width: NODE_WIDTH,
      height: height,
      type: 'text',
      text: content,
      color: getNodeColor(node),
    };
    canvasNodes.push(canvasNode);

    // Create edge from parent
    if (parentId) {
      const edge: CanvasEdge = {
        id: generateId(),
        fromNode: parentId,
        fromSide: 'bottom',
        toNode: nodeId,
        toSide: 'top',
      };
      // Add "Modified" label if this node is modified
      if (node.is_modified) {
        edge.label = 'Modified';
      }
      edges.push(edge);
    }

    // Create annotation node if present
    const annotation = annotations.get(node.turn_id);
    if (annotation && (annotation.title || annotation.body)) {
      const annotationContent = [
        annotation.title ? `**${annotation.title}**` : '',
        annotation.body || '',
        annotation.tags?.length ? `Tags: ${annotation.tags.join(', ')}` : '',
      ].filter(Boolean).join('\n\n');

      const annotationId = generateId();
      const annotationNode: CanvasNode = {
        id: annotationId,
        x: nodeX + ANNOTATION_OFFSET_X,
        y: y,
        width: ANNOTATION_WIDTH,
        height: estimateNodeHeight(annotationContent),
        type: 'text',
        text: annotationContent,
        color: COLOR_ANNOTATION,
      };
      canvasNodes.push(annotationNode);

      // Connect annotation to node
      edges.push({
        id: generateId(),
        fromNode: nodeId,
        fromSide: 'right',
        toNode: annotationId,
        toSide: 'left',
      });
    }

    // Position children
    if (node.children.length > 0) {
      const childrenWidths = node.children.map(c => calculateSubtreeWidth(c));
      const totalChildrenWidth = childrenWidths.reduce((a, b) => a + b, 0) +
        (node.children.length - 1) * HORIZONTAL_GAP;

      let childX = centerX - totalChildrenWidth / 2;
      const childY = y + height + VERTICAL_GAP;

      for (let i = 0; i < node.children.length; i++) {
        const childWidth = childrenWidths[i];
        const childCenterX = childX + childWidth / 2;

        positionNode(node.children[i], childCenterX, childY, nodeId);

        childX += childWidth + HORIZONTAL_GAP;
      }
    }
  }

  // Start layout from root
  const rootNode = nodes[0];
  const totalWidth = calculateSubtreeWidth(rootNode);
  const centerX = totalWidth / 2;

  positionNode(rootNode, centerX, 0);

  return { canvasNodes, edges };
}

/**
 * Collect annotations from tree nodes
 */
function collectAnnotations(
  nodes: ConversationTreeNode[]
): Map<string, { title?: string; body?: string; tags?: string[] }> {
  const annotations = new Map<string, { title?: string; body?: string; tags?: string[] }>();

  function traverse(node: ConversationTreeNode) {
    if (node.has_annotation && node.turn_id) {
      // We don't have the full annotation data in the tree node,
      // but we can indicate there's an annotation
      annotations.set(node.turn_id, {
        title: 'Annotation',
        body: '(See original for full annotation)',
        tags: node.tags,
      });
    }
    node.children.forEach(traverse);
  }

  nodes.forEach(traverse);
  return annotations;
}

/**
 * Export tree to Obsidian Canvas format
 */
export function exportTreeToCanvas(tree: ConversationTree): Canvas {
  const annotations = collectAnnotations(tree.nodes);
  const { canvasNodes, edges } = layoutTree(tree.nodes, annotations);

  return {
    nodes: canvasNodes,
    edges: edges,
  };
}

/**
 * Download tree as .canvas file
 */
export function downloadTreeCanvas(tree: ConversationTree): void {
  const canvas = exportTreeToCanvas(tree);
  const json = JSON.stringify(canvas, null, '\t');
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `conversation-tree-${tree.root_conversation_id.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.canvas`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
