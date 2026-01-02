# Security Guide

## Overview

This document covers the security measures implemented in the IDP (Intelligent Dependency Platform) API.

## Security Layers

### 1. Authentication (JWT)

The API uses JWT (JSON Web Token) for authentication.

#### Token Structure

```json
{
  "sub": "user-id",
  "exp": 1234567890,
  "iat": 1234567880,
  "iss": "idp-api",
  "aud": "idp-users",
  "roles": ["user", "premium"],
  "tier": "enterprise"
}
```

#### Configuration

```bash
JWT_SECRET=your-256-bit-secret-key-here
JWT_ISSUER=idp-api
JWT_AUDIENCE=idp-users
```

#### Protected Endpoints

- All GraphQL mutations require authentication
- Some queries require specific roles
- Subscriptions validate tokens on connection

### 2. Rate Limiting

Multi-tier rate limiting protects against abuse:

| Tier | Requests/Minute | Burst |
|------|-----------------|-------|
| Free | 60 | 10 |
| Pro | 600 | 50 |
| Enterprise | 6000 | 200 |
| Unlimited | ∞ | ∞ |

#### Configuration

```bash
RATE_LIMIT_RPM=100
```

### 3. Security Headers

All responses include security headers:

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Force HTTPS |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline' ...` | XSS Protection |
| `X-Frame-Options` | `DENY` | Clickjacking Protection |
| `X-Content-Type-Options` | `nosniff` | MIME Sniffing Protection |
| `X-XSS-Protection` | `1; mode=block` | Legacy XSS Protection |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Referrer Control |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Feature Restrictions |
| `Cache-Control` | `no-store, no-cache, must-revalidate` | Prevent Caching |

### 4. Query Complexity Limits

GraphQL query complexity is calculated and limited:

```rust
ComplexityConfig {
    max_complexity: 1000,
    max_depth: 15,
    base_cost: 1,
    list_multiplier: 10,
}
```

#### Complexity Calculation

- Each field: base_cost (1)
- Lists: base_cost × list_multiplier
- Nested objects: recursive calculation

### 5. Input Validation

All inputs are validated:

#### Body Size Limits

- Maximum request body: 1MB (default), 512KB (production)
- Maximum query depth: 15 (default), 10 (production)
- Maximum aliases: 50 (default), 30 (production)

#### Package ID Format

```
ecosystem:package_name
```

Valid ecosystems: `npm`, `pypi`, `cargo`, `maven`, `nuget`, `go`

#### Dangerous Pattern Detection

- Multiple queries in one request (>10)
- Excessive directives (>50)
- Injection patterns

### 6. Audit Logging

All requests are logged with:

```json
{
  "request_id": "uuid",
  "event_type": "ApiRequest",
  "timestamp": "2024-01-01T00:00:00Z",
  "method": "POST",
  "path": "/graphql",
  "client_ip": "1.2.3.4",
  "user_agent": "Mozilla/5.0...",
  "user_id": "user-123",
  "status_code": 200,
  "duration_ms": 42,
  "request_size": 256,
  "response_size": 1024
}
```

## Security Best Practices

### 1. API Keys

Never expose API keys in:
- Frontend code
- Git repositories
- URLs (use headers instead)

### 2. HTTPS

Always use HTTPS in production:
- TLS 1.2+ only
- Strong cipher suites
- Valid certificates

### 3. CORS

Configure CORS appropriately:

```rust
// Development
CorsLayer::new()
    .allow_origin(Any)

// Production
CorsLayer::new()
    .allow_origin([
        "https://your-app.com".parse().unwrap(),
        "https://api.your-app.com".parse().unwrap(),
    ])
```

### 4. Introspection

Disable GraphQL introspection in production:

```rust
ValidationConfig::production() // Disables introspection
```

### 5. Error Messages

Production errors should not expose:
- Stack traces
- Internal paths
- Database queries
- Configuration details

## Incident Response

### Security Events

Monitor for:
- Failed authentication attempts
- Rate limit violations
- Query complexity violations
- Blocked requests

### Logging

Security events are logged at appropriate levels:
- `WARN`: Rate limits, complexity violations
- `ERROR`: Authentication failures
- `INFO`: Successful authentications

### Alerts

Configure alerts for:
- > 10 failed auth attempts from same IP in 1 minute
- > 100 rate limit violations in 1 minute
- Any blocked requests (suspicious patterns)

## Penetration Testing

Before production deployment:

1. **OWASP Top 10** - Test for common vulnerabilities
2. **GraphQL-specific** - Test for:
   - Batching attacks
   - Deep query attacks
   - Introspection exposure
   - Alias overloading
3. **Rate limiting** - Verify limits work correctly
4. **Authentication** - Test JWT validation thoroughly

## Compliance

### GDPR

- Audit logs for data access tracking
- Data retention policies
- Right to erasure support

### SOC 2

- Access controls (RBAC)
- Encryption in transit (TLS)
- Audit logging
- Incident response

## Security Checklist

- [ ] JWT secret is strong (256+ bits)
- [ ] HTTPS enforced in production
- [ ] CORS configured for specific origins
- [ ] Rate limiting enabled
- [ ] Query complexity limits set
- [ ] Introspection disabled in production
- [ ] Security headers configured
- [ ] Audit logging enabled
- [ ] Error messages sanitized
- [ ] Input validation enabled
- [ ] Penetration testing completed
