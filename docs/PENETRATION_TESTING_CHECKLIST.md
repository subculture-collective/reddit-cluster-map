# Penetration Testing Checklist

This comprehensive checklist provides a structured approach to conducting penetration testing on the Reddit Cluster Map application. Use this checklist to ensure thorough coverage of security testing activities.

## Pre-Testing

### Planning & Preparation

- [ ] **Scope Definition**
  - [ ] Define in-scope systems and endpoints
  - [ ] Identify out-of-scope components
  - [ ] Document testing boundaries
  - [ ] Get written authorization from stakeholders

- [ ] **Legal & Authorization**
  - [ ] Obtain written permission to test
  - [ ] Review and sign testing agreement
  - [ ] Verify insurance coverage if applicable
  - [ ] Understand legal implications

- [ ] **Environment Setup**
  - [ ] Set up testing environment (preferably isolated)
  - [ ] Configure VPN/secure connection if needed
  - [ ] Install required tools
  - [ ] Prepare logging and evidence collection

- [ ] **Information Gathering**
  - [ ] Review available documentation
  - [ ] Identify application architecture
  - [ ] List all known endpoints
  - [ ] Map user roles and permissions
  - [ ] Identify technologies and versions

### Tool Preparation

- [ ] **Essential Tools Ready**
  - [ ] curl (HTTP client)
  - [ ] Burp Suite / OWASP ZAP (proxy)
  - [ ] nmap (network scanner)
  - [ ] sqlmap (SQL injection)
  - [ ] nikto (web scanner)
  - [ ] gobuster/dirb (directory enumeration)
  - [ ] Git client
  - [ ] Docker (for testing environment)

- [ ] **Optional/Advanced Tools**
  - [ ] Metasploit Framework
  - [ ] John the Ripper / Hashcat (password cracking)
  - [ ] Wireshark (packet analysis)
  - [ ] Custom scripts

---

## Information Gathering & Reconnaissance

### Passive Reconnaissance

- [ ] **Public Information**
  - [ ] Search GitHub repository for sensitive data
  - [ ] Review commit history for secrets
  - [ ] Check issue tracker for security hints
  - [ ] Review documentation for architecture details
  - [ ] Search for error messages online

- [ ] **Technology Stack**
  - [ ] Identify web server (if exposed)
  - [ ] Identify backend framework (Go)
  - [ ] Identify frontend framework (React)
  - [ ] Identify database (PostgreSQL)
  - [ ] Document all versions

### Active Reconnaissance

- [ ] **Service Discovery**
  - [ ] Scan for open ports: `nmap -sV localhost`
  - [ ] Identify running services
  - [ ] Check for unnecessary exposed services
  - [ ] Map network topology

- [ ] **Endpoint Discovery**
  - [ ] Enumerate API endpoints
  - [ ] Check robots.txt
  - [ ] Test common paths (/admin, /api, /debug)
  - [ ] Fuzz for hidden endpoints
  - [ ] Review JavaScript for API calls

- [ ] **Version Detection**
  - [ ] Check HTTP headers for version info
  - [ ] Review error messages
  - [ ] Check client-side source code
  - [ ] Look for version in responses

---

## Authentication & Session Management

### Authentication Testing

- [ ] **Credential Testing**
  - [ ] Test default credentials
  - [ ] Test weak passwords
  - [ ] Test password complexity requirements
  - [ ] Test account lockout mechanism
  - [ ] Test password reset functionality

- [ ] **Admin API Token Testing**
  - [ ] Test without token → expect 401
  - [ ] Test with invalid token → expect 401
  - [ ] Test with expired token → expect 401
  - [ ] Test with token in wrong format → expect 401
  - [ ] Test token in different header formats
  - [ ] Verify token is not logged
  - [ ] Test token length requirements

- [ ] **OAuth Token Testing**
  - [ ] Test OAuth flow
  - [ ] Test token refresh mechanism
  - [ ] Test expired token handling
  - [ ] Test token revocation
  - [ ] Test token leakage in URLs/logs

- [ ] **Brute Force Testing**
  - [ ] Test rate limiting on auth endpoints
  - [ ] Attempt credential stuffing
  - [ ] Test account enumeration
  - [ ] Verify CAPTCHA if implemented

### Session Management

- [ ] **Cookie Security** (if applicable)
  - [ ] Check for Secure flag
  - [ ] Check for HttpOnly flag
  - [ ] Check for SameSite attribute
  - [ ] Test session timeout
  - [ ] Test concurrent sessions

