# Security Features

This document describes the security features implemented in the reddit-cluster-map API.

## Overview

The API includes multiple layers of security protection:

1. **Rate Limiting** - Prevents abuse by limiting requests globally and per IP
2. **CORS (Cross-Origin Resource Sharing)** - Controls which origins can access the API
3. **Security Headers** - Adds HTTP headers to protect against common attacks
4. **Input Validation** - Sanitizes and validates all user input

## Rate Limiting

### Global Rate Limiting

Limits the total number of requests the API can handle globally across all clients. This prevents server overload.

**Configuration:**
- `RATE_LIMIT_GLOBAL` - Requests per second (default: 100)
- `RATE_LIMIT_GLOBAL_BURST` - Maximum burst size (default: 200)

### Per-IP Rate Limiting

Limits requests per individual IP address to prevent abuse from single sources.

**Configuration:**
- `RATE_LIMIT_PER_IP` - Requests per second per IP (default: 10)
- `RATE_LIMIT_PER_IP_BURST` - Burst size per IP (default: 20)
- `ENABLE_RATE_LIMIT` - Enable/disable rate limiting (default: true)

### How It Works

Rate limiting uses the token bucket algorithm:
- Requests consume tokens from a bucket
- Tokens refill at the configured rate
- Burst allows temporary spikes
- When bucket is empty, requests are denied with HTTP 429

The middleware is **proxy-aware** and extracts the real client IP from:
1. `X-Forwarded-For` header (first IP)
2. `X-Real-IP` header
3. `RemoteAddr` (fallback)

### Response

When rate limited, the API returns:
```json
{
  "error": "Rate limit exceeded - too many requests globally"
}
```
or
```json
{
  "error": "Rate limit exceeded - too many requests from your IP"
}
```

HTTP Status: `429 Too Many Requests`

## CORS (Cross-Origin Resource Sharing)

Controls which web origins can access the API from browsers.

### Configuration

**Environment Variable:**
- `CORS_ALLOWED_ORIGINS` - Comma-separated list of allowed origins

**Default:**
```
http://localhost:5173,http://localhost:3000
```

**Examples:**
```bash
# Development
CORS_ALLOWED_ORIGINS="http://localhost:5173,http://localhost:3000"

# Production - exact origins
CORS_ALLOWED_ORIGINS="https://example.com,https://app.example.com"

# Wildcard subdomain (matches any subdomain ending in .example.com)
# Note: *.example.com matches api.example.com, app.example.com, etc.
CORS_ALLOWED_ORIGINS="*.example.com"

# Allow all (NOT RECOMMENDED for production)
CORS_ALLOWED_ORIGINS="*"
```

**Note on Wildcard Subdomains**: The wildcard pattern `*.example.com` uses suffix matching. It will match any origin ending with `.example.com`, including `api.example.com`, `app.example.com`, etc. Use this carefully as it allows all subdomains.

### Supported Features

- **Preflight Requests**: Handles OPTIONS requests
- **Credentials**: Allows cookies and authentication headers
- **Custom Headers**: Supports Authorization, Content-Type, etc.
- **Max Age**: Caches preflight responses for 5 minutes

### Headers Set

**For allowed origins:**
- `Access-Control-Allow-Origin: <origin>`
- `Access-Control-Allow-Credentials: true`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Accept, Authorization, Content-Type, X-CSRF-Token`
- `Access-Control-Expose-Headers: Link`
- `Access-Control-Max-Age: 300`

## Security Headers

Automatically adds security headers to all responses to protect against common web attacks.

### Headers Applied

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Content-Type-Options` | `nosniff` | Prevents MIME type sniffing |
| `X-Frame-Options` | `DENY` | Prevents clickjacking |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Controls referrer information |
| `Content-Security-Policy` | (see below) | Restricts resource loading |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` | Disables browser features |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Enforces HTTPS (only with TLS) |

**Note**: The deprecated `X-XSS-Protection` header is not set. Modern browsers rely on Content Security Policy for XSS protection.

### Content Security Policy (CSP)

Default policy:
```
default-src 'self'; 
script-src 'self'; 
style-src 'self' 'unsafe-inline'; 
img-src 'self' data: https:; 
font-src 'self'; 
connect-src 'self'; 
frame-ancestors 'none'
```

This policy:
- Allows resources only from the same origin by default
- Permits scripts only from same origin
- Allows inline styles (needed for some frameworks)
- Allows images from same origin, data URIs, and HTTPS
- Prevents embedding in iframes

## Input Validation

All user input is validated and sanitized to prevent injection attacks.

### Features

1. **Request Body Size Limiting**
   - Maximum body size: 10MB
   - Prevents memory exhaustion attacks

2. **JSON Validation**
   - Ensures Content-Type is application/json
   - Validates JSON structure before processing

3. **String Sanitization**
   - Trims whitespace
   - Enforces maximum lengths
   - Validates UTF-8 encoding

4. **Subreddit Name Validation**
   - Maximum 21 characters
   - Only alphanumeric and underscore allowed
   - No spaces, slashes, or special characters

### Example Usage

The `/api/crawl` endpoint demonstrates input validation:

```bash
# Valid request
curl -X POST https://api.example.com/api/crawl \
  -H "Content-Type: application/json" \
  -d '{"subreddit":"golang"}'

