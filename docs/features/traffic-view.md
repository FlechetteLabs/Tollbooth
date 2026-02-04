# Traffic View

The main view showing all HTTP/HTTPS traffic flowing through the proxy.

## Layout

**Left Panel** - Traffic list with:

- Method, URL, status code, and timestamp
- Purple **LLM** badge for known LLM API endpoints
- Blue **Replay** badge for replay requests
- Orange **Refusal** badge when refusal detected
- Yellow **Modified** indicator when traffic was altered

**Right Panel** - Details for selected traffic:

- **Headers**: Request and response headers
- **Body**: Request and response body
- **Parsed**: Structured view for LLM API calls

## Filtering

### Simple Mode

Quick filters for common use cases:

| Filter | Description |
|--------|-------------|
| Search | Full-text search across headers and body |
| Domain | Filter by hostname |
| Method | GET, POST, etc. |
| Status | Response status code |
| LLM Only | Show only LLM API traffic |
| Provider | Anthropic, OpenAI, Google |
| Has Refusal | Traffic with refusal detection results |
| Modified | Traffic that was modified by rules |
| Show Hidden | Include hidden traffic |

### Advanced Mode

Click **Advanced** to build complex filters with AND/OR logic.

**Filter Groups:**

- Create multiple groups of conditions
- Each group uses AND or OR to combine conditions
- Groups are combined with a top-level AND or OR

**Available Fields:**

| Field | Match Types | Scope |
|-------|-------------|-------|
| Host | exact, contains, regex | Request |
| Path | exact, contains, regex | Request |
| Method | exact, contains, regex | Request |
| Header | exists, exact, contains, regex | Request/Response/Either |
| Body Contains | contains, regex | Request/Response |
| Body Size | gt, lt, gte, lte | Request/Response |
| Status Code | exact, range (4xx), list (500,502) | Response |

**NOT Modifier:**

Any condition can be negated with the NOT toggle.

**Example:**

Match requests to Anthropic that are NOT health checks:

```
(Host contains "anthropic.com" AND Path NOT contains "/health")
```

### Filter Presets

Save and load filter configurations:

1. Configure your filters
2. Click **Save Preset** and enter a name
3. Load later from the preset dropdown

Advanced presets are marked with an "Adv" badge.

## Display Modes

Toggle between display modes in the Body tab:

| Mode | Description |
|------|-------------|
| Raw | Original content as-is |
| Pretty | JSON formatted with indentation |
| Aggressive | Parses embedded JSON in SSE responses |
| Insane | Renders escaped newlines for deeply nested content |

## Original/Modified View

When traffic has been modified by rules or manual intercept:

- Toggle between **Original**, **Modified**, and **Diff** views
- Diff view highlights additions and deletions
- Yellow banner indicates modified content

## Bulk Actions

Select multiple flows using checkboxes or **shift-click** for range selection:

- **Hide Selected**: Remove from view (can restore with "Show Hidden")
- **Clear Selected**: Permanently delete

## Context Actions

Right-click or use action buttons on traffic:

| Action | Description |
|--------|-------------|
| Save to Datastore | Save request or response for use in rules |
| Save as Rule | Create a rule from this traffic pattern |
| Mock This Endpoint | One-click: save response + create rule to serve it |
| Create Variant | Create a replay variant for testing |
| Add Annotation | Add notes and tags to this traffic |
