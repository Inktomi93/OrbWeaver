// Generated type configs derive complete files from shared world/test/ambient intent.
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { execNicedSync, runNicedSync } from "@orb/tooling/_shared/proc";
import { PACKAGE_WORLDS } from "@orb/tooling/_shared/project-worlds";
import { TEST_KIND_DEFINITIONS } from "@orb/tooling/_shared/test-kinds";
import { deriveTypeConfigFiles, generateTypeConfigs, readCompilerPrograms, typeConfigsDrift } from "@orb/tooling/verify";
import { ts } from "ts-morph";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../../_load-budget.ts";

const BASE = JSON.stringify({ compilerOptions: { strict: true, lib: ["es2025", "esnext.disposable"] }, files: [] });

function plantBase(root: string, text: string = BASE): void {
  writeFileSync(join(root, "tsconfig.base.json"), text);
}

test("a shared base library change composes into the browser template without a second authored list", ({ scratch }) => {
  plantBase(scratch, JSON.stringify({ compilerOptions: { strict: true, lib: ["es2030"] }, files: [] }));
  const files = deriveTypeConfigFiles(scratch);
  const browser = JSON.parse(files["tsconfig.world-browser.json"] ?? "null") as { compilerOptions?: { lib?: string[] } };
  expect(browser.compilerOptions?.lib).toEqual(["es2030", "dom", "dom.iterable"]);
});

test("fresh packages and browser test kinds enter generated roots without another config edit", ({ scratch }) => {
  plantBase(scratch);
  const files = deriveTypeConfigFiles(scratch, {
    packageWorlds: { ...PACKAGE_WORLDS, fresh: "node" },
    testKinds: [...TEST_KIND_DEFINITIONS, { suffix: ".visual.test.ts", compilerWorld: "browser" }],
  });
  expect(files["packages/fresh/tsconfig.json"]).toContain("tsconfig.world-node.json");
  expect(files["tsconfig.tests-dom.json"]).toContain("tests/**/*.visual.test.ts");
  expect(files["tsconfig.json"]).toContain("tests/**/*.visual.test.ts");
});

test("writer is deterministic and idempotent, and freshness checks every complete output", ({ scratch }) => {
  plantBase(scratch);
  for (const pkg of Object.keys(PACKAGE_WORLDS)) {
    mkdirSync(join(scratch, "packages", pkg), { recursive: true });
  }
  mkdirSync(join(scratch, "tooling"), { recursive: true });
  expect(generateTypeConfigs(scratch)).toBe(0);
  const first = readFileSync(join(scratch, "tsconfig.json"), "utf8");
  expect(generateTypeConfigs(scratch)).toBe(0);
  expect(readFileSync(join(scratch, "tsconfig.json"), "utf8")).toBe(first);
  expect(typeConfigsDrift(scratch).drift).toEqual([]);
  writeFileSync(join(scratch, "tsconfig.json"), "{}\n");
  expect(typeConfigsDrift(scratch).drift).toEqual(["changed tsconfig.json"]);
});

test("fresh helper TSX roots compile in their declared worlds while ISO rejects intrinsic JSX", { timeout: scaledBudget(15_000) }, ({ repoRoot, scratch }) => {
  plantBase(scratch);
  writeFileSync(join(scratch, "reset.d.ts"), "export {};\n");
  writeFileSync(join(scratch, "platform.d.ts"), "export {};\n");
  writeFileSync(join(scratch, "package.json"), JSON.stringify({ type: "module" }));
  writeFileSync(join(scratch, ".gitignore"), "node_modules/\n");
  execNicedSync("git", ["init", "--quiet", "--template=", "--initial-branch=main"], { cwd: scratch });
  for (const pkg of Object.keys(PACKAGE_WORLDS)) {
    mkdirSync(join(scratch, "packages", pkg, "src"), { recursive: true });
    writeFileSync(join(scratch, "packages", pkg, "src", "anchor.ts"), "export {};\n");
  }
  mkdirSync(join(scratch, "tooling", "src"), { recursive: true });
  writeFileSync(join(scratch, "tooling", "src", "anchor.ts"), "export {};\n");
  for (const world of ["iso", "node", "browser"] as const) {
    mkdirSync(join(scratch, "tests", "support", world), { recursive: true });
  }
  writeFileSync(join(scratch, "tests", "support", "iso", "value.ts"), "export const value = 1;\n");
  writeFileSync(join(scratch, "tests", "support", "iso", "view.tsx"), 'export const view = "pure TypeScript";\n');
  writeFileSync(join(scratch, "tests", "support", "node", "view.tsx"), 'export const view = "node helper";\n');
  writeFileSync(join(scratch, "tests", "support", "browser", "view.tsx"), "export const view = <div />;\n");
  generateTypeConfigs(scratch);
  const programs = readCompilerPrograms(scratch);
  const ownersOf = (file: string): readonly string[] => programs.filter(({ files }) => files.includes(file)).map(({ config }) => config);
  expect(ownersOf("tests/support/iso/value.ts")).toEqual(["tsconfig.tests-iso.json"]);
  expect(ownersOf("tests/support/iso/view.tsx")).toEqual(["tsconfig.tests-iso.json"]);
  expect(ownersOf("tests/support/node/view.tsx")).toEqual(["tsconfig.json"]);
  expect(ownersOf("tests/support/browser/view.tsx")).toEqual(["tsconfig.tests-dom.json"]);

  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  const ts7 = join(repoRoot, "scripts/ts7.cjs");
  const compile = (config: string): ReturnType<typeof runNicedSync> =>
    runNicedSync(process.execPath, [ts7, "--noEmit", "--pretty", "false", "-p", config], { cwd: scratch });
  for (const config of ["tsconfig.tests-iso.json", "tsconfig.json", "tsconfig.tests-dom.json"]) {
    expect(compile(config)).toMatchObject({ status: 0, stdout: "", stderr: "" });
  }

  writeFileSync(join(scratch, "tests", "support", "iso", "view.tsx"), "export const view = <div />;\n");
  const hostile = compile("tsconfig.tests-iso.json");
  expect(hostile.status).toBe(1);
  expect(hostile.stdout).toContain("TS17004: Cannot use JSX unless the '--jsx' flag is provided");
});

