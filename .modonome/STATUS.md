# Modonome Status

**Repository state:** Stable  
**Current mode:** Dry-run  
**Autonomy enabled:** false  

## Phase A — Local Agentic Orchestration (dry-run verified 2026-06-27)

The maker → checker loop is verified end-to-end in dry-run mode using fully local models:

- **Maker:** `qwen2.5.1-coder-7b-instruct` via fleet gateway at `127.0.0.1:8080`
- **Checker:** `mistralai/mistral-7b-instruct-v0.3` via same gateway
- **Gateway:** OpenAI-compatible proxy (Uvicorn/FastAPI) with global semaphore and forced non-streaming
- **Dry run:** rehearsal-5 completed — queued → making → checking → merge_ready (parked)
- **Diff:** 42 lines, within cap; gates green; checker advisory only (no requested changes)

Go-live checklist (owner sign-off required before arming):
- [ ] Set `autonomy_enabled: true` in config and `MODONOME_ARMED=true` in env
- [ ] Set `dry_run: false`
- [ ] Confirm `ANTHROPIC_API_KEY` unset in run env (local-only posture)
- [ ] Pick a queued Tier-1, non-protected work item
- [ ] Run `factory-run-one --fleet-config /Users/nateshpp/agent-factory/fleet.config.yaml ...`

## Queue

WI-999 (test-autonomous-orchestration) is queued as a dry-rehearsal reference item.
For real work, pick or author a Tier-1 non-protected item and run the live loop.

See `ROADMAP.md` for the committed roadmap (Milestones 1-6) and `docs/research/` for
exploratory directions.

## Decisions

See `DECISIONS.md` for open questions.

## Learnings

See `LEARNINGS.md` for staged governance improvements.

## Network

See `NETWORK.md` for knowledge network configuration.
