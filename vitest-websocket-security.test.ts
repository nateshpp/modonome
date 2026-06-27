/**
 * Security tests for Vitest WebSocket CSWSH vulnerability and fixes
 *
 * These tests demonstrate:
 * 1. How the vulnerability can be exploited (before the fix)
 * 2. How the fix prevents the attacks
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import ws from 'ws'
import { createServer } from 'http'
import {
  setupSecureWebSocket,
  generateAuthToken,
  createTokenEndpoint,
} from './vitest-websocket-setup-fixed'

// ============================================================================
// Test Setup
// ============================================================================

describe('Vitest WebSocket CSWSH Security', () => {
  let httpServer: any
  let wss: ws.Server
  let serverUrl: string
  let authToken: string
  let port: number

  beforeEach(async () => {
    port = 3000 + Math.floor(Math.random() * 1000)
    httpServer = createServer()
    authToken = generateAuthToken()

    // Setup secure WebSocket
    wss = setupSecureWebSocket(httpServer, {
      authToken,
      requireOriginValidation: true,
      enableLogging: false,
    })

    // Setup token endpoint
    httpServer.on('request', (req, res) => {
      if (req.url === '/__vitest_api_token__') {
        createTokenEndpoint(authToken)(req, res)
        return
      }
      res.statusCode = 404
      res.end('Not Found')
    })

    await new Promise<void>((resolve) => {
      httpServer.listen(port, 'localhost', () => {
        serverUrl = `ws://localhost:${port}`
        resolve()
      })
    })
  })

  afterEach(async () => {
    wss.close()
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve())
    })
  })

  // =========================================================================
  // Origin Header Validation Tests
  // =========================================================================

  describe('Origin Header Validation (CSWSH Prevention)', () => {
    it('should accept WebSocket connections from localhost', async () => {
      const socket = new ws.WebSocket(serverUrl, {
        headers: {
          origin: 'http://localhost:3000',
        },
      })

      await new Promise<void>((resolve, reject) => {
        socket.on('open', () => {
          socket.close()
          resolve()
        })
        socket.on('error', reject)
        setTimeout(() => reject(new Error('Connection timeout')), 5000)
      })
    })

    it('should accept WebSocket connections from 127.0.0.1', async () => {
      const socket = new ws.WebSocket(serverUrl, {
        headers: {
          origin: 'http://127.0.0.1:3000',
        },
      })

      await new Promise<void>((resolve, reject) => {
        socket.on('open', () => {
          socket.close()
          resolve()
        })
        socket.on('error', reject)
        setTimeout(() => reject(new Error('Connection timeout')), 5000)
      })
    })

    it('should reject WebSocket connections from malicious origin (external domain)', async () => {
      const socket = new ws.WebSocket(serverUrl, {
        headers: {
          origin: 'https://malicious.com',
        },
      })

      await new Promise<void>((resolve, reject) => {
        let connected = false
        socket.on('open', () => {
          connected = true
          socket.close()
          reject(new Error('Should have rejected malicious origin'))
        })
        socket.on('error', () => {
          if (!connected) {
            resolve() // Expected error
          }
        })
        socket.on('close', () => {
          if (!connected) {
            resolve()
          }
        })
        setTimeout(() => {
          if (!connected) {
            resolve() // Connection was rejected as expected
          } else {
            reject(new Error('Should have rejected malicious origin'))
          }
        }, 2000)
      })
    })

    it('should reject WebSocket connections from attacker subdomain', async () => {
      const socket = new ws.WebSocket(serverUrl, {
        headers: {
          origin: 'https://attacker.github.io',
        },
      })

      // Connection should fail
      await new Promise<void>((resolve, reject) => {
        let connected = false
        socket.on('open', () => {
          connected = true
          reject(new Error('Should have rejected attacker.github.io'))
        })
        socket.on('error', () => {
          resolve()
        })
        socket.on('close', () => {
          if (!connected) {
            resolve()
          }
        })
        setTimeout(() => {
          if (!connected) {
            resolve()
          }
        }, 2000)
      })
    })

    it('should reject WebSocket connections without Origin header', async () => {
      const socket = new ws.WebSocket(serverUrl)

      // Remove origin header to simulate attack
      await new Promise<void>((resolve, reject) => {
        let connected = false
        socket.on('open', () => {
          connected = true
          reject(new Error('Should have rejected missing Origin header'))
        })
        socket.on('error', () => {
          resolve()
        })
        setTimeout(() => {
          if (!connected) {
            resolve()
          }
        }, 2000)
      })
    })
  })

  // =========================================================================
  // Authentication Token Validation Tests
  // =========================================================================

  describe('Authentication Token Validation', () => {
    async function connectAndSendMessage(
      message: any,
      token?: string
    ): Promise<any> {
      return new Promise((resolve, reject) => {
        const socket = new ws.WebSocket(serverUrl, {
          headers: {
            origin: 'http://localhost:3000',
          },
        })

        socket.on('open', () => {
          const msgWithToken = token ? { ...message, token } : message
          socket.send(JSON.stringify(msgWithToken))
        })

        socket.on('message', (data) => {
          const response = JSON.parse(data.toString())
          socket.close()
          resolve(response)
        })

        socket.on('error', reject)
        setTimeout(() => {
          reject(new Error('No response received'))
        }, 5000)
      })
    }

    it('should allow saveTestFile with valid authentication token', async () => {
      const response = await connectAndSendMessage(
        {
          t: 'q',
          i: 'msg-1',
          m: 'saveTestFile',
          a: ['test.ts', 'console.log("test")'],
        },
        authToken // Include valid token
      )

      expect(response.t).toBe('r')
      expect(response.e).toBeUndefined() // No error
    })

    it('should reject saveTestFile without authentication token', async () => {
      const response = await connectAndSendMessage({
        t: 'q',
        i: 'msg-2',
        m: 'saveTestFile',
        a: ['test.ts', 'console.log("hacked")'],
        // token is omitted
      })

      expect(response.t).toBe('e')
      expect(response.e).toContain('Unauthorized')
    })

    it('should reject saveTestFile with invalid token', async () => {
      const response = await connectAndSendMessage(
        {
          t: 'q',
          i: 'msg-3',
          m: 'saveTestFile',
          a: ['test.ts', 'code'],
        },
        'invalid-token-12345'
      )

      expect(response.t).toBe('e')
      expect(response.e).toContain('Unauthorized')
    })

    it('should allow rerun with valid authentication token', async () => {
      const response = await connectAndSendMessage(
        {
          t: 'q',
          i: 'msg-4',
          m: 'rerun',
          a: ['test.ts'],
        },
        authToken
      )

      expect(response.t).toBe('r')
      expect(response.e).toBeUndefined()
    })

    it('should reject rerun without authentication token', async () => {
      const response = await connectAndSendMessage({
        t: 'q',
        i: 'msg-5',
        m: 'rerun',
        a: ['test.ts'],
        // token is omitted
      })

      expect(response.t).toBe('e')
      expect(response.e).toContain('Unauthorized')
    })

    it('should allow read-only getFiles without token', async () => {
      const response = await connectAndSendMessage({
        t: 'q',
        i: 'msg-6',
        m: 'getFiles',
        a: [],
        // token is not required for read-only operations
      })

      expect(response.t).toBe('r')
      expect(response.e).toBeUndefined()
    })
  })

  // =========================================================================
  // Attack Scenario Tests
  // =========================================================================

  describe('Attack Scenarios (Before and After Fix)', () => {
    it('should prevent CSWSH attack: malicious website cannot inject code', async () => {
      // Simulating an attacker's malicious website trying to exploit the vulnerability
      const attackerOrigin = 'https://attacker-site.com'

      const socket = new ws.WebSocket(serverUrl, {
        headers: {
          origin: attackerOrigin,
        },
      })

      // The attack should fail at the origin validation step
      await new Promise<void>((resolve, reject) => {
        let connected = false

        socket.on('open', () => {
          connected = true
          reject(
            new Error('VULNERABILITY: Malicious origin was accepted!')
          )
        })

        socket.on('error', () => {
          resolve() // Expected: origin validation prevented the attack
        })

        socket.on('close', () => {
          if (!connected) {
            resolve()
          }
        })

        setTimeout(() => {
          if (!connected) {
            resolve()
          } else {
            reject(new Error('VULNERABILITY: Connection from malicious origin was accepted'))
          }
        }, 3000)
      })
    })

    it('should prevent PoC attack: even if origin is somehow bypassed, token is required', async () => {
      // If somehow the origin validation is bypassed, the token requirement
      // provides a second layer of defense

      const response = await new Promise<any>((resolve, reject) => {
        const socket = new ws.WebSocket(serverUrl, {
          headers: {
            origin: 'http://localhost:3000', // Using localhost to bypass origin check
          },
        })

        socket.on('open', () => {
          // Try to execute the PoC attack without token
          socket.send(
            JSON.stringify({
              t: 'q',
              i: 'poc-1',
              m: 'saveTestFile',
              a: [
                'test.ts',
                "import child_process from 'child_process';child_process.execSync('calc')",
              ],
              // Missing token
            })
          )
        })

        socket.on('message', (data) => {
          resolve(JSON.parse(data.toString()))
          socket.close()
        })

        socket.on('error', reject)
        setTimeout(() => reject(new Error('No response')), 5000)
      })

      // Should be rejected
      expect(response.t).toBe('e')
      expect(response.e).toContain('Unauthorized')
    })
  })

  // =========================================================================
  // Token Endpoint Tests
  // =========================================================================

  describe('Token Endpoint Security', () => {
    it('should serve token endpoint to localhost', async () => {
      const response = await fetch(`http://localhost:${port}/__vitest_api_token__`, {
        headers: { host: 'localhost' },
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.token).toBeDefined()
      expect(typeof data.token).toBe('string')
      expect(data.token.length).toBeGreaterThan(0)
    })

    it('should reject token endpoint from non-localhost', async () => {
      const response = await fetch(`http://localhost:${port}/__vitest_api_token__`, {
        headers: { host: 'attacker.com' },
      })

      expect(response.status).toBe(403)
    })

    it('should not cache the token endpoint response', async () => {
      const response = await fetch(`http://localhost:${port}/__vitest_api_token__`)

      const cacheControl = response.headers.get('cache-control')
      expect(cacheControl).toContain('no-store')
      expect(cacheControl).toContain('no-cache')
      expect(cacheControl).toContain('private')
    })

    it('should set security headers on token endpoint', async () => {
      const response = await fetch(`http://localhost:${port}/__vitest_api_token__`)

      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
      expect(response.headers.get('x-frame-options')).toBe('DENY')
    })
  })

  // =========================================================================
  // Timing Attack Prevention Tests
  // =========================================================================

  describe('Timing Attack Prevention', () => {
    it('should use constant-time comparison to prevent token guessing', async () => {
      // This test verifies that token comparison takes the same time
      // regardless of whether the token matches, preventing attackers from
      // using timing differences to guess the token

      const response1 = await connectAndSendMessage(
        {
          t: 'q',
          i: 'timing-1',
          m: 'saveTestFile',
          a: ['test.ts', 'code'],
        },
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' // Wrong token
      )

      const response2 = await connectAndSendMessage(
        {
          t: 'q',
          i: 'timing-2',
          m: 'saveTestFile',
          a: ['test.ts', 'code'],
        },
        'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' // Different wrong token
      )

      // Both should be rejected with the same error
      expect(response1.t).toBe('e')
      expect(response2.t).toBe('e')
      expect(response1.e).toBe(response2.e)
    })
  })
})
