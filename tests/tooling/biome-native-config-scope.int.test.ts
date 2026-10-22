// Native admission uses the shipping config and VCS ignores; scratch files never enter the checkout.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { runNicedSync } from "@orb/tooling/floor/process/proc";

const EQUALITY_BODY = "export const same = (left: number, right: number): boolean => left == right;\n";
const ADMITTED_PATHS = [
  ".ds-sync/native-config.ts",
  "ds-bundle/native-config.ts",
  "packages/client/src/routes/routeTree.gen.ts",
  "packages/kit/src/__dc_native-config.ts",
];
const PROTECTED_PATHS = [
  ".cache/native-config.ts",
  ".claude/worktrees/native-config.ts",
  "node_modules/native-config.ts",
  "reports/native-config.ts",
  "coverage/native-config.ts",
  "playwright/.cache/native-config.ts",
  "packages/ui/src/tokens/index.ts",
  "packages/ui/src/tokens/themes.gen.ts",
  "tooling/src/snap/lib/devtools-frontend/native-config.ts",
];
const ORDINARY_PATH = "tooling/src/native-config.ts";
const SCRIPT_PATH = "scripts/native-config.ts";
const FRAMEWORK_PATH = "scripts/native.config.ts";
const NAMESPACE_PATH = "packages/db/src/schema/native-config.ts";
const NAMED_PATH = "packages/db/src/schema/named-config.ts";
const DEFAULT_BODY = "export default function run(): number { return 1; }\n";

function lintTree(root: string, repoRoot: string, paths: readonly string[]): Record<string, JsonValue> {
  for (const path of ["biome.json", ".gitignore"]) {
    writeFileSync(join(root, path), readFileSync(join(repoRoot, path)));
  }
  execFixtureGit(root, ["init", "-q"]);
  const result = runNicedSync(join(repoRoot, "node_modules", ".bin", "biome"), ["lint", ...paths, "--reporter=json", "--diagnostic-level=error"], {
    cwd: root,
  });
  expect(result.status, result.stderr).toBe(1);
  const report = jsonValueSchema.parse(JSON.parse(result.stdout));
  if (report === null || typeof report !== "object" || Array.isArray(report) || !Array.isArray(report["diagnostics"])) {
    throw new Error("Biome did not return its native diagnostics report");
  }
  return report;
}

test("native config admits authored paths and rejects unnecessary default/namespace imports without opening derived trees", async ({
  plantedTree,
  repoRoot,
}) => {
  const root = await plantedTree({
    ...Object.fromEntries([...ADMITTED_PATHS, ...PROTECTED_PATHS, ORDINARY_PATH].map((path) => [path, EQUALITY_BODY])),
    [SCRIPT_PATH]: DEFAULT_BODY,
    [FRAMEWORK_PATH]: DEFAULT_BODY,
    [NAMESPACE_PATH]: 'import * as path from "node:path"; export const joined = path.join("a", "b");\n',
    [NAMED_PATH]: 'import { join } from "node:path"; export const joined = join("a", "b");\n',
  });
  const report = lintTree(root, repoRoot, [ORDINARY_PATH, ...ADMITTED_PATHS, SCRIPT_PATH, FRAMEWORK_PATH, NAMESPACE_PATH, NAMED_PATH, ...PROTECTED_PATHS]);
  const diagnostics = report["diagnostics"];
  expect(diagnostics).toContainEqual(
    expect.objectContaining({ category: "lint/suspicious/noDoubleEquals", location: expect.objectContaining({ path: ORDINARY_PATH }) }),
  );
  for (const path of ADMITTED_PATHS) {
    expect(diagnostics).toContainEqual(expect.objectContaining({ category: "lint/suspicious/noDoubleEquals", location: expect.objectContaining({ path }) }));
  }
  expect(diagnostics).toContainEqual(
    expect.objectContaining({ category: "lint/style/noDefaultExport", location: expect.objectContaining({ path: SCRIPT_PATH }) }),
  );
  expect(diagnostics).toContainEqual(
    expect.objectContaining({ category: "lint/performance/noNamespaceImport", location: expect.objectContaining({ path: NAMESPACE_PATH }) }),
  );
  for (const path of ["packages/client/src/routes/routeTree.gen.ts", "packages/kit/src/__dc_native-config.ts"]) {
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ category: "lint/style/useFilenamingConvention", location: expect.objectContaining({ path }) }),
    );
  }
  expect(diagnostics).toHaveLength(9);
  expect(report["summary"]).toMatchObject({ unchanged: 9, diagnosticsNotPrinted: 0 });
});

