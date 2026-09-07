// The ONE type-world model (type-worlds #1351 phase 0): worlds by package + directory + suffix, and the
// program list DERIVED from the tree — a planted config appears with no edit, an abstract template falls out.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import {
  BROWSER_PACKAGES,
  BROWSER_TESTS_PROGRAM,
  discoverTypePrograms,
  NODE_WORLD_PROGRAM,
  predictedTestProgram,
  programRootFiles,
  worldOf,
} from "@orb/tooling/_shared/project-worlds";
import { expect, test } from "../../support/tool-fixtures.ts";

const ABSTRACT_BASE =
  '{ "compilerOptions": { "noEmit": true, "strict": true, "target": "es2025", "lib": ["es2025"], "module": "esnext", "moduleResolution": "bundler" }, "include": [] }\n';

function scratchTree(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), "project-worlds-"));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(root, rel, ".."), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}

test("worldOf: package src by PACKAGE_WORLDS, the test surface by directory then suffix, nothing else", () => {
  expect(worldOf("packages/kit/src/ids.ts")).toBe("iso");
  expect(worldOf("packages/server/src/app.ts")).toBe("node");
  expect(worldOf("packages/ui/src/primitives/button/button.tsx")).toBe("browser");
  expect(worldOf("packages/unknown/src/x.ts")).toBeUndefined();
  expect(worldOf("tooling/src/verify/cli.ts")).toBe("node");
  expect(worldOf("tests/support/node/route-trpc.ts")).toBe("node");
  expect(worldOf("tests/support/browser/pixel-contrast.ts")).toBe("browser");
  expect(worldOf("tests/client/data/x.test.ts")).toBe("browser");
  expect(worldOf("tests/tooling/snap/ops/overflow.ct.tsx")).toBe("browser");
  expect(worldOf("tests/tooling/snap/cascade.suite.int.test.ts")).toBe("node");
  expect(worldOf("scripts/probes/st-goldens/generate-goldens.ts")).toBe("browser");
  expect(worldOf("scripts/dev/engines.ts")).toBe("node");
  expect(worldOf("playwright/index.tsx")).toBe("browser");
  expect(worldOf("knip.ts")).toBeUndefined();
  expect([...BROWSER_PACKAGES].toSorted()).toEqual(["client", "ui"]);
});

test("predictedTestProgram: browser → the browser-tests world, node → the root graph, off-surface → nothing", () => {
  expect(predictedTestProgram("tests/ui/primitives/badge/badge.ct.tsx")).toBe(BROWSER_TESTS_PROGRAM);
  expect(predictedTestProgram("tests/server/foundation/env/index.test.ts")).toBe(NODE_WORLD_PROGRAM);
  expect(predictedTestProgram("packages/ui/src/x.ts")).toBeUndefined();
});

test("discoverTypePrograms: a planted config that roots a source file appears with NO edit; an abstract template and an ambient-only config fall out by rule", () => {
  const root = scratchTree({
    "tsconfig.base.json": ABSTRACT_BASE,
    "reset.d.ts": "export {};\n",
    // roots ONLY an ambient d.ts — not a program, by the same rule that drops the real tsconfig.base.json
    "tsconfig.ambient.json": '{ "extends": "./tsconfig.base.json", "include": ["reset.d.ts"] }\n',
    "packages/a/tsconfig.json": '{ "extends": "../../tsconfig.base.json", "include": ["src"] }\n',
    "packages/a/src/a.ts": "export const a = 1;\n",
    "tooling/tsconfig.json": '{ "extends": "../tsconfig.base.json", "include": ["src"] }\n',
    "tooling/src/t.ts": "export const t = 1;\n",
  });
  try {
    expect(discoverTypePrograms(root)).toEqual(["packages/a/tsconfig.json", "tooling/tsconfig.json"]);
    // THE CONTROL: a new program on disk, untracked, no list edited anywhere.
    writeFileSync(join(root, "tsconfig.extra.json"), '{ "extends": "./tsconfig.base.json", "include": ["packages/a/src"] }\n');
    expect(discoverTypePrograms(root)).toEqual(["packages/a/tsconfig.json", "tooling/tsconfig.json", "tsconfig.extra.json"]);
    expect(programRootFiles(root, "tsconfig.extra.json")).toEqual(["packages/a/src/a.ts"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("programRootFiles REFUSES an unparseable config instead of defaulting it silently", () => {
  const root = scratchTree({ "tsconfig.json": '{ "extends": "./missing.json", "include": ["src"] }\n', "src/a.ts": "export const a = 1;\n" });
  try {
    expect(() => programRootFiles(root, "tsconfig.json")).toThrow(/unparseable/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the REAL tree: every package program, tooling, the two test-surface worlds — and never the abstract base", () => {
  const programs = discoverTypePrograms(process.cwd());
  expect(programs).toContain(NODE_WORLD_PROGRAM);
  expect(programs).toContain(BROWSER_TESTS_PROGRAM);
  expect(programs).toContain("packages/showcase-plugins/tsconfig.json");
  expect(programs).toContain("tooling/tsconfig.json");
  expect(programs).not.toContain("tsconfig.base.json");
  expect(programs.length).toBeGreaterThanOrEqual(10);
});
