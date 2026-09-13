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