test("a malformed base refuses before any generated output is written", ({ scratch }) => {
  plantBase(scratch, JSON.stringify({ compilerOptions: { strict: true }, files: [] }));
  writeFileSync(join(scratch, "tsconfig.json"), "preserve me\n");
  expect(() => generateTypeConfigs(scratch)).toThrow("compilerOptions.lib must be a nonempty string array");
  expect(readFileSync(join(scratch, "tsconfig.json"), "utf8")).toBe("preserve me\n");
});

test("native NodeNext rejects extensionless imports and the node world rejects DOM globals", ({ repoRoot, scratch }) => {
  plantBase(scratch);
  for (const pkg of Object.keys(PACKAGE_WORLDS)) {
    mkdirSync(join(scratch, "packages", pkg), { recursive: true });
  }
  mkdirSync(join(scratch, "tooling"), { recursive: true });
  generateTypeConfigs(scratch);
  writeFileSync(join(scratch, "package.json"), JSON.stringify({ type: "module" }));
  writeFileSync(join(scratch, "value.mts"), "export type Value = string;\n");
  writeFileSync(join(scratch, "probe.mts"), 'import type { Value } from "./value";\nexport const title: Value = "ok";\n');
  writeFileSync(
    join(scratch, "tsconfig.probe.json"),
    JSON.stringify({ extends: "./tsconfig.world-node.json", compilerOptions: { types: [] }, files: ["probe.mts"] }),
  );
  const result = runNicedSync(process.execPath, [join(repoRoot, "scripts/ts7.cjs"), "--noEmit", "--pretty", "false", "-p", "tsconfig.probe.json"], {
    cwd: scratch,
  });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain("TS2307: Cannot find module './value'");

  writeFileSync(join(scratch, "probe.mts"), 'import type { Value } from "./value.mts";\nexport const title: Value = "ok";\n');
  const extensionful = runNicedSync(process.execPath, [join(repoRoot, "scripts/ts7.cjs"), "--noEmit", "--pretty", "false", "-p", "tsconfig.probe.json"], {
    cwd: scratch,
  });
  expect(extensionful).toMatchObject({ status: 0, stdout: "", stderr: "" });

  writeFileSync(join(scratch, "probe.mts"), "export const title = document.title;\n");
  const wrongWorld = runNicedSync(process.execPath, [join(repoRoot, "scripts/ts7.cjs"), "--noEmit", "--pretty", "false", "-p", "tsconfig.probe.json"], {
    cwd: scratch,
  });
  expect(wrongWorld.status).toBe(1);
  expect(wrongWorld.stdout).toContain("TS2584: Cannot find name 'document'");
});

test("real compiler roots own the formerly missing configs and package-root tools", { timeout: scaledBudget(10_000) }, ({ repoRoot }) => {
  const programs = readCompilerPrograms(repoRoot);
  const root = programs.find(({ config }) => config === "tsconfig.json");
  expect(root?.commandLine.options.moduleResolution).toBe(ts.ModuleResolutionKind.NodeNext);
  expect(root?.files).toEqual(
    expect.arrayContaining(["playwright-ct.config.ts", "packages/ui/token-contract.ts", "packages/ui/tokens.build.ts", "packages/ui/tokens.near-duplicate.ts"]),
  );
  expect(programs.filter(({ configPaths }) => configPaths.includes("tsconfig.base.json")).length).toBe(programs.length);
  expect(programs.filter(({ files }) => files.includes("reset.d.ts")).length).toBe(programs.length);
  expect(programs.filter(({ files }) => files.includes("platform.d.ts")).length).toBe(programs.length);
  expect(programs.filter(({ files }) => files.includes("aggregator-assets.d.ts")).map(({ config }) => config)).toEqual(["tsconfig.json"]);
  expect(programs.filter(({ files }) => files.includes("packages/showcase-plugins/bundles/host-v1.d.ts")).map(({ config }) => config)).toEqual([
    "tsconfig.json",
  ]);
});
