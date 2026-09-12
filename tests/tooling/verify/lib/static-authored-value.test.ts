// Authored shape and refusal controls; arbitrary free-function effects are outside this reader's contract.
import type { Node, SourceFile } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import type { ReferenceFact, ResolvedReferenceFact } from "../../../../tooling/src/verify/contract/reference-fact.ts";
import type { StaticAuthoredValue } from "../../../../tooling/src/verify/contract/static-authored-value.ts";
import { resolveStableExpression } from "../../../../tooling/src/verify/lib/reference-fact.ts";
import { readStaticAuthoredScalar, readStaticAuthoredValue, resolveAuthoredComposite } from "../../../../tooling/src/verify/lib/static-authored-value.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`/repo/${path}`, source);
  }
  return project;
}

function sourceOf(code: string): SourceFile {
  return projectOf({ "use.ts": code }).getSourceFileOrThrow("/repo/use.ts");
}

function initializer(sf: SourceFile, name: string): Node {
  return sf.getVariableDeclarationOrThrow(name).getInitializerOrThrow();
}

function expectResolved(fact: ReferenceFact<StaticAuthoredValue>): ResolvedReferenceFact<StaticAuthoredValue> {
  if (fact.kind === "unresolved") {
    throw new Error(fact.detail);
  }
  expect(fact.kind).toBe("resolved");
  return fact;
}

test("reads wrapped scalar aliases and keeps scalar source anchors", () => {
  const sf = sourceOf(`
    const text = ((\`alpha\` as string) satisfies string)!;
    const count = -2;
    export const values = [text, count, true, false, null];
  `);
  const values = initializer(sf, "values").asKindOrThrow(SyntaxKind.ArrayLiteralExpression).getElements();

  expect(values.map((value) => readStaticAuthoredScalar(value))).toEqual([
    expect.objectContaining({ kind: "resolved", value: "alpha" }),
    expect.objectContaining({ kind: "resolved", value: -2 }),
    expect.objectContaining({ kind: "resolved", value: true }),
    expect.objectContaining({ kind: "resolved", value: false }),
    expect.objectContaining({ kind: "resolved", value: null }),
  ]);
});

test("reads nested objects, tuples, computed keys, shorthand values, spreads, and duplicate property anchors", () => {
  const sf = sourceOf(`
    const KEY = "computed";
    const shorthand = 3;
    const base = { first: true } as const;
    const tuple = ["a", 2] as const;
    export const value = { ...base, [KEY]: [...tuple, null], [0x10]: "hex", shorthand, duplicate: 1, duplicate: 2 } as const;
  `);
  const fact = expectResolved(readStaticAuthoredValue(initializer(sf, "value")));

  expect(fact.value).toMatchObject({
    kind: "object",
    properties: [
      { key: "first", value: { kind: "scalar", value: true } },
      { key: "computed", value: { kind: "tuple", elements: [{ value: "a" }, { value: 2 }, { value: null }] } },
      { key: "16", value: { kind: "scalar", value: "hex" } },
      { key: "shorthand", value: { kind: "scalar", value: 3 } },
      { key: "duplicate", value: { kind: "scalar", value: 1 } },
      { key: "duplicate", value: { kind: "scalar", value: 2 } },
    ],
  });
  if (fact.value.kind !== "object") {
    throw new Error("expected object");
  }
  expect(fact.value.properties.slice(-2).map((property) => property.keyNode.getStartLineNumber())).toEqual([6, 6]);
});

