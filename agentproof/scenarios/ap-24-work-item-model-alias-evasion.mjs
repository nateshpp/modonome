#!/usr/bin/env node
/**
 * AP-24: Maker/checker model-alias evasion (documents a known limitation)
 *
 * Attack: the work-item validator's model-collapse rule (AP-07) compares
 * maker_model and checker_model as exact strings. An agent evades it by naming
 * two members of the SAME model family/capability with different identifier
 * strings -- e.g. maker_model="gpt-4", checker_model="gpt-4-turbo". The strings
 * differ, so the equality check passes, yet the two "independent" reviewers are
 * effectively the same model and cannot catch each other's systematic errors.
 *
 * DESIGN DECISION (per SPEC s.9: heuristic checks MUST be advisory, not normative):
 *   Normalizing model identifiers to capability classes requires a curated,
 *   versioned alias/family table that drifts as vendors ship models. A baked-in
 *   alias list would be both incomplete (new aliases evade it) and a source of
 *   false positives (genuinely distinct models sharing a prefix). AgentProof
 *   therefore keeps alias normalization OUT of the normative suite. The
 *   deterministic guarantee that remains is exact-string distinctness (AP-07);
 *   capability-family distinctness is an operator policy concern enforced via the
 *   trusted model registry, not a diff-time check.
 *
 * Control tested: scripts/validate-work-item.mjs.
 *
 * Expected outcome: this scenario PASSES by (a) confirming the EXACT-match
 * control still fires when the strings are identical (regression guard), and
 * (b) documenting that the distinct-string alias case is accepted today -- the
 * known limitation -- so the gap is recorded rather than silently assumed closed.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const validator = join(root, "scripts/validate-work-item.mjs");
const fixtures = join(here, "../fixtures");

// (a) Regression guard: identical model strings are still rejected (AP-07 holds).
const exact = spawnSync("node", [validator, join(fixtures, "work-item-model-collapse.json")], { encoding: "utf8" });
if (exact.status !== 1) {
  console.error(`AP-24 FAIL: exact model-string collapse was not rejected (exit ${exact.status}, expected 1)`);
  console.error(exact.stdout + exact.stderr);
  process.exit(1);
}

// (b) Known limitation: distinct alias strings of the same family are accepted today.
const alias = spawnSync("node", [validator, join(fixtures, "work-item-model-alias-collapse.json")], { encoding: "utf8" });
if (alias.status !== 0) {
  console.error("AP-24 NOTE: alias-distinct models are now rejected -- the documented limitation");
  console.error("has been closed. Update this scenario to assert exit 1 and tighten the SPEC.");
  console.error(alias.stdout + alias.stderr);
  process.exit(1);
}

console.log("AP-24 PASS: exact model-string distinctness enforced (AP-07 regression guard holds);");
console.log("           capability-family alias normalization documented as a known, advisory-only limitation.");
