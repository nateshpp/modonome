import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { validate } from "../scripts/lib/jsonschema.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

test("self-application conformance passes on this repo", () => {
  const r = spawnSync("node", [join(root, "scripts/check-self-application.mjs")], { encoding: "utf8", timeout: 30000 });
  assert.strictEqual(r.status, 0, `check-self-application.mjs exited ${r.status}:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /PASS: every repo-local self-governance invariant holds/);
});

test("shipped metrics example conforms to the metrics schema", () => {
  const schema = JSON.parse(readFileSync(join(root, "schemas/metrics.schema.json"), "utf8"));
  const text = readFileSync(join(root, ".modonome/metrics.example.jsonl"), "utf8");
  const lines = text.split("\n").filter((l) => l.trim());
  assert.ok(lines.length > 0, "example file should have at least one event");
  for (const [i, line] of lines.entries()) {
    const errs = validate(schema, JSON.parse(line));
    assert.deepStrictEqual(errs, [], `line ${i + 1} violates the metrics schema: ${errs.join("; ")}`);
  }
});

test("the metrics schema check has teeth (rejects the old malformed shape)", () => {
  const schema = JSON.parse(readFileSync(join(root, "schemas/metrics.schema.json"), "utf8"));
  // The shape that used to ship: "type" instead of "event", no schema_version.
  const bad = { ts: "2026-06-16T09:12:03Z", type: "item_created", id: "item-001" };
  const errs = validate(schema, bad);
  assert.ok(errs.length > 0, "malformed metrics line should fail schema validation");
});
