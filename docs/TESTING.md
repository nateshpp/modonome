# Testing

This repo has two test audiences.

Maintainers and contributors need executable contracts that keep the engine, gates,
fixtures, public claims, and release evidence aligned. Adopters need the short command set
that tells them whether Modonome is safe to use in their own repo.

## Test Layers

| Layer | Audience | Primary files | Gate |
| --- | --- | --- | --- |
| Gate integrity | Maintainers, framework authors | `agentproof/`, `fixtures/ratchet-diffs/`, `tests/ratchet.test.mjs` | `node agentproof/runner.mjs --json` |
| Repo governance | Maintainers | `.modonome/`, `tests/*`, governance scripts | `npm run verify` |
| Host adoption | Adopters, maintainers | `fixtures/dry-run/`, portability fixtures, examples | `node --test tests/host-adoption.test.mjs tests/portability.test.mjs` |
| Public claims | Maintainers, adopters | `docs/public-claims.json`, README, site, release evidence | `node --test tests/public-claims.test.mjs` |
| Package smoke | Adopters | `package.json`, `bin/`, `scripts/` | `npm pack --dry-run` |

## Fixture Rules

- Each fixture must prove one distinct risk or host behavior.
- Prefer runnable fixtures over prose-only scenarios.
- Negative fixtures must fail through the real gate they exercise.
- Host fixtures should model product behavior: validation, IO boundaries, config, state,
  error paths, and public output.
- Public claims must be backed by a gate or marked as roadmap or design-only.

## Commands

```bash
npm test
node agentproof/runner.mjs --json
npm run verify
npm pack --dry-run
```

Run targeted tests while iterating, then run the full gate set before review.