- [ ] **Token Management**
  - [ ] Test token storage (localStorage vs. memory)
  - [ ] Test token transmission (HTTPS only)
  - [ ] Test token expiration
  - [ ] Test token entropy/randomness

- [ ] **Session Attacks**
  - [ ] Test session fixation
  - [ ] Test session hijacking
  - [ ] Test CSRF protection
  - [ ] Test logout functionality

---

## Authorization & Access Control

### Vertical Privilege Escalation

- [ ] **User to Admin**
  - [ ] Try accessing admin endpoints without admin token
  - [ ] Try modifying requests to gain admin access
  - [ ] Test parameter manipulation for privilege escalation
  - [ ] Test forced browsing to admin pages

- [ ] **Service Control**
  - [ ] Test /api/admin/services without auth
  - [ ] Test starting/stopping services without permission
  - [ ] Test backup operations without auth

### Horizontal Privilege Escalation

- [ ] **User Data Access**
  - [ ] Test accessing other users' data
  - [ ] Test IDOR vulnerabilities
  - [ ] Test user enumeration
  - [ ] Test data modification for other users

### API Authorization

- [ ] **Endpoint Access Control**
  - [ ] List all API endpoints
  - [ ] Test each endpoint without authentication
  - [ ] Test each endpoint with wrong role
  - [ ] Verify proper authorization checks

---

## Input Validation & Injection

### SQL Injection

- [ ] **Query Parameter Injection**
  - [ ] Test: `?max_nodes=' OR '1'='1`
  - [ ] Test: `?max_nodes=1' UNION SELECT * FROM users--`
  - [ ] Test: `?id=1'; DROP TABLE users;--`
  - [ ] Test time-based: `?id=1' AND SLEEP(5)--`
  - [ ] Test boolean-based: `?id=1' AND '1'='1`

- [ ] **POST Body Injection**
  - [ ] Test JSON fields for SQL injection
  - [ ] Test subreddit parameter
  - [ ] Test filter parameters

- [ ] **Automated Testing**
  - [ ] Run sqlmap on all endpoints
  - [ ] Test blind SQL injection
  - [ ] Test second-order SQL injection

### Cross-Site Scripting (XSS)

- [ ] **Reflected XSS**
  - [ ] Test: `<script>alert('XSS')</script>`
  - [ ] Test: `<img src=x onerror=alert('XSS')>`
  - [ ] Test: `<svg onload=alert('XSS')>`
  - [ ] Test in all input fields
  - [ ] Test in URL parameters
  - [ ] Test in HTTP headers

- [ ] **Stored XSS**
  - [ ] Test subreddit names
  - [ ] Test user inputs stored in database
  - [ ] Test comment/post content if stored

- [ ] **DOM-Based XSS**
  - [ ] Review JavaScript for unsafe DOM manipulation
  - [ ] Test client-side routing
  - [ ] Test hash/fragment manipulation

### Command Injection

- [ ] **OS Command Injection**
  - [ ] Test: `; ls -la`
  - [ ] Test: `| cat /etc/passwd`
  - [ ] Test: `& whoami`
  - [ ] Test: `` `id` ``
  - [ ] Test: `$(whoami)`

### Path Traversal

- [ ] **Directory Traversal**
  - [ ] Test: `../../../etc/passwd`
  - [ ] Test: `..%2F..%2F..%2Fetc%2Fpasswd`
  - [ ] Test: `..%252F..%252F..%252Fetc%252Fpasswd`
  - [ ] Test backup download endpoint
  - [ ] Test file serving endpoints

### LDAP Injection (if applicable)

- [ ] Test: `*)(uid=*))(|(uid=*`
- [ ] Test: `admin)(|(password=*)`
- [ ] Test: `admin)(&(objectClass=*)`

### XML/XXE Injection (if applicable)

- [ ] Test external entity injection
- [ ] Test entity expansion (billion laughs)
- [ ] Test file disclosure via XXE

### Template Injection

- [ ] Test: `{{7*7}}`
- [ ] Test: `${7*7}`
- [ ] Test: `<%= 7*7 %>`

---

## Business Logic Testing

### Workflow Bypass

- [ ] **Crawl Job Management**
  - [ ] Test submitting duplicate crawl jobs
  - [ ] Test submitting excessive crawl jobs
  - [ ] Test canceling other users' jobs
  - [ ] Test modifying job parameters

- [ ] **Graph Precalculation**
  - [ ] Test triggering precalculation without auth
  - [ ] Test race conditions in precalculation
  - [ ] Test data integrity during precalculation

### Resource Manipulation

