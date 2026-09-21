import { Project } from "ts-morph";
import { collectRegistryCandidates } from "../../../../tooling/src/ast/ops/registry-candidates.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`/repo/${path}`, source);
  }
  return project;
}

test("the registry-candidate lens surfaces all four convention-maintained open-set classes", () => {
  const project = projectOf({
    "packages/client/src/features/cards/a.ts": 'export const a = { id: "a", label: "A", render: () => null };\n',
    "packages/client/src/features/cards/b.ts": 'export const b = { id: "b", label: "B", render: () => null };\n',
    "packages/client/src/features/cards/c.ts": 'export const c = { id: "c", label: "C", render: () => null };\n',
    "packages/shared/src/state.ts": "export const registry = {};\n",
    "packages/client/src/one.ts": 'import { registry as one } from "../../shared/src/state.ts";\nconst x = ["alpha", "beta", "gamma"];\none.alpha = 1;\n',
    "packages/client/src/two.ts": 'import { registry as two } from "../../shared/src/state.ts";\nconst x = ["alpha", "beta", "gamma"];\ntwo.beta = 2;\n',
    "packages/client/src/three.ts": 'import { registry as three } from "../../shared/src/state.ts";\nconst x = ["alpha", "beta", "gamma"];\nthree.gamma = 3;\n',
    "packages/client/src/left.ts": "const LEFT: Record<string, number> = { alpha: 1, beta: 2, gamma: 3 };\n",
    "packages/client/src/right.ts": "const RIGHT: Record<string, number> = { alpha: 1, beta: 2, delta: 4 };\n",
  });

  expect(new Set(collectRegistryCandidates(project).map(({ kind }) => kind))).toEqual(
    new Set([
      "registry-candidate:contribution-without-door",
      "registry-candidate:value-side-literal-set",
      "registry-candidate:shared-namespace-mutation",
      "registry-candidate:drifted-twins",
    ]),
  );
});

test("canonical tuple derivation, two-file repetition, and identical dispatch sets stay below the candidate thresholds", () => {
  const project = projectOf({
    "packages/client/src/a.ts": 'export const AXIS = ["alpha", "beta", "gamma"] as const;\nconst A: Record<string, number> = { alpha: 1, beta: 2 };\n',
    "packages/client/src/b.ts": 'const x = ["alpha", "beta", "gamma"];\nconst B: Record<string, number> = { alpha: 1, beta: 2 };\n',
  });

  expect(collectRegistryCandidates(project)).toEqual([]);
});

test("shared namespace mutation groups canonical receiver identity across aliases and separates same-spelled locals", () => {
  const shared = projectOf({
    "packages/shared/src/state.ts": "export const registry = {};\n",
    "packages/client/src/one.ts": 'import { registry as one } from "../../shared/src/state.ts";\none.alpha = 1;\n',
    "packages/client/src/two.ts": 'import { registry as two } from "../../shared/src/state.ts";\ntwo.beta = 1;\n',
    "packages/client/src/three.ts": 'import { registry as three } from "../../shared/src/state.ts";\nthree.gamma = 1;\n',
  });
  const distinct = projectOf({
    "packages/client/src/one.ts": "const registry = {};\nregistry.alpha = 1;\n",
    "packages/client/src/two.ts": "const registry = {};\nregistry.beta = 1;\n",
    "packages/client/src/three.ts": "const registry = {};\nregistry.gamma = 1;\n",
  });

  expect(collectRegistryCandidates(shared).filter(({ kind }) => kind === "registry-candidate:shared-namespace-mutation")).toHaveLength(1);
  expect(collectRegistryCandidates(distinct).filter(({ kind }) => kind === "registry-candidate:shared-namespace-mutation")).toEqual([]);
});

test("shared namespace mutation follows local const aliases to their imported value origin", () => {
  const project = projectOf({
    "packages/shared/src/state.ts": "export const registry = {};\n",
    "packages/client/src/one.ts": 'import { registry } from "../../shared/src/state.ts";\nconst one = registry;\none.alpha = 1;\n',
    "packages/client/src/two.ts": 'import { registry } from "../../shared/src/state.ts";\nconst two = registry;\ntwo.beta = 1;\n',
    "packages/client/src/three.ts": 'import { registry } from "../../shared/src/state.ts";\nconst three = registry;\nthree.gamma = 1;\n',
  });

  expect(collectRegistryCandidates(project).filter(({ kind }) => kind === "registry-candidate:shared-namespace-mutation")).toHaveLength(1);
});

test("instance member mutations do not merge unrelated values through their shared declared type", () => {
  const project = projectOf({
    "packages/shared/src/dom.ts": "export interface NodeLike { style: Record<string, unknown>; target: Record<string, unknown> }\n",
    "packages/client/src/one.ts":
      'import type { NodeLike } from "../../shared/src/dom.ts";\nexport function one(node: NodeLike): void { node.style.alpha = 1; node.target.alpha = 1; }\n',
    "packages/client/src/two.ts":
      'import type { NodeLike } from "../../shared/src/dom.ts";\nexport function two(node: NodeLike): void { node.style.beta = 1; node.target.beta = 1; }\n',
    "packages/client/src/three.ts":
      'import type { NodeLike } from "../../shared/src/dom.ts";\nexport function three(node: NodeLike): void { node.style.gamma = 1; node.target.gamma = 1; }\n',
  });

  expect(collectRegistryCandidates(project).filter(({ kind }) => kind === "registry-candidate:shared-namespace-mutation")).toEqual([]);
});

