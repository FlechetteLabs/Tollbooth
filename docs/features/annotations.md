# Annotations

Add notes and tags to traffic flows for organization and reference.

## Creating Annotations

1. Click the annotation icon on any traffic flow
2. Fill in the fields
3. Save

## Fields

| Field | Description |
|-------|-------------|
| Title | Short summary (like a git commit subject) |
| Body | Detailed notes (supports markdown) |
| Tags | Categorization labels |

## Tags

### Format

Tags support hierarchical structure with colons:

```
refusal:soft
refusal:hard
test:regression
test:unit
bug:api
bug:frontend
```

### Autocomplete

Start typing to see suggestions from existing tags.

### Filtering

Filter traffic by tags in the Traffic view:

- Use the tag filter dropdown
- Or use advanced filters with tag conditions

## Persistence

Annotations are stored inline with traffic flows in `tollbooth-data/traffic/`.

## Use Cases

### Mark Interesting Requests

Tag requests worth investigating later:

- `investigate`
- `bug:potential`
- `interesting`

### Categorize Refusals

When reviewing refusals:

- `refusal:false-positive`
- `refusal:valid`
- `refusal:needs-review`

### Test Documentation

Document test scenarios:

- Title: "Rate limit test - 429 response"
- Body: "Testing agent behavior when API returns rate limit"
- Tags: `test:rate-limit`, `expected:retry`

### Track Issues

Link traffic to issues:

- `issue:123`
- `pr:456`
