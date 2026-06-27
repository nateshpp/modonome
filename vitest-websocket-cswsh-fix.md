# Vitest WebSocket CSWSH Security Fix

## Vulnerability Summary

The Vitest API server's WebSocket endpoint is vulnerable to Cross-site WebSocket Hijacking (CSWSH) attacks because it:
1. Does not validate the Origin header
2. Has no authorization mechanism
3. Exposes dangerous APIs (`saveTestFile`, `rerun`) without authentication

An attacker can:
- Create a malicious website that connects to the WebSocket
- Inject code into test files via `saveTestFile`
- Execute arbitrary code by calling `rerun`

**Severity**: Critical (Remote Code Execution)

## Fix Overview

The fix implements:
1. **Origin Header Validation**: Verify the Origin header matches allowed origins
2. **Token-based Authentication**: Generate and validate secure tokens
3. **Secure API Methods**: Add authorization checks to sensitive APIs
4. **Additional Security Headers**: Implement best practices for WebSocket security

## Implementation

### 1. Generate Secure Auth Token

When the Vitest dev server starts, generate a secure token that clients must present:

```typescript
import { randomBytes } from 'crypto'

function generateAuthToken(): string {
  return randomBytes(32).toString('hex')
}
```

The token should:
- Be cryptographically random (32 bytes minimum)
- Be generated per server instance
- Be stored securely (environment or secure memory)
- Only be accessible to legitimate clients (local dev server)

### 2. Validate WebSocket Origin

Before accepting WebSocket connections, validate the Origin header:

```typescript
function isOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) return false
  
  try {
    const url = new URL(origin)
    // Only allow localhost/127.0.0.1 for development
    // In production, validate against explicitly allowed origins
    return (
      url.hostname === 'localhost' || 
      url.hostname === '127.0.0.1' ||
      url.hostname === '::1' || // IPv6 localhost
      allowedOrigins.includes(origin)
    )
  } catch {
    return false
  }
}
```

### 3. Require Token Authentication

All WebSocket messages must include a valid token:

```typescript
interface AuthenticatedMessage {
  t: 'q' | 'r' | 'e'
  i: string
  m: string
  a: any[]
  token?: string
}

function validateAuthToken(message: AuthenticatedMessage, validToken: string): boolean {
  // Sensitive operations require the auth token
  if (['saveTestFile', 'rerun', 'updateConfig'].includes(message.m)) {
    if (!message.token) return false
    return constantTimeCompare(message.token, validToken)
  }
  return true
}

// Constant-time string comparison to prevent timing attacks
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}
```

### 4. Enhanced WebSocket Setup

```typescript
import ws from 'ws'
import { IncomingMessage } from 'http'

interface WebSocketSecurityOptions {
  authToken: string
  allowedOrigins?: string[]
  requireOriginValidation?: boolean
}

export function setupWebSocket(
  server: any,
  options: WebSocketSecurityOptions
) {
  const wss = new ws.Server({ noServer: true })
  
  server.on('upgrade', (request: IncomingMessage, socket: any, head: Buffer) => {
    // 1. Validate Origin header
    const origin = request.headers.origin
    const allowedOrigins = options.allowedOrigins || []
    
    if (options.requireOriginValidation !== false) {
      if (!isOriginAllowed(origin, allowedOrigins)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
        socket.destroy()
        return
      }
    }
    
    // 2. Check for required authorization header
    // For local dev, we still use the token approach but could also use:
    // - Query parameter token (less secure, but works for UI)
    // - Authorization header (more standard)
    
    wss.handleUpgrade(request, socket, head, (ws) => {
      setupSecureWebSocketHandlers(ws, options.authToken)
    })
  })
  
  return wss
}

function setupSecureWebSocketHandlers(
  ws: ws.WebSocket,
  validToken: string
) {
  ws.on('message', (data: Buffer) => {
    try {
      const message = parseMessage(data)
      
      // Validate token for sensitive operations
      if (!validateAuthToken(message, validToken)) {
        ws.send(JSON.stringify({
          t: 'e',
          i: message.i,
          e: 'Unauthorized: Invalid or missing authentication token'
        }))
        return
      }
      
      // Handle the message only if authorized
      handleMessage(message, ws)
    } catch (error) {
      ws.send(JSON.stringify({
        t: 'e',
        e: 'Invalid message format'
      }))
    }
  })
}
```

### 5. Token Injection to Client

Inject the auth token into the Vitest UI when it loads:

```typescript
// In the Vitest dev server middleware:
app.get('/__vitest_api_token__', (req, res) => {
  // Only serve to localhost/127.0.0.1
  const host = req.hostname
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    res.status(403).send('Forbidden')
    return
  }
  
  res.json({ token: authToken })
})
```

In the Vitest UI client:

```typescript
// Fetch the token when the UI initializes
const response = await fetch('/__vitest_api_token__')
const { token } = await response.json()

// Include token in all WebSocket messages
const ws = new WebSocket('ws://localhost:51204/__vitest_api__')
ws.addEventListener('open', () => {
  ws.send(Flatted.stringify({
    t: 'q',
    i: crypto.randomUUID(),
    m: 'getFiles',
    a: [],
    token: token // Include the auth token
  }))
})
```

## Summary of Security Improvements

| Attack Vector | Before | After |
|---|---|---|
| Cross-origin WebSocket hijacking | ❌ No validation | ✅ Origin header validated |
| Unauthorized API access | ❌ No authentication | ✅ Token-based auth required |
| Timing attacks on token | N/A | ✅ Constant-time comparison |
| Token exposure | N/A | ✅ Token only via same-origin fetch |
| Sensitive operations | ❌ Unrestricted | ✅ Token required for saveTestFile/rerun |

## Migration Guide

1. **For Vitest maintainers**:
   - Generate auth token on dev server start
   - Add Origin validation middleware
   - Inject token into UI via secure endpoint
   - Update client to include token in messages
   - Add integration tests for origin validation

2. **For users** (if using older Vitest):
   - Upgrade to patched version
   - No code changes needed on user side
   - Token handling is automatic in UI

## Testing

```typescript
describe('WebSocket Security', () => {
  it('should reject connections from unauthorized origins', () => {
    const ws = new WebSocket('ws://localhost:51204/__vitest_api__', {
      headers: {
        origin: 'https://malicious.com'
      }
    })
    
    expect(ws.readyState).toBe(WebSocket.CLOSED)
  })
  
  it('should reject saveTestFile without valid token', () => {
    const ws = connectWithOrigin('http://localhost:3000')
    
    ws.send(Flatted.stringify({
      t: 'q',
      i: '123',
      m: 'saveTestFile',
      a: ['test.ts', 'code'],
      token: 'invalid-token'
    }))
    
    // Should receive error response
  })
  
  it('should accept saveTestFile with valid token', () => {
    const token = getValidToken()
    const ws = connectWithOrigin('http://localhost:3000')
    
    ws.send(Flatted.stringify({
      t: 'q',
      i: '123',
      m: 'saveTestFile',
      a: ['test.ts', 'code'],
      token: token
    }))
    
    // Should succeed
  })
})
```

## References

- [OWASP WebSocket Security](https://owasp.org/www-community/attacks/websocket)
- [RFC 6455 - The WebSocket Protocol](https://tools.ietf.org/html/rfc6455#section-1.3)
- [CWE-352: Cross-Site Request Forgery (CSRF)](https://cwe.mitre.org/data/definitions/352.html)
- [OWASP Secure Coding Practices](https://owasp.org/www-project-secure-coding-practices-quick-reference-guide/)
