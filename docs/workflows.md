# Common Workflows

Practical examples for common use cases.

## Mocking API Responses

### Quick Method (One Click)

1. **Capture a real response**: Make an API call through the proxy and find it in Traffic view
2. **Click "Mock This Endpoint"**: This automatically saves the response and creates a matching rule
3. **Enable Rules Mode**: Toggle on in Intercept view
4. Future requests to this endpoint will receive your mock response

### Manual Method

1. **Capture a real response**: Make an API call through the proxy and find it in Traffic view
2. **Save to Data Store**: Click "Save to Datastore" on the response
3. **Create a rule**: Go to Rules view and create a new Response rule
4. **Configure the rule**:
   - Set filters to match the target endpoint (host, path)
   - Set action to "Serve from Data Store"
   - Select your saved response
5. **Enable Rules Mode**: Toggle on in Intercept view
6. Future requests matching the rule will receive your mock response

## Modifying Requests/Responses Automatically

1. **Create a rule** in Rules view
2. **Set filters** to match target traffic
3. **Choose "Modify Body & Headers"** action
4. **Add modifications**:
   - Replace entire body, or
   - Add find/replace patterns (with optional regex)
   - Add header modifications (set, remove, or find/replace)
   - Use dynamic variables like `{{uuid}}`, `{{timestamp}}`, `{{request.host}}`
5. **Enable Rules Mode**
6. Traffic matching the rule is automatically modified

## Simulating Flaky APIs

Test how your agent handles unreliable APIs using response variations:

1. **Create multiple stored responses** in Data Store:
   - A successful 200 response
   - A 500 error response
   - A 429 rate limit response
2. **Create a rule** with "Serve from Data Store" action
3. **Select "Random" mode** and add all your stored responses
4. **Enable Rules Mode**
5. Each request will randomly receive one of your responses

This is useful for testing:

- Retry logic
- Error handling
- Backoff strategies

## Testing Pagination

Use sequential response mode to simulate paginated APIs:

1. **Store each page response** in Data Store (page1, page2, page3, etc.)
2. **Create a rule** with "Serve from Data Store" action
3. **Select "Sequential" mode** and add pages in order
4. **Enable Rules Mode**
5. First request gets page1, second gets page2, etc.

The sequential mode stays on the last response once exhausted, simulating the end of pagination.

## Injecting Headers into Requests

Use stored requests to automatically inject authentication or other headers:

1. **Create a stored request** in Data Store with your desired headers (e.g., Authorization header)
2. **Create a Request rule** with "Serve from Data Store" action
3. **Set merge mode to "Merge"** so stored headers override incoming
4. **Enable Rules Mode**
5. All matching requests will have your stored headers injected

Use cases:

- Add authentication headers
- Inject tracing/correlation IDs
- Override content-type headers

## Debugging Agent Behavior

1. Start the inspector and your agent
2. Watch traffic in real-time in Traffic view
3. Click on any request to see:
   - Full headers and body
   - Parsed LLM message format
   - Token usage
4. Switch to Conversations view to see the full conversation flow
5. If needed, enable Intercept mode to pause and inspect specific calls

Tips:

- Use the LLM-only filter to focus on API calls
- Add annotations to mark interesting requests
- Use tags to categorize behavior patterns

## Prompt Engineering

1. Configure LLM settings with your API key
2. Use the Chat view to experiment with prompts
3. Save useful responses to Data Store
4. Create rules to inject these responses for testing

This workflow lets you:

- Test prompt variations without real API calls
- Build a library of expected responses
- Verify agent behavior with controlled outputs
