// Exercise resolved native import boundaries, including aliases and reexport paths.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { runNicedSync } from "@orb/tooling/floor/process/proc";
import type { IConfiguration } from "dependency-cruiser";

const ROOT = join(import.meta.dirname, "../../../..");
const config: IConfiguration = createRequire(import.meta.url)(join(ROOT, ".dependency-cruiser.cjs"));
const rules = config.forbidden?.filter(({ name }) => name?.startsWith("client-persisted-") === true) ?? [];
const CLI = join(ROOT, "node_modules/dependency-cruiser/bin/dependency-cruiser.mjs");
function findings(root: string, paths: readonly string[]): ReturnType<typeof JSON.parse> {
  const configPath = join(root, "rules.json");
  writeFileSync(configPath, JSON.stringify({ forbidden: rules, options: { tsPreCompilationDeps: config.options?.tsPreCompilationDeps } }));
  const result = runNicedSync(process.execPath, [CLI, "--config", configPath, "--output-type", "json", ...paths], { cwd: root });
  expect(result.errorCode, result.stderr).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}
const STATE = "packages/client/src/state/";
const RAW = `${STATE}persisted-store-implementation.ts`;
const DRAFT = `${STATE}entity-draft-store-implementation.ts`;
const LEGACY = `${STATE}legacy-test-factories/index.ts`;

function plant(root: string, path: string, source: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), source);
}

test("native persisted-store boundaries reject raw imports and reexports outside their real owners", ({ scratch }) => {
  const raw = "export function createPersistedStore() {}";
  plant(scratch, RAW, raw);
  plant(scratch, DRAFT, "export function createEntityDraftStore() {}");
  plant(
    scratch,
    LEGACY,
    'export { createPersistedStore } from "../persisted-store-implementation.ts"; export { createEntityDraftStore } from "../entity-draft-store-implementation.ts";',
  );
  const bad = `${STATE}bad.ts`;
  plant(
    scratch,
    bad,
    'import { createPersistedStore as renamed } from "./persisted-store-implementation.ts"; export { createEntityDraftStore as wrapped } from "./entity-draft-store-implementation.ts"; export * from "./legacy-test-factories/index.ts"; void renamed;',
  );
  const result = findings(scratch, [bad]);
  expect(result).toMatchObject({
    modules: expect.arrayContaining([expect.objectContaining({ source: bad }), expect.objectContaining({ source: RAW })]),
    summary: {
      violations: expect.arrayContaining([
        expect.objectContaining({ from: bad, to: RAW, rule: { name: "client-persisted-store-implementation", severity: "error" } }),
        expect.objectContaining({ from: bad, to: DRAFT, rule: { name: "client-persisted-draft-implementation", severity: "error" } }),
        expect.objectContaining({ from: bad, to: LEGACY, rule: { name: "client-persisted-legacy-only", severity: "error" } }),
      ]),
    },
  });
  expect(result).toHaveProperty("summary.violations.length", 3);
});

test("only the narrow public owners and exact legacy consumers can enter private factory modules", ({ scratch }) => {
  plant(scratch, RAW, "export function createPersistedStore() {}");
  plant(scratch, DRAFT, "export function createEntityDraftStore() {}");
  plant(
    scratch,
    LEGACY,
    'export { createPersistedStore } from "../persisted-store-implementation.ts"; export { createEntityDraftStore } from "../entity-draft-store-implementation.ts";',
  );
  plant(scratch, `${STATE}create-persisted-store.ts`, 'export { createPersistedStore } from "./persisted-store-implementation.ts";');
  plant(scratch, `${STATE}create-entity-draft-store.ts`, 'export { createEntityDraftStore } from "./entity-draft-store-implementation.ts";');
  const allowed = [
    "tests/legacy/client/state/create-persisted-store.test.ts",
    "tests/legacy/client/state/create-entity-draft-store.test.ts",
    "tests/legacy/client/state/durable-local.test.ts",
    "tests/legacy/client/forms/entity-form-base.test.ts",
    "tests/legacy/client/forms/editor/_ct-stories.tsx",
    "tests/legacy/client/forms/editor/_draft-completion-stories.tsx",
  ];
  for (const path of allowed) {
    const target = relative(dirname(path), LEGACY);
    plant(scratch, path, `import { createPersistedStore } from "${target}"; void createPersistedStore;`);
  }
  const fresh = "tests/client/state/fresh.test.ts";
  plant(scratch, fresh, 'export * from "../../../packages/client/src/state/legacy-test-factories/index.ts";');
  const result = findings(scratch, [...allowed, fresh, `${STATE}create-persisted-store.ts`, `${STATE}create-entity-draft-store.ts`]);
  expect(result).toMatchObject({ summary: { violations: [{ from: fresh, rule: { name: "client-persisted-legacy-only" } }] } });
  expect(result).toHaveProperty("summary.violations.length", 1);
});

test("native private boundaries include type-only edges under the shipped compiler-edge setting", ({ scratch }) => {
  plant(scratch, RAW, "export function createPersistedStore() {}");
  const path = `${STATE}private-type.ts`;
  plant(
    scratch,
    path,
    'import type { createPersistedStore as Factory } from "./persisted-store-implementation.ts"; export type CapturedFactory = typeof Factory;',
  );
  const result = findings(scratch, [path]);
  expect(result).toMatchObject({ summary: { violations: [{ from: path, to: RAW, rule: { name: "client-persisted-store-implementation" } }] } });
  expect(result).toHaveProperty("summary.violations.length", 1);
});
