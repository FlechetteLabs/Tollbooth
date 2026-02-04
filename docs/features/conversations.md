# Conversations View

Groups related LLM API calls into logical conversations based on message history correlation.

## How Correlation Works

LLM APIs are stateless—each request contains the full conversation history. Tollbooth correlates requests by comparing message history prefixes and matching models.

For example, if Request B contains all the messages from Request A plus new ones, they're part of the same conversation.

## Layout

**Left Panel** - Conversation list:

- Grouped by provider and model
- Shows turn count and timestamp
- Star conversations for quick access
- Filter and search conversations
- Click to expand

**Right Panel** - Conversation details with multiple view modes:

- **Conversation View** - Full conversation with expandable turns
- **Tree View** - Visual branch/merge diagram (gitflow-style)
- **Compare View** - Side-by-side diff of modified messages

## Turn Contents

Each conversation turn can include:

| Content Type | Description |
|--------------|-------------|
| User Message | The prompt sent to the model |
| Assistant Response | The model's reply |
| System Prompt | Instructions given to the model |
| Tool Use | Function/tool calls with input JSON |
| Tool Results | Responses from tool execution |
| Thinking Blocks | Extended thinking/reasoning content (Claude) |

## Tree View

The tree view visualizes conversation branches as a node graph, similar to gitflow diagrams.

### How It Works

Conversations that share a common message history prefix are merged into a single tree. When messages diverge (different responses, retries, or replays), the tree branches.

### Branch Types

| Type | Description |
|------|-------------|
| **Natural** | Different user messages after a common prefix |
| **Retry** | Same user message but different assistant response |
| **Replay** | Created via the Replay feature |

### Merge Connectors

When a branch diverges then reconverges (same content appears again on both paths), the tree uses gitflow-style merge visualization:

- Duplicate nodes are removed from alternate branches, keeping only unique content
- Visual connector arcs show where the branch reconnects to the main path
- Multiple diverge-reconverge cycles within a single branch are handled

**Example:**

```
Main:  A - B - C - D - E - F - G - H
Alt:   A - X - C - D - Y - F - G - Z

Tree display:
A
├─ B → C → D → E → F → G → H   (main path)
└─ X ──→ ┘     └─ Y ──→ ┘  └─ Z
   (connector)    (connector)

Alt branch shows: [X, Y, Z] with merge connector arcs
```

### Tree Controls

- **Zoom** - Scroll to zoom, cursor-centered
- **Pan** - Drag to pan the view
- **Click node** - View full message content
- **Branch points** - Navigate between branches at fork points

## Compare View

When messages have been modified by intercept or rules, the Compare View shows the original and modified versions side-by-side.

- Toggle between **Original**, **Modified**, and **Diff** views
- Diff highlights additions and deletions
- Available when a conversation has turns with `request_modified` or `response_modified`

## Token Statistics

Each turn displays token usage:

- Input tokens
- Output tokens
- Total tokens

Cumulative statistics shown for the full conversation.

## Filtering and Search

### Conversation List Filters

- **Provider** - Filter by Anthropic, OpenAI, Google
- **Search** - Full-text search across conversation content
- **Starred** - Show only starred conversations

### Message Filters

Configure content filters in Settings to clean up tree view display:

- Remove tool result noise, base64 data, or other verbose content
- Regex or plain-text pattern matching
- Filters apply to tree view display only (raw data preserved)

## Starring

Click the star icon on any conversation to mark it for quick access. Starred conversations can be filtered in the list view.

## Annotations

### Conversation-Level

Add annotations (title, body, tags) to entire conversations for organization.

### Turn-Level

Add annotations to individual turns within a conversation. Turn annotations appear as indicators in both list and tree views.

## Export

Export conversations in multiple formats:

| Format | Description |
|--------|-------------|
| **JSON** | Full structured data (re-importable) |
| **Markdown** | Human-readable with turn headers and metadata |
| **HTML** | Styled standalone page with dark theme |

### Single Export

Export one conversation from its detail view.

### Bulk Export

Select multiple conversations and export them together.

## Rebuild from Traffic

If conversations are lost or need recorrelation:

1. Open Settings
2. Click **Rebuild Conversations**
3. All LLM traffic is reprocessed and conversations are recreated

This is useful after importing traffic data or when correlation state gets out of sync.

## Navigation

Click on any turn to jump to the corresponding traffic flow in the Traffic view.

## Persistence

Conversations are persisted to disk in `tollbooth-data/conversations/`. See [Data Persistence](../configuration/persistence.md) for details.
