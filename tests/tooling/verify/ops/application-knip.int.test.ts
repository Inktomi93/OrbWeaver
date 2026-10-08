// The composed native argv must keep application issues and imported tooling reach, not just a selected config name.
import { existsSync, lstatSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { devNull } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { Project } from "ts-morph";
import { z } from "zod";
import type { ApplicationSubjects } from "../../../../tooling/src/verify/contract/application.ts";
import { gate as configImport } from "../../../../tooling/src/verify/gates/tooling-root-config-import.ts";
import { readApplicationSubjects } from "../../../../tooling/src/verify/lib/application-programs.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { policyPassExitCode } from "../../../../tooling/src/verify/lib/policy-plan.ts";
import { readPolicyRepositoryInventory } from "../../../../tooling/src/verify/lib/policy-repo-inventory.ts";
import { REVIEWED_GRANTS_TOOLING_TO_PERMISSION } from "../../../../tooling/src/verify/lib/reviewed-grants-tooling-to-permission.ts";
import { applicationKnipPluginNames, materializeApplicationKnipView } from "../../../../tooling/src/verify/ops/application-knip.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const TOOL = "tooling/src/helper/index.ts";
const OTHER = "tooling/src/unreached/index.ts";
const LAUNCHER = "tooling/src/verify/cli.ts";
const APP = "packages/kit/src/index.ts";
const ENTRY = "app.ts";
const CONFIGURED = {
  workspaces: {
    ".": { entry: [ENTRY], project: ["**/*.ts"] },
    "packages/kit": { entry: ["src/index.ts!"], project: ["src/**/*.ts!"] },
    tooling: { entry: ["src/*/index.ts"], project: ["src/**/*.ts"] },
  },
};
const ROOT_MANIFEST = {
  name: "knip-application-proof",
  private: true,
  type: "module",
  workspaces: ["packages/*", "tooling"],
  devDependencies: { "@orb/tooling": "workspace:*", vitest: "*", "@playwright/test": "*" },
  scripts: { "test:ct": `node ${LAUNCHER} scoped-test ct` },
};
const FILES = {
  ".gitignore": "node_modules\n.cache\n",
  "package.json": JSON.stringify(ROOT_MANIFEST),
  "pnpm-workspace.yaml": "packages:\n  - packages/*\n  - tooling\n",
  "packages/kit/package.json": JSON.stringify({ name: "@proof/kit", private: true, type: "module", exports: { ".": "./src/index.ts" } }),
  "tooling/package.json": JSON.stringify({
    name: "@orb/tooling",
    private: true,
    type: "module",
    exports: {
      "./*": "./src/*/index.ts",
      "./branch": { node: { import: "./src/branch-import.ts", require: "./src/branch-require.ts" }, default: "./src/branch-default.ts" },
    },
    dependencies: { "unused-tool-dependency": "1.0.0" },
  }),
  [APP]: "export const application = true;\n",
  [ENTRY]: 'import "@orb/tooling/helper";\n',
  [TOOL]: "export {};\n",
  [OTHER]: 'import "unreached-tool-poison";\n',
  [LAUNCHER]: 'import "dispatch-poison";\n',
  "tooling/src/branch-import.ts": 'import "selected-import-branch";\n',
  "tooling/src/branch-require.ts": 'import "unselected-require-branch";\n',
  "tooling/src/branch-default.ts": 'import "unselected-default-branch";\n',
  "vitest.product.config.ts": 'export default { test: { include: ["tests/kit/*.test.ts"] } };\n',
  "playwright-ct.product.config.ts": 'export default { testDir: "tests/kit", testMatch: "**/*.ct.tsx" };\n',
  "playwright.config.ts": 'export default { testDir: "tests/e2e", testMatch: "**/*.spec.ts" };\n',
  "tests/kit/visible.test.ts": "export {};\n",
  "tests/tooling/unrelated.test.ts": 'import "unrelated-proof-poison";\n',
};

function population(root: string): ApplicationSubjects {
  return { inventory: readPolicyRepositoryInventory(root), roots: [APP, ENTRY], files: [APP, ENTRY, TOOL], subjects: [APP, ENTRY, TOOL] };
}

test("native view projects the complete real application script population without changing workspace binary execution", {
  timeout: scaledBudget(110_000),
}, async ({ repoRoot }) => {
  const subjects = await readApplicationSubjects(repoRoot);
  const view = materializeApplicationKnipView(repoRoot, subjects, {});
  try {
    const manifest = z.object({ scripts: z.record(z.string(), z.string()) });
    const original = manifest.parse(JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")));
    const projected = manifest.parse(JSON.parse(readFileSync(join(view.root, "package.json"), "utf8")));
    expect(projected.scripts["check:drizzle-kit"]).toBe(original.scripts["check:drizzle-kit"]);
    expect(projected.scripts["test:ct"]).toBe(`node '${devNull}' scoped-test ct`);
    expect(projected.scripts["build"]).toBe(original.scripts["build"]);
  } finally {
    view.cleanup();
  }
  expect(existsSync(view.root)).toBe(false);
});

test.for([
  { version: "0.0.0", text: 'export const pluginNames = ["vitest"];', message: "requires installed knip" },
  { version: "6.37.0", text: "export const pluginNames = [];", message: "empty or duplicate" },
  { version: "6.37.0", text: 'export const pluginNames = ["vitest", "vitest"];', message: "empty or duplicate" },
  { version: "6.37.0", text: "export const pluginNames = [readNames()];", message: "nonliteral" },
  { version: "6.37.0", text: "export const pluginNames = readNames();", message: "unsupported pluginNames" },
  { version: "6.37.0", text: 'export const pluginNames = ["vitest"]; sideEffect();', message: "exported literal tuple" },
])("native Knip metadata refuses unsupported version or shape: $message", async ({ version, text, message }, { plantedTree }) => {
  const root = await plantedTree({
    "package.json": '{"type":"module"}',
    "node_modules/knip/package.json": JSON.stringify({ name: "knip", version, exports: { ".": "./dist/index.js" } }),
    "node_modules/knip/dist/index.js": "export {};",
    "node_modules/knip/dist/types/PluginNames.js": text,
  });
  expect(() => applicationKnipPluginNames(root)).toThrow(message);
});

test("missing native Knip plugin metadata refuses rather than accepting a public-schema substitute", async ({ plantedTree }) => {
  const root = await plantedTree({
    "package.json": '{"type":"module"}',
    "node_modules/knip/package.json": JSON.stringify({ name: "knip", version: "6.37.0", exports: { ".": "./dist/index.js" } }),
    "node_modules/knip/dist/index.js": "export {};",
  });
  expect(() => applicationKnipPluginNames(root)).toThrow("PluginNames.js");
});

test("the canonical Knip data import consumes exactly its reviewed permission and becomes stale when removed", ({ repoRoot }) => {
  const path = "tooling/src/verify/ops/application-knip.ts";
  const grant = REVIEWED_GRANTS_TOOLING_TO_PERMISSION.find((row) => row.policyId === configImport.id && row.subject === path);
  if (grant === undefined) {
    throw new Error("canonical Knip data import permission is absent");
  }
  const root = "/knip-import-permission";
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(`${root}/${path}`, readFileSync(join(repoRoot, path), "utf8"));
  const run = (reviewedGrants: readonly (typeof grant)[]): ReturnType<typeof runPolicyPass> =>
    runPolicyPass({ knownPolicies: [configImport], policies: [configImport], root, project, reviewedGrants, failOnWarnings: false });
  expect(policyPassExitCode(run([]))).toBe(1);
  const licensed = run([grant]);
  expect(policyPassExitCode(licensed)).toBe(0);
  expect(licensed.authority.reviewedGrantConsumption).toEqual([expect.objectContaining({ id: grant.id, count: 1 })]);
  source.getImportDeclarationOrThrow("../../../../knip.ts").remove();
  const stale = run([grant]);
  expect(policyPassExitCode(stale)).toBe(1);
  expect(stale.authority.authorityAlarms).toEqual([expect.objectContaining({ policyId: configImport.id, kind: "stale-reviewed-grant" })]);
});

test("native view preserves exact manifests, source bytes and workspace resolution; cleanup removes only its view", async ({ plantedTree, repoRoot }) => {
  const root = await plantedTree(FILES);
  execFixtureGit(root, ["init", "--quiet", "--template="]);
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const view = materializeApplicationKnipView(root, population(root), CONFIGURED);
  try {
    expect(readFileSync(join(view.root, "packages/kit/package.json"))).toEqual(readFileSync(join(root, "packages/kit/package.json")));
    expect(readFileSync(join(view.root, "node_modules/@orb/tooling/package.json"))).toEqual(readFileSync(join(root, "tooling/package.json")));
    expect(readFileSync(join(view.root, OTHER))).toEqual(readFileSync(join(root, OTHER)));
    expect(lstatSync(join(view.root, OTHER)).isSymbolicLink()).toBe(false);
    expect(realpathSync(join(view.root, "node_modules/@orb/tooling/src/helper/index.ts"))).toBe(join(view.root, TOOL));
    expect(realpathSync(join(view.root, "tooling/node_modules/@orb/tooling/src/helper/index.ts"))).toBe(join(view.root, TOOL));
    const manifest = JSON.parse(readFileSync(join(view.root, "package.json"), "utf8"));
    expect(manifest).toMatchObject({
      scripts: { "test:ct": `node '${devNull}' scoped-test ct` },
      devDependencies: ROOT_MANIFEST.devDependencies,
    });
  } finally {
    view.cleanup();
  }
  expect(existsSync(view.root)).toBe(false);
  expect(readFileSync(join(root, LAUNCHER), "utf8")).toBe(FILES[LAUNCHER]);
});

test.for([
  { name: "clean app with unrelated tooling defects", patch: {}, production: false, exit: 0, includes: [] },
  {
    name: "app-reached helper",
    patch: { [TOOL]: 'import "app-reached-unlisted"; import "./missing-helper.ts";\n' },
    production: false,
    exit: 1,
    includes: ["app-reached-unlisted", "missing-helper.ts"],
  },
  {
    name: "previously unselected public export",
    patch: { [ENTRY]: 'import "@orb/tooling/unreached";\n' },
    production: false,
    exit: 1,
    includes: ["unreached-tool-poison"],
  },
  {
    name: "conditional public export",
    patch: { [ENTRY]: 'import "@orb/tooling/branch";\n' },
    production: false,
    exit: 1,
    includes: ["selected-import-branch"],
  },
  { name: "real import of projected launcher", patch: { [TOOL]: 'import "../verify/cli.ts";\n' }, production: false, exit: 1, includes: ["dispatch-poison"] },
  {
    name: "app package dependency",
    patch: {
      "packages/kit/package.json": JSON.stringify({
        name: "@proof/kit",
        private: true,
        type: "module",
        dependencies: { "unused-app-dependency": "1.0.0" },
        exports: { ".": "./src/index.ts" },
      }),
    },
    production: false,
    exit: 1,
    includes: ["unused-app-dependency"],
  },
  {
    name: "app development dependency",
    patch: {
      "packages/kit/package.json": JSON.stringify({
        name: "@proof/kit",
        private: true,
        type: "module",
        devDependencies: { "unused-app-devdependency": "1.0.0" },
        exports: { ".": "./src/index.ts" },
      }),
    },
    production: false,
    exit: 1,
    includes: ["unused-app-devdependency"],
  },
  {
    name: "app exported type",
    patch: {
      [APP]: 'import "./types.ts"; export const application = true;\n',
      "packages/kit/src/types.ts": "export type UnusedApplicationType = { readonly name: string };\n",
    },
    production: false,
    exit: 1,
    includes: ["UnusedApplicationType"],
  },
  {
    name: "app unresolved source",
    patch: { [APP]: 'import "./missing-app.ts"; export const application = true;\n' },
    production: false,
    exit: 1,
    includes: ["missing-app.ts"],
  },
  {
    name: "app command binary after projected launcher",
    patch: {
      "package.json": JSON.stringify({
        ...ROOT_MANIFEST,
        scripts: { "test:ct": `node ${LAUNCHER} scoped-test ct && app-view-missing-binary` },
      }),
    },
    production: false,
    exit: 1,
    includes: ["app-view-missing-binary"],
  },
  {
    name: "binary after pnpm exec",
    patch: {
      "package.json": JSON.stringify({
        ...ROOT_MANIFEST,
        scripts: { "check:drizzle-kit": "pnpm exec app-view-missing-binary --config=build.ts" },
      }),
    },
    production: false,
    exit: 1,
    includes: ["app-view-missing-binary"],
  },
  {
    name: "production native package dependency",
    patch: {
      "packages/kit/package.json": JSON.stringify({
        name: "@proof/kit",
        private: true,
        type: "module",
        dependencies: { "unused-app-dependency": "1.0.0" },
        exports: { ".": "./src/index.ts" },
      }),
    },
    production: true,
    exit: 1,
    includes: ["unused-app-dependency"],
  },
])("composed application Knip: $name", { timeout: scaledBudget(30_000) }, async ({ patch, production, exit, includes }, { plantedTree, repoRoot }) => {
  const root = await plantedTree({ ...FILES, ...patch });
  execFixtureGit(root, ["init", "--quiet", "--template="]);
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const runner = join(root, "run-view.ts");
  writeFileSync(
    runner,
    `import { runApplicationKnip } from ${JSON.stringify(pathToFileURL(join(repoRoot, "tooling/src/verify/ops/application-knip.ts")).href)}; process.exitCode = runApplicationKnip(${JSON.stringify(root)}, ${JSON.stringify(population(root))}, ${production}, ${JSON.stringify(CONFIGURED)});\n`,
  );
  const result = await spawnNiced(process.execPath, [runner], { cwd: root, timeoutMs: scaledBudget(30_000) });
  expect(result.code, result.stdout + result.stderr).toBe(exit);
  for (const issue of includes) {
    expect(result.stdout + result.stderr).toContain(issue);
  }
  expect(result.stdout + result.stderr).not.toContain("unused-tool-dependency");
  expect(result.stdout + result.stderr).not.toContain("unrelated-proof-poison");
  expect(result.stdout + result.stderr).not.toContain("unselected-require-branch");
  expect(result.stdout + result.stderr).not.toContain("unselected-default-branch");
  expect(result.stdout).toContain(`production=${String(production)}`);
});

test("production application Knip retains canonical shipped-script entry semantics", { timeout: scaledBudget(30_000) }, async ({ plantedTree, repoRoot }) => {
  const media = "packages/server/src/entry/check-media.ts";
  const root = await plantedTree({
    ...FILES,
    "packages/server/package.json": JSON.stringify({
      name: "@proof/server",
      private: true,
      type: "module",
      exports: { ".": "./src/index.ts" },
      scripts: { postinstall: "node src/entry/check-media.ts" },
    }),
    "packages/server/src/index.ts": "export const server = true;\n",
    [media]: 'import "shipped-script-unlisted";\n',
  });
  execFixtureGit(root, ["init", "--quiet", "--template="]);
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const base = population(root);
  const selected = { ...base, files: [...base.files, media, "packages/server/src/index.ts"] };
  const runner = join(root, "run-view.ts");
  writeFileSync(
    runner,
    `import { runApplicationKnip } from ${JSON.stringify(pathToFileURL(join(repoRoot, "tooling/src/verify/ops/application-knip.ts")).href)}; process.exitCode = runApplicationKnip(${JSON.stringify(root)}, ${JSON.stringify(selected)}, true);\n`,
  );
  const result = await spawnNiced(process.execPath, [runner], { cwd: root, timeoutMs: scaledBudget(30_000) });
  expect(result.code, result.stdout + result.stderr).toBe(1);
  expect(result.stdout + result.stderr).toContain("shipped-script-unlisted");
  expect(result.stdout + result.stderr).toContain("check-media.ts");
  expect(result.stdout + result.stderr).not.toContain("dispatch-poison");
});