test("named imports and re-exports resolve while lexical shadows keep their own value", () => {
  const project = projectOf({
    "leaf.ts": `export const VALUE = { source: "leaf" } as const;`,
    "barrel.ts": `export { VALUE as RENAMED } from "./leaf.ts";`,
    "use.ts": `
      import { RENAMED as imported } from "./barrel.ts";
      export const outside = imported;
      export const shorthand = { imported };
      export function inner() {
        const imported = { source: "shadow" } as const;
        return imported;
      }
    `,
  });
  const use = project.getSourceFileOrThrow("/repo/use.ts");
  const values = [initializer(use, "outside"), use.getFirstDescendantByKindOrThrow(SyntaxKind.ReturnStatement).getExpressionOrThrow()];

  expect(values.map((value) => readStaticAuthoredValue(value))).toEqual([
    expect.objectContaining({ kind: "resolved", value: expect.objectContaining({ kind: "object" }) }),
    expect.objectContaining({ kind: "resolved", value: expect.objectContaining({ kind: "object" }) }),
  ]);
  const sources = values.map((value) => expectResolved(readStaticAuthoredValue(value)).value);
  expect(sources.map((value) => (value.kind === "object" ? value.properties[0]?.value : undefined))).toEqual([
    expect.objectContaining({ value: "leaf" }),
    expect.objectContaining({ value: "shadow" }),
  ]);
  expect(readStaticAuthoredValue(initializer(use, "shorthand"))).toMatchObject({
    kind: "resolved",
    value: { kind: "object", properties: [{ key: "imported", value: { kind: "object", properties: [{ key: "source", value: { value: "leaf" } }] } }] },
  });
});

test("direct and alias member mutations refuse as writes", () => {
  const sf = sourceOf(`
    const direct = { value: 1 };
    direct.value = 2;
    const original = [1, 2];
    const alias = original;
    alias[0]++;
    const nested = { child: { value: 1 } };
    const childAlias = nested.child;
    for (childAlias.value of [2]) {}
    const declaredTuple = [{ child: { value: 1 } }];
    const [{ child }] = declaredTuple;
    child.value = 2;
    const assignedTuple = [{ child: { value: 1 } }];
    let assignedChild;
    [{ child: assignedChild }] = assignedTuple;
    assignedChild.value = 2;
    export const values = [direct, original, nested, declaredTuple, assignedTuple];
  `);
  const values = initializer(sf, "values").asKindOrThrow(SyntaxKind.ArrayLiteralExpression).getElements();

  expect(values.map((value) => readStaticAuthoredValue(value))).toEqual([
    expect.objectContaining({ kind: "unresolved", reason: "write" }),
    expect.objectContaining({ kind: "unresolved", reason: "write" }),
    expect.objectContaining({ kind: "unresolved", reason: "write" }),
    expect.objectContaining({ kind: "unresolved", reason: "write" }),
    expect.objectContaining({ kind: "unresolved", reason: "write" }),
  ]);
});

test("binding identity remains available to mutation discovery while authored values refuse changed contents", () => {
  const sf = sourceOf("const original = { value: 1 }; const alias = original; alias.value = 2; export const use = alias;");
  const use = initializer(sf, "use");
  const binding = resolveStableExpression(use);

  expect(binding.kind).toBe("resolved");
  if (binding.kind === "unresolved") {
    throw new Error(binding.detail);
  }
  expect(binding.value).toBe(initializer(sf, "original"));
  expect(readStaticAuthoredValue(use)).toMatchObject({ kind: "unresolved", reason: "write" });
});

test("member calls through declarations and assignment aliases refuse as dynamic without treating the consuming query as an escape", () => {
  const sf = sourceOf(`
    const mutated = [1];
    mutated.push(2);
    const arrayDestructured = [[1]];
    const [arrayChild] = arrayDestructured;
    arrayChild.push(2);
    const objectDestructured = { child: [1] };
    const { child: objectChild } = objectDestructured;
    objectChild.push(2);
    const assigned = [[1]];
    let assignedChild;
    assignedChild = assigned[0];
    assignedChild.push(2);
    const destructureAssigned = [[1]];
    let destructureChild;
    [destructureChild] = destructureAssigned;
    destructureChild.push(2);
    const queried = { enabled: true } as const;
    record(queried);
    export const values = [mutated, arrayDestructured, objectDestructured, assigned, destructureAssigned, queried];
  `);
  const values = initializer(sf, "values").asKindOrThrow(SyntaxKind.ArrayLiteralExpression).getElements();

  expect(values.map((value) => readStaticAuthoredValue(value))).toEqual([
    expect.objectContaining({ kind: "unresolved", reason: "dynamic" }),
    expect.objectContaining({ kind: "unresolved", reason: "dynamic" }),
    expect.objectContaining({ kind: "unresolved", reason: "dynamic" }),
    expect.objectContaining({ kind: "unresolved", reason: "dynamic" }),
    expect.objectContaining({ kind: "unresolved", reason: "dynamic" }),
    expect.objectContaining({ kind: "resolved", value: expect.objectContaining({ kind: "object" }) }),
  ]);
});

