# Rules Engine

Automate traffic manipulation with pattern-based rules.

## Overview

Rules let you automatically:

- Intercept specific traffic for manual editing
- Serve mock responses from the data store
- Modify headers and body content
- Hide or clear matching traffic
- Use LLM to dynamically transform content

## Rule Components

### Basic Info

| Field | Description |
|-------|-------------|
| Name | Descriptive name for the rule |
| Direction | Request or Response |
| Enabled | Toggle on/off |
| Short ID | Auto-assigned (r1, r2, r3...) for reference |
| Priority | Drag to reorder; evaluated top to bottom |

### Filters

Rules support complex filter logic with grouped conditions.

**Structure:**

```
Top-level operator (AND/OR)
├── Group 1 (AND/OR)
│   ├── Condition 1
│   ├── Condition 2
│   └── ...
├── Group 2 (AND/OR)
│   └── ...
└── ...
```

**Available Conditions:**

| Condition | Match Types | Notes |
|-----------|-------------|-------|
| Host | exact, contains, regex | Hostname only |
| Path | exact, contains, regex | URL path |
| Method | exact, contains, regex | HTTP method |
| Header | key exists, value match | Check specific header |
| LLM API | yes, no, any | Filter by LLM traffic |
| Status Code | exact, range, list | Response rules only |
| Body Contains | string, regex | Response rules only |
| Response Size | gt, lt, gte, lte bytes | Response rules only |

**Negation:**

Any condition can be inverted with the NOT modifier.

**Example:**

```
Match (Host contains "api.anthropic.com" AND method = "POST")
  OR (Path contains "/v1/messages")
```

### Actions

| Action | Description |
|--------|-------------|
| **Passthrough** | Log only, don't intercept |
| **Intercept** | Hold for manual editing |
| **Serve from Data Store** | Return stored response/request |
| **Modify Body & Headers** | Apply automatic modifications |
| **LLM Modification** | Use LLM to transform content |
| **Auto-Hide** | Hide matching traffic from view |
| **Auto-Clear** | Delete matching traffic |

## Serve from Data Store

Return pre-configured responses instead of forwarding to the real API.

### Selection Modes (Response Rules)

| Mode | Behavior |
|------|----------|
| Single | Always serve the same response |
| Round Robin | Cycle through responses (1, 2, 3, 1, 2, 3...) |
| Random | Randomly pick each time |
| Sequential | Serve in order, stay on last |

### Merge Modes (Request Rules)

| Mode | Behavior |
|------|----------|
| Merge | Stored headers override incoming |
| Replace | Use only stored headers |

### Inline Preview

Rules with datastore actions show an expandable preview in the rule list.

## Modify Body & Headers

Apply automatic transformations to traffic.

### Body Modifications

| Type | Description |
|------|-------------|
| Replace Body | Completely replace content |
| Find/Replace | Multiple operations, optional regex |

### Header Modifications

| Type | Description |
|------|-------------|
| Set | Add or overwrite header |
| Remove | Delete header |
| Find/Replace | Modify header value |

### Dynamic Variables

Use variables in replacements:

| Variable | Description |
|----------|-------------|
| `{{timestamp}}` | Unix timestamp (ms) |
| `{{timestamp_iso}}` | ISO 8601 timestamp |
| `{{uuid}}` | Random UUID v4 |
| `{{random_int:min:max}}` | Random integer |
| `{{request.method}}` | HTTP method |
| `{{request.host}}` | Hostname |
| `{{request.path}}` | URL path |
| `{{request.url}}` | Full URL |
| `{{request.header:name}}` | Specific header value |
| `{{env:VAR_NAME}}` | Environment variable |

## LLM Modification

Use an LLM to dynamically transform content.

| Mode | Description |
|------|-------------|
| Generate Once | Cache result, serve same response |
| Generate Live | Generate fresh for every request |

Configure the LLM provider and prompt template in Settings.

## Rule Testing

Test rules without real traffic:

1. Click **Test Rule** on any rule
2. Enter test data: URL, method, headers, body
3. See which filters match or fail
4. Preview the action result

## Managing Rules

### Import/Export

- **Export**: Download all rules as JSON
- **Import**: Load rules from JSON file (disabled by default for safety)

### Templates

Create rules from pre-configured templates:

- Mock 500 Error
- Mock 429 Rate Limit
- Mock Empty Response
- Log LLM Traffic
- Intercept Anthropic API
- And more...

### Duplicate

Clone existing rules with a new ID for variations.
