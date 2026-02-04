# Intercept View

Real-time interception and modification of requests and responses.

## Intercept Modes

| Mode | Description |
|------|-------------|
| **Passthrough** | All traffic flows through unimpeded (default) |
| **Intercept LLM** | Hold only requests to known LLM API endpoints |
| **Intercept All** | Hold all requests for manual inspection |

## Rules Mode Toggle

Enable/disable the rules engine. When enabled, traffic matching rules is processed automatically even in passthrough mode.

## Intercept Queue

When traffic is intercepted, it appears in the queue showing:

- Request or Response indicator
- Method and URL
- Timestamp
- Time waiting

### Selection

- Click to select individual items
- Use checkboxes for multi-select
- **Shift-click** to select a range of items
- Selection helpers: All, None, Requests only, Responses only

### Bulk Actions

- **Forward Selected**: Send all selected items unchanged
- **Drop Selected**: Cancel all selected requests (requests only)

## Editing Intercepted Traffic

Select an item to view and edit in the detail panel.

### Headers

- View all headers
- Add new headers
- Modify existing values
- Delete headers

### Body

- View raw or formatted
- Edit content directly
- Toggle between Preview and Edit mode

### Status Code (Responses)

Change the HTTP status code before forwarding.

## Actions

| Action | Description |
|--------|-------------|
| **Forward** | Send unchanged |
| **Forward Modified** | Send with your edits |
| **Drop** | Cancel the request (requests only) |
| **Save to Datastore** | Save edited content for later use |
| **Save as Rule** | Create a rule from this pattern |

## Timeout

!!! warning "Auto-Forward"
    Intercepted traffic auto-forwards after **5 minutes** to prevent your agent from hanging indefinitely.

If you need more time:

1. Forward the current request
2. Make your changes to the rule or datastore
3. Trigger a new request from your agent

### Timeout Immunity

Mark individual intercepted items as **timeout immune** to prevent auto-forwarding. Immune items remain in the queue indefinitely until you manually forward or drop them.

Use this when you need extended time to inspect or modify a specific request without worrying about the 5-minute deadline.

## Use Cases

### Inspect a Specific Request

1. Set mode to **Intercept LLM**
2. Trigger an action in your agent
3. Examine the request in detail
4. Forward when done

### Modify a Prompt

1. Intercept a request
2. Edit the body to change the prompt
3. Click **Forward Modified**
4. Observe the response

### Test Error Handling

1. Intercept a response
2. Change status code to 500
3. Forward and observe agent behavior

### Save Response as Mock

1. Intercept a response
2. Click **Save to Datastore**
3. Create a rule to serve it for future requests
