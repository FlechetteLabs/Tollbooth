# Refusal Detection

ML-powered detection of LLM refusals with automatic handling options.

## How It Works

Tollbooth uses a zero-shot classification model (bundled in the Docker image) to analyze LLM responses for refusal patterns. Both text content and thinking blocks are analyzed.

No external API calls are made for detection—the model runs locally.

## Creating LLM Rules

LLM Rules are configured in the **Rules View** under the **LLM Rules** tab.

### Basic Settings

| Field | Description |
|-------|-------------|
| Name | Descriptive name |
| Enabled | Toggle on/off |

### Detection Settings

| Setting | Description |
|---------|-------------|
| Confidence Threshold | Minimum confidence to trigger (0-1, default 0.7) |
| Tokens to Analyze | Number of tokens to check (0 = all) |

Lower thresholds catch more refusals but may have false positives.

### Actions

| Action | Description |
|--------|-------------|
| **Passthrough** | Log the refusal, forward unchanged |
| **Prompt User** | Hold in queue for manual review |
| **Modify** | Auto-generate replacement response |

### Fallback Configuration (Modify Action)

When using the Modify action, configure how replacements are generated:

| Field | Description |
|-------|-------------|
| Provider | LLM provider for generating replacements |
| Custom Prompt | Template for generating alternatives |
| System Prompt | Instructions for the replacement LLM |

### Filters (Optional)

Narrow which traffic the rule applies to:

| Filter | Description |
|--------|-------------|
| Host | Match specific API hosts |
| Path | Match specific API paths |
| Model | Match specific model names |
| Provider | anthropic, openai, google |

## Pending Refusals Queue

When a rule's action is **Prompt User**, detected refusals appear in a separate queue.

### Queue Item Details

- Original response content
- Confidence score
- Tokens analyzed
- Which rule triggered detection

### Actions

| Action | Description |
|--------|-------------|
| **Approve** | Forward original response unchanged |
| **Generate Alternative** | Use LLM to create replacement |
| **Forward Modified** | Send custom or generated response |

### Timeout

!!! warning "Auto-Forward"
    Pending refusals auto-forward after **5 minutes** to prevent hangs.

## Visual Indicators

Traffic and conversation views show badges:

| Badge | Meaning |
|-------|---------|
| Orange **Refusal** | Refusal detected, not modified |
| Purple **Modified** | Refusal detected and replaced |

## Example Use Cases

### Log All Refusals

Create a rule with:

- Action: Passthrough
- Confidence: 0.7
- No filters (apply to all)

Refusals are logged but traffic flows normally.

### Review Before Forwarding

Create a rule with:

- Action: Prompt User
- Confidence: 0.8 (higher to reduce false positives)
- Filter: Provider = anthropic

Anthropic refusals are held for your review.

### Auto-Replace Refusals

Create a rule with:

- Action: Modify
- Confidence: 0.9 (high to avoid replacing valid responses)
- Fallback provider configured
- Custom prompt: "Provide a helpful response that addresses the user's request"

Detected refusals are automatically replaced.

## Troubleshooting

### Detection Not Working

1. Check that LLM rules are enabled
2. Lower the confidence threshold
3. Check backend logs: `docker compose logs -f backend`

### High False Positives

1. Raise the confidence threshold
2. Add filters to narrow scope
3. Use Prompt User action to review manually

### Slow Detection

The ML model loads on first use. Subsequent detections are fast.
