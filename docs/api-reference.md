# API Reference

REST API available at `localhost:2000`.

## Traffic & Conversations

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/traffic` | GET | Get all traffic flows |
| `/api/traffic/:flowId` | GET | Get single traffic flow |
| `/api/traffic/:flowId` | DELETE | Delete a traffic flow |
| `/api/traffic/:flowId/hide` | POST | Hide a traffic flow |
| `/api/traffic/:flowId/unhide` | POST | Unhide a traffic flow |
| `/api/traffic/hide-bulk` | POST | Hide multiple flows |
| `/api/traffic/clear-bulk` | DELETE | Delete multiple flows |
| `/api/conversations` | GET | Get all conversations |
| `/api/conversations/:id` | GET | Get single conversation |
| `/api/conversations/:id/export` | GET | Export conversation (`?format=json\|markdown\|html`) |
| `/api/conversations/export` | POST | Bulk export conversations |
| `/api/conversations/rebuild` | POST | Rebuild conversations from traffic |
| `/api/conversations/rebuild-branches` | POST | Re-detect all branch relationships |
| `/api/conversations/roots` | GET | Get all root conversations (no parent) |
| `/api/conversations/tree-stats` | GET | Get tree statistics |
| `/api/clear` | POST | Clear all stored data |

## Conversation Trees

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/conversations/:id/tree` | GET | Get conversation tree (merged trie) |
| `/api/conversations/:id/related` | GET | Get related trees (via replay links) |

## Intercept

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/intercept/mode` | GET | Get current intercept mode |
| `/api/intercept/mode` | POST | Set intercept mode |
| `/api/intercept/pending` | GET | Get pending intercepts |
| `/api/intercept/:flowId/forward` | POST | Forward intercepted request |
| `/api/intercept/:flowId/forward-modified` | POST | Forward with modifications |
| `/api/intercept/:flowId/drop` | POST | Drop intercepted request |
| `/api/intercept/:flowId/timeout-immune` | POST | Toggle timeout immunity |

## Rules

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/rules` | GET | List all rules |
| `/api/rules` | POST | Create rule |
| `/api/rules/:id` | GET | Get single rule |
| `/api/rules/:id` | PUT | Update rule |
| `/api/rules/:id` | DELETE | Delete rule |
| `/api/rules/reorder` | POST | Reorder rules |
| `/api/rules/enabled` | GET | Get rules enabled state |
| `/api/rules/enabled` | POST | Set rules enabled state |

## Data Store

### Responses

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/datastore/responses` | GET | List all stored responses |
| `/api/datastore/responses` | POST | Save response |
| `/api/datastore/responses/:key` | GET | Get single response |
| `/api/datastore/responses/:key` | PUT | Update response |
| `/api/datastore/responses/:key` | DELETE | Delete response |

### Requests

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/datastore/requests` | GET | List all stored requests |
| `/api/datastore/requests` | POST | Save request |
| `/api/datastore/requests/:key` | GET | Get single request |
| `/api/datastore/requests/:key` | PUT | Update request |
| `/api/datastore/requests/:key` | DELETE | Delete request |

## Refusal Detection

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/refusal-rules` | GET | List all refusal rules |
| `/api/refusal-rules` | POST | Create refusal rule |
| `/api/refusal-rules/:id` | PUT | Update refusal rule |
| `/api/refusal-rules/:id` | DELETE | Delete refusal rule |
| `/api/pending-refusals` | GET | List pending refusals |
| `/api/pending-refusals/:id/approve` | POST | Approve (forward original) |
| `/api/pending-refusals/:id/modify` | POST | Reject and modify response |
| `/api/pending-refusals/:id/generate` | POST | Generate alternate response |

## Replay

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/replay` | GET | List all replay variants |
| `/api/replay` | POST | Create a new variant |
| `/api/replay/:id` | GET | Get a single variant |
| `/api/replay/:id` | PUT | Update a variant |
| `/api/replay/:id` | DELETE | Delete a variant |
| `/api/replay/:id/send` | POST | Execute a replay |
| `/api/replay/tree/:flowId` | GET | Get variant tree for a flow |
| `/api/replay/names/:flowId` | GET | Get replay name for a flow |
| `/api/replay/names/:flowId` | PUT | Set replay name for a flow |

## Annotations

### Traffic Annotations

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/traffic/:flowId/annotation` | GET | Get annotation for a flow |
| `/api/traffic/:flowId/annotation` | PUT | Set annotation for a flow |
| `/api/traffic/:flowId/annotation` | DELETE | Delete annotation |
| `/api/annotations/tags` | GET | Get all unique tags |

### Conversation Annotations

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/conversations/:id/annotation` | GET | Get conversation annotation |
| `/api/conversations/:id/annotation` | PUT | Set conversation annotation |
| `/api/conversations/:id/annotation` | DELETE | Delete conversation annotation |
| `/api/conversations/:id/starred` | PUT | Set starred status |
| `/api/conversations/:id/turns/:turnId/annotation` | GET | Get turn annotation |
| `/api/conversations/:id/turns/:turnId/annotation` | PUT | Set turn annotation |
| `/api/conversations/:id/turns/:turnId/annotation` | DELETE | Delete turn annotation |

## Settings & Chat

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/settings` | GET | Get current settings |
| `/api/settings` | PUT | Update settings |
| `/api/settings/llm-status` | GET | Check if LLM is configured |
| `/api/chat` | POST | Send chat message |
| `/api/chat/complete` | POST | Simple completion |

## Filter Presets

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/filter-presets` | GET | List all presets |
| `/api/filter-presets` | POST | Create preset |
| `/api/filter-presets/:id` | PUT | Update preset |
| `/api/filter-presets/:id` | DELETE | Delete preset |

## URL Log

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/urls` | GET | Get URL log (supports filtering) |
| `/api/urls/filters` | GET | Get available filter options |
| `/api/urls/export` | GET | Export URL log |

Query parameters for export:

- `?format=csv` - CSV format
- `?format=json` - JSON format
