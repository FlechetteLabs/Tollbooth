# Replay View

Create and execute request variants to test API behavior with modified inputs.

## Concepts

| Term | Description |
|------|-------------|
| **Flow** | An original captured traffic request |
| **Variant** | A modified copy of a flow for testing |
| **Replay** | Executing a variant through the proxy |

## Creating Variants

### From Traffic View

1. Find the request you want to test
2. Click **Create Variant**
3. You're taken to Replay view with a new variant

### From Replay View

1. Select an existing flow or variant
2. Click **New Variant**
3. The new variant inherits from the selected item

### Variant Chains

Create variants from variants to build test progressions:

```
Original Flow
├── Variant A (change prompt)
│   └── Variant A1 (also change model)
└── Variant B (change headers)
```

## Variant Editor

| Field | Description |
|-------|-------------|
| Name | Display name for easy identification |
| Description | What this variant tests |
| Method | HTTP method (GET, POST, etc.) |
| URL | Target URL |
| Headers | Request headers (editable) |
| Body | Request body (editable) |

### Intercept on Replay

Toggle to intercept the response when this variant executes:

- **Off**: Response is captured but not held
- **On**: Response appears in Intercept queue for editing

## Executing Replays

1. Select a variant
2. Click **Send**
3. If Intercept on Replay is enabled:
   - Edit the response in Intercept queue
   - Forward when ready
4. View results in variant details

## Results

After execution, variants show:

| Field | Description |
|-------|-------------|
| Status | pending, sent, completed, failed |
| Sent At | Timestamp of execution |
| Result Flow ID | Link to captured response |
| Error | Error message if failed |

Click the result flow ID to view full response details in Traffic view.

## Replay Names

Give meaningful names to flows that have variants:

1. Click the name field next to a flow
2. Enter a descriptive name
3. Names persist across sessions

## Use Cases

### Test Different Prompts

1. Create variant from an LLM request
2. Modify the prompt in the body
3. Execute and compare responses

### Test Error Handling

1. Create variant
2. Enable Intercept on Replay
3. Execute
4. Change response status to 500
5. Forward and observe agent behavior

### Test with Different Models

1. Create variant
2. Change the model parameter in body
3. Execute and compare outputs

### Reproduce Issues

1. Find the problematic request in Traffic
2. Create variant
3. Replay to reproduce
4. Modify to test fixes
