// Unified native typecheck execution discovers programs, expands references, and never bails early.
import { copyFileSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { processEnvValue } from "@orb/tooling/_shared/process-env";
import { classifyTypecheckChild, executeTypecheckPrograms, typecheckCompilerArgv } from "@orb/tooling/verify";
import { readApplicationSubjects } from "../../../../tooling/src/verify/lib/application-programs.ts";
import { readPolicyRepositoryInventory } from "../../../../tooling/src/verify/lib/policy-repo-inventory.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const BASE = JSON.stringify({
  compilerOptions: {
    noEmit: true,
    strict: true,
    target: "es2025",
    lib: ["es2025"],
    module: "nodenext",
    moduleResolution: "nodenext",
    types: [],
    skipLibCheck: true,
  },
  files: [],
});

function plant(root: string, files: Readonly<Record<string, string>>): void {
  execFixtureGit(root, ["init", "--quiet", "--template=", "--initial-branch=main"]);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

const TIMEOUT = scaledBudget(30_000);

function plantApplicationRepo(scratch: string, repoRoot: string): void {
  plant(scratch, {
    ".gitignore": "node_modules\ntest-results\n",
    "package.json": JSON.stringify({ type: "module", scripts: { build: "node build.ts" }, devDependencies: { "@playwright/test": "*" } }),
    "tsconfig.base.json": BASE,
    "tsconfig.json": JSON.stringify({
      extends: "./tsconfig.base.json",
      include: ["*.config.ts", "build.ts", "scripts/**/*.ts", "tests/**/*.ts", "reset.d.ts", "platform.d.ts", "aggregator-assets.d.ts"],
      exclude: ["tests/e2e"],
    }),
    "packages/kit/tsconfig.json": JSON.stringify({ extends: "../../tsconfig.base.json", include: ["src", "../../reset.d.ts", "../../platform.d.ts"] }),
    "packages/ui/tsconfig.json": JSON.stringify({
      extends: "../../tsconfig.base.json",
      compilerOptions: { lib: ["es2025", "dom"] },
      include: ["src", "../../reset.d.ts", "../../platform.d.ts"],
    }),
    "tsconfig.tests-dom.json": JSON.stringify({
      extends: "./tsconfig.base.json",
      compilerOptions: { lib: ["es2025", "dom"], jsx: "react-jsx" },
      include: [
        "tests/**/*.ct.tsx",
        "tests/e2e",
        "reset.d.ts",
        "platform.d.ts",
        "packages/ui/src/markdown/css-modules.d.ts",
        "playwright/globals.d.ts",
        "tests/support/vitest-tags.d.ts",
      ],
    }),
    "packages/kit/src/value.ts": "export const value = 1;\n",
    "packages/ui/src/index.ts": "export const ui = 1;\n",
    "packages/ui/src/markdown/css-modules.d.ts": "export {};\n",
    "build.ts": "export {};\n",
    "reset.d.ts": "export {};\n",
    "platform.d.ts": "export {};\n",
    "aggregator-assets.d.ts": "export {};\n",
    "playwright/globals.d.ts": "export {};\n",
    "tests/support/vitest-tags.d.ts": "export {};\n",
    "scripts/unrelated.ts": 'export const value: number = "wrong";\n',
    "vitest.product.config.ts": 'export default { test: { name: "unit", include: ["tests/kit/*.test.ts"] } };\n',
    "playwright-ct.product.config.ts": 'export default { testDir: "./tests", testMatch: "**/*.ct.tsx" };\n',
    "playwright.config.ts": 'export default { testDir: "./tests/e2e", testMatch: "**/*.spec.ts" };\n',
    "tests/kit/value.test.ts": "export const fixture = true;\n",
    "tests/ui/value.ct.tsx": 'import { test } from "@playwright/test"; test("collection fixture", () => {});\n',
    "tests/e2e/value.spec.ts": 'import { test } from "@playwright/test"; test("collection fixture", () => {});\n',
  });
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
}

test("application native roots exclude an unrelated tool error but retain imported errors", { timeout: TIMEOUT }, async ({ runCli, scratch, repoRoot }) => {
  plantApplicationRepo(scratch, repoRoot);
  const authored = readPolicyRepositoryInventory(scratch).paths;
  await readApplicationSubjects(scratch);
  expect(readPolicyRepositoryInventory(scratch).paths).toEqual(authored);
  const application = await runCli("verify", ["typecheck", "--application"], { cwd: scratch, timeoutMs: TIMEOUT });
  await expect(application).toExitWith(0);
  expect(application.stdout).toContain("application");
  const global = await runCli("verify", ["typecheck"], { cwd: scratch, timeoutMs: TIMEOUT });
  await expect(global).toExitWith(1);
  expect(global.stdout).toContain("scripts/unrelated.ts");
  writeFileSync(join(scratch, "packages/kit/src/value.ts"), 'import "../../../scripts/unrelated.ts";\nexport const value = 1;\n');
  const imported = await runCli("verify", ["typecheck", "--application"], { cwd: scratch, timeoutMs: TIMEOUT });
  await expect(imported).toExitWith(1);
  expect(imported.stdout).toContain("TS2322");
  expect(imported.stdout).toContain("scripts/unrelated.ts");
  expect(readPolicyRepositoryInventory(scratch).paths).toEqual(authored);
});

test("application native ownership refuses DOM pollution in an isomorphic application closure", { timeout: TIMEOUT }, async ({ runCli, scratch, repoRoot }) => {
  plantApplicationRepo(scratch, repoRoot);
  writeFileSync(join(scratch, "packages/kit/src/value.ts"), '/// <reference lib="dom" />\nexport const value = document.title;\n');
  const result = await runCli("verify", ["tests-membership", "--application"], { cwd: scratch, timeoutMs: TIMEOUT });
  await expect(result).toExitWith(1);
  expect(result.stdout).toContain("packages/kit/tsconfig.json [iso] acquired forbidden browser-libraries");
  expect(result.stdout).toContain("packages/kit/src/value.ts");
});

test("application qualification refuses an empty authored test denominator despite valid application sources", { timeout: TIMEOUT }, async ({
  runCli,
  scratch,
  repoRoot,
}) => {
  plantApplicationRepo(scratch, repoRoot);
  for (const file of ["tests/kit/value.test.ts", "tests/ui/value.ct.tsx", "tests/e2e/value.spec.ts"]) {
    rmSync(join(scratch, file));
  }
  const result = await runCli("verify", ["typecheck", "--application"], { cwd: scratch, timeoutMs: TIMEOUT });
  await expect(result).toExitWith(2);
  expect(result.stderr).toContain("no authored product tests");
});

test("application qualification refuses a native runner that omits an existing product test", { timeout: TIMEOUT }, async ({ runCli, scratch, repoRoot }) => {
  plantApplicationRepo(scratch, repoRoot);
  writeFileSync(join(scratch, "vitest.product.config.ts"), 'export default { test: { name: "unit", include: ["tests/absent/*.test.ts"] } };\n');
  const result = await runCli("verify", ["typecheck", "--application"], { cwd: scratch, timeoutMs: TIMEOUT });
  await expect(result).toExitWith(2);
  expect(result.stderr).toContain("missing {tests/kit/value.test.ts}");
});

test.for(["tests/ui/primitives/example.test.tsx", "tests/support/shape.ct-d.ts"])(
  "application qualification refuses the unregistered test kind %s before native collection can omit it",
  { timeout: TIMEOUT },
  async (path, { runCli, scratch, repoRoot }) => {
    plantApplicationRepo(scratch, repoRoot);
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), "export const unsupported = true;\n");
    const result = await runCli("verify", ["typecheck", "--application"], { cwd: scratch, timeoutMs: TIMEOUT });
    await expect(result).toExitWith(2);
    expect(result.stderr).toContain(`application test kind is unregistered: ${path}`);
  },
);

