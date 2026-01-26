/**
 * Tollbooth - Backend Service
 *
 * Handles:
 * - WebSocket connection from proxy (receives traffic)
 * - WebSocket connection to frontend (pushes updates)
 * - REST API for traffic, conversations, URL log
 */

import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import {
  TrafficFlow,
  StreamChunk,
  ProxyMessage,
  InterceptMode,
  InterceptModifications,
  URLLogFilter,
  StoredResponse,
  StoredRequest,
  RequestModifiedData,
  PendingIntercept,
} from './types';
import { storage } from './storage';
import { parseRequest, parseResponse } from './parsers';
import {
  processRequest,
  processResponse,
  getOrCreateAccumulator,
  finalizeStream,
} from './conversations';
import { addToURLLog, getURLLog, exportToCSV, exportToJSON, getUniqueDomains, getUniqueMethods, getUniqueStatusCodes } from './url-log';
import { interceptManager } from './intercept';
import { dataStore } from './datastore';
import { rulesEngine } from './rules';
import { Rule, RuleDirection } from './types';
import { settingsManager, Settings } from './settings';
import { createLLMClient, ChatMessage, fetchModelsForProvider, STATIC_MODELS } from './llm-client';
import { LLMProvider, ConfigurableLLMProvider, DEFAULT_BASE_URLS } from './settings';
import { refusalManager } from './refusal';
import { RefusalRule, PendingRefusal, Annotation, AnnotationTargetType, ReplayVariant, InlineAnnotation } from './types';
import { shortIdRegistry } from './short-id-registry';
import { replayManager } from './replay';

// Configuration
const REST_PORT = parseInt(process.env.REST_PORT || '3000', 10);
const PROXY_WS_PORT = parseInt(process.env.PROXY_WS_PORT || '3001', 10);
const FRONTEND_WS_PORT = parseInt(process.env.FRONTEND_WS_PORT || '3002', 10);
const WS_MAX_PAYLOAD = parseInt(process.env.WS_MAX_PAYLOAD || String(200 * 1024 * 1024), 10); // Default 200MB

// Express app for REST API
const app = express();

// CORS configuration
const corsOptions = {
  origin: true,  // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};
app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '50mb' }));

// Frontend WebSocket clients
const frontendClients = new Set<WebSocket>();

// ============ REST API Routes ============

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Get all traffic
app.get('/api/traffic', (req, res) => {
  const traffic = storage.getAllTraffic();
  res.json({ traffic, total: traffic.length });
});

// Get single traffic flow
app.get('/api/traffic/:flowId', (req, res) => {
  const flow = storage.getTraffic(req.params.flowId);
  if (!flow) {
    return res.status(404).json({ error: 'Flow not found' });
  }
  res.json(flow);
});

// Hide a traffic flow
app.post('/api/traffic/:flowId/hide', (req, res) => {
  const success = storage.hideTraffic(req.params.flowId);
  if (!success) {
    return res.status(404).json({ error: 'Flow not found' });
  }
  const flow = storage.getTraffic(req.params.flowId);
  broadcastToFrontend({ type: 'traffic', data: flow });
  res.json({ success: true, flow });
});

// Unhide a traffic flow
app.post('/api/traffic/:flowId/unhide', (req, res) => {
  const success = storage.unhideTraffic(req.params.flowId);
  if (!success) {
    return res.status(404).json({ error: 'Flow not found' });
  }
  const flow = storage.getTraffic(req.params.flowId);
  broadcastToFrontend({ type: 'traffic', data: flow });
  res.json({ success: true, flow });
});

// Hide multiple traffic flows
app.post('/api/traffic/hide-bulk', (req, res) => {
  const { flow_ids } = req.body;
  if (!Array.isArray(flow_ids)) {
    return res.status(400).json({ error: 'flow_ids must be an array' });
  }
  const count = storage.hideTrafficBulk(flow_ids);
  // Broadcast updates for each hidden flow
  for (const flowId of flow_ids) {
    const flow = storage.getTraffic(flowId);
    if (flow) {
      broadcastToFrontend({ type: 'traffic', data: flow });
    }
  }
  res.json({ success: true, hidden: count });
});

// Delete a single traffic flow
app.delete('/api/traffic/:flowId', (req, res) => {
  const success = storage.deleteTraffic(req.params.flowId);
  if (!success) {
    return res.status(404).json({ error: 'Flow not found' });
  }
  broadcastToFrontend({ type: 'traffic_deleted', data: { flow_id: req.params.flowId } });
  res.json({ success: true });
});

// Clear (delete) multiple traffic flows
app.post('/api/traffic/clear-bulk', (req, res) => {
  const { flow_ids } = req.body;
  if (!Array.isArray(flow_ids)) {
    return res.status(400).json({ error: 'flow_ids must be an array' });
  }
  const count = storage.deleteTrafficBulk(flow_ids);
  // Broadcast deletions
  broadcastToFrontend({ type: 'traffic_cleared', data: { flow_ids, count } });
  res.json({ success: true, cleared: count });
});

// Get URL log with filtering
app.get('/api/urls', (req, res) => {
  const filter: URLLogFilter = {};
  if (req.query.domain) filter.domain = req.query.domain as string;
  if (req.query.method) filter.method = req.query.method as string;
  if (req.query.status_code) filter.status_code = parseInt(req.query.status_code as string, 10);
  if (req.query.is_llm_api) filter.is_llm_api = req.query.is_llm_api === 'true';
  if (req.query.search) filter.search = req.query.search as string;

  const urls = getURLLog(Object.keys(filter).length > 0 ? filter : undefined);
  res.json({ urls, total: urls.length });
});

// Get URL log filter options
app.get('/api/urls/filters', (req, res) => {
  res.json({
    domains: getUniqueDomains(),
    methods: getUniqueMethods(),
    status_codes: getUniqueStatusCodes(),
  });
});

// Export URL log
app.get('/api/urls/export', (req, res) => {
  const format = req.query.format as string || 'json';
  const urls = getURLLog();

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="url-log.csv"');
    res.send(exportToCSV(urls));
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="url-log.json"');
    res.send(exportToJSON(urls));
  }
});

// Get all conversations
app.get('/api/conversations', (req, res) => {
  const conversations = storage.getAllConversations();
  res.json({ conversations, total: conversations.length });
});

// Get single conversation
app.get('/api/conversations/:conversationId', (req, res) => {
  const conversation = storage.getConversation(req.params.conversationId);
  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  res.json(conversation);
});

// Get intercept mode
app.get('/api/intercept/mode', (req, res) => {
  res.json({ mode: interceptManager.getInterceptMode() });
});

// Set intercept mode
app.post('/api/intercept/mode', (req, res) => {
  const { mode } = req.body;
  if (!['passthrough', 'intercept_llm', 'intercept_all'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid intercept mode' });
  }
  interceptManager.setInterceptMode(mode as InterceptMode);
  res.json({ mode });
});

// Get rules enabled state
app.get('/api/rules/enabled', (req, res) => {
  res.json({ enabled: interceptManager.getRulesEnabled() });
});

// Set rules enabled state
app.post('/api/rules/enabled', (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be a boolean' });
  }
  interceptManager.setRulesEnabled(enabled);
  res.json({ enabled });
});

// Get pending intercepts
app.get('/api/intercept/pending', (req, res) => {
  const pending = interceptManager.getPendingIntercepts();
  res.json({ pending, total: pending.length });
});

// Forward request/response
app.post('/api/intercept/:flowId/forward', async (req, res) => {
  const { flowId } = req.params;
  const pending = interceptManager.getPendingIntercept(flowId);
  if (!pending) {
    return res.status(404).json({ error: 'Pending intercept not found' });
  }

  if (pending.type === 'request') {
    interceptManager.forwardRequest(flowId);
  } else {
    interceptManager.forwardResponse(flowId);

    // If this is a replay response, mark the variant as completed
    if (pending.flow.replay_source) {
      await replayManager.markCompleted(pending.flow.replay_source.variant_id, flowId);
    }
  }
  res.json({ success: true });
});