test("dynamic, cycle, namespace, destructure, object-method, proto, hole, and ambiguous shapes refuse explicitly", () => {
  const sf = sourceOf(`
    import * as namespace from "@values";
    function overloaded(): string;
    function overloaded(): string { return "x"; }
    const cycle = { self: cycle };
    const source = { picked: 1 };
    const { picked } = source;
    export const values = [compute(), cycle, namespace.VALUE, picked, { method() {} }, { __proto__: null }, [, 1], overloaded];
  `);
  const values = sf.getFirstDescendantByKindOrThrow(SyntaxKind.ArrayLiteralExpression).getElements();

  expect(values.map((value) => readStaticAuthoredValue(value))).toEqual([
    expect.objectContaining({ kind: "unresolved", reason: "dynamic" }),
    expect.objectContaining({ kind: "unresolved", reason: "cycle" }),
    expect.objectContaining({ kind: "unresolved", reason: "dynamic" }),
    expect.objectContaining({ kind: "unresolved", reason: "dynamic" }),
    expect.objectContaining({ kind: "unresolved", reason: "unsupported" }),
    expect.objectContaining({ kind: "unresolved", reason: "unsupported" }),
    expect.objectContaining({ kind: "unresolved", reason: "unsupported" }),
    expect.objectContaining({ kind: "unresolved", reason: "ambiguous" }),
  ]);
});

// The two directions of the read-only-member rule (#1950 D2). A registry declared beside its own
// `REGISTRY.map(...)` projection is the shape the real tree has, and refusing it blinded
// `design-audit-rule-proof` on a 62-row registry while every conformance row stayed green.
test("a read-only member call beside the literal resolves, in both readers", () => {
  const sf = sourceOf(`
    const RULES = [{ id: "one" }, { id: "two" }] as const;
    export const IDS = RULES.map((rule) => rule.id);
    const SECTIONS = ["a", "b"] as const;
    export const known = (value: string) => SECTIONS.includes(value as never);
    export const values = [RULES, SECTIONS];
  `);
  const values = initializer(sf, "values").asKindOrThrow(SyntaxKind.ArrayLiteralExpression).getElements();

  expect(values.map((value) => resolveAuthoredComposite(value))).toEqual([
    expect.objectContaining({ kind: "resolved" }),
    expect.objectContaining({ kind: "resolved" }),
  ]);
  expect(values.map((value) => readStaticAuthoredValue(value))).toEqual([
    expect.objectContaining({ kind: "resolved", value: expect.objectContaining({ kind: "tuple" }) }),
    expect.objectContaining({ kind: "resolved", value: expect.objectContaining({ kind: "tuple" }) }),
  ]);
});

// FAIL-CLOSED, the half that keeps the rule safe. `readThenMutate` is the reason the allowlist lives in
// the COLLECTOR rather than at the refusal: the collector keeps at most one invoked member per binding,
// so skipping the read-only `map` at the decision site would have hidden the later `push`.
test("the read-only member list is closed: a mutator, an unnamed member, and a deeper chain all still refuse", () => {
  const sf = sourceOf(`
    const readThenMutate = [1];
    void readThenMutate.map((value) => value);
    readThenMutate.push(2);
    const unnamedMember = [1];
    void unnamedMember.toReversed();
    const deeperChain = { nested: [1] };
    void deeperChain.nested.join(",");
    export const values = [readThenMutate, unnamedMember, deeperChain];
  `);
  const values = initializer(sf, "values").asKindOrThrow(SyntaxKind.ArrayLiteralExpression).getElements();

  expect(values.map((value) => resolveAuthoredComposite(value))).toEqual([
    expect.objectContaining({ kind: "unresolved", reason: "dynamic" }),
    expect.objectContaining({ kind: "unresolved", reason: "dynamic" }),
    expect.objectContaining({ kind: "unresolved", reason: "dynamic" }),
  ]);
});
