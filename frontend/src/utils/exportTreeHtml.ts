/**
 * Export conversation tree as a self-contained HTML file
 * Includes all data and styling inline for offline viewing
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
  // Prepare tree data with options
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
        <label>
          <input type="checkbox" id="expandAll" onchange="toggleExpandAll()">
          Expand all messages
        </label>
        <label>
          <input type="checkbox" id="showThinking" ${options.includeThinking ? 'checked' : ''} onchange="toggleThinking()">
          Show thinking
        </label>
      </div>
    </header>
    <main id="tree-container"></main>
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
 * Prepare tree data for export, optionally filtering fields
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
      // Keep only truncated message
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
      min-height: 100vh;
    }

    #app {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }

    .header {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 20px;
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
      gap: 16px;
      flex-wrap: wrap;
    }

    .controls label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.875rem;
      color: #94a3b8;
      cursor: pointer;
    }

    .controls input[type="checkbox"] {
      width: 16px;
      height: 16px;
      accent-color: #22d3ee;
    }

    .tree-level {
      padding-left: 24px;
      border-left: 2px solid #334155;
      margin-left: 12px;
    }

    .tree-level:first-child {
      padding-left: 0;
      border-left: none;
      margin-left: 0;
    }

    .node {
      margin: 12px 0;
    }

    .node-content {
      background: #1e293b;
      border: 2px solid #334155;
      border-radius: 8px;
      padding: 12px 16px;
      transition: all 0.2s;
    }

    .node-content:hover {
      border-color: #475569;
    }

    .node-content.user {
      border-color: #3b82f6;
      background: rgba(59, 130, 246, 0.1);
    }

    .node-content.assistant {
      border-color: #22c55e;
      background: rgba(34, 197, 94, 0.1);
    }

    .node-content.modified {
      border-color: #f97316 !important;
    }

    .node-header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      font-size: 0.75rem;
    }

    .badge {
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
      text-transform: uppercase;
      font-size: 0.625rem;
    }

    .badge.user {
      background: #3b82f6;
      color: white;
    }

    .badge.assistant {
      background: #22c55e;
      color: white;
    }

    .badge.provider {
      background: #475569;
      color: white;
    }

    .badge.modified {
      background: #f97316;
      color: white;
    }

    .badge.params {
      background: #eab308;
      color: black;
    }

    .meta {
      color: #64748b;
      font-family: monospace;
      font-size: 0.75rem;
    }

    .message-preview {
      font-size: 0.875rem;
      color: #cbd5e1;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 120px;
      overflow: hidden;
      position: relative;
    }

    .message-preview.expanded {
      max-height: none;
    }

    .message-preview.collapsed::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 40px;
      background: linear-gradient(transparent, #1e293b);
      pointer-events: none;
    }

    .node-content.user .message-preview.collapsed::after {
      background: linear-gradient(transparent, rgba(30, 64, 175, 0.3));
    }

    .node-content.assistant .message-preview.collapsed::after {
      background: linear-gradient(transparent, rgba(22, 101, 52, 0.3));
    }

    .message-full {
      display: none;
      font-size: 0.875rem;
      color: #e2e8f0;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 400px;
      overflow-y: auto;
      padding: 12px;
      background: #0f172a;
      border-radius: 6px;
      margin-top: 8px;
    }

    .message-full.visible {
      display: block;
    }

    .thinking-section {
      margin-top: 8px;
      padding: 12px;
      background: rgba(147, 51, 234, 0.1);
      border: 1px solid rgba(147, 51, 234, 0.3);
      border-radius: 6px;
      display: none;
    }

    .thinking-section.visible {
      display: block;
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
      margin-top: 8px;
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

    .param-item .field {
      color: #e2e8f0;
      font-weight: 500;
    }

    .param-item .old {
      color: #ef4444;
      text-decoration: line-through;
    }

    .param-item .new {
      color: #22c55e;
    }

    .expand-btn {
      background: none;
      border: 1px solid #475569;
      color: #94a3b8;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 0.75rem;
      cursor: pointer;
      margin-top: 8px;
    }

    .expand-btn:hover {
      border-color: #22d3ee;
      color: #22d3ee;
    }

    .branch-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.75rem;
      color: #eab308;
      margin: 8px 0;
    }

    .children-container {
      margin-top: 8px;
    }

    .request-id {
      font-family: monospace;
      font-size: 0.625rem;
      color: #64748b;
      cursor: pointer;
    }

    .request-id:hover {
      color: #94a3b8;
    }

    .copied-toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #22c55e;
      color: white;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 0.875rem;
      opacity: 0;
      transition: opacity 0.3s;
    }

    .copied-toast.visible {
      opacity: 1;
    }
  `;
}

/**
 * Inline JavaScript for interactivity
 */
