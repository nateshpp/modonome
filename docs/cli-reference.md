# CLI Reference

All commands are invoked as `npx modonome <command> [args]` or `modonome <command> [args]`
after a local install. Every command exits 0 on success and non-zero on failure.

Modonome stays off until an owner arms it through the environment or CI. The config file
alone cannot arm the engine; `MODONOME_ARMED=true` in the environment is always required.

---

## Commands

### dry-run

Read the target repository and print proposed work. Changes nothing.

```
npx modonome dry-run <dir>
npx modonome adopt <dir>        (alias)
```

**Input:** `<dir>` is the path to the repository root (defaults to `.`).

**Output:** Proposed work items printed to stdout, including detected stack, gates, protected
paths, and candidate improvements. Nothing is written to disk.

**Exit codes:** 0 success, 1 unrecoverable error reading the repo.

---

### scaffold

Drop `.modonome/` state files into the target repository. Files are created disabled
and in dry-run mode.

```
npx modonome scaffold <dir>          preview (prints what would be written)
npx modonome scaffold <dir> --write  apply (writes files to disk)
```

**Input:** `<dir>` is the path to the repository root (defaults to `.`).

**Flags:**
- `--write`: apply the scaffold; without this flag the command only prints a preview.

**Output:** A list of files that would be (or were) created, with their content summarized.

**Exit codes:** 0 success, 1 error.

---

### validate

Validate a config file or knowledge packet against its JSON Schema and safety rules.

```
npx modonome validate <file>
npx modonome validate <file> --type config
npx modonome validate <file> --type packet
```

**Input:** `<file>` is the path to a YAML/JSON config or a JSON knowledge packet.
Type is inferred from the filename; use `--type` to override.

**Config validation** checks:
- Schema conformance (required fields, types, allowed values)
- Application-level safety rules (e.g. `auto_merge` requires branch protection to be set)

**Packet validation** checks:
- Schema conformance
- Raw code leakage in the evidence field (blocked by redaction rules)

**Output:** Validation errors printed to stderr. Nothing printed on success.

**Exit codes:** 0 valid, 1 invalid (errors printed), 2 usage error.

---

### migrate

Add new config levers to an existing `.modonome/config.yaml` with safe defaults and bump
the schema version.

```
npx modonome migrate <file>
```

**Input:** `<file>` is the path to an existing config file.

**Output:** Updated config file written in place. A diff of changes is printed to stdout.

**Exit codes:** 0 success, 1 error.

---

### tick

Expire stale in-flight work items whose lease has passed.

```
npx modonome tick [stateDir]
```

**Input:** `[stateDir]` is the path to the `.modonome/` state directory (defaults to `.modonome/`).

**Output:** Expired item IDs printed to stdout. Work items past their `lease_expires` field
are moved from `in_flight` to `expired`.

**Exit codes:** 0 success, 1 error.

---

### status

Print the effective arming posture for the target repository.

```
npx modonome status [dir]
```

**Input:** `[dir]` is the path to the repository root (defaults to `.`).

**Output (stdout):**
```
Modonome arming status
======================
Target:              <path>
Config autonomy:     enabled|disabled (advisory)
MODONOME_ARMED env:  set|not set (authoritative)
Effective state:     ARMED|dry-run
```

**Exit codes:** 0 always.

---

### report

Print a governance activity summary and AgentProof score for the target repository.

```
npx modonome report [dir]
```

**Input:** `[dir]` is the path to the repository root. Reads `.modonome/metrics.jsonl`.

**Output:** Governance summary table: items attempted, gates passed/failed, ratchet
rejections, merges, lines changed, estimated hours saved, and live AgentProof score.

**Exit codes:** 0 success, 1 error reading metrics.

---

### agentproof

Run the full AgentProof adversarial benchmark suite (16 scenarios).

```
npx modonome agentproof
npx modonome agentproof ap-01 ap-07    (run specific scenarios)
npx modonome agentproof --json         (JSON output for CI integration)
```

**Input:** Optional scenario IDs to run a subset. `--json` emits machine-readable output.

**Output:** Per-scenario PASS/FAIL lines, a final score, and a conformance level
(`GOVERNED`, `PARTIAL`, or `UNGOVERNED`).

**Exit codes:** 0 all scenarios pass (GOVERNED), 1 any scenario fails.

---

## Environment variables

| Variable | Effect |
|---|---|
| `MODONOME_ARMED=true` | Authoritative arming gate. Required alongside `autonomy_enabled: true` in config for the engine to act autonomously. |

---

## MCP server

Modonome exposes four JSON-RPC 2.0 tools over stdio for MCP-compatible harnesses.
Start the server with:

```
node scripts/mcp-server.mjs
```

### modonome_ratchet

Run the anti-gaming ratchet on a unified diff.

**Input:**

| Field | Type | Required | Description |
|---|---|---|---|
| `diff` | string | one of diff/diff_path | Unified diff string (output of `git diff`) |
| `diff_path` | string | one of diff/diff_path | Absolute path to a file containing a unified diff |

**Output:**
```json
{ "passed": true, "violations": [] }
{ "passed": false, "violations": ["src/foo.test.ts: removes more test assertions than it adds (+0 / -2)."] }
```

### modonome_validate_config

Validate a config file against the JSON Schema and safety rules.

**Input:**

| Field | Type | Required | Description |
|---|---|---|---|
| `content` | string | yes | Config content as YAML or JSON |
| `format` | string | no | `yaml` or `json` (defaults to `yaml`) |

**Output:** List of error strings, empty on success.
```json
{ "errors": [] }
{ "errors": ["auto_merge requires branch_protection to be set"] }
```

### modonome_validate_work_item

Validate a work item object against the JSON Schema and governance rules.

**Input:**

| Field | Type | Required | Description |
|---|---|---|---|
| `item` | object | yes | The work item object to validate |

**Output:** List of error strings, empty on success.
```json
{ "errors": [] }
{ "errors": ["maker_id must not equal checker_id"] }
```

### modonome_status

Return the current governance posture of a repository.

**Input:**

| Field | Type | Required | Description |
|---|---|---|---|
| `repo_path` | string | no | Absolute path to the repository root (defaults to cwd) |

**Output:**
```json
{
  "armed": false,
  "config": { "autonomy_enabled": false, "dry_run": true, "auto_merge": false },
  "agentproof": { "score": 16, "total": 16, "level": "GOVERNED" }
}
```
