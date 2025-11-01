# Security Features

This document describes the security features implemented in the reddit-cluster-map API.

## Overview

The API includes multiple layers of security protection:

1. **Rate Limiting** - Prevents abuse by limiting requests globally and per IP
2. **CORS (Cross-Origin Resource Sharing)** - Controls which origins can access the API
3. **Security Headers** - Adds HTTP headers to protect against common attacks
4. **Input Validation** - Sanitizes and validates all user input
5. **Admin Authentication** - Protects administrative endpoints with bearer token auth
6. **Secret Management** - Secure handling of sensitive credentials
7. **Dependency Scanning** - Automated vulnerability detection in dependencies

## Secret Management

### Environment Variables

All sensitive configuration values (credentials, tokens, API keys) MUST be stored in environment variables and NEVER committed to source control.

#### Required Secrets

1. **Reddit OAuth Credentials**
   - `REDDIT_CLIENT_ID`: Reddit API client ID
   - `REDDIT_CLIENT_SECRET`: Reddit API client secret
   - Obtain from: https://www.reddit.com/prefs/apps

2. **Database Credentials**
   - `POSTGRES_USER`: Database username
   - `POSTGRES_PASSWORD`: Database password (min 16 chars in production)
   - `POSTGRES_DB`: Database name
   - `DATABASE_URL`: Full connection string

3. **Admin API Token**
   - `ADMIN_API_TOKEN`: Bearer token for admin endpoints
   - Generate: `openssl rand -base64 32`
   - Minimum 32 characters

### Best Practices

#### For Development

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Replace placeholder values with real credentials
3. Ensure `.env` is in `.gitignore` (it is by default)

#### For Production

Choose a secrets management solution based on your infrastructure:

**Option 1: Docker Secrets (Docker Swarm)**
```yaml
services:
  api:
    secrets:
      - reddit_client_id
      - reddit_client_secret
      - postgres_password
      - admin_api_token
```

**Option 2: Kubernetes Secrets**
```bash
kubectl create secret generic reddit-cluster-secrets \
  --from-literal=reddit-client-id=xxx \
  --from-literal=reddit-client-secret=xxx \
  --from-literal=postgres-password=xxx \
  --from-literal=admin-api-token=xxx
```

**Option 3: Cloud Provider Secrets Manager**
- AWS Secrets Manager
- Google Cloud Secret Manager
- Azure Key Vault
- HashiCorp Vault

**Option 4: Environment Variables (minimal setup)**
- Set via hosting platform (Heroku, Fly.io, etc.)
- Use deployment scripts with secure variable injection
- Never log or expose in error messages

### Rotation Policy

Rotate secrets regularly:
- **Admin API Token**: Every 90 days
- **Database Password**: Every 180 days
- **Reddit OAuth Secrets**: When compromised or annually

## Admin Authentication

Admin endpoints are protected by bearer token authentication:

```bash
# Example: Access admin endpoint
curl -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  http://localhost:8000/api/admin/services
```

Protected endpoints:
- `POST /api/admin/services` - Toggle background services
- `GET /api/admin/services` - Get service status
- `GET /api/admin/backups` - List database backups
- `GET /api/admin/backups/{name}` - Download backup file

### Implementation

The admin authentication middleware is in `backend/internal/api/routes.go`:

```go
adminOnly := func(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if cfg.AdminAPIToken == "" {
            http.Error(w, "admin token not configured", http.StatusServiceUnavailable)
            return
        }
        auth := r.Header.Get("Authorization")
        const prefix = "Bearer "
        if len(auth) <= len(prefix) || auth[:len(prefix)] != prefix || 
           auth[len(prefix):] != cfg.AdminAPIToken {
            http.Error(w, "unauthorized", http.StatusUnauthorized)
            return
        }
        next.ServeHTTP(w, r)
    })
}
```

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

## Dependency Security

### Automated Scanning

Dependencies are automatically scanned by:

1. **Dependabot** (`.github/dependabot.yml`)
   - Checks Go modules, npm packages, GitHub Actions, Docker images
   - Creates PRs for security updates immediately
   - Groups minor/patch updates to reduce noise
   - Runs weekly on Monday at 09:00 UTC

2. **Security Workflow** (`.github/workflows/security.yml`)
   - CodeQL analysis for Go and JavaScript/TypeScript
   - Go vulnerability scanning with `govulncheck`
   - npm audit for npm vulnerabilities
   - Docker image scanning with Trivy
   - Secret scanning with TruffleHog
   - Runs on push, PR, and daily at 02:00 UTC