test("application native lint excludes unrelated tooling findings while global lint and app findings remain blocking", { timeout: TIMEOUT }, async ({
  runCli,
  scratch,
  repoRoot,
}) => {
  plantApplicationRepo(scratch, repoRoot);
  writeFileSync(
    join(scratch, "biome.json"),
    JSON.stringify({
      formatter: { enabled: false },
      assist: { enabled: false },
      linter: { rules: { recommended: false, suspicious: { noDebugger: "error" } } },
    }),
  );
  writeFileSync(join(scratch, "scripts/unrelated.ts"), "debugger;\nexport {};\n");
  await expect(await runCli("verify", ["application-static", "biome"], { cwd: scratch, timeoutMs: TIMEOUT })).toExitWith(0);
  const global = runNicedSync(join(repoRoot, "node_modules/.bin/biome"), ["check", "scripts/unrelated.ts", "--diagnostic-level=error"], { cwd: scratch });
  expect(global.status, global.stderr).toBe(1);
  expect(global.stderr).toContain("noDebugger");
  writeFileSync(join(scratch, "packages/kit/src/value.ts"), "debugger;\nexport {};\n");
  const app = await runCli("verify", ["application-static", "biome"], { cwd: scratch, timeoutMs: TIMEOUT });
  await expect(app).toExitWith(1);
  expect(app.stdout + app.stderr).toContain("packages/kit/src/value.ts");
});

