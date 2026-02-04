# Data Persistence

Tollbooth automatically persists data across container restarts when `/data` is mounted.

## Quick Start

By default, `docker-compose.yml` mounts `./tollbooth-data` to `/data`:

```yaml
volumes:
  - ./tollbooth-data:/data
```

Data persists automatically. No configuration required.

## Directory Structure

```
tollbooth-data/
├── config/
│   ├── rules.json           # Traffic rules
│   ├── settings.json        # Application settings
│   ├── presets.json         # Filter presets
│   ├── templates.json       # Prompt templates
│   ├── refusal-rules.json   # Refusal detection rules
│   └── message-filters.json # Message display filters
├── traffic/
│   └── <flow_id>.json       # One file per traffic flow
├── conversations/
│   └── <conversation_id>.json  # One file per conversation
├── replay/
│   ├── <variant_id>.json    # Replay variants
│   └── _names.json          # Replay names
└── store/
    ├── responses/           # Stored responses
    └── requests/            # Stored requests
```

## Controlling What Persists

Disable specific categories with environment variables:

```yaml
environment:
  - TOLLBOOTH_PERSIST_TRAFFIC=false        # Don't save traffic
  - TOLLBOOTH_PERSIST_CONVERSATIONS=false  # Don't save conversations
  - TOLLBOOTH_PERSIST_REPLAY=false         # Don't save replay variants
  - TOLLBOOTH_PERSIST_RULES=false          # Don't save rules
  - TOLLBOOTH_PERSIST_CONFIG=false         # Don't save config files
  - TOLLBOOTH_PERSIST_STORE=false          # Don't save datastore
```

All default to `true` when `/data` is mounted.

## Memory-Only Mode

To run without persistence, remove the `/data` mount:

```yaml
volumes:
  - ./backend/src:/app/src:ro
  - ./backend/models:/app/models
  # - ./tollbooth-data:/data  # Commented out
```

The backend will log:

```
[Persistence] No data directory at /data - running in memory-only mode
```

## Traffic Storage Format

Each traffic flow is stored as a separate JSON file:

```json
{
  "flow_id": "abc123",
  "request": {
    "method": "POST",
    "url": "https://api.anthropic.com/v1/messages",
    "headers": {},
    "content": "..."
  },
  "response": {
    "status_code": 200,
    "headers": {},
    "content": "..."
  },
  "timestamp": 1234567890,
  "annotation": {
    "title": "Test request",
    "body": "Notes here",
    "tags": ["test"]
  }
}
```

Benefits:

- Human-readable
- Easy to inspect and edit
- Simple backup (just copy the folder)
- Git-friendly (though not recommended for large traffic volumes)

## Backup and Restore

### Backup

```bash
cp -r tollbooth-data/ tollbooth-backup/
```

### Restore

```bash
rm -rf tollbooth-data/
cp -r tollbooth-backup/ tollbooth-data/
docker compose restart backend
```

## Gitignore

The default `.gitignore` excludes all contents except `.gitkeep`:

```gitignore
tollbooth-data/*
!tollbooth-data/.gitkeep
```

This keeps the directory structure in git without committing data.
