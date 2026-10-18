// @subject tooling/src/verify/ops/typecheck.ts
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import { z } from "zod";
import { scaledBudget } from "../../_load-budget.ts";
import { copyNativeInventoryImplementation } from "../../floor/compiler/native-inventory-tree.ts";

const TIMEOUT = scaledBudget(30_000);
const BRIDGE = "packages/client/src/data/trpc.ts";
const CLIENT = "packages/client/tsconfig.json";
const ENTRY = "packages/server/dist/router-types/index.d.ts";
const completionSchema = z.object({ code: z.number(), config: z.string() });
const OPTIONS = { target: "ES2025", module: "NodeNext", strict: true, skipLibCheck: true, noEmit: true, types: [] };

function plant(scratch: string, repoRoot: string, mode: string): string {
  const root = copyNativeInventoryImplementation(scratch, repoRoot);
  copyFileSync(join(repoRoot, "knip.ts"), join(root, "knip.ts"));
  copyFileSync(join(repoRoot, "tooling/concurrency-profile.json"), join(root, "tooling/concurrency-profile.json"));
  const files = {
    ".gitignore": "node_modules\n.cache\npackages/server/dist\n",
    "packages/server/package.json": JSON.stringify({
      type: "module",
      exports: { ".": "./src/index.ts", "./router-types": { types: "./dist/router-types/index.d.ts" } },
    }),
    "packages/server/tsconfig.json": JSON.stringify({ compilerOptions: OPTIONS, files: ["src/index.ts"] }),
    "packages/server/src/index.ts": 'export interface AppRouter { readonly mode: "first" }',
    [CLIENT]: JSON.stringify({ compilerOptions: OPTIONS, files: ["src/data/trpc.ts"] }),
    [BRIDGE]: 'import type { AppRouter } from "@orb/server"; export const mode: AppRouter["mode"] = "first";',
    "unrelated/tsconfig.json": JSON.stringify({ compilerOptions: OPTIONS, files: ["value.ts"] }),
    "unrelated/value.ts": "export const value = 1;",
    "consumer/tsconfig.json": JSON.stringify({ compilerOptions: OPTIONS, files: ["value.ts"] }),
    "consumer/value.ts": 'import "../packages/client/src/data/trpc.js";',
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  execFixtureGit(root, ["init", "--quiet", "--template=", "--initial-branch=main"]);
  const localPackages = join(root, "packages/client/node_modules/@orb");
  mkdirSync(localPackages, { recursive: true });
  symlinkSync(join(root, "packages/server"), join(localPackages, "server"), "dir");
  mkdirSync(join(root, "scripts"));
  const wrapper = readFileSync(join(repoRoot, "scripts/ts7.ts"), "utf8").replace(
    "#!/usr/bin/env node\n",
    '#!/usr/bin/env node\nprocess.argv.push("--listFiles");\n',
  );
  let mutation = "";
  if (mode === "source" || mode === "abnormal") {
    mutation = `writeFileSync(${JSON.stringify(join(root, "packages/server/src/index.ts"))}, 'export interface AppRouter { readonly mode: "second" }');`;
  } else if (mode === "helper") {
    mutation = `const helper = ${JSON.stringify(join(root, "tooling/src/floor/compiler/router-declaration-inputs.ts"))}; writeFileSync(helper, readFileSync(helper, "utf8") + String.fromCharCode(10));`;
  } else if (mode === "config") {
    mutation = 'writeFileSync(config, "{}");';
  } else if (mode === "later-owner") {
    mutation = `if (config.includes("unrelated/")) writeFileSync(${JSON.stringify(join(root, "packages/server/src/index.ts"))}, 'export interface AppRouter { readonly mode: "second" }');`;
  }
  writeFileSync(
    join(root, "scripts/ts7.ts"),
    `${wrapper}\nconst { readFileSync, writeFileSync } = await import("node:fs");
const config = process.argv[process.argv.indexOf("-p") + 1];
writeFileSync(${JSON.stringify(join(root, "native-done.json"))}, JSON.stringify({ code: process.exitCode ?? 0, config }));
${mutation}
${mode === "abnormal" ? 'process.kill(process.pid, "SIGKILL");' : ""}
`,
  );
  return root;
}

async function run(root: string, config = CLIENT): ReturnType<typeof spawnNiced> {
  return await spawnNiced(process.execPath, [join(root, "tooling/src/verify/cli.ts"), "typecheck", "--config", config], { cwd: root });
}

test("only the native direct client owner consumes a fresh declaration projection through the maintained CLI", { timeout: TIMEOUT }, async ({
  scratch,
  repoRoot,
}) => {
  const root = plant(scratch, repoRoot, "healthy");
  const unrelated = await run(root, "unrelated/tsconfig.json");
  expect(unrelated.code, unrelated.stderr).toBe(0);
  expect(existsSync(join(root, ENTRY))).toBe(false);
  const transitive = await run(root, "consumer/tsconfig.json");
  expect(transitive.code, transitive.stderr).toBe(0);
  expect(transitive.stdout).toContain(join(root, "packages/server/src/index.ts"));
  expect(existsSync(join(root, ENTRY))).toBe(false);
  const result = await run(root);
  expect(result.code, result.stderr).toBe(0);
  expect(result.stdout).toContain("PASS packages/client/tsconfig.json");
  expect(existsSync(join(root, ENTRY))).toBe(true);
  expect(result.stdout).toContain(join(root, ENTRY));
  expect(result.stdout).not.toContain(join(root, "packages/server/src/index.ts"));
  const completed = completionSchema.parse(JSON.parse(readFileSync(join(root, "native-done.json"), "utf8")));
  expect(completed.code).toBe(0);
  expect(existsSync(completed.config)).toBe(false);
  expect(readdirSync(join(root, ".cache/typecheck-router"))).toEqual([]);
});

test.for(["source", "helper", "config", "abnormal"])(
  "%s drift at actual native completion refuses a current client verdict",
  { timeout: TIMEOUT },
  async (mode, { scratch, repoRoot }) => {
    const root = plant(scratch, repoRoot, mode);
    const result = await run(root);
    expect(completionSchema.parse(JSON.parse(readFileSync(join(root, "native-done.json"), "utf8"))).code).toBe(0);
    expect(result.code, result.stdout + result.stderr).toBe(2);
    let message = "subject inputs changed";
    if (mode === "helper") {
      message = "executing implementation changed";
    } else if (mode === "config") {
      message = "projection changed";
    }
    expect(result.stdout + result.stderr).toContain(message);
    expect(readdirSync(join(root, ".cache/typecheck-router"))).toEqual([]);
  },
);

test("a cached unobserved typecheck owner cannot use disk-current declarations as authority", { timeout: TIMEOUT }, async ({ scratch, repoRoot }) => {
  const root = plant(scratch, repoRoot, "healthy");
  const entry = join(root, "cached.mjs");
  writeFileSync(
    entry,
    `const { executeTypecheckPrograms } = await import("./tooling/src/verify/ops/typecheck.ts");
await import("./tooling/src/floor/compiler/semantic-inventory-runtime.ts");
const result = await executeTypecheckPrograms(${JSON.stringify(root)}, [${JSON.stringify(CLIENT)}]); console.log(JSON.stringify(result));
`,
  );
  const result = await spawnNiced(process.execPath, [entry], { cwd: root });
  expect(result.code, result.stderr).toBe(0);
  expect(result.stdout).toContain('"status":"tool-error"');
  expect(result.stdout).toMatch(/observation|startup/);
  expect(existsSync(join(root, "native-done.json"))).toBe(false);
});

test("ambiguous native direct client ownership refuses before preparing or starting a compiler", { timeout: TIMEOUT }, async ({ scratch, repoRoot }) => {
  const root = plant(scratch, repoRoot, "healthy");
  mkdirSync(join(root, "other"));
  writeFileSync(join(root, "other/tsconfig.json"), JSON.stringify({ compilerOptions: OPTIONS, files: ["../packages/client/src/data/trpc.ts"] }));
  const result = await run(root);
  expect(result.code, result.stdout + result.stderr).toBe(2);
  expect(result.stdout + result.stderr).toContain("ambiguous");
  expect(existsSync(join(root, ENTRY))).toBe(false);
  expect(existsSync(join(root, "native-done.json"))).toBe(false);
});

test("a later native owner cannot make the original client batch context current again", { timeout: TIMEOUT }, async ({ scratch, repoRoot }) => {
  const root = plant(scratch, repoRoot, "later-owner");
  const result = await spawnNiced(
    process.execPath,
    [join(root, "tooling/src/verify/cli.ts"), "typecheck", "--config", CLIENT, "--config", "unrelated/tsconfig.json"],
    { cwd: root },
  );
  expect(result.code, result.stdout + result.stderr).toBe(2);
  expect(result.stdout).toContain("TOOL ERROR packages/client/tsconfig.json");
  expect(result.stdout).toContain("PASS unrelated/tsconfig.json");
  expect(result.stderr).toContain("subject inputs changed");
  expect(readdirSync(join(root, ".cache/typecheck-router"))).toEqual([]);
});

test("native client diagnostics retain violation status and cleanup their actual projection", { timeout: TIMEOUT }, async ({ scratch, repoRoot }) => {
  const root = plant(scratch, repoRoot, "healthy");
  writeFileSync(join(root, BRIDGE), 'import type { AppRouter } from "@orb/server"; export const mode: AppRouter["mode"] = "wrong";');
  const result = await run(root);
  expect(result.code, result.stdout + result.stderr).toBe(1);
  expect(result.stdout).toContain("FAIL packages/client/tsconfig.json");
  expect(result.stdout).toContain("TS2322");
  expect(readdirSync(join(root, ".cache/typecheck-router"))).toEqual([]);
});