// Forward with modifications
app.post('/api/intercept/:flowId/forward-modified', async (req, res) => {
  const { flowId } = req.params;
  const modifications: InterceptModifications = req.body;
  const pending = interceptManager.getPendingIntercept(flowId);
  if (!pending) {
    return res.status(404).json({ error: 'Pending intercept not found' });
  }

  if (pending.type === 'request') {
    interceptManager.forwardModifiedRequest(flowId, modifications);
  } else {
    interceptManager.forwardModifiedResponse(flowId, modifications);

    // If this is a replay response, mark the variant as completed
    if (pending.flow.replay_source) {
      await replayManager.markCompleted(pending.flow.replay_source.variant_id, flowId);
    }
  }
  res.json({ success: true });
});

// Drop request
app.post('/api/intercept/:flowId/drop', (req, res) => {
  const { flowId } = req.params;
  const pending = interceptManager.getPendingIntercept(flowId);
  if (!pending) {
    return res.status(404).json({ error: 'Pending intercept not found' });
  }

  interceptManager.dropRequest(flowId);
  res.json({ success: true });
});

// Clear all data
app.post('/api/clear', (req, res) => {
  storage.clear();
  res.json({ success: true });
});

// ============ Data Store API Routes ============

// Helper to add shortId to datastore response item (now stored directly in metadata)
function addDatastoreResponseShortId(item: { key: string; data: StoredResponse }): { key: string; data: StoredResponse; shortId?: string } {
  return { ...item, shortId: item.data.metadata.shortId };
}

// Helper to add shortId to datastore request item (now stored directly in metadata)
function addDatastoreRequestShortId(item: { key: string; data: StoredRequest }): { key: string; data: StoredRequest; shortId?: string } {
  return { ...item, shortId: item.data.metadata.shortId };
}

// List all stored responses
app.get('/api/datastore/responses', async (req, res) => {
  try {
    const items = await dataStore.getAllResponses();
    const itemsWithShortIds = items.map(addDatastoreResponseShortId);
    res.json({ items: itemsWithShortIds, total: items.length });
  } catch (err: any) {
    console.error('Failed to list responses:', err);
    res.status(500).json({ error: 'Failed to list responses' });
  }
});

// Get single stored response (accepts short ID like ds1 or full key)
app.get('/api/datastore/responses/:key', async (req, res) => {
  try {
    const resolvedKey = shortIdRegistry.resolveDatastoreResponseKey(req.params.key) || req.params.key;
    const data = await dataStore.getResponse(resolvedKey);
    if (!data) {
      return res.status(404).json({ error: 'Response not found' });
    }
    res.json({ key: resolvedKey, data, shortId: data.metadata.shortId });
  } catch (err: any) {
    console.error('Failed to get response:', err);
    res.status(500).json({ error: 'Failed to get response' });
  }
});

// Save response
app.post('/api/datastore/responses', async (req, res) => {
  try {
    const { key, data } = req.body as { key: string; data: StoredResponse };
    if (!key || !data) {
      return res.status(400).json({ error: 'Missing key or data' });
    }

    // Validate required fields
    if (typeof data.status_code !== 'number' || typeof data.body !== 'string') {
      return res.status(400).json({ error: 'Invalid response data: status_code and body required' });
    }

    // Add metadata if not present
    if (!data.metadata) {
      data.metadata = { created_at: Date.now() };
    }
    if (!data.headers) {
      data.headers = {};
    }

    const savedData = await dataStore.saveResponse(key, data);

    res.json({ success: true, key, shortId: savedData.metadata.shortId });
  } catch (err: any) {
    console.error('Failed to save response:', err);
    res.status(500).json({ error: 'Failed to save response' });
  }
});

// Update response (accepts short ID like ds1 or full key)
app.put('/api/datastore/responses/:key', async (req, res) => {
  try {
    const resolvedKey = shortIdRegistry.resolveDatastoreResponseKey(req.params.key) || req.params.key;
    const { data } = req.body as { data: StoredResponse };

    // Check if exists
    const existing = await dataStore.getResponse(resolvedKey);
    if (!existing) {
      return res.status(404).json({ error: 'Response not found' });
    }

    if (!data) {
      return res.status(400).json({ error: 'Missing data' });
    }

    // Validate required fields
    if (typeof data.status_code !== 'number' || typeof data.body !== 'string') {
      return res.status(400).json({ error: 'Invalid response data: status_code and body required' });
    }

    // Preserve original created_at, update metadata
    if (!data.metadata) {
      data.metadata = { created_at: existing.metadata?.created_at || Date.now() };
    } else if (!data.metadata.created_at) {
      data.metadata.created_at = existing.metadata?.created_at || Date.now();
    }
    if (!data.headers) {
      data.headers = {};
    }

    const savedData = await dataStore.saveResponse(resolvedKey, data);
    res.json({ success: true, key: resolvedKey, shortId: savedData.metadata.shortId });
  } catch (err: any) {
    console.error('Failed to update response:', err);
    res.status(500).json({ error: 'Failed to update response' });
  }
});