3. **CI Workflow** (`.github/workflows/ci.yml`)
   - Vulnerability checks integrated into CI pipeline
   - Fails build on high/critical vulnerabilities

### Manual Checks

#### Backend (Go)

```bash
cd backend

# Check for vulnerabilities
go install golang.org/x/vuln/cmd/govulncheck@latest
govulncheck ./...

# Verify module integrity
go mod verify

# Update dependencies
go get -u ./...
go mod tidy
```

#### Frontend (npm)

```bash
cd frontend

# Check for vulnerabilities
npm audit

# Fix automatically fixable issues
npm audit fix

# Update dependencies
npm update
```

### Dependency Update Policy

- **Critical vulnerabilities**: Fix immediately
- **High vulnerabilities**: Fix within 7 days
- **Medium vulnerabilities**: Fix within 30 days
- **Low vulnerabilities**: Fix within 90 days

## Production Security Checklist

### Pre-Deployment Checklist

- [ ] All secrets are stored in a secrets manager (not in code or .env files)
- [ ] `ADMIN_API_TOKEN` is set to a strong random value (32+ chars)
- [ ] Database password is strong (16+ chars, mixed case, numbers, symbols)
- [ ] `CORS_ALLOWED_ORIGINS` is set to your actual frontend domain(s)
- [ ] Rate limiting is enabled (`ENABLE_RATE_LIMIT=true`)
- [ ] HTTPS/TLS is configured and enforced
- [ ] `ENV=production` is set for proper error handling
- [ ] All dependencies are up-to-date and scanned
- [ ] Security scanning workflow passes

### Security Monitoring

1. **Enable observability features**:
   ```bash
   OTEL_ENABLED=true
   OTEL_EXPORTER_OTLP_ENDPOINT=your-collector:4318
   SENTRY_DSN=your-sentry-dsn
   SENTRY_ENVIRONMENT=production
   ```

2. **Monitor security events**:
   - Failed authentication attempts
   - Rate limit violations
   - Database connection errors
   - Unusual API usage patterns

3. **Regular security audits**:
   - Review access logs weekly
   - Audit admin API usage monthly
   - Run penetration tests quarterly
   - Review and rotate secrets quarterly

## Incident Response

If a security incident occurs:

1. **Immediately**:
   - Rotate all compromised credentials
   - Review access logs for unauthorized access
   - Block malicious IPs at firewall level

2. **Within 24 hours**:
   - Investigate root cause
   - Patch vulnerabilities
   - Update security documentation

3. **Within 7 days**:
   - Implement additional safeguards
   - Conduct post-mortem review
   - Update incident response procedures

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

## Security Auditing and Penetration Testing

### Documentation

For comprehensive security auditing and penetration testing guidance, see:

- **[Security Audit Guide](SECURITY_AUDIT.md)** - Complete security audit procedures, testing methodologies, and vulnerability assessment
- **[Penetration Testing Checklist](PENETRATION_TESTING_CHECKLIST.md)** - Detailed checklist for conducting penetration tests
- **[Security Audit Report Template](SECURITY_AUDIT_REPORT_TEMPLATE.md)** - Template for documenting security audit findings

### Automated Security Testing

Run automated security tests using the provided script:

```bash
# Run all security tests
./scripts/security-test.sh

# Run specific test suite
./scripts/security-test.sh --suite auth
./scripts/security-test.sh --suite input
./scripts/security-test.sh --suite rate-limit
./scripts/security-test.sh --suite headers
```

### Regular Security Assessment Schedule

**Weekly:**
- Review Dependabot alerts
- Check security workflow results
- Review access logs for anomalies

**Monthly:**
- Run automated security test script
- Review and rotate credentials
- Update security documentation

**Quarterly:**
- Comprehensive manual security audit
- External penetration test (recommended)
- Security training for team
- Review and update security policies

**Annually:**
- Third-party security assessment
- Compliance audit
- Incident response plan review
- Security architecture review

## Additional Resources

### Security Documentation
- [Security Audit Guide](SECURITY_AUDIT.md)
- [Penetration Testing Checklist](PENETRATION_TESTING_CHECKLIST.md)
- [Security Audit Report Template](SECURITY_AUDIT_REPORT_TEMPLATE.md)

### External Resources
- [OWASP Security Headers](https://owasp.org/www-project-secure-headers/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [MDN CORS Guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [Rate Limiting Best Practices](https://cloud.google.com/architecture/rate-limiting-strategies-techniques)
- [Content Security Policy Reference](https://content-security-policy.com/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