test("application native import direction keeps the real rule while unrelated tooling imports belong to global checking", { timeout: TIMEOUT }, async ({
  runCli,
  scratch,
  repoRoot,
}) => {
  plantApplicationRepo(scratch, repoRoot);
  writeFileSync(join(scratch, ".dependency-cruiser.cjs"), `module.exports = require(${JSON.stringify(join(repoRoot, ".dependency-cruiser.cjs"))});\n`);
  writeFileSync(join(scratch, "scripts/unrelated.ts"), 'import "./missing.ts";\n');
  await expect(await runCli("verify", ["application-static", "imports"], { cwd: scratch, timeoutMs: TIMEOUT })).toExitWith(0);
  const global = runNicedSync(
    join(repoRoot, "node_modules/.bin/depcruise"),
    ["scripts/unrelated.ts", "--config", ".dependency-cruiser.cjs", "--output-type", "err-long"],
    { cwd: scratch },
  );
  expect(global.status, global.stderr).toBe(1);
  expect(global.stdout + global.stderr).toContain("not-to-unresolvable");
  writeFileSync(join(scratch, "packages/kit/src/value.ts"), 'import "node:fs";\nexport const value = 1;\n');
  const app = await runCli("verify", ["application-static", "imports"], { cwd: scratch, timeoutMs: TIMEOUT });
  await expect(app).toExitWith(1);
  expect(app.stdout + app.stderr).toContain("kit-no-node-builtins");
});

test("application import entry roots preserve test composition without widening deployed domain rules", { timeout: TIMEOUT }, async ({
  runCli,
  scratch,
  repoRoot,
}) => {
  plantApplicationRepo(scratch, repoRoot);
  plant(scratch, {
    "packages/server/tsconfig.json": JSON.stringify({ extends: "../../tsconfig.base.json", include: ["src", "../../reset.d.ts", "../../platform.d.ts"] }),
    "packages/server/src/domain/demo/service.ts": "export const service = true;\n",
    "tests/kit/value.test.ts": 'import "../support/demo.ts";\n',
    "tests/support/demo.ts": 'import "../../packages/server/src/domain/demo/service.ts";\n',
    ".dependency-cruiser.cjs": `module.exports = require(${JSON.stringify(join(repoRoot, ".dependency-cruiser.cjs"))});\n`,
  });
  const clean = await runCli("verify", ["application-static", "imports"], { cwd: scratch, timeoutMs: TIMEOUT });
  await expect(clean).toExitWith(0);
  writeFileSync(join(scratch, "packages/server/src/index.ts"), 'import "../../../tests/support/demo.ts";\n');
  const reached = await runCli("verify", ["application-static", "imports"], { cwd: scratch, timeoutMs: TIMEOUT });
  await expect(reached).toExitWith(1);
  expect(reached.stdout + reached.stderr).toContain("domain-feature-front-door");
  expect(reached.stdout + reached.stderr).toContain("tests/support/demo.ts");
});

