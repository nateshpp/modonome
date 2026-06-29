import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { loadConfig, validateConfig } from "../scripts/validate-config.mjs";
import { resolveRole } from "../scripts/agent/resolve-role.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const configPath = join(root, ".modonome", "config.yaml");

// (a) Backward-compat: flat top-level keys in the real config parse to expected values.
test("backward-compat: flat keys in real config parse correctly", () => {
  const cfg = loadConfig(configPath);
  assert.equal(cfg.autonomy_enabled, false);
  assert.equal(cfg.dry_run, true);
  assert.equal(cfg.auto_merge, false);
  assert.equal(cfg.state_dir, ".modonome");
  assert.equal(cfg.require_distinct_maker_checker_model, true);
  assert.deepEqual(cfg.trusted_author_allowlist, []);
  assert.ok(Array.isArray(cfg.protected_paths_extra), "protected_paths_extra is array");
  assert.ok(cfg.protected_paths_extra.length > 0, "protected_paths_extra has entries");
  assert.equal(cfg.max_merges_per_day, 0);
});

const nestedConfigFixture = {
  schema_version: 1,
  autonomy_enabled: false,
  dry_run: true,
  auto_merge: false,
  state_dir: ".modonome",
  require_distinct_maker_checker_model: true,
  roles: {
    maker: { runner: "local", model: "qwen2.5-coder-7b" },
    checker: { runner: "local", model: "claude-cli" },
    dogfood: { runner: "container", model: "claude-haiku-4-5" },
  },
  runners: {
    local: { labels: ["self-hosted", "mac-mini"], cli_path: "claude" },
    container: { labels: ["ubuntu-latest"], cli_path: "claude" },
  },
  models: {
    "qwen2.5-coder-7b": { provider: "local", base_url: "http://127.0.0.1:8080/v1" },
    "claude-cli": { provider: "local" },
    "claude-haiku-4-5": { provider: "anthropic" },
    "local-default": { provider: "local", base_url: "http://mac-mini.local:11434" },
  },
};

// (b) Nested parser/resolver coverage uses a fixture so local operator config drift
// does not redefine the public contract.
test("nested fixture roles, models, runners resolve correctly", () => {
  const cfg = nestedConfigFixture;
  assert.equal(cfg.roles?.maker?.runner, "local");
  assert.equal(cfg.roles?.maker?.model, "qwen2.5-coder-7b");
  assert.equal(cfg.roles?.checker?.runner, "local");
  assert.equal(cfg.roles?.checker?.model, "claude-cli");
  assert.equal(cfg.roles?.dogfood?.runner, "container");
  assert.equal(cfg.roles?.dogfood?.model, "claude-haiku-4-5");
  assert.equal(cfg.models?.["qwen2.5-coder-7b"]?.provider, "local");
  assert.equal(cfg.models?.["qwen2.5-coder-7b"]?.base_url, "http://127.0.0.1:8080/v1");
  assert.equal(cfg.models?.["claude-cli"]?.provider, "local");
  assert.ok(Array.isArray(cfg.runners?.local?.labels), "local labels is array");
  assert.ok(cfg.runners?.local?.labels.includes("mac-mini"), "local labels includes mac-mini");
});

// (c) validateConfig on the real config returns zero errors.
test("validateConfig on the real config returns zero errors", () => {
  const cfg = loadConfig(configPath);
  const errors = validateConfig(cfg);
  assert.deepEqual(errors, [], `Unexpected errors: ${errors.join("; ")}`);
});

// (d) A config where roles.maker.model equals roles.checker.model produces a distinct-model error.
test("distinct-model enforcement: same maker/checker model triggers error", () => {
  const cfg = {
    schema_version: 1,
    autonomy_enabled: false,
    dry_run: true,
    auto_merge: false,
    state_dir: ".modonome",
    require_distinct_maker_checker_model: true,
    roles: {
      maker: { runner: "container", model: "claude-sonnet-4-6" },
      checker: { runner: "container", model: "claude-sonnet-4-6" },
    },
  };
  const errors = validateConfig(cfg);
  assert.ok(errors.length > 0, "expected at least one error");
  assert.ok(
    errors.some((e) => e.includes("claude-sonnet-4-6")),
    `error should name the model; got: ${errors.join("; ")}`
  );
  assert.ok(
    errors.some((e) => e.includes("maker") && e.includes("checker")),
    `error should name both roles; got: ${errors.join("; ")}`
  );
});

// (e) resolveRole(cfg, 'maker') follows nested fixture config.
test("resolveRole for maker returns fixture local runner and model", () => {
  const cfg = nestedConfigFixture;
  const result = resolveRole(cfg, "maker");
  assert.equal(result.runner, "local");
  assert.equal(result.model, "qwen2.5-coder-7b");
  assert.equal(result.modelProvider, "local");
  assert.deepEqual(result.runnerLabels, ["self-hosted", "mac-mini"]);
  assert.equal(result.cliPath, "claude");
  assert.equal(result.modelBaseUrl, "http://127.0.0.1:8080/v1");
});

test("resolveRole falls back to hosted container defaults when config omits roles", () => {
  const maker = resolveRole({}, "maker");
  assert.equal(maker.runner, "container");
  assert.equal(maker.model, "claude-sonnet-4-6");
  assert.equal(maker.modelProvider, "anthropic");
  assert.deepEqual(maker.runnerLabels, ["ubuntu-latest"]);
  assert.equal(maker.cliPath, "claude");
  assert.equal(maker.modelBaseUrl, undefined);

  const checker = resolveRole({}, "checker");
  assert.equal(checker.runner, "container");
  assert.equal(checker.model, "claude-opus-4-8");
  assert.equal(checker.modelProvider, "anthropic");
});
