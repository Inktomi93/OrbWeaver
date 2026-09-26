// Unified native typecheck execution discovers programs, expands references, and never bails early.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { processEnvValue } from "@orb/tooling/_shared/process-env";
import { classifyTypecheckChild, executeTypecheckPrograms, typecheckCompilerArgv } from "@orb/tooling/verify";
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
