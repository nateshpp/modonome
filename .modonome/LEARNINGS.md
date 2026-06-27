# Learnings, staged candidate conventions

Binding rules live in the repo's canonical instructions. This file is a short queue
of candidate lessons captured from real correction signals, plus a machine-readable
record of lessons that have been promoted into a deterministic gate.

Rules:
- Capture only on a gate failure, a review fix, a production incident, or repeated rework.
- One line per lesson, generalized, dated, and evidence-backed.
- Cap at 20 staged entries. When full, promote or prune. Never auto-evict.
- Entries older than 30 days need a promote-or-prune review.
- A lesson becomes binding only when an owner promotes it into a deterministic gate and
  records it in the Promoted block below.

Staged format:
- [YYYY-MM-DD] (signal: gate|review|incident|rework) lesson - evidence: ref

## Staged

- [2026-06-27] (signal: incident) Use 127.0.0.1 instead of localhost for LM Studio and gateway URLs when Pi-hole or network-level DNS blocking is active — localhost may resolve through a DNS blocker and return an HTML error page instead of the API. evidence: Phase A go-live hardening on Mac mini.

- [2026-06-27] (signal: incident) Force non-streaming (stream=False) in the gateway proxy — httpx exceptions raised inside an async generator after StreamingResponse is returned cannot be caught by FastAPI and silently become 502s with empty detail. evidence: Phase A gateway debugging; fix: rewrite body["stream"]=False before proxying.

- [2026-06-27] (signal: incident) Gateway backend timeout must exceed worst-case model generation time — 120s is too short for a 7B model generating a full CrewAI agent prompt (2000+ tokens); use 600s. evidence: Phase A; symptom was "Backend connection failed" while LM Studio showed successful completion.

- [2026-06-27] (signal: incident) The fleet checker adapter must route on cfg.checker.mode (openai vs claude_cli) — hardcoding ClaudeCliLLM ignores the configured mode and fails when checker is a local gateway model. evidence: Phase A; fix: make_checker_llm() dispatches on mode.

- [2026-06-27] (signal: incident) Pass --fleet-config as an absolute path to factory-run-one — FleetConfig.load() resolves fleet.config.yaml relative to CWD, so running from a different directory silently falls back to defaults (checker mode reverts to claude_cli). evidence: Phase A rehearsal-5 required --fleet-config /Users/nateshpp/agent-factory/fleet.config.yaml.

- [2026-06-27] (signal: incident) LiteLLM/CrewAI LLM timeout must be set explicitly — CrewAI's LLM() default timeout is too short for a 7B model under a full agent prompt; set timeout=600 in make_maker_llm(). evidence: Phase A; symptom was litellm.Timeout on the first real maker call.

## Promoted

Promoted learnings carry full traceability so an auditor can trace any rule back to the
correction signal that produced it. The block below is validated in CI by
`scripts/check-learning-traceability.mjs` and is queryable with
`scripts/audit-learnings.mjs <gate-substring>`.

```json
[
  {
    "id": "L-001",
    "lesson": "Shipped sample telemetry must conform to its schema and must never be presented as real measured data.",
    "correction_signal_id": "docs/CLAIMS-AUDIT-2026-06-25.md",
    "observation_date": "2026-06-25",
    "promotion_date": "2026-06-25",
    "evidence_summary": "Audit found .modonome/metrics.jsonl used non-schema fields (type, id) and carried synthetic merge events presented as telemetry.",
    "gate_added": "Self-application metrics conformance check plus schema-conformance test",
    "gate_location": "scripts/check-self-application.mjs"
  },
  {
    "id": "L-002",
    "lesson": "Every path named in CODEOWNERS must also appear in protected_paths_extra, so protection is real rather than nominal.",
    "correction_signal_id": "docs/CLAIMS-AUDIT-2026-06-25.md",
    "observation_date": "2026-06-25",
    "promotion_date": "2026-06-25",
    "evidence_summary": "bin/ was protected by CODEOWNERS but missing from protected_paths_extra in config.",
    "gate_added": "CODEOWNERS versus protected_paths_extra agreement check",
    "gate_location": "scripts/check-self-application.mjs"
  }
]
```