function getInlineScript(): string {
  return `
    let expandAllState = false;
    let showThinkingState = true;

    function init() {
      renderTree();
    }

    function toggleExpandAll() {
      expandAllState = document.getElementById('expandAll').checked;
      document.querySelectorAll('.message-preview').forEach(el => {
        el.classList.toggle('expanded', expandAllState);
        el.classList.toggle('collapsed', !expandAllState);
      });
      document.querySelectorAll('.message-full').forEach(el => {
        el.classList.toggle('visible', expandAllState);
      });
      document.querySelectorAll('.expand-btn').forEach(el => {
        el.textContent = expandAllState ? 'Collapse' : 'Expand';
      });
    }

    function toggleThinking() {
      showThinkingState = document.getElementById('showThinking').checked;
      document.querySelectorAll('.thinking-section').forEach(el => {
        el.classList.toggle('visible', showThinkingState);
      });
    }

    function toggleMessage(nodeId) {
      const preview = document.getElementById('preview-' + nodeId);
      const full = document.getElementById('full-' + nodeId);
      const btn = document.getElementById('btn-' + nodeId);

      const isExpanded = preview.classList.contains('expanded');
      preview.classList.toggle('expanded', !isExpanded);
      preview.classList.toggle('collapsed', isExpanded);
      full.classList.toggle('visible', !isExpanded);
      btn.textContent = isExpanded ? 'Expand' : 'Collapse';
    }

    function copyRequestId(text) {
      navigator.clipboard.writeText(text).then(() => {
        showToast('Copied: ' + text);
      });
    }

    function showToast(message) {
      let toast = document.getElementById('toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'copied-toast';
        document.body.appendChild(toast);
      }
      toast.textContent = message;
      toast.classList.add('visible');
      setTimeout(() => toast.classList.remove('visible'), 2000);
    }

    function formatTimestamp(ts) {
      return new Date(ts * 1000).toLocaleString();
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function renderNode(node, depth = 0) {
      const isUser = node.role === 'user';
      const hasChildren = node.children && node.children.length > 0;
      const hasBranches = hasChildren && node.children.length > 1;
      const hasThinking = node.thinking && options.includeThinking;
      const hasParamMods = node.parameter_modifications?.hasModifications && options.includeParameterMods;

      let html = '<div class="node">';
      html += '<div class="node-content ' + node.role + (node.is_modified ? ' modified' : '') + '">';

      // Header
      html += '<div class="node-header">';
      html += '<span class="badge ' + node.role + '">' + node.role + '</span>';
      html += '<span class="badge provider">' + escapeHtml(node.provider) + '</span>';
      html += '<span class="meta">' + escapeHtml(node.model) + '</span>';
      html += '<span class="meta">' + formatTimestamp(node.timestamp) + '</span>';
      if (node.is_modified) {
        html += '<span class="badge modified">Modified</span>';
      }
      if (hasParamMods) {
        html += '<span class="badge params">Params</span>';
      }
      if (node.request_id) {
        html += '<span class="request-id" onclick="copyRequestId(\\'' + escapeHtml(node.request_id) + '\\')">req: ' + escapeHtml(node.request_id.slice(0, 16)) + '...</span>';
      }
      html += '</div>';

      // Message preview
      html += '<div id="preview-' + node.node_id + '" class="message-preview collapsed">';
      html += escapeHtml(node.message);
      html += '</div>';

      // Full message (hidden by default)
      html += '<div id="full-' + node.node_id + '" class="message-full">';
      html += escapeHtml(node.full_message || node.message);
      html += '</div>';

      // Expand button
      html += '<button id="btn-' + node.node_id + '" class="expand-btn" onclick="toggleMessage(\\'' + node.node_id + '\\')">Expand</button>';

      // Thinking section
      if (hasThinking) {
        html += '<div class="thinking-section' + (showThinkingState ? ' visible' : '') + '">';
        html += '<div class="label">Thinking (' + node.thinking.length.toLocaleString() + ' chars)</div>';
        html += '<pre>' + escapeHtml(node.thinking) + '</pre>';
        html += '</div>';
      }

      // Parameter modifications
      if (hasParamMods) {
        html += '<div class="params-section">';
        html += '<div class="label">Parameter Changes</div>';
        node.parameter_modifications.modifications.forEach(function(mod) {
          html += '<div class="param-item">';
          html += '<span class="field">' + escapeHtml(mod.field) + ':</span> ';
          html += '<span class="old">' + escapeHtml(String(mod.oldValue || '(not set)').slice(0, 50)) + '</span>';
          html += ' → ';
          html += '<span class="new">' + escapeHtml(String(mod.newValue || '(not set)').slice(0, 50)) + '</span>';
          html += ' <em>(' + mod.modificationType + ')</em>';
          html += '</div>';
        });
        html += '</div>';
      }

      html += '</div>'; // End node-content

      // Children
      if (hasChildren) {
        if (hasBranches) {
          html += '<div class="branch-indicator">↳ ' + node.children.length + ' branches</div>';
        }
        html += '<div class="children-container tree-level">';
        node.children.forEach(function(child) {
          html += renderNode(child, depth + 1);
        });
        html += '</div>';
      }

      html += '</div>'; // End node
      return html;
    }

    function renderTree() {
      const container = document.getElementById('tree-container');
      let html = '';
      treeData.nodes.forEach(function(node) {
        html += renderNode(node, 0);
      });
      container.innerHTML = html;
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
