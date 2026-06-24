# Modonome decisions

Every decision defaults to hold when unanswered.

## Resolved

- id: self-maintenance-scope
  question: Which surfaces should Modonome maintain on its own repo autonomously?
  decision: Tier 1 (docs, examples, tests, fixtures) autonomous. Tier 2 (scripts, schemas,
    prompts, templates, .github) owner-reviewed. See docs/adr/ADR-001.
  resolved: 2026-06-24

## Open

- id: shadow-mode-implementation-timing
  question: Implement shadow mode in v0.2 or keep as a later milestone?
  decision: ADR-002 says v0.2. Confirm when v0.2 scope is finalized.
  options:
    - v02: Implement --shadow flag on dry-run-sweep in v0.2 as WI-011.
    - later: Defer beyond v0.2 and keep it off the near-term roadmap.
  recommendation: v0.2, see ADR-002.
  default_on_timeout: hold

- id: agentproof-conformance-interface
  question: Publish a standalone conformance interface spec for third-party runners?
  decision: ADR-003 says yes for v0.3. Confirm scope before starting WI-012.
  options:
    - standalone-spec: agentproof/CONFORMANCE-INTERFACE.md with stdio runner protocol.
    - in-repo-only: Keep AgentProof as an internal benchmark; do not publish a separate spec.
  recommendation: standalone-spec, see ADR-003.
  default_on_timeout: hold

- id: dry-run-git-integration
  question: Should dry-run read git history for repo-specific proposals (WI-015)?
  options:
    - shallow-git: Run 'git log --oneline -20' and find most-changed files with no test neighbors.
    - static-only: Keep static proposals; improve specificity through better stack heuristics only.
  recommendation: shallow-git. This is the "Vagrant moment" for the tool; generic proposals
    do not differentiate modonome from a documentation page.
  default_on_timeout: hold
