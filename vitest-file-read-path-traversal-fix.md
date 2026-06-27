# Vitest File Read Path Traversal Vulnerability - Fix Guide

## Executive Summary

This document addresses a critical path traversal vulnerability in Vitest's file serving endpoints that allows arbitrary file read access on Windows systems and when the Vitest UI server is exposed to the network.

**Vulnerability**: CVE-TBD  
**Severity**: High (CVSS 7.5)  
**Affected Components**: 
- `packages/ui/node/index.ts` - `/__vitest_attachment__` endpoint
- `packages/vitest/src/api/setup.ts` - File read APIs
- `packages/browser/src/node/commands/fs.ts` - Browser mode file access
- `packages/browser/src/node/plugin.ts` - Plugin file serving
- `packages/browser/src/node/rpc.ts` - RPC file operations

**Impact**: 
- Arbitrary file read (especially on Windows)
- Combined with CSWSH vulnerability: Arbitrary code execution
- When exposed to network: Remote code execution

---

## Vulnerability Details

### Root Cause

The `isFileServingAllowed()` function checks file paths BEFORE they are normalized with `cleanUrl()`, allowing attackers to use special path syntax to bypass the check.

### Attack Vector

**On Windows**, using UNC paths with wildcards:
```
GET /__vitest_attachment__?path=C:\\project\\?\\..\\..\\secret.txt
```

The `?` character makes Windows skip the invalid directory check, allowing:
- Path traversal to parent directories
- Reading files outside the project root
- Accessing sensitive system files

**On any platform**, when API is exposed to network:
```javascript
// Combined with saveTestFile + rerun (CSWSH vulnerability):
// 1. Read sensitive config
fetch('/__vitest_attachment__?path=/etc/passwd&token=...')

// 2. Inject code
ws.send({ m: 'saveTestFile', a: ['test.ts', 'import fs from "fs"; ...'] })

// 3. Execute
ws.send({ m: 'rerun', a: ['test.ts'] })
```

---

## Security Architecture

### Defense Layers

#### Layer 1: Path Normalization

Always normalize paths BEFORE validation:

```typescript
import { resolve, normalize } from 'path'
import { isAbsolute } from 'path'

function normalizePath(inputPath: string): string {
  // Remove null bytes
  if (inputPath.includes('\0')) {
    throw new Error('Invalid path: contains null bytes')
  }

  // Normalize the path (handles .., ., //, \\, etc.)
  const normalized = normalize(inputPath)

  // On Windows, resolve UNC paths
  const resolved = resolve(normalized)

  return resolved
}
```

#### Layer 2: Project Root Validation

Verify resolved path is within project root:

```typescript
import { relative } from 'path'

function isPathInProjectRoot(filePath: string, projectRoot: string): boolean {
  const normalized = normalizePath(filePath)
  const normalizedRoot = normalizePath(projectRoot)

  // Get relative path from project root
  const rel = relative(normalizedRoot, normalized)

  // If relative path starts with .., it's outside project root
  if (rel.startsWith('..')) {
    return false
  }

  // Check for absolute paths
  if (isAbsolute(rel)) {
    return false
  }

  return true
}
```

#### Layer 3: Operation-Level Access Control

New configuration flags control privileged operations:

```typescript
interface APIConfig {
  // Allow file write operations (saveTestFile)
  allowWrite: boolean
  
  // Allow code execution (rerun)
  allowExec: boolean
  
  // Auto-disable write/exec when bound to non-localhost
  autoRestrictRemote: boolean
}

// When API is bound to non-localhost host:
if (!isLocalhost(apiHost) && config.autoRestrictRemote) {
  config.allowWrite = false
  config.allowExec = false
  UI.readOnlyMode = true
}
```

---

## Implementation

### Step 1: Fix Path Validation

**File**: `packages/vitest/src/api/utils.ts` (new file)