test("application native CPD overrides global roots but rejects actual duplicated application implementation", { timeout: TIMEOUT }, async ({
  runCli,
  scratch,
  repoRoot,
}) => {
  plantApplicationRepo(scratch, repoRoot);
  copyFileSync(join(repoRoot, "scripts/cpd.ts"), join(scratch, "scripts/cpd.ts"));
  copyFileSync(join(repoRoot, "jscpd.json"), join(scratch, "jscpd.json"));
  mkdirSync(join(scratch, "tooling/src/proof/lib"), { recursive: true });
  const duplicate =
    "export function score(values: readonly number[]): number {\n  let total = 0;\n  for (const value of values) {\n    if (value > 10) {\n      total += value * value + value / 2;\n    } else {\n      total -= value * 3 + value / 4;\n    }\n  }\n  return total;\n}\n";
  writeFileSync(join(scratch, "packages/kit/src/value.ts"), duplicate);
  writeFileSync(join(scratch, "tooling/src/proof/lib/first.ts"), duplicate);
  writeFileSync(join(scratch, "tooling/src/proof/lib/second.ts"), duplicate);
  await expect(await runCli("verify", ["application-static", "cpd"], { cwd: scratch, timeoutMs: TIMEOUT })).toExitWith(0);
  const global = runNicedSync(join(repoRoot, "node_modules/.bin/jscpd"), ["-c", "jscpd.json", "--workers", "1", "--fail-on-empty"], { cwd: scratch });
  expect(global.status, global.stderr).toBe(1);
  expect(global.stdout + global.stderr).toContain("proof/lib/first.ts");
  expect(global.stdout + global.stderr).toContain("proof/lib/second.ts");
  writeFileSync(join(scratch, "packages/kit/src/first.ts"), duplicate);
  writeFileSync(join(scratch, "packages/kit/src/second.ts"), duplicate);
  const app = await runCli("verify", ["application-static", "cpd"], { cwd: scratch, timeoutMs: TIMEOUT });
  await expect(app).toExitWith(1);
  expect(app.stdout + app.stderr).toContain("first.ts");
  expect(app.stdout + app.stderr).toContain("second.ts");
});

test("an extended concrete parent still reports native diagnostics through discovery and explicit selection", { timeout: TIMEOUT }, async ({
  runCli,
  scratch,
}) => {
  plant(scratch, {
    "package.json": JSON.stringify({ type: "module" }),
    "tsconfig.base.json": BASE,
    "tsconfig.json": JSON.stringify({ extends: "./tsconfig.base.json", files: ["bad.ts"] }),
    "tsconfig.child.json": JSON.stringify({ extends: "./tsconfig.json", files: ["good.ts"] }),
    "bad.ts": 'export const value: number = "wrong";\n',
    "good.ts": "export const value = 1;\n",
  });
  const discovered = await runCli("verify", ["typecheck"], { cwd: scratch, timeoutMs: TIMEOUT });
  await expect(discovered).toExitWith(1);
  expect(discovered.stdout).toContain("FAIL tsconfig.json");
  expect(discovered.stdout).toContain("PASS tsconfig.child.json");
  expect(discovered.stdout).toContain("TS2322");
  const explicit = await runCli("verify", ["typecheck", "--config", "tsconfig.json"], { cwd: scratch, timeoutMs: TIMEOUT });
  await expect(explicit).toExitWith(1);
  expect(explicit.stdout).toContain("FAIL tsconfig.json");
  expect(explicit.stdout).toContain("TS2322");
  expect(explicit.stdout).not.toContain("PASS tsconfig.child.json");
});

test("a newly discovered program with a native type error is checked without registration", { timeout: TIMEOUT }, async ({ runCli, scratch }) => {
  plant(scratch, {
    "package.json": JSON.stringify({ type: "module" }),
    "tsconfig.base.json": BASE,
    "nested/tsconfig.json": JSON.stringify({ extends: "../tsconfig.base.json", files: ["bad.ts"] }),
    "nested/bad.ts": 'export const value: number = "wrong";\n',
  });
  const result = await runCli("verify", ["typecheck"], { cwd: scratch, timeoutMs: TIMEOUT });
  await expect(result).toExitWith(1);
  expect(result.stdout).toContain("nested/tsconfig.json");
  expect(result.stdout).toContain("TS2322");
});

