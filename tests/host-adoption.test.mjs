import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const fixtures = join(root, "fixtures", "dry-run");

function dryRun(dir) {
  return spawnSync("node", [join(root, "scripts", "dry-run-sweep.mjs"), dir], {
    encoding: "utf8",
    timeout: 30000,
  });
}

function withFixtureCopy(name, fn) {
  const tmp = mkdtempSync(join(tmpdir(), `modonome-host-${name}-`));
  try {
    cpSync(join(fixtures, name), tmp, { recursive: true });
    return fn(tmp);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const stackCases = [
  ["pnpm", /Node or TypeScript/, /Detected stack: Node or TypeScript \(pnpm\)/, /pnpm test/],
  ["yarn", /Node or TypeScript/, /Detected stack: Node or TypeScript \(yarn\)/, /yarn test/],
  ["java-maven", /Java \(Maven\)/, /\.\/mvnw verify/, /jacoco:check/],
  ["java-gradle", /Java \(Gradle\)/, /\.\/gradlew check/, /jacocoTestCoverageVerification/],
  ["go", /Go/, /go vet \.\/\.\.\./, /go test \.\/\.\.\./],
  ["dotnet", /C# \(\.NET\)/, /dotnet build/, /dotnet test/],
  ["terraform", /Infrastructure \(Terraform\)/, /terraform fmt -check/, /terraform validate/],
];

for (const [name, stackRe, gateOneRe, gateTwoRe] of stackCases) {
  test(`dry-run adopts ${name} host signals`, () => {
    withFixtureCopy(name, (target) => {
      const result = dryRun(target);
      assert.equal(result.status, 0, `exited ${result.status}: ${result.stderr}`);
      assert.match(result.stdout, stackRe);
      assert.match(result.stdout, gateOneRe);
      assert.match(result.stdout, gateTwoRe);
      assert.match(result.stdout, /Mode: dry-run\. This run changed nothing/);
      assert.match(result.stdout, /Refused by default/);
      assert.ok(existsSync(join(target, ".modonome", "runs")), "dry-run records an ignored run log");
    });
  });
}

test("dry-run adopts an existing .autonomy state directory", () => {
  withFixtureCopy("autonomy", (target) => {
    const result = dryRun(target);
    assert.equal(result.status, 0, `exited ${result.status}: ${result.stderr}`);
    assert.match(result.stdout, /State directory: \.autonomy \(adopted\)/);
    assert.ok(existsSync(join(target, ".autonomy", "config.yaml")), "existing .autonomy state remains intact");
    assert.ok(
      existsSync(join(target, ".modonome", "runs")),
      "current dry-run observability still writes ignored logs under .modonome/runs"
    );
  });
});

test("dry-run leaves host files untouched apart from ignored run logs", () => {
  withFixtureCopy("pnpm", (target) => {
    const pkgPath = join(target, "package.json");
    const beforePkg = readFileSync(pkgPath, "utf8");
    const result = dryRun(target);
    assert.equal(result.status, 0, `exited ${result.status}: ${result.stderr}`);
    assert.equal(readFileSync(pkgPath, "utf8"), beforePkg, "package.json must not change");

    const rootEntries = readdirSync(target).sort();
    assert.deepEqual(rootEntries, [".modonome", "package.json", "pnpm-lock.yaml"]);
    const runDir = join(target, ".modonome", "runs");
    assert.ok(existsSync(runDir), "dry-run may write an ignored run log");
    assert.ok(readdirSync(runDir).some((file) => file.endsWith("-dry-run.json")), "run log must be recorded");
  });
});
