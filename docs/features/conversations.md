# Conversations View

Groups related LLM API calls into logical conversations based on message history correlation.

## How Correlation Works

LLM APIs are stateless—each request contains the full conversation history. Tollbooth correlates requests by comparing message history prefixes and matching models.

For example, if Request B contains all the messages from Request A plus new ones, they're part of the same conversation.

## Layout

**Left Panel** - Conversation list:

- Grouped by provider and model
- Shows turn count and timestamp
- Click to expand

**Right Panel** - Conversation details:

- Full conversation with expandable turns
- Each turn shows request and response

## Turn Contents

Each conversation turn can include:

| Content Type | Description |
|--------------|-------------|
| User Message | The prompt sent to the model |
| Assistant Response | The model's reply |
| System Prompt | Instructions given to the model |
| Tool Use | Function/tool calls with input JSON |
| Tool Results | Responses from tool execution |
| Thinking Blocks | Extended thinking (Claude) |

## Token Statistics

Each turn displays token usage:

- Input tokens
- Output tokens
- Total tokens

Cumulative statistics shown for the full conversation.

## Navigation

Click on any turn to jump to the corresponding traffic flow in the Traffic view.

## Filtering

Conversations inherit the same filtering as Traffic view. Hidden traffic is excluded from conversation correlation.