// Delete response (accepts short ID like ds1 or full key)
app.delete('/api/datastore/responses/:key', async (req, res) => {
  try {
    const resolvedKey = shortIdRegistry.resolveDatastoreResponseKey(req.params.key) || req.params.key;
    const deleted = await dataStore.deleteResponse(resolvedKey);
    if (!deleted) {
      return res.status(404).json({ error: 'Response not found' });
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('Failed to delete response:', err);
    res.status(500).json({ error: 'Failed to delete response' });
  }
});

// List all stored requests
app.get('/api/datastore/requests', async (req, res) => {
  try {
    const items = await dataStore.getAllRequests();
    const itemsWithShortIds = items.map(addDatastoreRequestShortId);
    res.json({ items: itemsWithShortIds, total: items.length });
  } catch (err: any) {
    console.error('Failed to list requests:', err);
    res.status(500).json({ error: 'Failed to list requests' });
  }
});

// Get single stored request (accepts short ID like rq1 or full key)
app.get('/api/datastore/requests/:key', async (req, res) => {
  try {
    const resolvedKey = shortIdRegistry.resolveDatastoreRequestKey(req.params.key) || req.params.key;
    const data = await dataStore.getRequest(resolvedKey);
    if (!data) {
      return res.status(404).json({ error: 'Request not found' });
    }
    res.json({ key: resolvedKey, data, shortId: data.metadata.shortId });
  } catch (err: any) {
    console.error('Failed to get request:', err);
    res.status(500).json({ error: 'Failed to get request' });
  }
});

// Save request
app.post('/api/datastore/requests', async (req, res) => {
  try {
    const { key, data } = req.body as { key: string; data: StoredRequest };
    if (!key || !data) {
      return res.status(400).json({ error: 'Missing key or data' });
    }

    // Validate required fields
    if (typeof data.method !== 'string' || typeof data.url !== 'string' || typeof data.body !== 'string') {
      return res.status(400).json({ error: 'Invalid request data: method, url, and body required' });
    }

    // Add metadata if not present
    if (!data.metadata) {
      data.metadata = { created_at: Date.now() };
    }
    if (!data.headers) {
      data.headers = {};
    }

    const savedData = await dataStore.saveRequest(key, data);

    res.json({ success: true, key, shortId: savedData.metadata.shortId });
  } catch (err: any) {
    console.error('Failed to save request:', err);
    res.status(500).json({ error: 'Failed to save request' });
  }
});

// Update request (accepts short ID like rq1 or full key)
app.put('/api/datastore/requests/:key', async (req, res) => {
  try {
    const resolvedKey = shortIdRegistry.resolveDatastoreRequestKey(req.params.key) || req.params.key;
    const { data } = req.body as { data: StoredRequest };

    // Check if exists
    const existing = await dataStore.getRequest(resolvedKey);
    if (!existing) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (!data) {
      return res.status(400).json({ error: 'Missing data' });
    }

    // Validate required fields
    if (typeof data.method !== 'string' || typeof data.url !== 'string' || typeof data.body !== 'string') {
      return res.status(400).json({ error: 'Invalid request data: method, url, and body required' });
    }

    // Preserve original created_at, update metadata
    if (!data.metadata) {
      data.metadata = { created_at: existing.metadata?.created_at || Date.now() };
    } else if (!data.metadata.created_at) {
      data.metadata.created_at = existing.metadata?.created_at || Date.now();
    }
    if (!data.headers) {
      data.headers = {};
    }

    const savedData = await dataStore.saveRequest(resolvedKey, data);
    res.json({ success: true, key: resolvedKey, shortId: savedData.metadata.shortId });
  } catch (err: any) {
    console.error('Failed to update request:', err);
    res.status(500).json({ error: 'Failed to update request' });
  }
});

// Delete request (accepts short ID like rq1 or full key)
app.delete('/api/datastore/requests/:key', async (req, res) => {
  try {
    const resolvedKey = shortIdRegistry.resolveDatastoreRequestKey(req.params.key) || req.params.key;
    const deleted = await dataStore.deleteRequest(resolvedKey);
    if (!deleted) {
      return res.status(404).json({ error: 'Request not found' });
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('Failed to delete request:', err);
    res.status(500).json({ error: 'Failed to delete request' });
  }
});

// Generate a key based on request properties
// Transform response using LLM (accepts short ID like ds1 or full key)
app.post('/api/datastore/responses/:key/transform', async (req, res) => {
  try {
    const resolvedKey = shortIdRegistry.resolveDatastoreResponseKey(req.params.key) || req.params.key;
    const key = resolvedKey;
    const { prompt, template_id, template_variables, provider, save_as = 'replace', new_key } = req.body;

    // Get existing response
    const existing = await dataStore.getResponse(key);
    if (!existing) {
      return res.status(404).json({ error: 'Response not found' });
    }

    // Determine which provider to use
    const targetProvider = provider || settingsManager.getActiveProvider();
    if (!settingsManager.isProviderConfigured(targetProvider)) {
      return res.status(400).json({
        error: `Provider "${targetProvider}" not configured. Set API key in settings.`,
      });
    }

    // Build the prompt
    let finalPrompt: string;
    let systemPrompt: string | undefined;

    if (template_id) {
      const template = settingsManager.getTemplate(template_id);
      if (!template) {
        return res.status(404).json({ error: `Template "${template_id}" not found` });
      }

      const vars = {
        content: existing.body,
        ...template_variables,
      };

      finalPrompt = settingsManager.interpolateString(template.template, vars);
      systemPrompt = template.systemPrompt;
    } else if (prompt) {
      finalPrompt = `${prompt}\n\nContent to transform:\n${existing.body}`;
      systemPrompt = 'You are a data transformation assistant. Apply the requested transformation and return only the transformed content without explanation or formatting.';
    } else {
      return res.status(400).json({ error: 'Either prompt or template_id is required' });
    }

    // Validate new_key for save_as: 'new_key'
    if (save_as === 'new_key' && !new_key) {
      return res.status(400).json({ error: 'new_key is required when save_as is "new_key"' });
    }

    // Call LLM
    const llmConfig = settingsManager.getLLMConfig(targetProvider);
    const client = createLLMClient(llmConfig);

    const messages: ChatMessage[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: finalPrompt });

    const response = await client.chat(messages);
    const transformedContent = response.content;

    // Save the transformed content
    const targetKey = save_as === 'new_key' ? new_key : key;
    const updatedResponse = {
      ...existing,
      body: transformedContent,
      metadata: {
        ...existing.metadata,
        updated_at: Date.now(),
        transformed_from: save_as === 'new_key' ? key : undefined,
      },
    };

    await dataStore.saveResponse(targetKey, updatedResponse);

    res.json({
      success: true,
      key: targetKey,
      original_body: existing.body,
      transformed_body: transformedContent,
    });
  } catch (err: any) {
    console.error('Transform error:', err);
    res.status(500).json({ error: err.message || 'Transform failed' });
  }
});

app.post('/api/datastore/generate-key', (req, res) => {
  const { method, host, path } = req.body;
  if (!method || !host || !path) {
    return res.status(400).json({ error: 'Missing method, host, or path' });
  }
  const key = dataStore.generateKey(method, host, path);
  res.json({ key });
});

// ============ Rules API Routes ============

// Helper to ensure rule has shortId (rules now store shortId directly, this is for backwards compat)
function addRuleShortId(rule: Rule): Rule {
  // Rules now have shortId stored directly on them
  return rule;
}

// List all rules (optionally filter by direction)
app.get('/api/rules', (req, res) => {
  const direction = req.query.direction as RuleDirection | undefined;
  const rules = rulesEngine.getRules(direction);
  const rulesWithShortIds = rules.map(addRuleShortId);
  res.json({ rules: rulesWithShortIds, total: rules.length });
});

// Get single rule (accepts short ID like r1 or full ID)
app.get('/api/rules/:id', (req, res) => {
  const resolvedId = shortIdRegistry.resolveRuleId(req.params.id) || req.params.id;
  const rule = rulesEngine.getRule(resolvedId);
  if (!rule) {
    return res.status(404).json({ error: 'Rule not found' });
  }
  res.json(addRuleShortId(rule));
});

// Create rule
app.post('/api/rules', async (req, res) => {
  try {
    const ruleData = req.body as Partial<Rule>;

    // Validate required fields
    if (!ruleData.name || !ruleData.direction || !ruleData.filter || !ruleData.action) {
      return res.status(400).json({ error: 'Missing required fields: name, direction, filter, action' });
    }

    // Generate ID if not provided
    const rule: Rule = {
      id: ruleData.id || rulesEngine.generateId(),
      name: ruleData.name,
      enabled: ruleData.enabled !== false, // Default to enabled
      direction: ruleData.direction,
      priority: ruleData.priority ?? rulesEngine.getRules().length,
      filter: ruleData.filter,
      action: ruleData.action,
    };

    rulesEngine.addRule(rule);
    await rulesEngine.saveRules();

    res.json({ success: true, rule: addRuleShortId(rule) });
  } catch (err: any) {
    console.error('Failed to create rule:', err);
    res.status(500).json({ error: err.message || 'Failed to create rule' });
  }
});

// Update rule (accepts short ID like r1 or full ID)
app.put('/api/rules/:id', async (req, res) => {
  try {
    const resolvedId = shortIdRegistry.resolveRuleId(req.params.id) || req.params.id;
    const rule = rulesEngine.getRule(resolvedId);
    if (!rule) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    const updates = req.body as Partial<Rule>;
    rulesEngine.updateRule(resolvedId, updates);
    await rulesEngine.saveRules();

    const updatedRule = rulesEngine.getRule(resolvedId);
    res.json({ success: true, rule: updatedRule ? addRuleShortId(updatedRule) : null });
  } catch (err: any) {
    console.error('Failed to update rule:', err);
    res.status(500).json({ error: err.message || 'Failed to update rule' });
  }
});

// Delete rule (accepts short ID like r1 or full ID)
app.delete('/api/rules/:id', async (req, res) => {
  try {
    const resolvedId = shortIdRegistry.resolveRuleId(req.params.id) || req.params.id;
    const deleted = rulesEngine.deleteRule(resolvedId);
    if (!deleted) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    await rulesEngine.saveRules();

    res.json({ success: true });
  } catch (err: any) {
    console.error('Failed to delete rule:', err);
    res.status(500).json({ error: 'Failed to delete rule' });
  }
});

// Reorder rules
app.post('/api/rules/reorder', async (req, res) => {
  try {
    const { orderedIds } = req.body as { orderedIds: string[] };
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: 'orderedIds must be an array' });
    }

    rulesEngine.reorderRules(orderedIds);
    await rulesEngine.saveRules();

    const rulesWithShortIds = rulesEngine.getRules().map(addRuleShortId);
    res.json({ success: true, rules: rulesWithShortIds });
  } catch (err: any) {
    console.error('Failed to reorder rules:', err);
    res.status(500).json({ error: 'Failed to reorder rules' });
  }
});

// ============ Refusal Rules API Routes ============

// List all refusal rules
app.get('/api/refusal-rules', (req, res) => {
  const rules = refusalManager.getRules();
  res.json({ rules, total: rules.length });
});

// Get single refusal rule
app.get('/api/refusal-rules/:id', (req, res) => {
  const rule = refusalManager.getRule(req.params.id);
  if (!rule) {
    return res.status(404).json({ error: 'Refusal rule not found' });
  }
  res.json(rule);
});

