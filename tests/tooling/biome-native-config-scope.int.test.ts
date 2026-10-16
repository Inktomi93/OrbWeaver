// Native admission uses the shipping config and VCS ignores; scratch files never enter the checkout.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { jsonValueSchema } from "@orb/kit/json";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { runNicedSync } from "@orb/tooling/floor/process/proc";

const EQUALITY_BODY = "export const same = (left: number, right: number): boolean => left == right;\n";
const ADMITTED_PATHS = [".ds-sync/native-config.ts", "ds-bundle/native-config.ts", "packages/client/src/routes/routeTree.gen.ts"];
const PROTECTED_PATHS = [
  ".cache/native-config.ts",
  ".claude/worktrees/native-config.ts",
  "node_modules/native-config.ts",
  "reports/native-config.ts",
  "coverage/native-config.ts",
  ".stryker-tmp/native-config.ts",
  "playwright/.cache/native-config.ts",
  "packages/kit/src/__dc_native-config.ts",
  "packages/ui/src/tokens/index.ts",
  "packages/ui/src/tokens/themes.gen.ts",
  "tooling/src/snap/lib/devtools-frontend/native-config.ts",
  "scripts/probes/openrouter/native-config.ts",
  "scripts/probes/rpg-extraction/native-config.ts",
];
const ORDINARY_PATH = "tooling/src/native-config.ts";
const SCRIPT_PATH = "scripts/native-config.ts";
const FRAMEWORK_PATH = "scripts/native.config.ts";
const NAMESPACE_PATH = "packages/db/src/schema/native-config.ts";
const NAMED_PATH = "packages/db/src/schema/named-config.ts";
const DEFAULT_BODY = "export default function run(): number { return 1; }\n";

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
  for (const path of ["biome.json", ".gitignore"]) {
    writeFileSync(join(root, path), readFileSync(join(repoRoot, path)));
  }
  execFixtureGit(root, ["init", "-q"]);
  const result = runNicedSync(
    join(repoRoot, "node_modules", ".bin", "biome"),
    [
      "lint",
      ORDINARY_PATH,
      ...ADMITTED_PATHS,
      SCRIPT_PATH,
      FRAMEWORK_PATH,
      NAMESPACE_PATH,
      NAMED_PATH,
      ...PROTECTED_PATHS,
      "--reporter=json",
      "--diagnostic-level=error",
    ],
    { cwd: root },
  );
  expect(result.status, result.stderr).toBe(1);
  const report = jsonValueSchema.parse(JSON.parse(result.stdout));
  if (report === null || typeof report !== "object" || Array.isArray(report) || !Array.isArray(report["diagnostics"])) {
    throw new Error("Biome did not return its native diagnostics report");
  }
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
  expect(diagnostics).toContainEqual(
    expect.objectContaining({
      category: "lint/style/useFilenamingConvention",
      location: expect.objectContaining({ path: "packages/client/src/routes/routeTree.gen.ts" }),
    }),
  );
  expect(diagnostics).toHaveLength(7);
  expect(report["summary"]).toMatchObject({ unchanged: 8, diagnosticsNotPrinted: 0 });
});
