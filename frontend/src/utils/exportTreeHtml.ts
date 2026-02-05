/**
 * Export conversation tree as a self-contained HTML file
 * Renders an interactive SVG-based tree graph with pan/zoom
 * Click nodes to view full conversation branch
 */

import { ConversationTree, ConversationTreeNode } from '../types';

interface ExportOptions {
  includeThinking: boolean;
  includeAnnotations: boolean;
  includeParameterMods: boolean;
  includeFullMessages: boolean;
}

/**
 * Generate a self-contained HTML file from the conversation tree
 */
export function exportTreeToHtml(
  tree: ConversationTree,
  options: ExportOptions = {
    includeThinking: true,
    includeAnnotations: true,
    includeParameterMods: true,
    includeFullMessages: true,
  }
): string {
  const treeData = prepareTreeData(tree, options);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Conversation Tree Export - ${new Date().toISOString().split('T')[0]}</title>
  <style>
${getInlineStyles()}
  </style>
</head>
<body>
  <div id="app">
    <header class="header">
      <h1>Conversation Tree</h1>
      <div class="stats">
        <span>${tree.total_conversations} conversation(s)</span>
        <span class="divider">|</span>
        <span>${countNodes(tree.nodes)} message(s)</span>
        <span class="divider">|</span>
        <span>${tree.total_branches} branch(es)</span>
        <span class="divider">|</span>
        <span>Exported: ${new Date().toLocaleString()}</span>
      </div>
      <div class="controls">
        <button id="zoomIn" onclick="zoomIn()">+</button>
        <span id="zoomLevel">100%</span>
        <button id="zoomOut" onclick="zoomOut()">-</button>
        <button onclick="resetView()">Reset</button>
        <label>
          <input type="checkbox" id="expandNodes" onchange="toggleExpandNodes()">
          Expand nodes
        </label>
      </div>
    </header>
    <main id="tree-container">
      <svg id="tree-svg"></svg>
    </main>
    <div id="modal" class="modal hidden">
      <div class="modal-content">
        <div class="modal-header">
          <h2>Conversation Branch</h2>
          <button class="close-btn" onclick="closeModal()">&times;</button>
        </div>
        <div id="modal-body" class="modal-body"></div>
      </div>
    </div>
  </div>
  <script>
    const treeData = ${JSON.stringify(treeData, null, 2)};
    const options = ${JSON.stringify(options)};

${getInlineScript()}
  </script>
</body>
</html>`;
}

/**
 * Prepare tree data for export
 */
function prepareTreeData(tree: ConversationTree, options: ExportOptions): ConversationTree {
  function processNode(node: ConversationTreeNode): ConversationTreeNode {
    const processed: ConversationTreeNode = {
      ...node,
      children: node.children.map(processNode),
    };

    if (!options.includeThinking) {
      delete (processed as any).thinking;
    }

    if (!options.includeParameterMods) {
      delete (processed as any).parameter_modifications;
    }

    if (!options.includeFullMessages) {
      processed.full_message = processed.message;
    }

    return processed;
  }

  return {
    ...tree,
    nodes: tree.nodes.map(processNode),
  };
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
 * Inline CSS styles
 */
function getInlineStyles(): string {
  return `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      line-height: 1.5;
      height: 100vh;
      overflow: hidden;
    }

    #app {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }

    .header {
      background: #1e293b;
      border-bottom: 1px solid #334155;
      padding: 12px 20px;
      flex-shrink: 0;
    }

    .header h1 {
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .stats {
      font-size: 0.875rem;
      color: #94a3b8;
      margin-bottom: 12px;
    }

    .stats .divider {
      margin: 0 8px;
      color: #475569;
    }

    .controls {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }

    .controls button {
      background: #334155;
      border: 1px solid #475569;
      color: #e2e8f0;
      padding: 4px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.875rem;
    }

    .controls button:hover {
      background: #475569;
    }

    .controls label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.875rem;
      color: #94a3b8;
      cursor: pointer;
      margin-left: 16px;
    }

    .controls input[type="checkbox"] {
      width: 16px;
      height: 16px;
      accent-color: #22d3ee;
    }

    #zoomLevel {
      min-width: 50px;
      text-align: center;
      font-size: 0.875rem;
      color: #94a3b8;
    }

    #tree-container {
      flex: 1;
      overflow: hidden;
      cursor: grab;
      background: #0f172a;
    }

    #tree-container:active {
      cursor: grabbing;
    }

    #tree-svg {
      width: 100%;
      height: 100%;
    }

    .node-group {
      cursor: pointer;
    }

    .node-rect {
      rx: 8;
      ry: 8;
      stroke-width: 2;
      transition: filter 0.2s;
    }

    .node-group:hover .node-rect {
      filter: brightness(1.2);
    }

    .node-rect.user {
      fill: rgba(59, 130, 246, 0.2);
      stroke: #3b82f6;
    }

    .node-rect.assistant {
      fill: rgba(34, 197, 94, 0.2);
      stroke: #22c55e;
    }

    .node-rect.modified {
      stroke: #f97316;
    }

    .node-text {
      fill: #e2e8f0;
      font-size: 12px;
    }

    .node-role {
      fill: #94a3b8;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .node-role.user { fill: #3b82f6; }
    .node-role.assistant { fill: #22c55e; }

    .node-meta {
      fill: #64748b;
      font-size: 9px;
      font-family: monospace;
    }

    .node-badges {
      font-size: 10px;
    }

    .connection-line {
      fill: none;
      stroke: #4b5563;
      stroke-width: 2;
    }

    /* Modal styles */
    .modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal.hidden {
      display: none;
    }

    .modal-content {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      width: 90%;
      max-width: 900px;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid #334155;
    }

    .modal-header h2 {
      font-size: 1.125rem;
      font-weight: 600;
    }

    .close-btn {
      background: none;
      border: none;
      color: #94a3b8;
      font-size: 1.5rem;
      cursor: pointer;
      padding: 0 8px;
    }

    .close-btn:hover {
      color: #e2e8f0;
    }

    .modal-body {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    }

    .message-bubble {
      border-radius: 8px;
      border: 1px solid #334155;
      padding: 16px;
      margin-bottom: 16px;
    }

    .message-bubble.user {
      background: rgba(59, 130, 246, 0.1);
      border-color: rgba(59, 130, 246, 0.3);
    }

    .message-bubble.assistant {
      background: rgba(34, 197, 94, 0.1);
      border-color: rgba(34, 197, 94, 0.3);
    }

    .message-bubble.highlighted {
      box-shadow: 0 0 0 2px #22d3ee;
    }

    .message-header {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin-bottom: 12px;
      font-size: 0.75rem;
    }

    .badge {
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
      font-size: 0.625rem;
      text-transform: uppercase;
    }

    .badge.user { background: #3b82f6; color: white; }
    .badge.assistant { background: #22c55e; color: white; }
    .badge.provider { background: #475569; color: white; }
    .badge.modified { background: #f97316; color: white; }
    .badge.params { background: #eab308; color: black; }

    .message-meta {
      color: #64748b;
      font-family: monospace;
    }

    .message-content {
      font-size: 0.875rem;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .thinking-section {
      margin-top: 12px;
      padding: 12px;
      background: rgba(147, 51, 234, 0.1);
      border: 1px solid rgba(147, 51, 234, 0.3);
      border-radius: 6px;
    }

    .thinking-section .label {
      font-size: 0.75rem;
      font-weight: 600;
      color: #a855f7;
      margin-bottom: 8px;
    }

    .thinking-section pre {
      font-size: 0.75rem;
      color: rgba(192, 132, 252, 0.8);
      white-space: pre-wrap;
      word-break: break-word;
      font-style: italic;
      max-height: 200px;
      overflow-y: auto;
    }

    .params-section {
      margin-top: 12px;
      padding: 12px;
      background: rgba(234, 179, 8, 0.1);
      border: 1px solid rgba(234, 179, 8, 0.3);
      border-radius: 6px;
    }

    .params-section .label {
      font-size: 0.75rem;
      font-weight: 600;
      color: #eab308;
      margin-bottom: 8px;
    }

    .param-item {
      font-size: 0.75rem;
      color: #94a3b8;
      margin: 4px 0;
    }

    .param-item .field { color: #e2e8f0; font-weight: 500; }
    .param-item .old { color: #ef4444; text-decoration: line-through; }
    .param-item .new { color: #22c55e; }
  `;
}

/**
 * Inline JavaScript for interactivity
 */
function getInlineScript(): string {
  return `
    // Layout constants
    const NODE_WIDTH = 200;
    const NODE_HEIGHT = 130;
    const NODE_WIDTH_EXPANDED = 380;
    const NODE_HEIGHT_EXPANDED = 280;
    const HORIZONTAL_GAP = 30;
    const VERTICAL_GAP = 40;

    // View state
    let viewState = { zoom: 1, panX: 0, panY: 0 };
    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    let expandNodes = false;

    // Positioned nodes cache
    let positionedNodes = [];
    let svgBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

    function init() {
      layoutAndRender();
      setupEventListeners();
    }

    function getNodeDimensions() {
      return expandNodes
        ? { width: NODE_WIDTH_EXPANDED, height: NODE_HEIGHT_EXPANDED }
        : { width: NODE_WIDTH, height: NODE_HEIGHT };
    }

    function calculateSubtreeWidth(node) {
      const { width } = getNodeDimensions();
      if (!node.children || node.children.length === 0) {
        return width;
      }
      const childrenWidth = node.children.reduce((sum, child) => sum + calculateSubtreeWidth(child), 0);
      const gaps = (node.children.length - 1) * HORIZONTAL_GAP;
      return Math.max(width, childrenWidth + gaps);
    }

    function layoutTree(nodes) {
      if (!nodes || nodes.length === 0) return [];

      const { width, height } = getNodeDimensions();
      const positioned = [];

      function positionNode(node, centerX, y) {
        const nodeX = centerX - width / 2;
        const pos = {
          node: node,
          x: nodeX,
          y: y,
          width: width,
          height: height,
          children: []
        };

        if (node.children && node.children.length > 0) {
          const childrenWidths = node.children.map(c => calculateSubtreeWidth(c));
          const totalChildrenWidth = childrenWidths.reduce((a, b) => a + b, 0) +
            (node.children.length - 1) * HORIZONTAL_GAP;

          let childX = centerX - totalChildrenWidth / 2;

          for (let i = 0; i < node.children.length; i++) {
            const childWidth = childrenWidths[i];
            const childCenterX = childX + childWidth / 2;
            const childPos = positionNode(node.children[i], childCenterX, y + height + VERTICAL_GAP);
            pos.children.push(childPos);
            childX += childWidth + HORIZONTAL_GAP;
          }
        }

        return pos;
      }

      const rootNode = nodes[0];
      const totalWidth = calculateSubtreeWidth(rootNode);
      positioned.push(positionNode(rootNode, totalWidth / 2, 0));

      return positioned;
    }

    function collectAllPositioned(positioned) {
      const all = [];
      function collect(p) {
        all.push(p);
        p.children.forEach(collect);
      }
      positioned.forEach(collect);
      return all;
    }

    function calculateBounds(allNodes) {
      if (allNodes.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const n of allNodes) {
        minX = Math.min(minX, n.x);
        maxX = Math.max(maxX, n.x + n.width);
        minY = Math.min(minY, n.y);
        maxY = Math.max(maxY, n.y + n.height);
      }
      return { minX, maxX, minY, maxY };
    }

    function escapeHtml(text) {
      if (text === null || text === undefined) return '';
      const div = document.createElement('div');
      div.textContent = String(text);
      return div.innerHTML;
    }

    function truncateText(text, maxLen) {
      if (!text) return '';
      text = String(text);
      if (text.length <= maxLen) return text;
      return text.slice(0, maxLen) + '...';
    }

    function formatValue(value) {
      if (value === null || value === undefined) return '(none)';
      if (typeof value === 'object') {
        try {
          const str = JSON.stringify(value);
          return truncateText(str, 100);
        } catch (e) {
          return '(complex object)';
        }
      }
      return truncateText(String(value), 100);
    }

    function layoutAndRender() {
      positionedNodes = layoutTree(treeData.nodes);
      const allNodes = collectAllPositioned(positionedNodes);
      svgBounds = calculateBounds(allNodes);

      const padding = 60;
      const contentWidth = svgBounds.maxX - svgBounds.minX + padding * 2;
      const contentHeight = svgBounds.maxY - svgBounds.minY + padding * 2;
      const offsetX = -svgBounds.minX + padding;
      const offsetY = -svgBounds.minY + padding;

      const svg = document.getElementById('tree-svg');
      svg.innerHTML = '';
      svg.setAttribute('viewBox', '0 0 ' + contentWidth + ' ' + contentHeight);

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.id = 'tree-group';
      svg.appendChild(g);

      // Render connections first (behind nodes)
      renderConnections(g, positionedNodes, offsetX, offsetY);

      // Render nodes
      renderNodes(g, positionedNodes, offsetX, offsetY);

      updateTransform();
    }

    function renderConnections(g, positioned, offsetX, offsetY) {
      function renderLines(pos) {
        for (const child of pos.children) {
          const startX = pos.x + offsetX + pos.width / 2;
          const startY = pos.y + offsetY + pos.height;
          const endX = child.x + offsetX + child.width / 2;
          const endY = child.y + offsetY;
          const midY = (startY + endY) / 2;

          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', 'M ' + startX + ' ' + startY + ' C ' + startX + ' ' + midY + ', ' + endX + ' ' + midY + ', ' + endX + ' ' + endY);
          path.setAttribute('class', 'connection-line');
          g.appendChild(path);

          renderLines(child);
        }
      }
      positioned.forEach(renderLines);
    }

    function renderNodes(g, positioned, offsetX, offsetY) {
      function renderNode(pos) {
        const node = pos.node;
        const x = pos.x + offsetX;
        const y = pos.y + offsetY;

        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('class', 'node-group');
        group.setAttribute('data-node-id', node.node_id);
        group.onclick = function() { openNodeModal(node); };

        // Background rect
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', pos.width);
        rect.setAttribute('height', pos.height);
        rect.setAttribute('class', 'node-rect ' + node.role + (node.is_modified ? ' modified' : ''));
        group.appendChild(rect);

        // Role label
        const roleText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        roleText.setAttribute('x', x + 12);
        roleText.setAttribute('y', y + 20);
        roleText.setAttribute('class', 'node-role ' + node.role);
        roleText.textContent = node.role.toUpperCase();
        group.appendChild(roleText);

        // Message preview
        const maxChars = expandNodes ? 800 : 80;
        const preview = truncateText(node.full_message || node.message || '(empty)', maxChars);
        const lines = wrapText(preview, expandNodes ? 50 : 25);

        lines.slice(0, expandNodes ? 15 : 3).forEach((line, i) => {
          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          text.setAttribute('x', x + 12);
          text.setAttribute('y', y + 38 + i * 14);
          text.setAttribute('class', 'node-text');
          text.textContent = line;
          group.appendChild(text);
        });

        // Model info at bottom
        const metaText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        metaText.setAttribute('x', x + 12);
        metaText.setAttribute('y', y + pos.height - 10);
        metaText.setAttribute('class', 'node-meta');
        metaText.textContent = truncateText(node.model, 20);
        group.appendChild(metaText);

        // Badges
        let badgeX = x + pos.width - 12;
        if (node.thinking) {
          const badge = createBadge(badgeX, y + pos.height - 18, 'T', '#a855f7');
          group.appendChild(badge);
          badgeX -= 18;
        }
        if (node.is_modified) {
          const badge = createBadge(badgeX, y + pos.height - 18, '*', '#f97316');
          group.appendChild(badge);
          badgeX -= 18;
        }
        if (node.parameter_modifications && node.parameter_modifications.hasModifications) {
          const badge = createBadge(badgeX, y + pos.height - 18, 'P', '#eab308');
          group.appendChild(badge);
        }

        g.appendChild(group);

        pos.children.forEach(renderNode);
      }

      positioned.forEach(renderNode);
    }

    function createBadge(x, y, text, color) {
      const badge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      badge.setAttribute('x', x);
      badge.setAttribute('y', y);
      badge.setAttribute('text-anchor', 'end');
      badge.setAttribute('class', 'node-badges');
      badge.setAttribute('fill', color);
      badge.textContent = text;
      return badge;
    }

    function wrapText(text, maxCharsPerLine) {
      if (!text) return [];
      const words = text.replace(/\\n/g, ' ').split(' ');
      const lines = [];
      let currentLine = '';

      for (const word of words) {
        if (currentLine.length + word.length + 1 <= maxCharsPerLine) {
          currentLine += (currentLine ? ' ' : '') + word;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word.slice(0, maxCharsPerLine);
        }
      }
      if (currentLine) lines.push(currentLine);
      return lines;
    }

    function updateTransform() {
      const g = document.getElementById('tree-group');
      if (g) {
        g.setAttribute('transform',
          'translate(' + viewState.panX + ',' + viewState.panY + ') scale(' + viewState.zoom + ')');
      }
      document.getElementById('zoomLevel').textContent = Math.round(viewState.zoom * 100) + '%';
    }

    function setupEventListeners() {
      const container = document.getElementById('tree-container');

      container.addEventListener('mousedown', function(e) {
        if (e.button === 0) {
          isDragging = true;
          dragStart = { x: e.clientX - viewState.panX, y: e.clientY - viewState.panY };
        }
      });

      container.addEventListener('mousemove', function(e) {
        if (isDragging) {
          viewState.panX = e.clientX - dragStart.x;
          viewState.panY = e.clientY - dragStart.y;
          updateTransform();
        }
      });

      container.addEventListener('mouseup', function() {
        isDragging = false;
      });

      container.addEventListener('mouseleave', function() {
        isDragging = false;
      });

      container.addEventListener('wheel', function(e) {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const rect = container.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;

        const newZoom = Math.min(Math.max(viewState.zoom * factor, 0.1), 20);
        viewState.panX = cx - (cx - viewState.panX) / viewState.zoom * newZoom;
        viewState.panY = cy - (cy - viewState.panY) / viewState.zoom * newZoom;
        viewState.zoom = newZoom;
        updateTransform();
      });

      // Close modal on escape
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeModal();
      });

      // Close modal on backdrop click
      document.getElementById('modal').addEventListener('click', function(e) {
        if (e.target === this) closeModal();
      });
    }

    function zoomIn() {
      viewState.zoom = Math.min(viewState.zoom * 1.2, 20);
      updateTransform();
    }

    function zoomOut() {
      viewState.zoom = Math.max(viewState.zoom * 0.8, 0.1);
      updateTransform();
    }

    function resetView() {
      viewState = { zoom: 1, panX: 0, panY: 0 };
      updateTransform();
    }

    function toggleExpandNodes() {
      expandNodes = document.getElementById('expandNodes').checked;
      layoutAndRender();
    }

    // Build path from root to target node
    function buildBranchPath(nodes, targetNodeId) {
      const path = [];

      function findPath(node, currentPath) {
        currentPath.push(node);
        if (node.node_id === targetNodeId) {
          path.push(...currentPath);
          return true;
        }
        for (const child of (node.children || [])) {
          if (findPath(child, currentPath)) return true;
        }
        currentPath.pop();
        return false;
      }

      for (const root of nodes) {
        if (findPath(root, [])) break;
      }

      // Extend to leaf
      if (path.length > 0) {
        let current = path[path.length - 1];
        while (current.children && current.children.length > 0) {
          current = current.children[0];
          path.push(current);
        }
      }

      return path;
    }

    function openNodeModal(clickedNode) {
      const path = buildBranchPath(treeData.nodes, clickedNode.node_id);
      const modalBody = document.getElementById('modal-body');
      modalBody.innerHTML = '';

      path.forEach(function(node) {
        const isHighlighted = node.node_id === clickedNode.node_id;
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble ' + node.role + (isHighlighted ? ' highlighted' : '');
        if (isHighlighted) bubble.id = 'highlighted-message';

        // Header
        const header = document.createElement('div');
        header.className = 'message-header';
        header.innerHTML =
          '<span class="badge ' + node.role + '">' + node.role.toUpperCase() + '</span>' +
          '<span class="badge provider">' + escapeHtml(node.provider) + '</span>' +
          '<span class="message-meta">' + escapeHtml(node.model) + '</span>' +
          '<span class="message-meta">' + new Date(node.timestamp * 1000).toLocaleString() + '</span>' +
          (node.is_modified ? '<span class="badge modified">Modified</span>' : '') +
          (node.parameter_modifications && node.parameter_modifications.hasModifications ? '<span class="badge params">Params</span>' : '') +
          (node.request_id ? '<span class="message-meta">req: ' + escapeHtml(node.request_id.slice(0, 16)) + '...</span>' : '');
        bubble.appendChild(header);

        // Thinking section
        if (node.thinking && options.includeThinking) {
          const thinking = document.createElement('div');
          thinking.className = 'thinking-section';
          thinking.innerHTML =
            '<div class="label">Thinking (' + node.thinking.length.toLocaleString() + ' chars)</div>' +
            '<pre>' + escapeHtml(node.thinking) + '</pre>';
          bubble.appendChild(thinking);
        }

        // Parameter modifications
        if (node.parameter_modifications && node.parameter_modifications.hasModifications && options.includeParameterMods) {
          const params = document.createElement('div');
          params.className = 'params-section';
          let paramsHtml = '<div class="label">Parameter Changes</div>';
          node.parameter_modifications.modifications.forEach(function(mod) {
            paramsHtml += '<div class="param-item">' +
              '<span class="field">' + escapeHtml(mod.field) + ':</span> ' +
              '<span class="old">' + escapeHtml(formatValue(mod.oldValue)) + '</span>' +
              ' → ' +
              '<span class="new">' + escapeHtml(formatValue(mod.newValue)) + '</span>' +
              ' <em>(' + mod.modificationType + ')</em></div>';
          });
          params.innerHTML = paramsHtml;
          bubble.appendChild(params);
        }

        // Message content
        const content = document.createElement('div');
        content.className = 'message-content';
        content.textContent = node.full_message || node.message || '(empty)';
        bubble.appendChild(content);

        modalBody.appendChild(bubble);
      });

      document.getElementById('modal').classList.remove('hidden');

      // Scroll to highlighted message
      setTimeout(function() {
        const highlighted = document.getElementById('highlighted-message');
        if (highlighted) {
          highlighted.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }

    function closeModal() {
      document.getElementById('modal').classList.add('hidden');
    }

    // Initialize on load
    document.addEventListener('DOMContentLoaded', init);
  `;
}

/**
 * Trigger download of the HTML file
 */
export function downloadTreeHtml(tree: ConversationTree, options?: ExportOptions): void {
  const html = exportTreeToHtml(tree, options);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `conversation-tree-${tree.root_conversation_id.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
