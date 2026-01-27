# Upstream Proxy

Route Tollbooth traffic through another proxy like Burp Suite, OWASP ZAP, or Charles Proxy.

## Use Case

Run both tools simultaneously:

```
Agent → Tollbooth (8080) → Your Proxy (8081) → Internet
```

Your proxy sees decrypted traffic. Both UIs work at the same time.

## Setup

### 1. Configure Your Proxy

Set your proxy to listen on port 8081, bound to all interfaces.

**Burp Suite:**

1. Proxy → Proxy settings
2. Add listener on port 8081
3. Bind to all interfaces

**OWASP ZAP:**

1. Tools → Options → Local Proxies
2. Add proxy on port 8081

### 2. Update docker-compose.yml

Uncomment the upstream proxy configuration:

```yaml
proxy:
  # ... other settings ...
  command: >
    mitmdump -s /app/addon.py
    --listen-host 0.0.0.0
    --listen-port 8080
    --set block_global=false
    --mode upstream:http://host.docker.internal:8081
    --ssl-insecure
```

**Linux only:** Also uncomment:

```yaml
  extra_hosts:
    - "host.docker.internal:host-gateway"
```

### 3. Restart the Proxy

```bash
docker compose up -d proxy
```

## Traffic Flow

```
┌─────────┐     ┌───────────────┐     ┌────────────┐     ┌──────────┐
│  Agent  │────▶│   Tollbooth   │────▶│ Your Proxy │────▶│ Internet │
│         │     │  (mitmproxy)  │     │   (Burp)   │     │          │
└─────────┘     └───────────────┘     └────────────┘     └──────────┘
                      │                      │
                      ▼                      ▼
                 Tollbooth UI           Burp Suite UI
```

## Notes

- `--ssl-insecure` is required because the upstream proxy also does SSL interception
- Traffic appears decrypted in both tools
- You can still use all Tollbooth features (intercept, rules, etc.)

## Troubleshooting

### Connection Refused

Ensure your upstream proxy is:

1. Running and listening on the correct port
2. Bound to all interfaces (not just localhost)
3. Accepting connections from Docker

### Certificate Errors

The `--ssl-insecure` flag should handle most cases. If you still see errors:

1. Import Tollbooth's CA cert into your upstream proxy
2. Or configure the upstream proxy to not verify certificates
