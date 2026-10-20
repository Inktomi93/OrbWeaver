import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node } from "ts-morph";
import { Project } from "ts-morph";
import { buildLiveness } from "../../../../tooling/src/floor/code-facts/liveness.ts";
import { inventoryDeclarationKey } from "../../../../tooling/src/floor/code-facts/semantic-inventory-reader.ts";

const ROOT = "/repo";
const LAZY_ALIAS = { "@fixture/lazy": ["packages/server/src/lazy/target"] };

function projectWithAliasesOf(paths: Record<string, string[]>, files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { baseUrl: ROOT, paths } });
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, text);
  }
  return project;
}

function exportedFunction(project: Project, path: string, name: string): Node {
  return project.getSourceFileOrThrow(`${ROOT}/${path}`).getFunctionOrThrow(name);
}

test("a package-aliased import() credits members named by a destructured callback or a later destructure of the awaited module", () => {
  const project = projectWithAliasesOf(LAZY_ALIAS, {
    "packages/server/src/lazy/target.ts": `
export function DestructuredThen(): number { return 1; }
export function LaterDestructure(): number { return 2; }
export function Untouched(): number { return 3; }
`,
    "packages/server/src/lazy/consumer.ts": `
export async function load(): Promise<readonly unknown[]> {
  const fromThen = await import("@fixture/lazy").then(({ DestructuredThen }) => DestructuredThen);
  const loaded = await import("@fixture/lazy");
  const { LaterDestructure } = loaded;
  const { ...everything } = await import("@fixture/lazy");
  return [fromThen, LaterDestructure, everything];
}
`,
  });
  const live = buildLiveness(project);
  const keyOf = (name: string): string => inventoryDeclarationKey(exportedFunction(project, "packages/server/src/lazy/target.ts", name));

  expect(live.usedServerProd.has(keyOf("DestructuredThen"))).toBe(true);
  expect(live.usedServerProd.has(keyOf("LaterDestructure"))).toBe(true);
  // A rest element names no member, so the package-aliased arm still credits nothing for it.
  expect(live.usedProd.has(keyOf("Untouched"))).toBe(false);
});

test("a package-aliased import() member is a declaration edge from the declaration holding the call", () => {
  const project = projectWithAliasesOf(LAZY_ALIAS, {
    "packages/server/src/lazy/target.ts": "export function LazyThing(): number { return 1; }\n",
    "packages/server/src/lazy/consumer.ts": `
export async function load(): Promise<number> {
  return (await import("@fixture/lazy")).LazyThing();
}
`,
  });
  const live = buildLiveness(project, { edges: true });
  const target = inventoryDeclarationKey(exportedFunction(project, "packages/server/src/lazy/target.ts", "LazyThing"));
  const holder = inventoryDeclarationKey(exportedFunction(project, "packages/server/src/lazy/consumer.ts", "load"));

  expect([...(live.consumers.get(target) ?? [])]).toEqual([holder]);
});