// Create refusal rule
app.post('/api/refusal-rules', (req, res) => {
  try {
    const ruleData = req.body as Partial<RefusalRule>;

    // Validate required fields
    if (!ruleData.name) {
      return res.status(400).json({ error: 'Missing required field: name' });
    }

    const now = Date.now();
    const rule: RefusalRule = {
      id: ruleData.id || `refusal_${now}_${Math.random().toString(36).slice(2, 8)}`,
      name: ruleData.name,
      enabled: ruleData.enabled !== false,
      priority: ruleData.priority ?? refusalManager.getRules().length,
      detection: ruleData.detection || {
        enabled: true,
        confidence_threshold: 0.7,
        tokens_to_analyze: 0,
      },
      action: ruleData.action || 'prompt_user',
      fallback_config: ruleData.fallback_config,
      filter: ruleData.filter,
      created_at: now,
      updated_at: now,
    };

    refusalManager.addRule(rule);
    res.json({ success: true, rule });
  } catch (err: any) {
    console.error('Failed to create refusal rule:', err);
    res.status(500).json({ error: err.message || 'Failed to create refusal rule' });
  }
});

// Update refusal rule
app.put('/api/refusal-rules/:id', (req, res) => {
  try {
    const updates = req.body as Partial<RefusalRule>;
    const updated = refusalManager.updateRule(req.params.id, updates);

    if (!updated) {
      return res.status(404).json({ error: 'Refusal rule not found' });
    }

    res.json({ success: true, rule: updated });
  } catch (err: any) {
    console.error('Failed to update refusal rule:', err);
    res.status(500).json({ error: err.message || 'Failed to update refusal rule' });
  }
});

// Delete refusal rule
app.delete('/api/refusal-rules/:id', (req, res) => {
  try {
    const deleted = refusalManager.deleteRule(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Refusal rule not found' });
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error('Failed to delete refusal rule:', err);
    res.status(500).json({ error: 'Failed to delete refusal rule' });
  }
});

// ============ Pending Refusals API Routes ============

// List pending refusals
app.get('/api/pending-refusals', (req, res) => {
  const pending = refusalManager.getPendingRefusals();
  res.json({ pending, total: pending.length });
});

// Approve pending refusal (forward original response)
app.post('/api/pending-refusals/:id/approve', async (req, res) => {
  try {
    await refusalManager.approveRefusal(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Failed to approve refusal:', err);
    res.status(500).json({ error: err.message || 'Failed to approve refusal' });
  }
});

// Modify pending refusal (replace response)
app.post('/api/pending-refusals/:id/modify', async (req, res) => {
  try {
    const { response } = req.body as { response?: string };
    const modifiedResponse = await refusalManager.rejectAndModify(req.params.id, response);
    res.json({ success: true, modified_response: modifiedResponse });
  } catch (err: any) {
    console.error('Failed to modify refusal:', err);
    res.status(500).json({ error: err.message || 'Failed to modify refusal' });
  }
});

// Generate alternate response
app.post('/api/pending-refusals/:id/generate', async (req, res) => {
  try {
    const pending = refusalManager.getPendingRefusal(req.params.id);
    if (!pending) {
      return res.status(404).json({ error: 'Pending refusal not found' });
    }

    const alternate = await refusalManager.generateAlternateResponse(pending);
    res.json({ success: true, alternate_response: alternate });
  } catch (err: any) {
    console.error('Failed to generate alternate:', err);
    res.status(500).json({ error: err.message || 'Failed to generate alternate response' });
  }
});

// ============ Settings API Routes ============

// Get current settings (redacted)
app.get('/api/settings', (req, res) => {
  res.json(settingsManager.getRedacted());
});

// Update settings
app.put('/api/settings', async (req, res) => {
  try {
    const updates = req.body as Partial<Settings>;
    const settings = await settingsManager.update(updates);
    res.json(settingsManager.getRedacted());
  } catch (err: any) {
    console.error('Failed to update settings:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Check if LLM is configured (for active provider or specific provider)
app.get('/api/settings/llm-status', (req, res) => {
  const provider = req.query.provider as ConfigurableLLMProvider | undefined;
  const activeProvider = settingsManager.getActiveProvider();
  const targetProvider = provider || activeProvider;
  const config = settingsManager.getProviderConfig(targetProvider);

  res.json({
    configured: settingsManager.isProviderConfigured(targetProvider),
    activeProvider,
    provider: targetProvider,
    model: config.model,
    configuredProviders: settingsManager.getConfiguredProviders(),
  });
});

// Get default base URLs for providers
app.get('/api/llm/defaults', (req, res) => {
  res.json({
    baseUrls: DEFAULT_BASE_URLS,
  });
});

// List available models for a provider
app.get('/api/llm/models', async (req, res) => {
  try {
    const provider = (req.query.provider as ConfigurableLLMProvider) || settingsManager.getActiveProvider();
    const apiKey = req.query.apiKey as string | undefined;
    const baseUrl = req.query.baseUrl as string | undefined;

    // Use saved config for the provider if not overridden in query
    const providerConfig = settingsManager.getProviderConfig(provider);
    const effectiveApiKey = apiKey || providerConfig.apiKey || undefined;
    const effectiveBaseUrl = baseUrl || providerConfig.baseUrl || undefined;

    const models = await fetchModelsForProvider(provider, effectiveApiKey, effectiveBaseUrl);

    // For providers without dynamic listing, indicate it's static
    const isStatic = provider === 'anthropic' || provider === 'google';

    res.json({
      models,
      provider,
      isStatic,
      total: models.length,
    });
  } catch (err: any) {
    console.error('Failed to list models:', err);
    res.status(500).json({ error: err.message || 'Failed to list models' });
  }
});

// ============ Template API Routes ============

// List all templates
app.get('/api/templates', (req, res) => {
  const templates = settingsManager.getTemplates();
  res.json({ templates, total: templates.length });
});

// Get single template
app.get('/api/templates/:id', (req, res) => {
  const template = settingsManager.getTemplate(req.params.id);
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }
  res.json(template);
});

// Create template
app.post('/api/templates', async (req, res) => {
  try {
    const { name, description, category, template, variables, systemPrompt } = req.body;

    if (!name || !template) {
      return res.status(400).json({ error: 'name and template are required' });
    }

    const newTemplate = await settingsManager.addTemplate({
      name,
      description,
      category,
      template,
      variables,
      systemPrompt,
    });

    res.json({ success: true, template: newTemplate });
  } catch (err: any) {
    console.error('Failed to create template:', err);
    res.status(500).json({ error: err.message || 'Failed to create template' });
  }
});

// Update template
app.put('/api/templates/:id', async (req, res) => {
  try {
    const { name, description, category, template, variables, systemPrompt } = req.body;

    const updated = await settingsManager.updateTemplate(req.params.id, {
      name,
      description,
      category,
      template,
      variables,
      systemPrompt,
    });

    if (!updated) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ success: true, template: updated });
  } catch (err: any) {
    console.error('Failed to update template:', err);
    res.status(500).json({ error: err.message || 'Failed to update template' });
  }
});

// Delete template
app.delete('/api/templates/:id', async (req, res) => {
  try {
    const deleted = await settingsManager.deleteTemplate(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error('Failed to delete template:', err);
    res.status(500).json({ error: err.message || 'Failed to delete template' });
  }
});

// Interpolate template with variables
app.post('/api/templates/:id/interpolate', (req, res) => {
  const { variables } = req.body as { variables: Record<string, string> };

  const template = settingsManager.getTemplate(req.params.id);
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }

  const result = settingsManager.interpolateTemplate(req.params.id, variables || {});
  res.json({
    interpolated: result,
    systemPrompt: template.systemPrompt,
  });
});

// ============ Mock Generation API Routes ============

interface GenerateMockRequest {
  request: {
    method: string;
    url: string;
    host: string;
    path: string;
    headers: Record<string, string>;
    body?: string;
  };
  prompt?: string;
  template_id?: string;
  template_variables?: Record<string, string>;
  provider?: ConfigurableLLMProvider;
  create_rule?: boolean;
  datastore_key?: string;
}

// Generate mock response using LLM
app.post('/api/generate-mock', async (req, res) => {
  try {
    const body = req.body as GenerateMockRequest;
    const { request, prompt, template_id, template_variables, provider, create_rule = true, datastore_key } = body;

    if (!request || !request.method || !request.url) {
      return res.status(400).json({ error: 'Request object with method and url is required' });
    }

    // Determine which provider to use
    const targetProvider = provider || settingsManager.getActiveProvider();
    if (!settingsManager.isProviderConfigured(targetProvider)) {
      return res.status(400).json({
        error: `Provider "${targetProvider}" not configured. Set API key in settings.`,
      });
    }

    // Build the prompt
    let finalPrompt: string;
    let systemPrompt: string | undefined;

    if (template_id) {
      // Use template
      const template = settingsManager.getTemplate(template_id);
      if (!template) {
        return res.status(404).json({ error: `Template "${template_id}" not found` });
      }

      // Build variables from request + user provided
      const vars = {
        method: request.method,
        url: request.url,
        host: request.host,
        path: request.path,
        body: request.body || '',
        headers: JSON.stringify(request.headers, null, 2),
        ...template_variables,
      };

      finalPrompt = settingsManager.interpolateString(template.template, vars);
      systemPrompt = template.systemPrompt;
    } else if (prompt) {
      // Use custom prompt with request context
      finalPrompt = `${prompt}\n\nRequest:\n${request.method} ${request.url}\n${request.body ? `\nBody:\n${request.body}` : ''}`;
      systemPrompt = 'You are an API mocking assistant. Return only valid JSON without markdown formatting or code blocks.';
    } else {
      // Default prompt
      finalPrompt = `Generate a realistic mock JSON response for this API endpoint.\n\nRequest:\n${request.method} ${request.url}\n${request.body ? `\nRequest Body:\n${request.body}` : ''}`;
      systemPrompt = 'You are an API mocking assistant. Return only valid JSON without markdown formatting or code blocks.';
    }

    // Call LLM
    const llmConfig = settingsManager.getLLMConfig(targetProvider);
    const client = createLLMClient(llmConfig);

    const messages: ChatMessage[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: finalPrompt });

    const response = await client.chat(messages);
    const generatedContent = response.content;

    // Try to parse as JSON to validate
    let parsedBody: unknown;
    try {
      // Remove potential markdown code blocks
      let cleanContent = generatedContent.trim();
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.slice(7);
      } else if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.slice(3);
      }
      if (cleanContent.endsWith('```')) {
        cleanContent = cleanContent.slice(0, -3);
      }
      parsedBody = JSON.parse(cleanContent.trim());
    } catch {
      // Not valid JSON, use as-is
      parsedBody = null;
    }

    const responseBody = parsedBody !== null ? JSON.stringify(parsedBody, null, 2) : generatedContent;

    // Generate datastore key
    const finalKey = datastore_key || dataStore.generateKey(request.method, request.host, request.path);

    // Save to datastore
    const storedResponse = {
      metadata: {
        created_at: Date.now(),
        description: `Generated mock for ${request.method} ${request.path}`,
      },
      status_code: 200,
      headers: {
        'content-type': 'application/json',
      },
      body: responseBody,
    };

    await dataStore.saveResponse(finalKey, storedResponse);

    // Optionally create rule
    let ruleId: string | undefined;
    if (create_rule) {
      const rule: Rule = {
        id: rulesEngine.generateId(),
        name: `Mock ${request.host}${request.path}`,
        enabled: true,
        direction: 'response' as RuleDirection,
        priority: rulesEngine.getRules().length,
        filter: {
          host: { match: 'contains', value: request.host },
          path: { match: 'contains', value: request.path },
        },
        action: {
          type: 'serve_from_store',
          store_key: finalKey,
        },
      };

      rulesEngine.addRule(rule);
      await rulesEngine.saveRules();
      ruleId = rule.id;
    }

    res.json({
      success: true,
      datastore_key: finalKey,
      rule_id: ruleId,
      generated_response: {
        status_code: 200,
        headers: { 'content-type': 'application/json' },
        body: responseBody,
      },
    });
  } catch (err: any) {
    console.error('Mock generation error:', err);
    res.status(500).json({ error: err.message || 'Mock generation failed' });
  }
});

