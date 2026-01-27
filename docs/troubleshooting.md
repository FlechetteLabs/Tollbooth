# Troubleshooting

Common issues and solutions.

## Connection Issues

### Agent Can't Connect / SSL Errors

1. **Verify proxy is running:**
   ```bash
   curl -x http://localhost:8080 http://httpbin.org/get
   ```

2. **Check certificate path:**
   - Must be an absolute path
   - File must exist and be readable

3. **Try system-wide CA installation:**
   See [Manual Setup](configuration/manual-setup.md#system-wide-ca-certificate)

### No Traffic in UI

1. **Check frontend connection:**
   - Green dot in sidebar = connected
   - Red dot = disconnected, refresh the page

2. **Verify agent is using proxy:**
   - Check agent logs for proxy-related messages
   - Run `curl -x http://localhost:8080 https://api.anthropic.com` to test

3. **Check Docker logs:**
   ```bash
   docker compose logs -f
   ```

## Streaming Issues

### Responses Only Appear After Completion

SSE streaming requires proper headers. Check:

1. Response has `content-type: text/event-stream`
2. Backend is receiving chunks (check logs)
3. No buffering proxy between agent and Tollbooth

## Intercept Issues

### Request Auto-Forwarded

Intercepted traffic auto-forwards after 5 minutes.

**Solution:** Work faster, or:

1. Forward the request
2. Make your rule/datastore changes
3. Trigger a new request from agent

### Rules Not Applying

1. **Check Rules Mode is enabled** in Intercept view
2. **Verify rule is enabled** (toggle switch on)
3. **Check filters match** the traffic:
   - Host, path, method all correct?
   - Use the Test Rule feature
4. **Check rule priority** - rules evaluate top to bottom

## Refusal Detection Issues

### Not Detecting Refusals

1. **Check LLM rules are enabled** in Rules → LLM Rules tab
2. **Lower confidence threshold** (try 0.5)
3. **Check backend logs:**
   ```bash
   docker compose logs -f backend | grep -i refusal
   ```

### Too Many False Positives

1. **Raise confidence threshold** (try 0.9)
2. **Add filters** to narrow scope
3. **Use Prompt User action** to review manually

### Slow Detection

The ML model loads on first use (~500ms). Subsequent detections are fast.

## Docker Issues

### Container Won't Start

1. **Check for port conflicts:**
   ```bash
   lsof -i :8080
   lsof -i :2000
   lsof -i :5173
   ```

2. **Rebuild containers:**
   ```bash
   docker compose down
   docker compose build --no-cache
   docker compose up
   ```

### Permission Denied on tollbooth-data

The backend runs as UID 1000. Ensure the directory is writable:

```bash
sudo chown -R 1000:1000 tollbooth-data/
```

Or match your host user:

```bash
chown -R $(id -u):$(id -g) tollbooth-data/
```

## Performance Issues

### UI Slow with Many Traffic Items

1. **Use filters** to reduce visible items
2. **Hide old traffic** you don't need
3. **Clear traffic** periodically
4. **Disable traffic persistence** if not needed:
   ```yaml
   environment:
     - TOLLBOOTH_PERSIST_TRAFFIC=false
   ```

### High Memory Usage

1. **Clear traffic** regularly
2. **Reduce WS_MAX_PAYLOAD** if not handling large bodies
3. **Use smaller ML model:**
   ```yaml
   environment:
     - REFUSAL_MODEL_ID=Xenova/nli-deberta-v3-xsmall
   ```

## Getting Help

1. **Check Docker logs:**
   ```bash
   docker compose logs -f
   ```

2. **Check browser console:**
   - Open DevTools (F12)
   - Look for errors in Console tab

3. **File an issue:**
   [GitHub Issues](https://github.com/flechettelabs/tollbooth/issues)
