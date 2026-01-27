# Security Considerations

Important security information for using Tollbooth safely.

## CA Certificate Risks

!!! danger "Do Not Install on Production Machines"
    The CA certificate allows the proxy to decrypt **all HTTPS traffic**. Do not install it system-wide on production machines or shared systems.

The mitmproxy CA certificate (`certs/mitmproxy-ca-cert.pem`) enables man-in-the-middle decryption of HTTPS traffic. This is necessary for the proxy to inspect encrypted API calls, but it also means:

- Any application trusting this certificate can have its traffic decrypted
- If the certificate is installed system-wide, all HTTPS traffic on the machine can be intercepted
- The private key (in `certs/`) should be kept secure

**Best practices:**

- Only use Tollbooth on development machines
- Use environment variables to scope certificate trust to specific applications
- Do not commit the `certs/` directory to version control (it's gitignored by default)
- Generate new certificates for each deployment

## API Key Visibility

!!! warning "Sensitive Data in Traffic"
    API keys in intercepted traffic are visible in the UI.

When you inspect LLM API traffic, request headers contain authentication tokens:

- `x-api-key` header (Anthropic)
- `Authorization: Bearer` header (OpenAI, Google)

These are displayed in the Traffic view and stored in traffic logs.

**Best practices:**

- Use this tool only in development environments
- Clear traffic regularly if it contains sensitive keys
- Disable traffic persistence if storing API keys is a concern:
  ```yaml
  environment:
    - TOLLBOOTH_PERSIST_TRAFFIC=false
  ```

## Proxy Access to Sensitive Data

The proxy has full access to request and response bodies, including:

- API keys and tokens
- User data in requests
- Model responses with potentially sensitive content
- Any other data flowing through the proxy

**Best practices:**

- Don't proxy traffic containing production user data
- Be aware of data retention in `tollbooth-data/traffic/`
- Use appropriate access controls on the tollbooth-data directory

## Plaintext API Key Storage

!!! warning "Settings Stored in Plaintext"
    LLM API keys configured via the Settings UI are stored in **plaintext**.

API keys entered in the Settings view are saved to:

```
tollbooth-data/config/settings.json
```

This file is:

- Excluded from git by default (via `.gitignore`)
- Readable by anyone with access to the filesystem
- Not encrypted

**Safer alternatives:**

Pass API keys via environment variables instead:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
docker compose run --rm agent
```

Environment variables are:

- Passed to the agent container automatically
- Not persisted to disk
- Not visible in the Tollbooth UI

## Network Exposure

By default, Tollbooth services bind to:

| Service | Port | Binding |
|---------|------|---------|
| Proxy | 8080 | Container network |
| Backend API | 2000 | localhost |
| Frontend | 5173 | localhost |

If you modify `docker-compose.yml` to expose services more broadly (e.g., `0.0.0.0:8080:8080`), be aware that:

- Anyone on the network could route traffic through your proxy
- The UI would be accessible to others
- Traffic data could be viewed by others

## Recommendations Summary

1. **Development only** - Don't use on production systems
2. **Scope certificate trust** - Use env vars instead of system-wide installation
3. **Use env vars for API keys** - Avoid storing keys in settings.json
4. **Clear sensitive traffic** - Don't persist traffic with sensitive data
5. **Secure the data directory** - Restrict access to `tollbooth-data/`
6. **Don't expose to network** - Keep services bound to localhost
