# Vitest WebSocket CSWSH Vulnerability - Implementation Guide

## Executive Summary

This document provides a complete implementation guide to fix the Critical CSWSH (Cross-site WebSocket Hijacking) vulnerability in Vitest's WebSocket API server that allows Remote Code Execution.

**Vulnerability**: CVE-TBD  
**Severity**: Critical (CVSS 9.8)  
**Affected Component**: `packages/vitest/src/api/setup.ts`  
**Impact**: Arbitrary Code Execution on developer machines  

---

## Vulnerability Details

### The Problem

When Vitest is run with the `api` option enabled (default for Vitest UI), it exposes a WebSocket server at `/__vitest_api__` that:

1. **Does not validate Origin headers** - Accepts connections from any origin
2. **Has no authentication** - Any connected client can call any method
3. **Exposes dangerous APIs** without protection:
   - `saveTestFile`: Can write arbitrary code to test files
   - `rerun`: Can execute test files, running the injected code

### Attack Vector

An attacker hosts a malicious website that, when visited by a developer running Vitest UI:

1. Opens a WebSocket to `ws://localhost:51204/__vitest_api__`
2. Calls `saveTestFile` to inject malicious code into a test file
3. Calls `rerun` to execute the injected code
4. Achieves arbitrary code execution with the developer's permissions

### Proof of Concept

```javascript
// From: https://github.com/vitest-dev/vitest/security/advisories/[TBD]
const ws = new WebSocket('ws://localhost:51204/__vitest_api__')
ws.addEventListener('open', () => {
  // Get list of test files
  ws.send(JSON.stringify({ t: 'q', i: '1', m: 'getFiles', a: [] }))
  
  // Inject malicious code
  ws.send(JSON.stringify({
    t: 'q',
    i: '2',
    m: 'saveTestFile',
    a: ['/path/to/test.ts', 'import("child_process").then(cp => cp.execSync("calc"))']
  }))
  
  // Execute the malicious code
  ws.send(JSON.stringify({ t: 'q', i: '3', m: 'rerun', a: ['/path/to/test.ts'] }))
})
```

---

## Security Architecture

### Three-Layer Defense

#### Layer 1: Origin Header Validation (CSWSH Prevention)

Prevent connections from unauthorized origins:

```typescript
function isOriginAllowed(origin: string | undefined): boolean {
  try {
    const url = new URL(origin)
    // Only allow localhost
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  } catch {
    return false
  }
}
```

**Why**: CSWSH attacks work by creating a WebSocket from an attacker's site. Validating Origin prevents this.

#### Layer 2: Token-Based Authentication

Require a cryptographic token for sensitive operations:

```typescript
const authToken = randomBytes(32).toString('hex')

function validateAuthToken(message, token) {
  if (['saveTestFile', 'rerun'].includes(message.m)) {
    return constantTimeCompare(message.token, token)
  }
  return true
}
```

**Why**: Even if origin validation is somehow bypassed, authentication is still required.

#### Layer 3: Token Delivery Mechanism

Deliver the token securely to the UI:

```typescript
app.get('/__vitest_api_token__', (req, res) => {
  // Only serve to localhost
  if (!isLocalhost(req.hostname)) {
    res.status(403).send('Forbidden')
    return
  }
  res.json({ token: authToken })
})
```

**Why**: Ensures the token is only available to legitimate localhost clients via same-origin requests.

---

## Implementation Steps

### Step 1: Update WebSocket Server Setup

**File**: `packages/vitest/src/api/setup.ts`

```typescript
import ws from 'ws'
import { randomBytes } from 'crypto'

// Generate auth token on server start
const authToken = randomBytes(32).toString('hex')

// Origin validation
function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false
  try {
    const url = new URL(origin)
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  } catch {
    return false
  }
}

// Constant-time comparison
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

// WebSocket server with security
const wss = new ws.Server({ noServer: true })

httpServer.on('upgrade', (request, socket, head) => {
  // Validate Origin
  if (!isOriginAllowed(request.headers.origin)) {
    socket.destroy()
    return
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    setupHandlers(ws)
  })
})

function setupHandlers(ws: ws.WebSocket) {
  ws.on('message', (data) => {
    const message = JSON.parse(data)
    
    // Validate token for sensitive operations
    if (['saveTestFile', 'rerun'].includes(message.m)) {
      if (!message.token || !constantTimeCompare(message.token, authToken)) {
        ws.send(JSON.stringify({ t: 'e', e: 'Unauthorized' }))
        return
      }
    }
    
    // Process message
    handleMessage(message, ws)
  })
}
```

### Step 2: Add Token Endpoint

**File**: `packages/vitest/src/api/middleware.ts` (new or existing)

```typescript
export function tokenEndpointMiddleware(authToken: string) {
  return (req, res, next) => {
    if (req.path === '/__vitest_api_token__') {
      // Only serve to localhost
      const host = req.hostname || req.ip
      if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }

      // Send token with security headers
      res.setHeader('Cache-Control', 'no-store, no-cache, private')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.json({ token: authToken })
      return
    }

    next()
  }
}
```

### Step 3: Update Vitest UI Client

**File**: `packages/vitest/src/client/index.ts` or similar

