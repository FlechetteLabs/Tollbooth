# Tollbooth Test Plan

This document contains manual tests to verify all features are working correctly.

## Prerequisites

1. Start all services: `docker compose up`
2. Open web UI at http://localhost:5173
3. Verify frontend shows "Connected" status in sidebar

---

## 1. Traffic Capture and Display

### 1.1 Basic Traffic Capture

- [ ] Start the agent container: `docker compose run --rm agent`
- [ ] Make a test request: `curl -x http://proxy:8080 http://httpbin.org/get`
- [ ] Verify request appears in Traffic view
- [ ] Verify method, URL, and status code are displayed correctly
- [ ] Click on the traffic entry and verify Headers tab shows request/response headers
- [ ] Verify Body tab shows request/response body content

### 1.2 LLM API Detection

- [ ] Make an LLM API request through the proxy (Anthropic, OpenAI, or Google)
- [ ] Verify purple "LLM" badge appears on the traffic entry
- [ ] Verify Parsed tab appears and shows structured message format
- [ ] Verify messages, system prompt, and model info are parsed correctly

### 1.3 Display Modes

- [ ] Click on an LLM API response
- [ ] Toggle between Raw, Pretty, Aggressive, and Insane display modes
- [ ] Verify each mode formats content appropriately

---

## 2. Rich Traffic Filtering

### 2.1 Basic Filters

- [ ] Generate multiple traffic entries (mix of LLM and non-LLM)
- [ ] Filter by domain - verify only matching traffic shows
- [ ] Filter by method (GET, POST) - verify filtering works
- [ ] Filter by status code - verify filtering works
- [ ] Toggle "LLM Only" - verify only LLM traffic shows
- [ ] Use text search - verify it searches headers and body

### 2.2 Advanced Filters

- [ ] Filter by provider (Anthropic/OpenAI/Google) - verify filtering works
- [ ] Filter by "Has Refusal" - verify works if refusal detection is active
- [ ] Filter by "Modified" - verify shows only modified traffic

### 2.3 Saved Filter Presets

- [ ] Set up a complex filter (domain + method + LLM only)
- [ ] Click "Save Preset" and give it a name (e.g., "Anthropic POST only")
- [ ] Clear all filters
- [ ] Click the preset dropdown and select your saved preset
- [ ] Verify filters are restored correctly
- [ ] Reload the page and verify preset persists (localStorage)
- [ ] Delete the preset and verify it's removed

### 2.4 Hide Traffic

- [ ] Select multiple traffic entries using checkboxes
- [ ] Click "Hide Selected"
- [ ] Verify hidden traffic disappears from list
- [ ] Toggle "Show Hidden" checkbox
- [ ] Verify hidden traffic reappears (with visual indicator)
- [ ] Select a hidden entry and click "Unhide"
- [ ] Toggle off "Show Hidden" and verify unhidden entry still shows

### 2.5 Clear Traffic

- [ ] Select multiple traffic entries using checkboxes
- [ ] Click "Clear Selected"
- [ ] Confirm the deletion
- [ ] Verify selected traffic is permanently removed
- [ ] Verify it doesn't reappear with "Show Hidden"

---

## 3. Short IDs

### 3.1 Rule Short IDs

- [ ] Go to Rules view
- [ ] Create a new rule
- [ ] Verify it gets a short ID (r1, r2, etc.)
- [ ] Verify the short ID is displayed in the rule list
- [ ] Delete and recreate rules - verify IDs are unique and persistent

### 3.2 Datastore Short IDs

- [ ] Go to Data Store view
- [ ] Create a new response entry
- [ ] Verify it gets a short ID (ds1, ds2, etc.)
- [ ] Create a new request entry
- [ ] Verify it gets a short ID (rq1, rq2, etc.)
- [ ] Verify short IDs persist across page reloads

---

## 4. Rules Engine

### 4.1 Basic Rule Creation

- [ ] Create a new Response rule with:
  - Name: "Test Rule"
  - Direction: Response
  - Filter: Host contains "httpbin"
  - Action: Passthrough
- [ ] Enable Rules Mode in Intercept view
- [ ] Make a request to httpbin.org
- [ ] Verify rule matches (check backend logs)

### 4.2 AND/OR Filter Logic

- [ ] Create a rule with multiple filter groups:
  - Group 1 (AND): Host contains "api" AND Method = "POST"
  - Group 2 (OR): Path contains "/v1"
  - Top-level: OR (either group matches)
- [ ] Use the Rule Test feature to verify matching:
  - Test URL: `https://api.example.com/test` with POST - should match Group 1
  - Test URL: `https://other.com/v1/endpoint` with GET - should match Group 2
  - Test URL: `https://other.com/other` with GET - should NOT match

### 4.3 Serve from Data Store

- [ ] Save a mock response to Data Store
- [ ] Create a rule with "Serve from Data Store" action
- [ ] Select the saved response
- [ ] Enable Rules Mode
- [ ] Make a matching request
- [ ] Verify mock response is returned instead of real response

