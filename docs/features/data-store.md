# Data Store

File-based storage for mock requests and responses that can be served by rules.

## Overview

The Data Store holds HTTP requests and responses that you can:

- Serve automatically via rules
- Edit and version
- Transform with LLM
- Import/export as JSON

Data persists in `tollbooth-data/store/`.

## Tabs

| Tab | Contents |
|-----|----------|
| **Responses** | Stored HTTP responses (status, headers, body) |
| **Requests** | Stored HTTP requests (method, URL, headers, body) |

## Creating Entries

### From Traffic View

1. Find the traffic you want to save
2. Click **Save to Datastore**
3. Choose Request or Response
4. Enter a descriptive key

### From Intercept Queue

1. Intercept a request/response
2. Optionally edit it
3. Click **Save to Datastore**

### Manually

1. Click **New** in Data Store view
2. Fill in the details
3. Save

## Entry Fields

### Response

| Field | Description |
|-------|-------------|
| Key | Unique identifier |
| Description | What this response is for |
| Status Code | HTTP status (200, 404, 500...) |
| Headers | Response headers |
| Body | Response content |

### Request

| Field | Description |
|-------|-------------|
| Key | Unique identifier |
| Description | What this request is for |
| Method | HTTP method |
| URL | Target URL |
| Headers | Request headers |
| Body | Request content |

## Short IDs

Entries get permanent short IDs for easy reference:

- Responses: `ds1`, `ds2`, `ds3`...
- Requests: `rq1`, `rq2`, `rq3`...

## Usage Tracking

Each entry shows:

- Badge with count of rules referencing it
- "Used by" section listing rule names
- Warning before deleting entries in use

## Actions

| Action | Description |
|--------|-------------|
| Edit | Modify any field |
| Duplicate | Create a copy with new key |
| Delete | Remove (warns if used by rules) |
| Transform | Use LLM to modify content |

## LLM Transform

Transform entries using natural language:

1. Select an entry
2. Click **Transform**
3. Describe the transformation (e.g., "Change all user IDs to random UUIDs")
4. Review and save

Requires LLM settings configured in Settings view.

## Import/Export

### Export

Download entries as JSON for backup or sharing.

### Import

Load entries from JSON file.

## Using in Rules

1. Create a rule with **Serve from Data Store** action
2. Select the entry from the dropdown
3. Configure selection mode (for responses):
   - Single, Round Robin, Random, or Sequential
4. Enable Rules Mode

Traffic matching the rule receives your stored content instead of going to the real API.