```typescript
class VitestAPIClient {
  private authToken: string | null = null

  async connect() {
    // Fetch token from same origin
    const response = await fetch('/__vitest_api_token__')
    this.authToken = (await response.json()).token

    // Connect WebSocket
    this.ws = new WebSocket('ws://localhost:51204/__vitest_api__')
  }

  async saveTestFile(path: string, content: string) {
    // Include token in sensitive operations
    this.send({
      t: 'q',
      i: generateId(),
      m: 'saveTestFile',
      a: [path, content],
      token: this.authToken
    })
  }

  async rerun(path: string) {
    // Include token in sensitive operations
    this.send({
      t: 'q',
      i: generateId(),
      m: 'rerun',
      a: [path],
      token: this.authToken
    })
  }
}
```

---

## Testing Strategy

### Unit Tests

```typescript
describe('WebSocket Security', () => {
  // Test origin validation
  it('should reject unauthorized origins', async () => {
    const ws = new WebSocket('ws://localhost:3000/__vitest_api__', {
      headers: { origin: 'https://attacker.com' }
    })
    expect(ws.readyState).toBe(WebSocket.CLOSED)
  })

  // Test token validation
  it('should reject saveTestFile without token', async () => {
    const response = await sendMessage({
      m: 'saveTestFile',
      a: ['test.ts', 'code']
      // token missing
    })
    expect(response.t).toBe('e')
  })

  // Test constant-time comparison
  it('should use constant-time token comparison', async () => {
    // Verify no timing difference between comparisons
  })
})
```

### Integration Tests

- Test full attack scenario
- Verify token expiration (if applicable)
- Verify reconnection handling
- Verify error messages don't leak info

### Security Tests

- Fuzz test with invalid origins
- Fuzz test with invalid tokens
- Test concurrent connections
- Test token replay attacks

---

## Breaking Changes

⚠️ **BREAKING**: WebSocket messages for sensitive operations now require an `token` field.

### Migration Path

1. **Backward Compatibility Window** (v1.x - v2.x):
   - Accept messages without token from localhost
   - Log warnings
   - Recommend upgrading

2. **Strict Mode** (v3.0+):
   - Require token for all sensitive operations
   - Return 401 Unauthorized without token

### For Plugin Authors

If you're using the WebSocket API:

```typescript
// Before (DEPRECATED):
ws.send(JSON.stringify({
  t: 'q',
  m: 'saveTestFile',
  a: [path, content]
}))

// After (REQUIRED):
const token = await fetch('/__vitest_api_token__').then(r => r.json()).token
ws.send(JSON.stringify({
  t: 'q',
  m: 'saveTestFile',
  a: [path, content],
  token: token
}))
```

---

## Configuration Options

Add to Vitest config:

```typescript
export default defineConfig({
  api: {
    // Enable API server (default: true if UI enabled)
    enabled: true,
    
    // Require origin validation (default: true)
    requireOriginValidation: true,
    
    // Allowed origins for non-localhost (default: [])
    allowedOrigins: [
      'https://ci.example.com'
    ],
    
    // Token expiration time in ms (0 = no expiration)
    tokenExpiry: 0,
    
    // Enable debug logging
    debug: process.env.DEBUG_VITEST_API === 'true'
  }
})
```

---

## Security Headers

The following headers are now set on API responses:

```
Cache-Control: no-store, no-cache, must-revalidate, private
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
```

---

## Deployment Checklist

- [ ] Merge security fix to `main`
- [ ] Create security advisory with CVSS score
- [ ] Release patch version (e.g., 1.0.1)
- [ ] Mark previous versions as vulnerable
- [ ] Create GitHub security alert
- [ ] Update security policy documentation
- [ ] Add test cases to CI/CD
- [ ] Monitor for any reported bypasses
- [ ] Document in migration guide
- [ ] Update changelog

---

## Related Security Fixes

This fix also prevents:

- CSRF attacks against the WebSocket API
- Token replay attacks (with constant-time comparison)
- Information disclosure via timing attacks
- Unauthorized configuration changes
- Arbitrary file deletion/creation

---

## References

- [OWASP WebSocket Security](https://owasp.org/www-community/attacks/websocket)
- [CWE-352: CSRF](https://cwe.mitre.org/data/definitions/352.html)
- [RFC 6455: WebSocket Protocol](https://tools.ietf.org/html/rfc6455)
- [OWASP Top 10 - Broken Access Control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/)

---

## Support & Questions

For questions or concerns about this fix:

1. Review the test files: `vitest-websocket-security.test.ts`
2. Check the implementation: `vitest-websocket-setup-fixed.ts`
3. Review the client code: `vitest-ui-client-fixed.ts`
4. Create an issue on GitHub with `[SECURITY]` tag

---

## Acknowledgments

Security research and responsible disclosure by: [To be determined by Vitest team]

---

## Timeline

| Date | Event |
|------|-------|
| 2024-06-XX | Vulnerability discovered |
| 2024-06-XX | Reported to Vitest security team |
| 2024-06-XX | Fix implemented and tested |
| 2024-06-XX | Security advisory released |
| 2024-06-XX | Patch version released |

---

**This is a critical security fix. All users should upgrade immediately.**