// ============ Chat API Routes ============

// Send chat message (optionally specify provider to use)
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, provider } = req.body as { messages: ChatMessage[]; provider?: ConfigurableLLMProvider };

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    // Use specified provider or fall back to active provider
    const targetProvider = provider || settingsManager.getActiveProvider();

    if (!settingsManager.isProviderConfigured(targetProvider)) {
      return res.status(400).json({
        error: `Provider "${targetProvider}" not configured. Set API key in settings.`,
      });
    }

    const llmConfig = settingsManager.getLLMConfig(targetProvider);
    const client = createLLMClient(llmConfig);

    const response = await client.chat(messages);

    res.json({
      content: response.content,
      model: response.model,
      provider: targetProvider,
      usage: response.usage,
    });
  } catch (err: any) {
    console.error('Chat error:', err);
    res.status(500).json({ error: err.message || 'Chat request failed' });
  }
});

// Simple completion endpoint
app.post('/api/chat/complete', async (req, res) => {
  try {
    const { prompt } = req.body as { prompt: string };

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    if (!settingsManager.isLLMConfigured()) {
      return res.status(400).json({ error: 'LLM not configured. Set API key in settings.' });
    }

    const llmConfig = settingsManager.getLLMConfig();
    const client = createLLMClient(llmConfig);

    const content = await client.complete(prompt);

    res.json({ content });
  } catch (err: any) {
    console.error('Completion error:', err);
    res.status(500).json({ error: err.message || 'Completion request failed' });
  }
});

// ============ Annotations API Routes ============
// Annotations are now stored inline with traffic flows

// Get all unique tags (for autocomplete)
app.get('/api/annotations/tags', (req, res) => {
  const tags = storage.getAllTags();
  res.json({ tags });
});

// Get annotation for a specific traffic flow
app.get('/api/annotations/target/traffic/:targetId', (req, res) => {
  const { targetId } = req.params;
  const flow = storage.getTraffic(targetId);
  if (!flow || !flow.annotation) {
    return res.status(404).json({ error: 'Annotation not found' });
  }
  // Return in Annotation format for backwards compat
  res.json({
    id: targetId,  // Use flow_id as annotation id
    target_type: 'traffic',
    target_id: targetId,
    ...flow.annotation,
  });
});

// Get annotation by flow_id (same as target for inline annotations)
app.get('/api/annotations/:id', (req, res) => {
  // Treat id as flow_id for inline annotations
  const flow = storage.getTraffic(req.params.id);
  if (!flow || !flow.annotation) {
    return res.status(404).json({ error: 'Annotation not found' });
  }
  res.json({
    id: req.params.id,
    target_type: 'traffic',
    target_id: req.params.id,
    ...flow.annotation,
  });
});

// Create/update annotation for a traffic flow
app.post('/api/annotations', async (req, res) => {
  try {
    const { target_type, target_id, title, body, tags } = req.body;

    // Only support traffic annotations for now (inline storage)
    if (target_type !== 'traffic') {
      return res.status(400).json({ error: 'Only traffic annotations are supported' });
    }

    if (!target_id) {
      return res.status(400).json({ error: 'target_id is required' });
    }

    const hasTags = Array.isArray(tags) && tags.length > 0;
    const hasTitle = title && title.trim();
    if (!hasTitle && !hasTags) {
      return res.status(400).json({ error: 'At least title or tags must be provided' });
    }

    const flow = storage.getTraffic(target_id);
    if (!flow) {
      return res.status(404).json({ error: 'Traffic flow not found' });
    }

    const now = Date.now();
    const annotation = {
      title: title || '',
      body,
      tags: tags || [],
      created_at: flow.annotation?.created_at || now,
      updated_at: now,
    };

    const updatedFlow = storage.setTrafficAnnotation(target_id, annotation);
    if (!updatedFlow) {
      return res.status(500).json({ error: 'Failed to update annotation' });
    }

    // Broadcast updated flow to frontend
    broadcastToFrontend({ type: 'traffic', data: updatedFlow });

    res.json({
      success: true,
      annotation: {
        id: target_id,
        target_type: 'traffic',
        target_id,
        ...annotation,
      },
    });
  } catch (err: any) {
    console.error('Failed to create annotation:', err);
    res.status(500).json({ error: err.message || 'Failed to create annotation' });
  }
});