### 4.4 Multi-Response Modes

- [ ] Create 3 different responses in Data Store (response1, response2, response3)
- [ ] Create a rule with "Serve from Data Store" and select all 3 responses
- [ ] Test "Round Robin" mode:
  - Make 4 requests - verify responses cycle: 1, 2, 3, 1
- [ ] Test "Random" mode:
  - Make several requests - verify responses vary randomly
- [ ] Test "Sequential" mode:
  - Make 4 requests - verify responses: 1, 2, 3, 3 (stays on last)

### 4.5 Auto-Hide and Auto-Clear Rules

- [ ] Create a rule with "Auto-Hide" action and a specific filter
- [ ] Enable Rules Mode
- [ ] Make matching requests
- [ ] Verify traffic is automatically hidden (toggle "Show Hidden" to verify)
- [ ] Create a rule with "Auto-Clear" action
- [ ] Make matching requests
- [ ] Verify traffic is automatically deleted (doesn't appear at all)

### 4.6 Modify Body & Headers

- [ ] Create a rule with "Modify Body & Headers" action
- [ ] Add a body find/replace: find "original" replace with "modified"
- [ ] Add a header modification: Set "X-Custom-Header" to "test-value"
- [ ] Enable Rules Mode
- [ ] Make a matching request
- [ ] Verify body is modified and header is added
- [ ] Verify Original/Modified diff view shows changes

---

## 5. Intercept Mode

### 5.1 Basic Interception

- [ ] Set Intercept Mode to "Intercept All"
- [ ] Make a request through the proxy
- [ ] Verify request appears in Intercept Queue
- [ ] Click "Forward" - verify request completes
- [ ] Make another request
- [ ] Click "Drop" - verify request is cancelled

### 5.2 Response Interception

- [ ] Set Intercept Mode to "Intercept All"
- [ ] Make a request and forward it
- [ ] Verify response appears in Intercept Queue
- [ ] Edit the response body
- [ ] Click "Forward Modified"
- [ ] Verify modified response is shown in Traffic view

### 5.3 Bulk Actions

- [ ] Make several requests with Intercept Mode on
- [ ] Select multiple entries using checkboxes
- [ ] Click "Forward Selected" - verify all are forwarded
- [ ] Make more requests
- [ ] Use "Select All" then "Drop Selected" - verify all are dropped

---

## 6. Replay View

### 6.1 Create Variant from Traffic

- [ ] In Traffic view, find a completed request
- [ ] Click "Create Variant" button
- [ ] Verify Replay view opens with variant editor
- [ ] Enter a description
- [ ] Verify method, URL, headers, and body are populated from original

### 6.2 Edit and Execute Replay

- [ ] Modify the request URL slightly
- [ ] Modify a header value
- [ ] Click "Send" to execute the replay
- [ ] Verify replay executes and response is captured
- [ ] Verify traffic appears in Traffic view with "Replay" badge
- [ ] Verify variant shows result status (completed/failed)

### 6.3 Replay Naming

- [ ] In Replay view sidebar, find an original flow
- [ ] Click the edit icon next to the flow
- [ ] Enter a name (e.g., "Test Endpoint")
- [ ] Verify name is saved and displayed
- [ ] Reload page and verify name persists

### 6.4 Intercept on Replay

- [ ] Create or edit a variant
- [ ] Enable "Intercept response when replayed" checkbox
- [ ] Click "Send" to execute the replay
- [ ] Verify response appears in Intercept Queue
- [ ] Edit the response if desired
- [ ] Click "Forward" or "Forward Modified"
- [ ] Verify final response is recorded in variant result

### 6.5 Variant Chains

- [ ] Execute a variant and get a result
- [ ] Click "Create Variant" on the result
- [ ] Verify new variant is created with result as parent
- [ ] Verify variant tree shows hierarchy correctly

---

## 7. Traffic Annotations

### 7.1 Add Annotation to Traffic

- [ ] In Traffic view, select a traffic entry
- [ ] Click the annotation icon (or expand annotation panel)
- [ ] Enter a title: "Test annotation"
- [ ] Enter body text (markdown): "This is a **test** annotation"
- [ ] Add tags: "test", "regression:api"
- [ ] Save the annotation
- [ ] Verify annotation indicator appears on traffic entry

### 7.2 Tag Autocomplete

- [ ] Add another annotation to a different traffic entry
- [ ] Start typing a tag that was used before
- [ ] Verify autocomplete suggestions appear
- [ ] Select from autocomplete
- [ ] Verify tag is added correctly

### 7.3 Annotation Persistence

- [ ] Reload the page
- [ ] Verify annotations are still present on traffic entries
- [ ] Click on an annotated entry
- [ ] Verify annotation content is preserved

### 7.4 Edit and Delete Annotation

- [ ] Find an annotated traffic entry
- [ ] Edit the annotation title and body
- [ ] Save changes
- [ ] Verify changes are preserved
- [ ] Delete the annotation
- [ ] Verify annotation indicator is removed

---

## 8. Conversations View

### 8.1 Conversation Grouping

- [ ] Make multiple LLM API calls that build on previous context
- [ ] Go to Conversations view
- [ ] Verify calls are grouped into a single conversation
- [ ] Verify turn count matches number of API calls

### 8.2 Conversation Details

- [ ] Click on a conversation
- [ ] Verify all turns are displayed
- [ ] Verify user messages, assistant responses are shown
- [ ] Verify tool use blocks are collapsible
- [ ] Verify token usage statistics are shown

---

## 9. Refusal Detection

### 9.1 Create Refusal Rule

- [ ] Go to Rules view > LLM Rules tab
- [ ] Create a new refusal rule:
  - Name: "Test Refusal Detection"
  - Confidence Threshold: 0.5
  - Action: Prompt User
- [ ] Enable the rule

### 9.2 Test Refusal Detection

- [ ] Make an LLM API call that triggers a refusal response
- [ ] Verify refusal appears in Pending Refusals queue
- [ ] Verify confidence score is displayed
- [ ] Click "Approve" to forward original response
- [ ] Verify "Refusal" badge appears on traffic

### 9.3 Generate Alternative

- [ ] Configure an LLM provider in Settings
- [ ] Trigger another refusal detection
- [ ] In Pending Refusals, click "Generate Alternative"
- [ ] Verify alternative response is generated
- [ ] Forward the modified response
- [ ] Verify "Modified" badge appears on traffic

---

## 10. Data Store

### 10.1 Save from Traffic

- [ ] In Traffic view, select a response
- [ ] Click "Save to Datastore"
- [ ] Enter a key name
- [ ] Verify entry appears in Data Store view

### 10.2 Create and Edit Entries

- [ ] In Data Store, click "New Response"
- [ ] Enter key, status code, headers, body
- [ ] Save the entry
- [ ] Verify short ID is assigned (ds1, ds2, etc.)
- [ ] Edit the entry - modify body
- [ ] Save and verify changes persist

### 10.3 Usage Tracking

- [ ] Create a rule that references a datastore entry
- [ ] Go to Data Store view
- [ ] Verify usage badge shows "1 rule" for that entry
- [ ] Click on entry to see "Used by" section
- [ ] Try to delete the entry - verify warning is shown

---

## 11. LLM Chat View

### 11.1 Basic Chat

- [ ] Configure an LLM provider in Settings
- [ ] Go to Chat view
- [ ] Send a message
- [ ] Verify response is received
- [ ] Verify token usage is displayed

### 11.2 Save to Data Store

- [ ] Get a useful response in Chat
- [ ] Click "Save to Data Store" on the response
- [ ] Enter a key name
- [ ] Verify entry appears in Data Store

---

## 12. Settings

### 12.1 LLM Configuration

- [ ] Go to Settings view
- [ ] Configure Anthropic provider with API key
- [ ] Test by using Chat view
- [ ] Switch to OpenAI provider
- [ ] Test with Chat view
- [ ] Verify provider switch works correctly

---

## 13. Original/Modified Diff View

### 13.1 View Modified Traffic

- [ ] Create a rule that modifies response body
- [ ] Enable Rules Mode
- [ ] Make a matching request
- [ ] In Traffic view, click on the modified response
- [ ] Verify "Modified" view toggle appears
- [ ] Switch between Original, Modified, and Diff views
- [ ] Verify diff view highlights changes correctly

---

## 14. WebSocket Connection

### 14.1 Connection Resilience

- [ ] Verify "Connected" status in sidebar
- [ ] Restart backend: `docker compose restart backend`
- [ ] Verify frontend reconnects automatically
- [ ] Verify existing traffic data is preserved

### 14.2 Real-time Updates

- [ ] Open Traffic view
- [ ] Make a request from agent container
- [ ] Verify traffic appears in real-time without page refresh
- [ ] Enable Intercept Mode
- [ ] Make a request
- [ ] Verify request appears in Intercept Queue in real-time

---

## Test Results Summary

| Section | Tests Passed | Tests Failed | Notes |
|---------|-------------|--------------|-------|
| 1. Traffic Capture | | | |
| 2. Rich Filtering | | | |
| 3. Short IDs | | | |
| 4. Rules Engine | | | |
| 5. Intercept Mode | | | |
| 6. Replay View | | | |
| 7. Annotations | | | |
| 8. Conversations | | | |
| 9. Refusal Detection | | | |
| 10. Data Store | | | |
| 11. LLM Chat | | | |
| 12. Settings | | | |
| 13. Diff View | | | |
| 14. WebSocket | | | |

---

## Known Issues

Document any issues found during testing:

1.
2.
3.