# Invalid - special characters
curl -X POST https://api.example.com/api/crawl \
  -H "Content-Type: application/json" \
  -d '{"subreddit":"golang/test"}'
# Response: 400 Bad Request
```

## Middleware Stack Order

Middleware is applied in this order:

1. **Security Headers** - Always applied first
2. **CORS** - Handles cross-origin requests
3. **Request Body Validation** - Limits body size
4. **Rate Limiting** - Enforces request limits (if enabled)
5. **Route Handlers** - Application logic

This order ensures:
- Security headers are always present
- CORS is checked before rate limiting
- Rate limiting happens before expensive operations

## Security Best Practices

### Production Configuration

```bash
# Rate limiting - adjust based on your needs
ENABLE_RATE_LIMIT=true
RATE_LIMIT_GLOBAL=100
RATE_LIMIT_GLOBAL_BURST=200
RATE_LIMIT_PER_IP=10
RATE_LIMIT_PER_IP_BURST=20

# CORS - restrict to your domains
CORS_ALLOWED_ORIGINS="https://yourdomain.com,https://app.yourdomain.com"

# Admin token - use a strong random value
ADMIN_API_TOKEN="your-secure-random-token-here"
```

### Recommendations

1. **HTTPS Only**: Always use HTTPS in production
2. **Strong Admin Token**: Use a cryptographically random token
3. **Monitor Rate Limits**: Adjust based on legitimate traffic patterns
4. **Restrict CORS**: Only allow necessary origins
5. **Keep Dependencies Updated**: Regularly update Go and dependencies

## Testing

All security middleware includes comprehensive tests:

```bash
# Run middleware tests
cd backend
go test ./internal/middleware/... -v

# Run all tests including integration
go test ./...
```

## Disabling Security Features

For development or testing, you can disable features:

```bash
# Disable rate limiting
ENABLE_RATE_LIMIT=false

# Allow all origins (NOT for production)
CORS_ALLOWED_ORIGINS="*"
```

**⚠️ WARNING**: Never disable security features in production!

## Troubleshooting

### Rate Limit Issues

**Problem**: Legitimate requests being rate limited

**Solution**: 
- Check if you're behind a proxy/load balancer
- Ensure proxy forwards real client IP in headers
- Adjust rate limits if legitimate traffic is higher
- Monitor `X-Forwarded-For` and `X-Real-IP` headers

### CORS Issues

**Problem**: Browser shows CORS errors

**Solution**:
- Add your frontend origin to `CORS_ALLOWED_ORIGINS`
- Ensure origin matches exactly (including protocol and port)
- Check browser console for specific CORS error
- Verify preflight OPTIONS requests are allowed

### CSP Violations

**Problem**: Browser blocks resources due to CSP

**Solution**:
- Check browser console for CSP violation details
- Adjust CSP policy if needed for your frontend
- Consider using CSP report-only mode during development

## Additional Resources

- [OWASP Security Headers](https://owasp.org/www-project-secure-headers/)
- [MDN CORS Guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [Rate Limiting Best Practices](https://cloud.google.com/architecture/rate-limiting-strategies-techniques)
- [Content Security Policy Reference](https://content-security-policy.com/)
