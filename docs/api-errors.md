# API Error Codes Documentation

This document describes the structured error codes used by the reddit-cluster-map API.

## Error Response Format

All API errors return a consistent JSON structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "field": "additional context"
    },
    "request_id": "unique-request-identifier"
  }
}
```

### Fields

- **code**: Machine-readable error code (see categories below)
- **message**: Human-readable error message describing what went wrong
- **details** (optional): Additional context about the error (e.g., which field is invalid)
- **request_id** (optional): Unique request identifier for debugging and tracing

## Error Code Categories

The API defines 28 error codes across 8 categories:
- AUTH_ (5 codes)
- GRAPH_ (4 codes)
- CRAWL_ (4 codes)
- SEARCH_ (3 codes)
- SYSTEM_ (4 codes)
- VALIDATION_ (4 codes)
- RESOURCE_ (2 codes)
- RATE_LIMIT_ (2 codes)

### Authentication Errors (AUTH_*)

Errors related to authentication and authorization.

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AUTH_MISSING` | 401 | Authentication credentials are missing |
| `AUTH_INVALID` | 401 | Authentication credentials are invalid |
| `AUTH_FORBIDDEN` | 403 | User does not have permission to access the resource |
| `AUTH_OAUTH_NOT_CONFIGURED` | 503 | OAuth is not configured on the server |
| `AUTH_OAUTH_FAILED` | 502 | OAuth authentication failed |

**Example:**
```json
{
  "error": {
    "code": "AUTH_INVALID",
    "message": "Invalid authentication credentials",
    "request_id": "req-123abc"
  }
}
```

**Client Handling:**
- `AUTH_MISSING`, `AUTH_INVALID`: Redirect to login page
- `AUTH_FORBIDDEN`: Show "access denied" message
- `AUTH_OAUTH_NOT_CONFIGURED`, `AUTH_OAUTH_FAILED`: Show error and suggest contacting support

---

### Graph Errors (GRAPH_*)

Errors related to graph queries and data processing.

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `GRAPH_TIMEOUT` | 408 | Graph query exceeded timeout limit |
| `GRAPH_QUERY_FAILED` | 500 | Graph query failed (database error) |
| `GRAPH_NO_DATA` | 404 | No graph data available |
| `GRAPH_INVALID_PARAMS` | 400 | Invalid query parameters provided |

**Example:**
```json
{
  "error": {
    "code": "GRAPH_TIMEOUT",
    "message": "Graph query timeout - dataset may be too large. Try reducing max_nodes or max_links parameters.",
    "request_id": "req-456def"
  }
}
```

**Client Handling:**
- `GRAPH_TIMEOUT`: Suggest reducing `max_nodes` or `max_links` parameters
- `GRAPH_QUERY_FAILED`: Retry with exponential backoff
- `GRAPH_NO_DATA`: Show empty state UI
- `GRAPH_INVALID_PARAMS`: Validate parameters before sending request

---

### Crawl Errors (CRAWL_*)

Errors related to Reddit crawling operations.

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `CRAWL_INVALID_SUBREDDIT` | 400 | Invalid subreddit name provided |
| `CRAWL_QUEUE_FAILED` | 500 | Failed to queue crawl job |
| `CRAWL_RATE_LIMITED` | 429 | Rate limit exceeded for crawl requests |
| `CRAWL_NOT_FOUND` | 404 | Crawl job not found |

**Example:**
```json
{
  "error": {
    "code": "CRAWL_INVALID_SUBREDDIT",
    "message": "Invalid subreddit name",
    "details": {
      "subreddit": "invalid$name"
    },
    "request_id": "req-789ghi"
  }
}
```

**Client Handling:**
- `CRAWL_INVALID_SUBREDDIT`: Show validation error on form
- `CRAWL_QUEUE_FAILED`: Retry operation
- `CRAWL_RATE_LIMITED`: Show rate limit message with retry timer
- `CRAWL_NOT_FOUND`: Remove from UI

---

### Search Errors (SEARCH_*)

Errors related to search operations.

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `SEARCH_INVALID_QUERY` | 400 | Invalid search query provided |
| `SEARCH_TIMEOUT` | 408 | Search query timed out |
| `SEARCH_FAILED` | 500 | Search query failed |

**Example:**
```json
{
  "error": {
    "code": "SEARCH_INVALID_QUERY",
    "message": "node parameter is required",
    "request_id": "req-012jkl"
  }
}
```

**Client Handling:**
- `SEARCH_INVALID_QUERY`: Show validation error
- `SEARCH_TIMEOUT`: Suggest more specific query
- `SEARCH_FAILED`: Retry with exponential backoff

---

### System Errors (SYSTEM_*)

General system and server errors.

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `SYSTEM_INTERNAL` | 500 | Internal server error |
| `SYSTEM_DATABASE` | 500 | Database error |
| `SYSTEM_UNAVAILABLE` | 503 | Service temporarily unavailable |
| `SYSTEM_TIMEOUT` | 408 | Request timeout |

