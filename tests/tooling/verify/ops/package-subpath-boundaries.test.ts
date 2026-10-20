// Exercise the package-subpath-crossing rule on resolved edges: a `#src/` file subpath may not enter another module's
// internals, whatever the edge kind (import, re-export, dynamic import, type-only).
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { runNicedSync } from "@orb/tooling/floor/process/proc";
import type { IConfiguration } from "dependency-cruiser";

const ROOT = join(import.meta.dirname, "../../../..");
const RULE = "package-subpath-crossing";
const config: IConfiguration = createRequire(import.meta.url)(join(ROOT, ".dependency-cruiser.cjs"));
const rule = config.forbidden?.find(({ name }) => name === RULE);
const CLI = join(ROOT, "node_modules/dependency-cruiser/bin/dependency-cruiser.mjs");
const PACKAGES = ["server", "client", "inference", "ui", "db", "contracts", "kit"] as const;

interface Violation {
  readonly from: string;
  readonly to: string;
  readonly rule: { readonly name: string };
}

function plant(root: string, path: string, source: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), source);
}

/** Cruise `paths` in a scratch tree whose packages carry the real `#*` / `#src/*` imports map. */
function violations(root: string, files: Readonly<Record<string, string>>): readonly Violation[] {
  for (const pkg of PACKAGES) {
    plant(root, `packages/${pkg}/package.json`, JSON.stringify({ name: `@orb/${pkg}`, imports: { "#*": "./src/*/index.ts", "#src/*": "./src/*" } }));
  }
  for (const [path, source] of Object.entries(files)) {
    plant(root, path, source);
  }
  const configPath = join(root, "rules.json");
  writeFileSync(configPath, JSON.stringify({ forbidden: rule === undefined ? [] : [rule], options: { tsPreCompilationDeps: true } }));
  const importers = Object.keys(files).filter((path) => path.endsWith(".ts") || path.endsWith(".tsx"));
  const result = runNicedSync(process.execPath, [CLI, "--config", configPath, "--output-type", "json", ...importers], { cwd: root });
  expect(result.errorCode, result.stderr).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  return (JSON.parse(result.stdout) as { summary: { violations: Violation[] } }).summary.violations;
}

const SERVER = "packages/server/src";

test("a #src subpath into another module's internals is refused as a value and as a type", ({ scratch }) => {
  const importer = `${SERVER}/domain/chat/run.ts`;
  const found = violations(scratch, {
    [importer]: 'import { b } from "#src/domain/tag/verbs/b.ts";\nimport type { C } from "#src/domain/tag/contract/c.ts";\nexport const r: C = b;\n',
    [`${SERVER}/domain/tag/verbs/b.ts`]: "export const b = 1;\n",
    [`${SERVER}/domain/tag/contract/c.ts`]: "export type C = number;\n",
  });
  expect(found).toHaveLength(2);
  expect(found.map(({ from, to, rule: { name } }) => [from, to, name])).toEqual(
    expect.arrayContaining([
      [importer, `${SERVER}/domain/tag/verbs/b.ts`, RULE],
      [importer, `${SERVER}/domain/tag/contract/c.ts`, RULE],
    ]),
  );
});

test("a re-export and a dynamic import cross the same way an import does", ({ scratch }) => {
  const importer = "packages/client/src/features/plugin/worker.ts";
  const found = violations(scratch, {
    [importer]: 'export type { P } from "#src/lib/protocol.ts";\nexport const load = () => import("#src/state/store.ts");\n',
    "packages/client/src/lib/protocol.ts": "export type P = number;\n",
    "packages/client/src/state/store.ts": "export const s = 1;\n",
  });
  expect(found.map(({ from, to }) => [from, to]).toSorted((left, right) => left.join().localeCompare(right.join()))).toEqual([
    [importer, "packages/client/src/lib/protocol.ts"],
    [importer, "packages/client/src/state/store.ts"],
  ]);
});

test("an inference backend and a ui group are modules too", ({ scratch }) => {
  const backend = "packages/inference/src/backends/google/chat.ts";
  const icon = "packages/ui/src/primitives/icons/glyph.ts";
  const found = violations(scratch, {
    [backend]: 'import { e } from "#src/contract/errors.ts";\nimport { w } from "#src/backends/wire/shapes.ts";\nexport const x = [e, w];\n',
    "packages/inference/src/contract/errors.ts": "export const e = 1;\n",
    "packages/inference/src/backends/wire/shapes.ts": "export const w = 1;\n",
    [icon]: 'import { g } from "#src/art/web-weave/geometry.ts";\nexport const y = g;\n',
    "packages/ui/src/art/web-weave/geometry.ts": "export const g = 1;\n",
  });
  expect(found.map(({ from, to }) => [from, to]).toSorted((left, right) => left.join().localeCompare(right.join()))).toEqual([
    [backend, "packages/inference/src/backends/wire/shapes.ts"],
    [backend, "packages/inference/src/contract/errors.ts"],
    [icon, "packages/ui/src/art/web-weave/geometry.ts"],
  ]);
});

test("the importer's own module, a single-file module and a front door stay legal", ({ scratch }) => {
  const found = violations(scratch, {
    [`${SERVER}/domain/chat/verbs/run.ts`]:
      'import { a } from "#src/domain/chat/substrate/a.ts";\nimport { l } from "#src/transport/rate-limit.ts";\nimport { e } from "#src/primitives/node-environment/index.ts";\nimport { t } from "#domain/tag";\nexport const r = [a, l, e, t];\n',
    [`${SERVER}/domain/chat/substrate/a.ts`]: "export const a = 1;\n",
    [`${SERVER}/transport/rate-limit.ts`]: "export const l = 1;\n",
    [`${SERVER}/primitives/node-environment/index.ts`]: "export const e = 1;\n",
    [`${SERVER}/domain/tag/index.ts`]: "export const t = 1;\n",
  });
  expect(found).toEqual([]);
});

test("a relative cross-module path is not a subpath spelling and stays outside this rule", ({ scratch }) => {
  const found = violations(scratch, {
    [`${SERVER}/domain/chat/run.ts`]: 'import { b } from "../tag/verbs/b.ts";\nexport const r = b;\n',
    [`${SERVER}/domain/tag/verbs/b.ts`]: "export const b = 1;\n",
  });
  expect(found).toEqual([]);
});

test("every exempt leaf importer is a real file, so a deleted importer cannot leave a standing permission", () => {
  const exempt = [rule?.from.pathNot ?? []].flat().map((pattern) => pattern.replace(/^\^/u, "").replace(/\$$/u, "").replaceAll("\\.", "."));
  expect(exempt.length).toBeGreaterThan(0);
  expect(exempt.filter((path) => !existsSync(join(ROOT, path)))).toEqual([]);
});

test("a leaf importer named in the rule is exempt by exact file, and its sibling is not", ({ scratch }) => {
  const exempt = `${SERVER}/infra/network/egress.ts`;
  const sibling = `${SERVER}/infra/network/egress-copy.ts`;
  const source = 'import { t } from "#src/foundation/observability/tracing.ts";\nexport const x = t;\n';
  const found = violations(scratch, {
    [exempt]: source,
    [sibling]: source,
    [`${SERVER}/foundation/observability/tracing.ts`]: "export const t = 1;\n",
  });
  expect(found.map(({ from }) => from)).toEqual([sibling]);
});