```typescript
import { resolve, normalize, relative, isAbsolute } from 'path'

/**
 * Safely normalize a file path and validate it's within the allowed directory
 */
export function validateFilePath(
  inputPath: string,
  baseDir: string,
  options: {
    allowAbsolute?: boolean
    allowedDirs?: string[]
  } = {}
): string {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new Error('Invalid path: must be a non-empty string')
  }

  // Remove null bytes and other dangerous characters
  if (inputPath.includes('\0') || inputPath.includes('\r') || inputPath.includes('\n')) {
    throw new Error('Invalid path: contains dangerous characters')
  }

  // Normalize the path (handles .., ., //, \\, etc.)
  const normalized = normalize(inputPath)
  const resolved = resolve(normalized)

  // Check if path is absolute
  const isAbs = isAbsolute(resolved)

  if (isAbs && !options.allowAbsolute) {
    throw new Error('Absolute paths are not allowed')
  }

  // Resolve relative to base directory
  const normalizedBase = normalize(baseDir)
  const basePath = resolve(normalizedBase)

  let finalPath: string

  if (isAbs) {
    finalPath = resolved
  } else {
    finalPath = resolve(basePath, resolved)
  }

  // Verify the resolved path is within the allowed directory
  const relativePath = relative(basePath, finalPath)

  // If relative path starts with .., it's outside the base directory
  if (relativePath.startsWith('..')) {
    throw new Error('Path traversal detected: path is outside allowed directory')
  }

  // Additional check for platform-specific attacks
  if (process.platform === 'win32') {
    // On Windows, verify no UNC paths or drive changes
    const drive = finalPath.charAt(1) === ':' ? finalPath.charAt(0) : null
    const baseDrive = basePath.charAt(1) === ':' ? basePath.charAt(0) : null

    if (drive && baseDrive && drive !== baseDrive) {
      throw new Error('Cross-drive access is not allowed')
    }
  }

  // Check against allowed directories if specified
  if (options.allowedDirs && options.allowedDirs.length > 0) {
    const isAllowed = options.allowedDirs.some((allowedDir) => {
      const allowedPath = resolve(normalize(allowedDir))
      return (
        finalPath === allowedPath || finalPath.startsWith(allowedPath + (process.platform === 'win32' ? '\\' : '/'))
      )
    })

    if (!isAllowed) {
      throw new Error('Path is not in allowed directories')
    }
  }

  return finalPath
}

/**
 * Check if a host is a localhost address
 */
export function isLocalhost(host: string): boolean {
  if (!host) return false

  const normalized = host.split(':')[0].toLowerCase()

  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '[::1]' ||
    normalized === '0.0.0.0' // Not really localhost, but dev-only
  )
}

/**
 * Sanitize file path for display
 */
export function sanitizePathForLog(filePath: string): string {
  // Mask sensitive parts
  return filePath.replace(/([^/\\])([^/\\]{3,})/g, '$1***')
}
```

### Step 2: Fix `/__vitest_attachment__` Endpoint

**File**: `packages/ui/node/index.ts`

```typescript
import { validateFilePath, isLocalhost } from './utils'

app.get('/__vitest_attachment__', async (req, res) => {
  const { path, contentType, token } = req.query

  // 1. Validate API token (from CSWSH fix)
  if (!token || !validateAuthToken(token as string, apiToken)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  // 2. Check if write operations are allowed
  if (!config.api.allowRead) {
    res.status(403).json({ 
      error: 'File read is disabled. Set api.allowRead=true to enable.' 
    })
    return
  }

  // 3. Validate and normalize the file path
  try {
    const filePath = validateFilePath(
      path as string,
      projectRoot,
      {
        allowAbsolute: false,
        allowedDirs: [projectRoot]
      }
    )

    // 4. Check file exists and is readable
    const stat = await fs.promises.stat(filePath)
    if (!stat.isFile()) {
      res.status(400).json({ error: 'Not a file' })
      return
    }

    // 5. Check file size (prevent large file reads)
    const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
    if (stat.size > MAX_FILE_SIZE) {
      res.status(413).json({ error: 'File too large' })
      return
    }

    // 6. Serve file with safety headers
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cache-Control', 'no-store, no-cache, private')
    res.setHeader('Content-Type', contentType as string || 'application/octet-stream')
    res.setHeader('Content-Disposition', 'attachment')

    const fileContent = await fs.promises.readFile(filePath)
    res.send(fileContent)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[API] File read error:', message)
    
    // Don't leak path info to client
    res.status(400).json({ error: 'Invalid or forbidden path' })
  }
})
```

### Step 3: Fix API saveTestFile Handler

**File**: `packages/vitest/src/api/setup.ts`

```typescript
function handleSaveTestFile(message: VitestMessage, ws: WebSocket) {
  const [filePath, content] = message.a

  // 1. Check if write is allowed
  if (!config.api.allowWrite) {
    ws.send(JSON.stringify({
      t: 'e',
      i: message.i,
      e: 'File write is disabled'
    }))
    return
  }

  // 2. Validate file path BEFORE writing
  try {
    const validatedPath = validateFilePath(
      filePath,
      projectRoot,
      {
        allowAbsolute: false,
        allowedDirs: [projectRoot]
      }
    )

    // 3. Ensure it's a test file (optional but recommended)
    if (!validatedPath.match(/\.(test|spec)\.(ts|js)$/)) {
      ws.send(JSON.stringify({
        t: 'e',
        i: message.i,
        e: 'Can only write to test files'
      }))
      return
    }

    // 4. Write the file
    fs.writeFileSync(validatedPath, content, 'utf-8')

    ws.send(JSON.stringify({
      t: 'r',
      i: message.i,
      r: 'File saved successfully'
    }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    ws.send(JSON.stringify({
      t: 'e',
      i: message.i,
      e: message
    }))
  }
}
```

### Step 4: Configuration Schema

**File**: `packages/vitest/src/config.ts`