**Example:**
```json
{
  "error": {
    "code": "SYSTEM_DATABASE",
    "message": "Database error",
    "request_id": "req-345mno"
  }
}
```

**Client Handling:**
- All system errors: Retry with exponential backoff
- Show generic error message to user
- Include request_id in error reports

---

### Validation Errors (VALIDATION_*)

Request validation errors.

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_INVALID_JSON` | 400 | Invalid JSON request body |
| `VALIDATION_INVALID_FORMAT` | 400 | Invalid request format |
| `VALIDATION_MISSING_FIELD` | 400 | Required field is missing |
| `VALIDATION_INVALID_VALUE` | 400 | Invalid value for a field |

**Example:**
```json
{
  "error": {
    "code": "VALIDATION_MISSING_FIELD",
    "message": "Missing required field: username",
    "details": {
      "field": "username"
    },
    "request_id": "req-678pqr"
  }
}
```

**Client Handling:**
- Show field-level validation errors
- Highlight invalid fields in forms
- Prevent submission until valid

---

### Resource Errors (RESOURCE_*)

Resource-related errors.

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `RESOURCE_NOT_FOUND` | 404 | Requested resource not found |
| `RESOURCE_CONFLICT` | 409 | Resource conflict |

**Example:**
```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "community not found",
    "details": {
      "resource_type": "community"
    },
    "request_id": "req-901stu"
  }
}
```

**Client Handling:**
- `RESOURCE_NOT_FOUND`: Show 404 page or remove from UI
- `RESOURCE_CONFLICT`: Show conflict message and refresh data

---

### Rate Limit Errors (RATE_LIMIT_*)

Rate limiting errors.

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `RATE_LIMIT_GLOBAL` | 429 | Global rate limit exceeded |
| `RATE_LIMIT_IP` | 429 | IP-based rate limit exceeded |

**Example:**
```json
{
  "error": {
    "code": "RATE_LIMIT_GLOBAL",
    "message": "Rate limit exceeded - too many requests globally",
    "request_id": "req-234vwx"
  }
}
```

**Client Handling:**
- Show rate limit message
- Implement retry with exponential backoff
- Respect `Retry-After` header if present
- Consider showing countdown timer

---

## HTTP Status Code Mapping

| Status | Used For |
|--------|----------|
| 400 | Bad Request - validation errors, invalid parameters |
| 401 | Unauthorized - missing or invalid authentication |
| 403 | Forbidden - insufficient permissions |
| 404 | Not Found - resource not found |
| 408 | Request Timeout - query timeout |
| 409 | Conflict - resource conflict |
| 429 | Too Many Requests - rate limiting |
| 500 | Internal Server Error - server errors, database errors |
| 502 | Bad Gateway - external service errors (OAuth) |
| 503 | Service Unavailable - service not configured or down |

---

## Client Implementation Guide

### Parsing Errors

```typescript
interface APIError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  request_id?: string;
}

interface ErrorResponse {
  error: APIError;
}

async function handleAPIResponse(response: Response) {
  if (!response.ok) {
    const errorData: ErrorResponse = await response.json();
    // Handle structured error
    console.error(`Error ${errorData.error.code}: ${errorData.error.message}`);
    if (errorData.error.request_id) {
      console.error(`Request ID: ${errorData.error.request_id}`);
    }
  }
}
```

### Error Display

```typescript
function getErrorSeverity(code: string): 'error' | 'warning' | 'info' {
  if (code.startsWith('RATE_LIMIT_')) return 'warning';
  if (code.includes('TIMEOUT')) return 'warning';
  return 'error';
}

function isRetryable(code: string): boolean {
  return (
    code.startsWith('RATE_LIMIT_') ||
    code.includes('TIMEOUT') ||
    code === 'SYSTEM_UNAVAILABLE' ||
    code === 'SYSTEM_INTERNAL'
  );
}
```

### Retry Logic

```typescript
async function fetchWithRetry(url: string, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        const error: ErrorResponse = await response.json();
        if (!isRetryable(error.error.code)) {
          throw new Error(error.error.message);
        }
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        continue;
      }
      return response;
    } catch (err) {
      if (i === maxRetries - 1) throw err;
    }
  }
}
```

---

## Debugging

When reporting errors, always include the `request_id` field. This allows server-side tracing and debugging.

Example error report:
```
Error: GRAPH_TIMEOUT
Message: Graph query timeout - dataset may be too large
Request ID: 3286ed2424b38dd5d68326071e5e62c1
```

---

## Migration from Legacy Errors

Old error format:
```json
{"error": "Graph query timeout"}
```

New error format:
```json
{
  "error": {
    "code": "GRAPH_TIMEOUT",
    "message": "Graph query timeout - dataset may be too large. Try reducing max_nodes or max_links parameters.",
    "request_id": "req-abc123"
  }
}
```

The client should handle both formats during the transition period.