test("quoted record keys and switch literals normalize to the same dispatch set", () => {
  const project = projectOf({
    "packages/client/src/table.ts": 'const TABLE: Record<string, number> = { alpha: 1, beta: 2, "gamma": 3 };\n',
    "packages/client/src/dispatch.ts":
      'export function dispatch(key: string): number { switch (key) { case "alpha": return 1; case "beta": return 2; case "gamma": return 3; default: return 0; } }\n',
  });

  expect(collectRegistryCandidates(project).filter(({ kind }) => kind === "registry-candidate:drifted-twins")).toEqual([]);
});

test("numeric-only overlap from unrelated axes is not a drift candidate", () => {
  const project = projectOf({
    "packages/client/src/migrations.ts": "type Migration = 1 | 2 | 3;\nconst MIGRATIONS: Record<Migration, string> = { 1: 'a', 2: 'b', 3: 'c' };\n",
    "packages/ui/src/positions.ts": 'type Position = 1 | 2 | 4;\nconst POSITIONS: Record<Position, string> = { "1": "top", "2": "middle", "4": "bottom" };\n',
  });

  expect(collectRegistryCandidates(project).filter(({ kind }) => kind === "registry-candidate:drifted-twins")).toEqual([]);
});

test("numeric overlap with unresolved axes remains a drift candidate", () => {
  const project = projectOf({
    "packages/client/src/a.ts": 'const A: Record<number, string> = { 1: "a", 2: "b", 3: "c" };\n',
    "packages/client/src/b.ts": 'const B: Record<number, string> = { 1: "a", 2: "b", 4: "d" };\n',
  });

  expect(collectRegistryCandidates(project).filter(({ kind }) => kind === "registry-candidate:drifted-twins")).toHaveLength(1);
});

test("a typed hand composition is a registration door for sibling contributions", () => {
  const project = projectOf({
    "packages/client/src/features/cards/type.ts": "export interface Card { id: string; label: string; render: () => null }\n",
    "packages/client/src/features/cards/a.ts": 'export const a = { id: "a", label: "A", render: () => null };\n',
    "packages/client/src/features/cards/b.ts": 'export const b = { id: "b", label: "B", render: () => null };\n',
    "packages/client/src/features/cards/c.ts": 'export const c = { id: "c", label: "C", render: () => null };\n',
    "packages/client/src/compose/cards.ts":
      'import type { Card } from "../features/cards/type.ts";\nimport { a } from "../features/cards/a.ts";\nimport { b } from "../features/cards/b.ts";\nimport { c } from "../features/cards/c.ts";\nexport const CARDS: readonly Card[] = [a, b, c];\n',
  });

  expect(collectRegistryCandidates(project).filter(({ kind }) => kind === "registry-candidate:contribution-without-door")).toEqual([]);
});

test("a typed diagnostic that mentions contributions is not a registration door", () => {
  const project = projectOf({
    "packages/client/src/features/cards/a.ts": 'export const a = { id: "a", label: "A", render: () => null };\n',
    "packages/client/src/features/cards/b.ts": 'export const b = { id: "b", label: "B", render: () => null };\n',
    "packages/client/src/features/cards/c.ts": 'export const c = { id: "c", label: "C", render: () => null };\n',
    "packages/client/src/diagnostics.ts":
      'import { a } from "./features/cards/a.ts";\nimport { b } from "./features/cards/b.ts";\nimport { c } from "./features/cards/c.ts";\nconst DIAGNOSTIC: { allDistinct: boolean } = { allDistinct: a.id !== b.id && b.id !== c.id };\n',
  });

  expect(collectRegistryCandidates(project).filter(({ kind }) => kind === "registry-candidate:contribution-without-door")).toHaveLength(1);
});

test("only an exact exported as-const tuple suppresses a repeated value-side literal set", () => {
  const assertedReadonly = projectOf({
    "packages/client/src/axis.ts": 'export const AXIS = ["alpha", "beta", "gamma"] as readonly string[];\n',
    "packages/client/src/one.ts": 'const x = ["alpha", "beta", "gamma"];\n',
    "packages/client/src/two.ts": 'const x = ["alpha", "beta", "gamma"];\n',
    "packages/client/src/three.ts": 'const x = ["alpha", "beta", "gamma"];\n',
  });
  const exactConst = projectOf({
    "packages/client/src/axis.ts": 'export const AXIS = ["alpha", "beta", "gamma"] as const;\n',
    "packages/client/src/one.ts": 'const x = ["alpha", "beta", "gamma"];\n',
    "packages/client/src/two.ts": 'const x = ["alpha", "beta", "gamma"];\n',
    "packages/client/src/three.ts": 'const x = ["alpha", "beta", "gamma"];\n',
  });

  expect(collectRegistryCandidates(assertedReadonly).filter(({ kind }) => kind === "registry-candidate:value-side-literal-set")).toHaveLength(1);
  expect(collectRegistryCandidates(exactConst).filter(({ kind }) => kind === "registry-candidate:value-side-literal-set")).toEqual([]);
});
