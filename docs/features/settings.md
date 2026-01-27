# Settings

Configure application settings including LLM providers.

## LLM Configuration

### Providers

Tollbooth supports multiple LLM providers:

| Provider | Models |
|----------|--------|
| Anthropic | Claude 3.5 Sonnet, Claude 3 Opus, etc. |
| OpenAI | GPT-4o, GPT-4, GPT-3.5, etc. |
| Google | Gemini 1.5 Pro, Gemini 1.5 Flash |
| Ollama | Any locally hosted model |

### Settings Per Provider

| Setting | Description |
|---------|-------------|
| API Key | Your API key (not needed for Ollama) |
| Model | Model name or ID |
| Temperature | Response randomness (0-1) |
| Max Tokens | Maximum tokens to generate |
| Base URL | Custom API endpoint (optional) |

### Active Provider

Select which provider to use for:

- LLM Chat
- Rule LLM modifications
- Refusal replacement generation
- Data Store transformations

## Security Warning

!!! danger "API Key Storage"
    API keys entered here are stored in **plaintext** in `tollbooth-data/config/settings.json`.

    **Do not use on shared or production systems.**

### Safer Alternatives

Pass API keys via environment variables instead:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
docker compose run --rm agent
```

Environment variables are passed to the agent container but not persisted to disk.

## Prompt Templates

Manage reusable prompt templates for:

- Mock response generation
- Data transformation
- Error response generation

### Default Templates

| Template | Purpose |
|----------|---------|
| Generate API Mock Response | Create realistic API responses |
| Generate Error Response | Create error responses |
| Transform Response | Apply transformations |
| Anonymize PII | Remove personal information |

### Custom Templates

Create templates with variables:

```
Generate a {{status_code}} error for:
{{method}} {{url}}

Reason: {{reason}}
```

Variables use `{{variable_name}}` syntax.

## Data Store Path

Shows the configured data store location (read-only, set via Docker mount).