- [ ] **Rate Limit Bypass**
  - [ ] Test header manipulation (X-Forwarded-For)
  - [ ] Test distributed requests
  - [ ] Test using multiple tokens
  - [ ] Test timing attacks

- [ ] **Parameter Tampering**
  - [ ] Test negative values: `max_nodes=-1`
  - [ ] Test zero values: `max_nodes=0`
  - [ ] Test very large values: `max_nodes=999999999`
  - [ ] Test invalid types: `max_nodes=abc`
  - [ ] Test null/undefined values

### Data Validation

- [ ] **Input Boundaries**
  - [ ] Test minimum values
  - [ ] Test maximum values
  - [ ] Test boundary conditions
  - [ ] Test overflow conditions

---

## API Security Testing

### REST API Testing

- [ ] **HTTP Methods**
  - [ ] Test invalid methods on endpoints
  - [ ] Test OPTIONS requests
  - [ ] Test HEAD requests
  - [ ] Test TRACE/TRACK methods

- [ ] **Content-Type Testing**
  - [ ] Test with wrong Content-Type
  - [ ] Test XML when expecting JSON
  - [ ] Test multipart/form-data
  - [ ] Test content-type confusion

- [ ] **API Abuse**
  - [ ] Test rapid sequential requests
  - [ ] Test large payload sizes
  - [ ] Test malformed JSON
  - [ ] Test deeply nested JSON
  - [ ] Test circular references in JSON

- [ ] **Information Disclosure**
  - [ ] Check error messages for sensitive data
  - [ ] Check headers for version info
  - [ ] Test verbose error modes
  - [ ] Check for stack traces

### GraphQL Testing (if applicable)

- [ ] Test introspection queries
- [ ] Test query depth limits
- [ ] Test batch queries
- [ ] Test query cost limits

---

## Security Headers & Configuration

### HTTP Security Headers

- [ ] **Verify Headers Present**
  - [ ] X-Content-Type-Options: nosniff
  - [ ] X-Frame-Options: DENY
  - [ ] Content-Security-Policy
  - [ ] Referrer-Policy
  - [ ] Permissions-Policy
  - [ ] Strict-Transport-Security (if HTTPS)

- [ ] **Test Header Bypass**
  - [ ] Test with different request methods
  - [ ] Test with different content types
  - [ ] Test header injection

### CORS Configuration

- [ ] **CORS Testing**
  - [ ] Test with allowed origin
  - [ ] Test with disallowed origin
  - [ ] Test with null origin
  - [ ] Test origin spoofing
  - [ ] Test subdomain bypass
  - [ ] Test CORS preflight requests
  - [ ] Test credentials in CORS

### SSL/TLS Configuration

- [ ] **Certificate Validation**
  - [ ] Check certificate validity
  - [ ] Check certificate chain
  - [ ] Test certificate pinning if implemented
  - [ ] Check for self-signed certificates

- [ ] **Protocol Testing**
  - [ ] Test for SSLv2/SSLv3 (should be disabled)
  - [ ] Test for TLS 1.0/1.1 (should be disabled)
  - [ ] Verify TLS 1.2+ is supported
  - [ ] Test cipher suite strength

- [ ] **SSL/TLS Vulnerabilities**
  - [ ] Test for Heartbleed
  - [ ] Test for POODLE
  - [ ] Test for BEAST
  - [ ] Test for CRIME/BREACH

---

## Client-Side Security

### Frontend Testing

- [ ] **JavaScript Analysis**
  - [ ] Review source code for secrets
  - [ ] Check for sensitive data in localStorage
  - [ ] Check for sensitive data in sessionStorage
  - [ ] Test for DOM-based vulnerabilities

- [ ] **Browser Security**
  - [ ] Test Content Security Policy
  - [ ] Test subresource integrity
  - [ ] Test for mixed content
  - [ ] Check for outdated libraries

### Dependency Vulnerabilities

- [ ] **Backend Dependencies**
  - [ ] Run `govulncheck ./...`
  - [ ] Check for known CVEs
  - [ ] Review Dependabot alerts
  - [ ] Verify dependency integrity

- [ ] **Frontend Dependencies**
  - [ ] Run `npm audit`
  - [ ] Check for known CVEs
  - [ ] Review outdated packages
  - [ ] Test for prototype pollution

---

## Infrastructure & Container Security

### Docker Security

- [ ] **Container Configuration**
  - [ ] Check if containers run as root
  - [ ] Verify no privileged containers
  - [ ] Check for excessive capabilities
  - [ ] Review exposed ports
  - [ ] Test container escape attempts