const ENV_BODY = 'import process from "node:process"; export const selected = process.env["ORB_CONFIG_CONTROL"];\n';
const NUMERIC_BODY = "export function defaultTimeout(): number { return 5000; }\n";
const BUILTIN_BODY = 'import { join } from "node:path"; export const joined = join("a", "b");\n';
const AMBIENT_BODY = 'export const selected = process.env["ORB_CONFIG_CONTROL"];\n';
const FOREIGN_CLIENT_CONFIG = "packages/client/ordinary.config.ts";
const FOREIGN_ROOT_CONFIG = "ordinary.config.ts";
const PLAIN_NODE_PATH = "tooling/src/native-process-control.ts";

test("native framework permissions stop at actual Node and environment intake owners", async ({ plantedTree, repoRoot }) => {
  const files = {
    "packages/client/vite.config.ts": ENV_BODY + NUMERIC_BODY,
    "packages/client/native-typecheck.config.ts": BUILTIN_BODY,
    "playwright-ct.config.ts": ENV_BODY,
    "playwright.config.ts": ENV_BODY + NUMERIC_BODY,
    "tests/e2e/support/global-setup.ts": ENV_BODY,
    "tests/e2e/support/modes.ts": ENV_BODY,
    "vitest.config.ts": ENV_BODY + NUMERIC_BODY,
    [FOREIGN_CLIENT_CONFIG]: BUILTIN_BODY + AMBIENT_BODY + NUMERIC_BODY,
    [FOREIGN_ROOT_CONFIG]: AMBIENT_BODY + NUMERIC_BODY,
    [PLAIN_NODE_PATH]: "export const currentPid = process.pid;\n",
  };
  const root = await plantedTree(files);
  const report = lintTree(root, repoRoot, Object.keys(files));
  const diagnostics = report["diagnostics"];
  expect(report["summary"]).toMatchObject({ unchanged: 10, diagnosticsNotPrinted: 0 });
  expect(diagnostics).toContainEqual(
    expect.objectContaining({ category: "lint/correctness/noProcessGlobal", location: expect.objectContaining({ path: PLAIN_NODE_PATH }) }),
  );
  for (const path of [FOREIGN_CLIENT_CONFIG, FOREIGN_ROOT_CONFIG]) {
    for (const category of ["lint/correctness/noProcessGlobal", "lint/style/noProcessEnv", "lint/style/noMagicNumbers"]) {
      expect(diagnostics).toContainEqual(expect.objectContaining({ category, location: expect.objectContaining({ path }) }));
    }
  }
  expect(diagnostics).toContainEqual(
    expect.objectContaining({ category: "lint/correctness/noNodejsModules", location: expect.objectContaining({ path: FOREIGN_CLIENT_CONFIG }) }),
  );
  expect(diagnostics).toHaveLength(8);
});

test("Playwright suite callbacks stay synchronous without rejecting legal async Vitest suites", async ({ plantedTree, repoRoot }) => {
  const playwright =
    'import { expect, test } from "@playwright/test"; test.describe("suite", async () => { await Promise.resolve(); test("case", () => { expect(1).toBe(1); }); });\n';
  const vitest =
    'import { describe, expect, test } from "vitest"; describe("suite", async () => { await Promise.resolve(); test("case", () => { expect(1).toBe(1); }); });\n';
  const rejected = ["tests/client/control.ct.tsx", "tests/e2e/control.spec.ts", "tests/e2e/support/helper.ts"];
  const accepted = [
    "tests/tooling/control.test.ts",
    "tests/e2e/support/control.int.test.ts",
    "tests/e2e/support/control.dom.test.ts",
    "tests/support/node/helper.ts",
  ];
  const paths = [...rejected, ...accepted];
  const root = await plantedTree({
    ...Object.fromEntries(rejected.map((path) => [path, playwright])),
    ...Object.fromEntries(accepted.map((path) => [path, vitest])),
    "package.json": readFileSync(join(repoRoot, "package.json"), "utf8"),
  });
  const report = lintTree(root, repoRoot, paths);
  const diagnostics = report["diagnostics"];
  for (const path of rejected) {
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        category: "lint/correctness/usePlaywrightValidDescribeCallback",
        location: expect.objectContaining({ path }),
      }),
    );
  }
  expect(diagnostics).toHaveLength(rejected.length);
  expect(report["summary"]).toMatchObject({ unchanged: paths.length, diagnosticsNotPrinted: 0 });
});