test("a requested reference container runs its leaf, while the container is not a fake pass", { timeout: TIMEOUT }, async ({ runCli, scratch }) => {
  plant(scratch, {
    "package.json": JSON.stringify({ type: "module" }),
    "tsconfig.base.json": BASE,
    "tsconfig.json": JSON.stringify({ files: [], references: [{ path: "./leaf" }] }),
    "leaf/tsconfig.json": JSON.stringify({ extends: "../tsconfig.base.json", files: ["value.ts"] }),
    "leaf/value.ts": "export const value = 1;\n",
  });
  const result = await runCli("verify", ["typecheck", "--config", "tsconfig.json"], { cwd: scratch, timeoutMs: TIMEOUT });
  await expect(result).toExitWith(0);
  expect(result.stdout).toContain("PASS leaf/tsconfig.json");
  expect(result.stdout).toContain("SKIP tsconfig.json (reference-only container)");
});

test("explicit configs run exactly once and a failure does not hide a later program", { timeout: TIMEOUT }, async ({ runCli, scratch }) => {
  plant(scratch, {
    "package.json": JSON.stringify({ type: "module" }),
    "tsconfig.base.json": BASE,
    "a/tsconfig.json": JSON.stringify({ extends: "../tsconfig.base.json", files: ["bad.ts"] }),
    "a/bad.ts": 'export const value: number = "wrong";\n',
    "b/tsconfig.json": JSON.stringify({ extends: "../tsconfig.base.json", files: ["good.ts"] }),
    "b/good.ts": "export const value = 1;\n",
  });
  const result = await runCli("verify", ["typecheck", "--config", "a/tsconfig.json", "--config", "b/tsconfig.json", "--config", "a/tsconfig.json"], {
    cwd: scratch,
    timeoutMs: TIMEOUT,
  });
  await expect(result).toExitWith(1);
  expect(result.stdout.match(/a\/tsconfig\.json/gu)).toHaveLength(1);
  expect(result.stdout.match(/b\/tsconfig\.json/gu)).toHaveLength(1);
  expect(result.stdout).toContain("FAIL a/tsconfig.json");
  expect(result.stdout).toContain("PASS b/tsconfig.json");
});

test("unknown and malformed configs refuse instead of returning a clean empty run", { timeout: TIMEOUT }, async ({ runCli, scratch }) => {
  plant(scratch, {
    "package.json": JSON.stringify({ type: "module" }),
    "tsconfig.base.json": BASE,
    "good/tsconfig.json": JSON.stringify({ extends: "../tsconfig.base.json", files: ["value.ts"] }),
    "good/value.ts": "export const value = 1;\n",
  });
  await expect(await runCli("verify", ["typecheck", "--config", "missing/tsconfig.json"], { cwd: scratch, timeoutMs: TIMEOUT })).toExitWith(3);
  mkdirSync(join(scratch, "broken"), { recursive: true });
  writeFileSync(join(scratch, "broken", "tsconfig.json"), "{");
  await expect(await runCli("verify", ["typecheck"], { cwd: scratch, timeoutMs: TIMEOUT })).toExitWith(2);
});

test("an abstract-only tree refuses instead of reporting a fake successful compiler run", { timeout: TIMEOUT }, async ({ runCli, scratch }) => {
  plant(scratch, { "tsconfig.base.json": BASE });
  await expect(await runCli("verify", ["typecheck"], { cwd: scratch, timeoutMs: TIMEOUT })).toExitWith(2);
});

test("native diagnostics are violations while a dead or non-compiler child is a tool error", () => {
  expect(classifyTypecheckChild({ code: 1, stdout: "x.ts(1,1): error TS2322: wrong\n", stderr: "", timedOut: false })).toBe("violations");
  expect(classifyTypecheckChild({ code: 70, stdout: "x.ts(1,1): error TS2322: partial\n", stderr: "", timedOut: false })).toBe("tool-error");
  expect(classifyTypecheckChild({ code: 1, stdout: "", stderr: "Cannot find module ts7", timedOut: false })).toBe("tool-error");
  expect(classifyTypecheckChild({ code: null, stdout: "", stderr: "killed", timedOut: true })).toBe("tool-error");
});