- [ ] **Image Security**
  - [ ] Scan images with Trivy
  - [ ] Check base image vulnerabilities
  - [ ] Verify image signatures
  - [ ] Check for secrets in layers

### Database Security

- [ ] **PostgreSQL Configuration**
  - [ ] Verify database is not publicly accessible
  - [ ] Test default credentials
  - [ ] Check user permissions
  - [ ] Test connection string security
  - [ ] Verify SSL/TLS for connections

- [ ] **Query Security**
  - [ ] Verify parameterized queries
  - [ ] Test SQL injection prevention
  - [ ] Check for stored procedures vulnerabilities

### Network Security

- [ ] **Port Scanning**
  - [ ] Scan for open ports
  - [ ] Identify unnecessary services
  - [ ] Test firewall rules
  - [ ] Verify internal services isolation

---

## Logging & Monitoring

### Log Security

- [ ] **Sensitive Data in Logs**
  - [ ] Check logs for passwords
  - [ ] Check logs for tokens
  - [ ] Check logs for API keys
  - [ ] Check logs for PII

- [ ] **Log Injection**
  - [ ] Test log injection attacks
  - [ ] Test CRLF injection in logs
  - [ ] Test log forging

### Monitoring Bypass

- [ ] **Detection Evasion**
  - [ ] Test slow attacks
  - [ ] Test low-volume attacks
  - [ ] Test during maintenance windows
  - [ ] Test distributed attacks

---

## Denial of Service

### Application DoS

- [ ] **Resource Exhaustion**
  - [ ] Test with large payloads
  - [ ] Test with complex queries
  - [ ] Test with recursive requests
  - [ ] Test regex DoS
  - [ ] Test zip bomb uploads

- [ ] **Slowloris Attacks**
  - [ ] Test slow HTTP headers
  - [ ] Test slow POST body
  - [ ] Test connection exhaustion

### Database DoS

- [ ] Test expensive queries
- [ ] Test query timeout bypasses
- [ ] Test connection pool exhaustion

---

## Post-Testing

### Documentation

- [ ] **Evidence Collection**
  - [ ] Screenshot all findings
  - [ ] Save relevant logs
  - [ ] Document reproduction steps
  - [ ] Record timestamps

- [ ] **Report Preparation**
  - [ ] Categorize findings by severity
  - [ ] Document impact for each finding
  - [ ] Provide remediation recommendations
  - [ ] Include proof-of-concept code

### Cleanup

- [ ] **Environment Cleanup**
  - [ ] Remove test data
  - [ ] Delete test accounts
  - [ ] Remove uploaded files
  - [ ] Reset configurations

- [ ] **Verification**
  - [ ] Verify no persistent changes
  - [ ] Verify no backdoors left
  - [ ] Verify logs are clean

### Follow-up

- [ ] **Reporting**
  - [ ] Submit detailed report
  - [ ] Present findings to team
  - [ ] Answer questions
  - [ ] Provide remediation support

- [ ] **Retesting**
  - [ ] Schedule retest after fixes
  - [ ] Verify vulnerabilities are fixed
  - [ ] Update documentation

---

## Continuous Testing

### Regular Activities

- [ ] **Monthly**
  - [ ] Run automated security scans
  - [ ] Review new dependencies
  - [ ] Check for new CVEs
  - [ ] Review access logs

- [ ] **Quarterly**
  - [ ] Conduct manual penetration test
  - [ ] Review and update this checklist
  - [ ] Security training for team
  - [ ] Review incident response plan

- [ ] **Annually**
  - [ ] Full security audit
  - [ ] External penetration test
  - [ ] Compliance assessment
  - [ ] Security architecture review

---

## Tools Reference

### Essential Commands

```bash
# Port scanning
nmap -sV -sC localhost

# Directory enumeration
gobuster dir -u http://localhost:8080 -w /path/to/wordlist

# SQL injection testing
sqlmap -u "http://localhost:8080/api/graph?max_nodes=1" --batch

# Web vulnerability scanning
nikto -h http://localhost:8080

# SSL/TLS testing
nmap --script ssl-enum-ciphers -p 443 localhost
```

### Useful Resources

- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [PortSwigger Web Security Academy](https://portswigger.net/web-security)
- [HackerOne Hacking Resources](https://www.hackerone.com/resources)
- [NIST SP 800-115 Technical Guide to Testing](https://csrc.nist.gov/publications/detail/sp/800-115/final)

---

**Last Updated:** 2025-11-01  
**Version:** 1.0  
**Maintained By:** Security Team
