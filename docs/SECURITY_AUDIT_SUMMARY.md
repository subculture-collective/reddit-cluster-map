# Security Audit and Penetration Testing - Quick Reference

This document provides a quick reference for security auditing and penetration testing procedures for the Reddit Cluster Map project.

## Quick Start

### Running Automated Security Tests

```bash
# Run all security tests
./scripts/security-test.sh

# Run specific test suite
./scripts/security-test.sh --suite auth      # Authentication tests
./scripts/security-test.sh --suite input     # Input validation tests
./scripts/security-test.sh --suite rate-limit # Rate limiting tests
./scripts/security-test.sh --suite headers   # Security headers tests
./scripts/security-test.sh --suite cors      # CORS tests
./scripts/security-test.sh --suite info      # Information disclosure tests
./scripts/security-test.sh --suite api       # API endpoint tests
```

### Environment Configuration

```bash
# Set API URL (default: http://localhost:8080)
export API_URL="http://localhost:8080"

# Set admin token for testing
export ADMIN_API_TOKEN="your-test-token"

# Configure rate limit test parameters (optional)
export RATE_LIMIT_TEST_COUNT=20
export RATE_LIMIT_TEST_DELAY=0.05
```

## Documentation Overview

### Main Documents

1. **[SECURITY_AUDIT.md](SECURITY_AUDIT.md)** - Comprehensive security audit guide
   - Security audit checklist
   - Penetration testing procedures
   - Automated and manual testing methods
   - Vulnerability assessment guidelines
   - Reporting and remediation workflows

2. **[PENETRATION_TESTING_CHECKLIST.md](PENETRATION_TESTING_CHECKLIST.md)** - Detailed penetration testing checklist
   - Pre-testing preparation
   - Information gathering
   - Authentication & session management testing
   - Authorization & access control testing
   - Input validation & injection testing
   - Business logic testing
   - API security testing
   - Infrastructure security testing

3. **[SECURITY_AUDIT_REPORT_TEMPLATE.md](SECURITY_AUDIT_REPORT_TEMPLATE.md)** - Standardized report template
   - Executive summary format
   - Detailed finding structure
   - Risk assessment framework
   - Remediation tracking

4. **[SECURITY_AUDIT_EXAMPLE.md](SECURITY_AUDIT_EXAMPLE.md)** - Example audit report
   - Real audit results
   - Finding documentation examples
   - Risk assessment examples

## Common Security Tests

### Authentication Tests

```bash
# Test admin endpoint without token
curl -v http://localhost:8080/api/admin/services

# Test admin endpoint with invalid token
curl -v -H "Authorization: Bearer invalid-token" \
  http://localhost:8080/api/admin/services

# Test admin endpoint with valid token
curl -v -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  http://localhost:8080/api/admin/services
```

### Input Validation Tests

```bash
# Test SQL injection
curl "http://localhost:8080/api/graph?max_nodes=' OR '1'='1"

# Test XSS
curl "http://localhost:8080/api/graph?test=<script>alert('XSS')</script>"

# Test path traversal
curl -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  "http://localhost:8080/api/admin/backups/../../../etc/passwd"
```

### Rate Limiting Tests

```bash
# Test rate limiting with rapid requests
for i in {1..100}; do
  curl -w "%{http_code}\n" http://localhost:8080/api/graph
done | grep -c 429
```

### Security Headers Tests

```bash
# Check security headers
curl -I http://localhost:8080/api/graph
```

## CI/CD Integration

Security tests run automatically in GitHub Actions:

- **On every push** to main/develop branches
- **On every pull request** to main/develop
- **Daily** at 02:00 UTC (scheduled scan)
- **Manual trigger** via workflow_dispatch

### Workflows

1. **`.github/workflows/security.yml`** - Comprehensive security scanning
   - CodeQL analysis (Go and JavaScript/TypeScript)
   - Dependency vulnerability scanning (govulncheck, npm audit)
   - Secret scanning (TruffleHog)
   - Container security (Trivy)

2. **`.github/workflows/ci.yml`** - Continuous integration with security gates
   - Build and test
   - Security checks (govulncheck, npm audit)
   - Fails on high/critical vulnerabilities

## Security Testing Tools

### Included in Repository

1. **security-test.sh** - Automated security testing script
   - Authentication & authorization tests
   - Input validation tests
   - Rate limiting tests
   - Security headers tests
   - CORS tests
   - Information disclosure tests
   - API endpoint tests

2. **security_test.go** - Go test suite for security validation
   - SQL injection protection
   - XSS protection
   - Path traversal protection
   - Input validation
   - Rate limit bypass attempts
   - Authentication bypass attempts
   - CORS bypass attempts
   - And more...

### External Tools (Recommended)

- **Burp Suite** - Web vulnerability scanner
- **OWASP ZAP** - Security testing tool
- **nmap** - Network scanner
- **sqlmap** - SQL injection testing
- **nikto** - Web server scanner

## Security Assessment Schedule

### Weekly
- Review Dependabot alerts
- Check security workflow results
- Review access logs for anomalies

### Monthly
- Run automated security test script (`./scripts/security-test.sh`)
- Review and rotate credentials (if needed)
- Update security documentation

### Quarterly
- Comprehensive manual security audit (see SECURITY_AUDIT.md)
- External penetration test (recommended)
- Security training for team
- Review and update security policies

### Annually
- Third-party security assessment
- Compliance audit
- Incident response plan review
- Security architecture review

## Current Security Status

### Latest Audit Results (2025-11-01)

- **CodeQL Analysis:** ✅ 0 alerts
- **Dependency Scanning:** ✅ 0 vulnerabilities
- **Container Security:** ✅ 0 critical/high vulnerabilities
- **Secret Scanning:** ✅ No secrets found
- **Overall Security Posture:** Good

### Security Controls

| Control | Status | Effectiveness |
|---------|--------|---------------|
| Rate Limiting | ✅ Active | High |
| CORS | ✅ Active | High |
| Security Headers | ✅ Active | High |
| Admin Authentication | ✅ Active | High |
| Input Validation | ✅ Active | High |
| Dependency Scanning | ✅ Active | High |
| Secret Masking | ✅ Active | High |
| OAuth Token Management | ✅ Active | High |

### Known Low-Priority Findings

1. **Metrics endpoint public** - Consider protecting in production
2. **Token complexity validation** - Add runtime warnings for weak tokens
3. **Audit logging** - Implement comprehensive logging for admin actions

See [SECURITY_AUDIT_EXAMPLE.md](SECURITY_AUDIT_EXAMPLE.md) for detailed findings.

## Quick Links

### Security Documentation
- [Security Features](SECURITY.md)
- [Security Audit Guide](SECURITY_AUDIT.md)
- [Penetration Testing Checklist](PENETRATION_TESTING_CHECKLIST.md)
- [Security Audit Report Template](SECURITY_AUDIT_REPORT_TEMPLATE.md)
- [Security Audit Example](SECURITY_AUDIT_EXAMPLE.md)

### External Resources
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)

### GitHub Security
- [Security Advisories](https://github.com/subculture-collective/reddit-cluster-map/security/advisories)
- [Security Policy](https://github.com/subculture-collective/reddit-cluster-map/security/policy)
- [Dependabot Alerts](https://github.com/subculture-collective/reddit-cluster-map/security/dependabot)

## Contact

For security issues:
- Create a [private security advisory](https://github.com/subculture-collective/reddit-cluster-map/security/advisories/new)
- Or open a confidential issue in the repository

---

**Last Updated:** 2025-11-01  
**Next Review:** 2026-02-01
