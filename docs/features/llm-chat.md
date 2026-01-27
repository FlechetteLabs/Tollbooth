# LLM Chat

Built-in chat interface for interacting with LLMs directly.

## Purpose

Use LLM Chat to:

- Generate mock API responses
- Test prompts before creating rules
- Create realistic test data
- Transform content with natural language

## Requirements

Configure LLM settings in the [Settings](settings.md) view first.

## Interface

- Multi-turn conversation with context
- Token usage display per message
- Provider indicator

## Actions

| Action | Description |
|--------|-------------|
| Send | Submit your message |
| Save to Data Store | Save assistant response for use in rules |
| Clear | Reset conversation history |

## Use Cases

### Generate Mock Response

```
Generate a realistic JSON response for a user profile API endpoint.
Include: id, name, email, created_at, subscription_tier
```

Then click **Save to Data Store**.

### Test Prompt Variations

Try different prompt phrasings:

```
Explain how to implement authentication in Node.js
```

vs

```
As a senior developer, explain Node.js authentication best practices
```

### Create Test Data

```
Generate 5 realistic error responses for a payment API:
- 400 Bad Request (missing fields)
- 401 Unauthorized
- 402 Payment Required
- 429 Rate Limited
- 500 Server Error
```

### Transform Existing Data

Copy a response from Traffic view:

```
Transform this response to use fake PII:

{
  "user": {"name": "John Smith", "email": "john@example.com"}
}
```