test("a signaled native child stays a tool error through the real wrapper and does not skip the next program", { timeout: TIMEOUT }, async ({
  runCli,
  scratch,
}) => {
  plant(scratch, {
    "package.json": JSON.stringify({ type: "module" }),
    "tsconfig.base.json": BASE,
    "a/tsconfig.json": JSON.stringify({ extends: "../tsconfig.base.json", files: ["value.ts"] }),
    "a/value.ts": "export const value = 1;\n",
    "b/tsconfig.json": JSON.stringify({ extends: "../tsconfig.base.json", files: ["value.ts"] }),
    "b/value.ts": "export const value = 1;\n",
  });
  // The wrapper spawns the compiler asynchronously (its host slot's lease beats on a timer), so the plant replaces
  // `spawn`, and only for the compiler itself: the call whose argv carries ts7's `tsc` and names program a.
  const preload = join(scratch, "signal-one-compiler.cjs");
  writeFileSync(
    preload,
    'const cp = require("node:child_process");\n' +
      'const { EventEmitter } = require("node:events");\n' +
      "const real = cp.spawn;\n" +
      "cp.spawn = (command, args, options) => {\n" +
      '  if (args?.some((arg) => /[\\\\/]ts7[\\\\/]bin[\\\\/]tsc$/u.test(arg)) && args.at(-1) === "a/tsconfig.json") {\n' +
      '    process.stdout.write("partial.ts(1,1): error TS2322: emitted before signal\\n");\n' +
      "    const child = new EventEmitter();\n" +
      '    process.nextTick(() => child.emit("exit", null, "SIGTERM"));\n' +
      "    return child;\n" +
      "  }\n" +
      "  return real(command, args, options);\n" +
      "};\n" +
      'require("node:module").syncBuiltinESMExports();\n',
  );
  const result = await runCli("verify", ["typecheck"], {
    cwd: scratch,
    env: Object.fromEntries([
      ["NODE_OPTIONS", `--require=${preload}`],
      ["PATH", processEnvValue("PATH") ?? ""],
    ]),
    timeoutMs: TIMEOUT,
  });
  await expect(result).toExitWith(2);
  expect(result.stdout).toContain("TOOL ERROR a/tsconfig.json");
  expect(result.stdout).toContain("error TS2322: emitted before signal");
  expect(result.stdout).toContain("PASS b/tsconfig.json");
});

test("program concurrency obeys the supplied profile cap and the compiler argv stays cold", { timeout: TIMEOUT }, async ({ scratch }) => {
  plant(scratch, {
    "tsconfig.base.json": BASE,
    "a/tsconfig.json": JSON.stringify({ extends: "../tsconfig.base.json", files: ["value.ts"] }),
    "a/value.ts": "export const value = 1;\n",
    "b/tsconfig.json": JSON.stringify({ extends: "../tsconfig.base.json", files: ["value.ts"] }),
    "b/value.ts": "export const value = 1;\n",
    "c/tsconfig.json": JSON.stringify({ extends: "../tsconfig.base.json", files: ["value.ts"] }),
    "c/value.ts": "export const value = 1;\n",
  });
  let active = 0;
  let maximum = 0;
  const result = await executeTypecheckPrograms(scratch, null, {
    concurrency: 2,
    runner: (config) =>
      new Promise((resolve) => {
        active += 1;
        maximum = Math.max(maximum, active);
        queueMicrotask(() => {
          active -= 1;
          resolve({ code: 0, stdout: config, stderr: "", timedOut: false });
        });
      }),
  });
  expect(maximum).toBe(2);
  expect(result.programs.map(({ config }) => config)).toEqual(["a/tsconfig.json", "b/tsconfig.json", "c/tsconfig.json"]);
  const argv = typecheckCompilerArgv("a/tsconfig.json");
  expect(argv).toEqual(expect.arrayContaining(["--noEmit", "--pretty", "false", "-p", "a/tsconfig.json"]));
  expect(argv).not.toContain("--incremental");
  expect(argv).not.toContain("--tsBuildInfoFile");
});
