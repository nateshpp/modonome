import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const registryPath = join(root, "docs", "public-claims.json");

function readText(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function loadRegistry() {
  return JSON.parse(readFileSync(registryPath, "utf8"));
}

test("public claims registry has the required shape", () => {
  const registry = loadRegistry();
  assert.equal(registry.schema_version, 1);
  assert.ok(Array.isArray(registry.claims), "claims must be an array");
  assert.ok(registry.claims.length > 0, "claims registry must not be empty");

  const ids = new Set();
  const statuses = new Set(["shipped-tested", "roadmap", "design-only"]);
  for (const claim of registry.claims) {
    assert.equal(typeof claim.id, "string", "claim id is required");
    assert.ok(!ids.has(claim.id), `duplicate claim id: ${claim.id}`);
    ids.add(claim.id);
    assert.ok(statuses.has(claim.status), `unsupported status for ${claim.id}`);
    assert.equal(typeof claim.claim, "string", `claim text required for ${claim.id}`);
    assert.ok(claim.claim.length > 0, `claim text must not be empty for ${claim.id}`);
    assert.equal(typeof claim.limitation, "string", `limitation required for ${claim.id}`);
    assert.ok(claim.limitation.length > 0, `limitation must not be empty for ${claim.id}`);
    assert.ok(Array.isArray(claim.evidence), `evidence array required for ${claim.id}`);
    assert.ok(Array.isArray(claim.surfaces), `surfaces array required for ${claim.id}`);
    if (claim.status === "shipped-tested") {
      assert.ok(claim.gate, `shipped claim ${claim.id} must name an enforcing gate`);
      assert.ok(claim.evidence.length > 0, `shipped claim ${claim.id} must name evidence`);
    }
  }
});

test("shipped claim gates reference executable repo commands", () => {
  const registry = loadRegistry();
  const pkg = JSON.parse(readText("package.json"));
  for (const claim of registry.claims.filter((c) => c.status === "shipped-tested")) {
    const command = claim.gate.split(/\s+/);
    assert.ok(command.length > 0, `claim ${claim.id} must name a gate command`);
    if (command[0] === "npm") {
      assert.equal(command[1], "run", `npm gate for ${claim.id} must use npm run`);
      assert.ok(pkg.scripts?.[command[2]], `npm gate script missing for ${claim.id}: ${command[2]}`);
    } else if (command[0] === "node") {
      const fileArgs = command.slice(1).filter((arg) => !arg.startsWith("-") && /\//.test(arg));
      assert.ok(fileArgs.length > 0, `node gate for ${claim.id} must reference repo files`);
      for (const rel of fileArgs) assert.ok(existsSync(join(root, rel)), `gate file missing for ${claim.id}: ${rel}`);
    } else {
      assert.fail(`unsupported gate command for ${claim.id}: ${claim.gate}`);
    }
  }
});

test("claim evidence paths and surface needles resolve", () => {
  const registry = loadRegistry();
  for (const claim of registry.claims) {
    for (const rel of claim.evidence) {
      const path = join(root, rel);
      assert.ok(existsSync(path), `missing evidence for ${claim.id}: ${rel}`);
      assert.ok(statSync(path).isFile() || statSync(path).isDirectory(), `invalid evidence path: ${rel}`);
    }
    for (const surface of claim.surfaces) {
      const path = join(root, surface.path);
      assert.ok(existsSync(path), `missing surface for ${claim.id}: ${surface.path}`);
      assert.match(readText(surface.path), new RegExp(escapeRegExp(surface.needle)), `${surface.path} must contain claim needle for ${claim.id}`);
    }
  }
});

test("major public surfaces are covered by at least one claim", () => {
  const registry = loadRegistry();
  const covered = new Set();
  for (const claim of registry.claims) {
    for (const surface of claim.surfaces) covered.add(surface.path);
  }
  for (const rel of ["README.md", "QUICKSTART.md", "ADOPTION-GUIDE.md", "RELEASE-EVIDENCE.md", "site/index.html"]) {
    assert.ok(covered.has(rel), `${rel} must be represented in docs/public-claims.json`);
  }
});

test("25/25 public surfaces are registered as gate-integrity claims", () => {
  const registry = loadRegistry();
  const registered = new Set(
    registry.claims
      .filter((claim) => claim.id === "agentproof-gate-integrity")
      .flatMap((claim) => claim.surfaces.map((surface) => surface.path))
  );

  for (const rel of ["README.md", "QUICKSTART.md", "RELEASE-EVIDENCE.md", "site/index.html"]) {
    if (readText(rel).includes("25/25")) {
      assert.ok(registered.has(rel), `${rel} mentions 25/25 but is not registered under agentproof-gate-integrity`);
    }
  }
});

test("high-risk public phrases are covered by explicit claim entries", () => {
  const registry = loadRegistry();
  const publicSurfaces = ["README.md", "QUICKSTART.md", "ADOPTION-GUIDE.md", "RELEASE-EVIDENCE.md", "site/index.html"];
  const phrases = [
    "25/25",
    "HARDENED",
    "No central service",
    "no telemetry",
    "Private by design",
    "governed autonomy standard",
    "armed mode",
    "knowledge network",
    "patterns shared",
    "· armed",
  ];

  for (const rel of publicSurfaces) {
    const content = readText(rel).toLowerCase();
    const registered = registry.claims
      .flatMap((claim) => claim.surfaces)
      .filter((surface) => surface.path === rel)
      .map((surface) => surface.needle.toLowerCase());

    for (const phrase of phrases) {
      const normalized = phrase.toLowerCase();
      if (!content.includes(normalized)) continue;
      assert.ok(
        registered.some((needle) => needle.includes(normalized) || normalized.includes(needle)),
        `${rel} contains high-risk phrase "${phrase}" without an explicit public claim entry`
      );
    }
  }
});

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