// Update annotation (id is flow_id for inline annotations)
app.put('/api/annotations/:id', async (req, res) => {
  try {
    const { title, body, tags } = req.body;
    const flowId = req.params.id;

    const flow = storage.getTraffic(flowId);
    if (!flow) {
      return res.status(404).json({ error: 'Traffic flow not found' });
    }

    const now = Date.now();
    const annotation = {
      title: title !== undefined ? title : (flow.annotation?.title || ''),
      body: body !== undefined ? body : flow.annotation?.body,
      tags: tags !== undefined ? tags : (flow.annotation?.tags || []),
      created_at: flow.annotation?.created_at || now,
      updated_at: now,
    };

    const updatedFlow = storage.setTrafficAnnotation(flowId, annotation);
    if (!updatedFlow) {
      return res.status(500).json({ error: 'Failed to update annotation' });
    }

    // Broadcast updated flow to frontend
    broadcastToFrontend({ type: 'traffic', data: updatedFlow });

    res.json({
      success: true,
      annotation: {
        id: flowId,
        target_type: 'traffic',
        target_id: flowId,
        ...annotation,
      },
    });
  } catch (err: any) {
    console.error('Failed to update annotation:', err);
    res.status(500).json({ error: err.message || 'Failed to update annotation' });
  }
});

// Delete annotation (id is flow_id for inline annotations)
app.delete('/api/annotations/:id', async (req, res) => {
  try {
    const flowId = req.params.id;

    const flow = storage.getTraffic(flowId);
    if (!flow || !flow.annotation) {
      return res.status(404).json({ error: 'Annotation not found' });
    }

    const updatedFlow = storage.setTrafficAnnotation(flowId, null);
    if (!updatedFlow) {
      return res.status(500).json({ error: 'Failed to delete annotation' });
    }

    // Broadcast updated flow to frontend
    broadcastToFrontend({ type: 'traffic', data: updatedFlow });

    res.json({ success: true });
  } catch (err: any) {
    console.error('Failed to delete annotation:', err);
    res.status(500).json({ error: err.message || 'Failed to delete annotation' });
  }
});

// ============ Filter Presets API Routes ============

// List all filter presets
app.get('/api/presets', (req, res) => {
  const presets = storage.getAllFilterPresets();
  res.json({ presets, total: presets.length });
});

// Get single preset
app.get('/api/presets/:id', (req, res) => {
  const preset = storage.getFilterPreset(req.params.id);
  if (!preset) {
    return res.status(404).json({ error: 'Preset not found' });
  }
  res.json(preset);
});