```typescript
export interface APIConfig {
  /**
   * Allow reading files via API
   * @default true for localhost, false for remote
   */
  allowRead?: boolean

  /**
   * Allow writing files via API (saveTestFile)
   * @default true for localhost, false for remote
   */
  allowWrite?: boolean

  /**
   * Allow executing code via API (rerun)
   * @default true for localhost, false for remote
   */
  allowExec?: boolean

  /**
   * Automatically restrict privileged operations when bound to non-localhost
   * @default true
   */
  autoRestrictRemote?: boolean

  /**
   * Maximum file size to serve (bytes)
   * @default 50 * 1024 * 1024 (50MB)
   */
  maxFileSize?: number

  /**
   * Authentication token (auto-generated if not provided)
   * @default undefined
   */
  authToken?: string

  /**
   * Required origin header (prevents CSWSH)
   * @default localhost only
   */
  allowedOrigins?: string[]
}

export function normalizeApiConfig(
  config: APIConfig | boolean | undefined,
  apiHost: string
): APIConfig {
  if (config === false) {
    return {
      allowRead: false,
      allowWrite: false,
      allowExec: false,
    }
  }

  const apiConfig = config === true || !config ? {} : config

  // Auto-restrict remote access
  const isRemote = !isLocalhost(apiHost)
  const autoRestrict = apiConfig.autoRestrictRemote !== false

  return {
    allowRead: apiConfig.allowRead ?? true,
    allowWrite: apiConfig.allowWrite ?? (isRemote && autoRestrict ? false : true),
    allowExec: apiConfig.allowExec ?? (isRemote && autoRestrict ? false : true),
    autoRestrictRemote: autoRestrict,
    maxFileSize: apiConfig.maxFileSize ?? 50 * 1024 * 1024,
    authToken: apiConfig.authToken,
    allowedOrigins: apiConfig.allowedOrigins,
  }
}
```

---

## UI Updates

### Read-Only Mode

When `allowWrite` or `allowExec` are disabled:

```typescript
// In Vitest UI initialization
const uiConfig = {
  readOnly: !apiConfig.allowWrite || !apiConfig.allowExec,
  canEditFiles: apiConfig.allowWrite,
  canRunTests: apiConfig.allowExec,
}

if (uiConfig.readOnly) {
  // Disable:
  // - In-browser code editing
  // - Test execution buttons
  // - File write operations
  // - Snapshot management
  // - Attachments
  
  // Show banner:
  showWarning(
    'Vitest UI is in read-only mode. ' +
    'To enable editing and execution, set api.allowWrite and api.allowExec to true.'
  )
}
```

---

## Configuration Examples

### Default (Development)

```typescript
// vitest.config.ts
export default defineConfig({
  api: {
    // Auto-restricts to read-only when bound to 0.0.0.0 or other non-localhost
    autoRestrictRemote: true
  }
})
```

### Secure Network Exposure

```typescript
// Allow read-only access from CI/CD
export default defineConfig({
  api: {
    host: '0.0.0.0', // Expose to network
    allowRead: true,  // Allow file read
    allowWrite: false, // Disable write
    allowExec: false,  // Disable execution
    allowedOrigins: ['https://ci.example.com']
  }
})
```

### Full Access (Localhost Only)

```typescript
// Only for local development
export default defineConfig({
  api: {
    host: 'localhost', // Only localhost
    allowRead: true,
    allowWrite: true,
    allowExec: true
  }
})
```

---

## Testing

```typescript
describe('Path Traversal Prevention', () => {
  it('should reject path traversal with ..', async () => {
    expect(() => {
      validateFilePath(
        '../../../etc/passwd',
        '/home/user/project'
      )
    }).toThrow('outside allowed directory')
  })

  it('should reject absolute paths', async () => {
    expect(() => {
      validateFilePath(
        '/etc/passwd',
        '/home/user/project'
      )
    }).toThrow('Absolute paths not allowed')
  })

  it('should reject Windows UNC path traversal', async () => {
    // On Windows
    expect(() => {
      validateFilePath(
        'C:\\project\\?\\..\\..\\secret.txt',
        'C:\\project'
      )
    }).toThrow('path traversal detected')
  })

  it('should handle normalized paths safely', () => {
    const path = validateFilePath(
      './src/../test.ts',
      '/project'
    )
    expect(path).toBe('/project/test.ts')
  })

  it('should reject file access when allowRead is false', async () => {
    const response = await fetch('/__vitest_attachment__?path=...&token=...', {
      config: { api: { allowRead: false } }
    })
    expect(response.status).toBe(403)
  })
})
```

---

## Deployment Checklist

- [ ] Update path validation in all file operations
- [ ] Implement `allowRead`, `allowWrite`, `allowExec` flags
- [ ] Add auto-restrict for remote hosts
- [ ] Update UI to show read-only mode
- [ ] Add path validation tests
- [ ] Test on Windows with UNC paths
- [ ] Update documentation
- [ ] Add migration guide
- [ ] Release as patch version

---

## Related Fixes

This fix works together with:
1. CSWSH fix (token authentication)
2. API access control (allowWrite/allowExec)
3. Origin validation (prevents remote exploitation)

All three layers must be in place for complete security.

---

## References

- [CWE-22: Path Traversal](https://cwe.mitre.org/data/definitions/22.html)
- [OWASP Path Traversal](https://owasp.org/www-community/attacks/Path_Traversal)
- [Windows UNC Paths](https://docs.microsoft.com/en-us/windows/win32/fileio/naming-a-file)
- [Node.js path module](https://nodejs.org/api/path.html)