// Create preset
app.post('/api/presets', (req, res) => {
  try {
    const { name, simpleFilters, advancedFilter, isAdvanced } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const now = Date.now();
    const preset = {
      id: `preset_${now}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      simpleFilters,
      advancedFilter,
      isAdvanced: isAdvanced || false,
      created_at: now,
      updated_at: now,
    };

    storage.addFilterPreset(preset);
    res.json({ success: true, preset });
  } catch (err: any) {
    console.error('Failed to create preset:', err);
    res.status(500).json({ error: err.message || 'Failed to create preset' });
  }
});

// Update preset
app.put('/api/presets/:id', (req, res) => {
  try {
    const { name, simpleFilters, advancedFilter, isAdvanced } = req.body;
    const updated = storage.updateFilterPreset(req.params.id, {
      name,
      simpleFilters,
      advancedFilter,
      isAdvanced,
    });

    if (!updated) {
      return res.status(404).json({ error: 'Preset not found' });
    }

    res.json({ success: true, preset: updated });
  } catch (err: any) {
    console.error('Failed to update preset:', err);
    res.status(500).json({ error: err.message || 'Failed to update preset' });
  }
});

// Delete preset
app.delete('/api/presets/:id', (req, res) => {
  try {
    const deleted = storage.deleteFilterPreset(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Preset not found' });
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error('Failed to delete preset:', err);
    res.status(500).json({ error: err.message || 'Failed to delete preset' });
  }
});

// ============ Replay API Routes ============

// List all variants
app.get('/api/replay', (req, res) => {
  const variants = replayManager.getAll();
  res.json({ variants, total: variants.length });
});

// Get variant tree for a flow
app.get('/api/replay/tree/:flowId', (req, res) => {
  const tree = replayManager.getVariantTree(req.params.flowId);
  res.json(tree);
});

// Get variants for a flow (flat list)
app.get('/api/replay/flow/:flowId', (req, res) => {
  const variants = replayManager.getForFlow(req.params.flowId);
  res.json({ variants, total: variants.length });
});

// Check if flow has variants
app.get('/api/replay/flow/:flowId/exists', (req, res) => {
  const hasVariants = replayManager.hasVariants(req.params.flowId);
  const count = replayManager.getVariantCount(req.params.flowId);
  res.json({ has_variants: hasVariants, count });
});

// Get all replay names
app.get('/api/replay/names', (req, res) => {
  const names = replayManager.getAllReplayNames();
  res.json({ names });
});

// Get replay name for a flow
app.get('/api/replay/names/:flowId', (req, res) => {
  const name = replayManager.getReplayName(req.params.flowId);
  res.json({ flow_id: req.params.flowId, name });
});

// Set replay name for a flow
app.put('/api/replay/names/:flowId', async (req, res) => {
  try {
    const { name } = req.body;
    await replayManager.setReplayName(req.params.flowId, name || '');
    res.json({ success: true, flow_id: req.params.flowId, name: replayManager.getReplayName(req.params.flowId) });
  } catch (err: any) {
    console.error('Failed to set replay name:', err);
    res.status(500).json({ error: err.message || 'Failed to set replay name' });
  }
});

// Get single variant
app.get('/api/replay/:id', (req, res) => {
  const variant = replayManager.get(req.params.id);
  if (!variant) {
    return res.status(404).json({ error: 'Variant not found' });
  }
  res.json(variant);
});

// Create variant from flow
app.post('/api/replay', async (req, res) => {
  try {
    const { parent_flow_id, parent_variant_id, request, description, intercept_on_replay } = req.body;

    if (!parent_flow_id || !request || !description) {
      return res.status(400).json({ error: 'parent_flow_id, request, and description are required' });
    }

    const variant = await replayManager.create({
      parent_flow_id,
      parent_variant_id,
      request,
      description,
      intercept_on_replay,
    });

    res.json({ success: true, variant });
  } catch (err: any) {
    console.error('Failed to create variant:', err);
    res.status(500).json({ error: err.message || 'Failed to create variant' });
  }
});

// Update variant
app.put('/api/replay/:id', async (req, res) => {
  try {
    const { description, request, intercept_on_replay } = req.body;
    const variant = await replayManager.update(req.params.id, { description, request, intercept_on_replay });

    if (!variant) {
      return res.status(404).json({ error: 'Variant not found' });
    }

    res.json({ success: true, variant });
  } catch (err: any) {
    console.error('Failed to update variant:', err);
    res.status(500).json({ error: err.message || 'Failed to update variant' });
  }
});

// Delete variant
app.delete('/api/replay/:id', async (req, res) => {
  try {
    const deleteChildren = req.query.deleteChildren === 'true';
    const deleted = await replayManager.delete(req.params.id, deleteChildren);
    if (!deleted) {
      return res.status(404).json({ error: 'Variant not found' });
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error('Failed to delete variant:', err);
    res.status(500).json({ error: err.message || 'Failed to delete variant' });
  }
});

// Execute replay (send variant request via proxy)
app.post('/api/replay/:id/send', async (req, res) => {
  try {
    const variant = replayManager.get(req.params.id);
    if (!variant) {
      return res.status(404).json({ error: 'Variant not found' });
    }

    // Generate a unique replay ID
    const replayId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Mark as sent
    await replayManager.markSent(variant.variant_id);

    // Send replay request to proxy
    // The proxy will make the HTTP request and send traffic through normal channels
    const sent = interceptManager.sendReplayRequest({
      replay_id: replayId,
      variant_id: variant.variant_id,
      parent_flow_id: variant.parent_flow_id,
      request: {
        method: variant.request.method,
        url: variant.request.url,
        headers: variant.request.headers,
        body: variant.request.body,
      },
      intercept_response: variant.intercept_on_replay,
    });

    if (!sent) {
      await replayManager.markFailed(variant.variant_id, 'No proxy connection');
      return res.status(503).json({
        success: false,
        error: 'Proxy not connected. Make sure the proxy container is running.',
      });
    }

    // Return immediately - the response will come through normal traffic channels
    // and will be intercepted if intercept_on_replay is enabled
    res.json({
      success: true,
      message: variant.intercept_on_replay
        ? 'Replay initiated - response will be intercepted'
        : 'Replay initiated',
      variant: replayManager.get(variant.variant_id),
      replay_id: replayId,
    });
  } catch (err: any) {
    console.error('Failed to send replay:', err);
    res.status(500).json({ error: err.message || 'Failed to send replay' });
  }
});

// ============ WebSocket Server for Proxy ============

// Allow large messages - proxy should truncate large non-LLM bodies
const proxyWss = new WebSocketServer({
  port: PROXY_WS_PORT,
  maxPayload: WS_MAX_PAYLOAD,
});

proxyWss.on('connection', (ws) => {
  console.log('Proxy connected');
  interceptManager.setProxyConnection(ws as any);
  refusalManager.setProxyConnection(ws as any);

  // Sync current intercept mode and rules enabled to newly connected proxy
  const currentMode = interceptManager.getInterceptMode();
  const rulesEnabled = interceptManager.getRulesEnabled();
  console.log(`[proxyWss] Sending current mode to proxy: ${currentMode}, rules enabled: ${rulesEnabled}`);
  ws.send(JSON.stringify({ cmd: 'set_intercept_mode', mode: currentMode }));
  ws.send(JSON.stringify({ cmd: 'set_rules_enabled', enabled: rulesEnabled }));

  ws.on('message', (data) => {
    try {
      const message: ProxyMessage = JSON.parse(data.toString());
      handleProxyMessage(message);
    } catch (err) {
      console.error('Failed to parse proxy message:', err);
    }
  });

  ws.on('close', () => {
    console.log('Proxy disconnected');
    interceptManager.clearProxyConnection();
    refusalManager.clearProxyConnection();
  });

  ws.on('error', (err) => {
    console.error('Proxy WebSocket error:', err.message);
  });
});

function handleProxyMessage(message: ProxyMessage): void {
  switch (message.type) {
    case 'request':
      handleRequest(message.data as TrafficFlow);
      break;
    case 'response':
      handleResponse(message.data as TrafficFlow).catch(err => {
        console.error('[handleProxyMessage] Error in handleResponse:', err);
      });
      break;
    case 'stream_chunk':
      handleStreamChunk(message.data as StreamChunk);
      break;
    case 'intercept_request':
      interceptManager.handleInterceptRequest(message.data as TrafficFlow);
      break;
    case 'intercept_response':
      interceptManager.handleInterceptResponse(message.data as TrafficFlow);
      break;
    case 'request_modified':
      handleRequestModified(message.data as RequestModifiedData);
      break;
    case 'replay_response':
      handleReplayResponse(message.data as any);
      break;
    case 'replay_complete':
      handleReplayComplete(message.data as any);
      break;
  }
}

// Handle replay error response from proxy
function handleReplayResponse(data: { replay_id: string; variant_id: string; flow_id?: string; error?: string }): void {
  if (data.error) {
    console.log(`[handleReplayResponse] Replay failed: ${data.error}`);
    replayManager.markFailed(data.variant_id, data.error);
  }
}

// Handle replay complete notification from proxy
async function handleReplayComplete(data: { replay_id: string; variant_id: string; flow_id: string; success: boolean }): Promise<void> {
  console.log(`[handleReplayComplete] variant_id=${data.variant_id} flow_id=${data.flow_id} success=${data.success}`);

  if (data.success) {
    // Check if this replay was intercepted (status would be 'intercepted')
    const variant = replayManager.get(data.variant_id);
    if (variant?.result?.status !== 'intercepted') {
      // Not intercepted, mark as completed
      await replayManager.markCompleted(data.variant_id, data.flow_id);
    }
    // If intercepted, the status will be updated when released from intercept queue
  } else {
    await replayManager.markFailed(data.variant_id, 'Replay failed');
  }
}

function handleRequest(flow: TrafficFlow): void {
  console.log(`[handleRequest] flow_id=${flow.flow_id} host=${flow.request.host} path=${flow.request.path} is_llm_api=${flow.is_llm_api}`);

  // Store raw traffic
  storage.addTraffic(flow);

  // Try to parse as LLM request
  if (flow.is_llm_api) {
    const parsed = parseRequest(flow.request);
    console.log(`[handleRequest] parseRequest result: ${parsed ? `success (${parsed.provider})` : 'null'}`);

    if (parsed) {
      flow.parsed = parsed;
      storage.updateTraffic(flow.flow_id, { parsed });

      // Process for conversation tracking
      const { conversation } = processRequest(flow.flow_id, flow.timestamp, parsed);
      console.log(`[handleRequest] conversation created/updated: ${conversation.conversation_id}`);

      // Notify frontend
      broadcastToFrontend({
        type: 'conversation',
        data: conversation,
      });
    }
  }

  // Notify frontend of new traffic
  broadcastToFrontend({
    type: 'traffic',
    data: flow,
  });
}

async function handleResponse(flow: TrafficFlow): Promise<void> {
  console.log(`[handleResponse] flow_id=${flow.flow_id} is_llm_api=${flow.is_llm_api} stream_complete=${flow.stream_complete} has_response=${!!flow.response} response_modified=${flow.response_modified}`);

  // Update stored traffic - include original response if modified
  const updates: Partial<TrafficFlow> = {
    response: flow.response,
    stream_complete: flow.stream_complete,
  };

  if (flow.response_modified && flow.original_response) {
    updates.original_response = flow.original_response;
    updates.response_modified = true;
    console.log(`[handleResponse] Storing original response for flow_id=${flow.flow_id}`);
  }

  storage.updateTraffic(flow.flow_id, updates);

  // Add to URL log (with response info)
  const updatedFlow = storage.getTraffic(flow.flow_id);
  if (updatedFlow) {
    addToURLLog(updatedFlow);
  }

  // Handle streaming completion
  if (flow.stream_complete) {
    console.log(`[handleResponse] Processing stream completion for flow_id=${flow.flow_id}`);
    const streamResponse = finalizeStream(flow.flow_id);
    if (streamResponse) {
      const conversation = processResponse(flow.flow_id, streamResponse);
      if (conversation) {
        broadcastToFrontend({
          type: 'conversation',
          data: conversation,
        });
      }
    }
  } else if (flow.is_llm_api && flow.response) {
    // Parse non-streaming response
    console.log(`[handleResponse] Parsing LLM response for flow_id=${flow.flow_id}`);
    const existingFlow = storage.getTraffic(flow.flow_id);
    if (existingFlow) {
      const parsed = parseResponse(existingFlow.request, flow.response);
      console.log(`[handleResponse] parseResponse result: ${parsed ? 'success' : 'null'}`);
      if (parsed) {
        const conversation = processResponse(flow.flow_id, parsed);
        console.log(`[handleResponse] conversation updated: ${conversation?.conversation_id || 'none'}`);
        if (conversation) {
          broadcastToFrontend({
            type: 'conversation',
            data: conversation,
          });
        }
      }
    }
  }

  // Check for refusal in LLM responses (passthrough mode - response already sent)
  // This allows refusal detection even when intercept is disabled
  // Note: Since response is already forwarded, we can only add metadata, not modify
  if (flow.is_llm_api && flow.response) {
    try {
      await checkRefusalPassthrough(flow);
    } catch (err) {
      console.error(`[handleResponse] Error in refusal check:`, err);
    }
  }

  // Notify frontend of updated traffic
  broadcastToFrontend({
    type: 'traffic',
    data: storage.getTraffic(flow.flow_id),
  });
}

/**
 * Check for refusal in a response that has already been forwarded (passthrough mode).
 * Can only add metadata - cannot hold or modify the response.
 */
async function checkRefusalPassthrough(flow: TrafficFlow): Promise<void> {
  const existingFlow = storage.getTraffic(flow.flow_id);
  if (!existingFlow || !flow.response) {
    console.log(`[checkRefusalPassthrough] Early return: existingFlow=${!!existingFlow}, flow.response=${!!flow.response}`);
    return;
  }

  const parsedResponse = parseResponse(existingFlow.request, flow.response);
  if (!parsedResponse) {
    console.log(`[checkRefusalPassthrough] parsedResponse is null for flow ${flow.flow_id}`);
    return;
  }

  console.log(`[checkRefusalPassthrough] Analyzing flow ${flow.flow_id}, content blocks: ${parsedResponse.content?.length || 0}`);

  const result = await refusalManager.analyzeResponse(flow, parsedResponse);
  console.log(`[checkRefusalPassthrough] Analysis result: shouldIntercept=${result.shouldIntercept}, hasAnalysis=${!!result.analysis}, hasMatchedRule=${!!result.matchedRule}`);

  if (!result.analysis || !result.matchedRule) {
    return;
  }

  const { analysis, matchedRule } = result;
  console.log(`[checkRefusalPassthrough] Refusal detected for flow ${flow.flow_id}, action: ${matchedRule.action}`);

  // In passthrough mode, we can only add metadata (response already sent to client)
  // All actions degrade to 'passthrough' behavior - just record the detection
  refusalManager.handlePassthrough(flow, analysis, matchedRule);

  // Notify frontend that a refusal was detected (even though it already passed through)
  broadcastToFrontend({
    type: 'refusal_detected',
    data: {
      flow_id: flow.flow_id,
      analysis,
      rule: { id: matchedRule.id, name: matchedRule.name },
      action_taken: 'passthrough', // Forced passthrough since response already sent
    },
  });
}

function handleRequestModified(data: RequestModifiedData): void {
  console.log(`[handleRequestModified] flow_id=${data.flow_id}`);

  // Update the stored traffic with original request and modified request
  const existingFlow = storage.getTraffic(data.flow_id);
  if (existingFlow) {
    storage.updateTraffic(data.flow_id, {
      original_request: data.original_request,
      request: data.modified_request,
      request_modified: true,
    });

    // Notify frontend of the update
    broadcastToFrontend({
      type: 'traffic',
      data: storage.getTraffic(data.flow_id),
    });
  }
}

function handleStreamChunk(chunk: StreamChunk): void {
  const flow = storage.getTraffic(chunk.flow_id);
  if (!flow) return;

  // Get or create accumulator
  const accumulator = getOrCreateAccumulator(
    chunk.flow_id,
    flow.request.host,
    flow.request.path,
    (partial) => {
      // Send stream update to frontend
      broadcastToFrontend({
        type: 'stream_update',
        data: {
          flow_id: chunk.flow_id,
          partial,
        },
      });
    }
  );

  accumulator.addChunk(chunk);
}

// ============ WebSocket Server for Frontend ============

const frontendWss = new WebSocketServer({ port: FRONTEND_WS_PORT });

frontendWss.on('connection', (ws) => {
  console.log('Frontend client connected');
  frontendClients.add(ws);

  // Send current state
  ws.send(JSON.stringify({
    type: 'init',
    data: {
      traffic: storage.getAllTraffic(),
      conversations: storage.getAllConversations(),
      interceptMode: interceptManager.getInterceptMode(),
      rulesEnabled: interceptManager.getRulesEnabled(),
      pendingIntercepts: interceptManager.getPendingIntercepts(),
      pendingRefusals: refusalManager.getPendingRefusals(),
    },
  }));

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleFrontendMessage(ws, message);
    } catch (err) {
      console.error('Failed to parse frontend message:', err);
    }
  });

  ws.on('close', () => {
    console.log('Frontend client disconnected');
    frontendClients.delete(ws);
  });
});

function handleFrontendMessage(ws: WebSocket, message: any): void {
  // Handle any direct commands from frontend if needed
  switch (message.cmd) {
    case 'set_intercept_mode':
      interceptManager.setInterceptMode(message.mode);
      break;
    case 'set_rules_enabled':
      interceptManager.setRulesEnabled(message.enabled);
      break;
    case 'forward':
      const pending = interceptManager.getPendingIntercept(message.flow_id);
      if (pending?.type === 'response') {
        interceptManager.forwardResponse(message.flow_id);
      } else {
        interceptManager.forwardRequest(message.flow_id);
      }
      break;
    case 'forward_modified':
      if (message.type === 'response') {
        interceptManager.forwardModifiedResponse(message.flow_id, message.modifications);
      } else {
        interceptManager.forwardModifiedRequest(message.flow_id, message.modifications);
      }
      break;
    case 'drop':
      interceptManager.dropRequest(message.flow_id);
      break;
    // Refusal handling commands
    case 'approve_refusal':
      refusalManager.approveRefusal(message.refusal_id).catch(err => {
        console.error('Failed to approve refusal:', err);
      });
      break;
    case 'modify_refusal':
      refusalManager.rejectAndModify(message.refusal_id, message.modified_response).catch(err => {
        console.error('Failed to modify refusal:', err);
      });
      break;
    case 'generate_alternate':
      refusalManager.getPendingRefusal(message.refusal_id) &&
        refusalManager.generateAlternateResponse(refusalManager.getPendingRefusal(message.refusal_id)!).then(alternate => {
          // Send generated alternate back to the requesting client
          ws.send(JSON.stringify({
            type: 'alternate_generated',
            data: { refusal_id: message.refusal_id, alternate_response: alternate },
          }));
        }).catch(err => {
          console.error('Failed to generate alternate:', err);
        });
      break;
  }
}

function broadcastToFrontend(message: any): void {
  const data = JSON.stringify(message);
  for (const client of frontendClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

// Listen for intercept events and broadcast
interceptManager.on('intercept_request', (pending) => {
  broadcastToFrontend({ type: 'intercept', data: pending });
});

interceptManager.on('intercept_response', (pending) => {
  broadcastToFrontend({ type: 'intercept', data: pending });
});

interceptManager.on('intercept_completed', (flowId) => {
  broadcastToFrontend({ type: 'intercept_completed', data: { flow_id: flowId } });
});

interceptManager.on('intercept_dropped', (flowId) => {
  broadcastToFrontend({ type: 'intercept_dropped', data: { flow_id: flowId } });
});

interceptManager.on('mode_changed', (mode) => {
  broadcastToFrontend({ type: 'intercept_mode_changed', data: { mode } });
});

interceptManager.on('rules_enabled_changed', (enabled) => {
  broadcastToFrontend({ type: 'rules_enabled_changed', data: { enabled } });
});

// Listen for refusal events and broadcast
refusalManager.on('pending_refusal_added', (pending: PendingRefusal) => {
  broadcastToFrontend({ type: 'pending_refusal', data: pending });
});

refusalManager.on('refusal_resolved', (data: { id: string; flow_id: string; status: string }) => {
  broadcastToFrontend({ type: 'refusal_resolved', data });
});

refusalManager.on('alternate_generated', (data: { id: string; response: string }) => {
  broadcastToFrontend({ type: 'alternate_generated', data });
});

// ============ Start Servers ============

// Initialize storage and other systems
(async () => {
  try {
    // Initialize storage (loads persisted traffic, presets, etc.)
    await storage.initialize();
    console.log('[Storage] Initialized successfully');
  } catch (err) {
    console.error('[Storage] Failed to initialize:', err);
  }

  try {
    // Initialize short IDs for datastore items (rules handled by rulesEngine.loadRules())
    await dataStore.initializeShortIds();
    console.log('[ShortIdRegistry] Initialized successfully');
  } catch (err) {
    console.error('[ShortIdRegistry] Failed to initialize:', err);
  }

  try {
    refusalManager.loadRules();
    await refusalManager.initialize();
    console.log('[RefusalManager] Initialized successfully');
  } catch (err) {
    console.error('[RefusalManager] Failed to initialize:', err);
    console.log('[RefusalManager] Refusal detection will be disabled');
  }
})();

app.listen(REST_PORT, () => {
  console.log(`REST API server listening on port ${REST_PORT}`);
});

console.log(`Proxy WebSocket server listening on port ${PROXY_WS_PORT}`);
console.log(`Frontend WebSocket server listening on port ${FRONTEND_WS_PORT}`);
console.log('Tollbooth backend started');
