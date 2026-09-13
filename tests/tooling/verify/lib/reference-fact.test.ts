// The final reference reader is a fact engine: every supported identity/value carries provenance, and
// every refusal is a closed, loud reason. These controls plant the spellings that made the old reader lie.
import type { Node, SourceFile } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import type { ReferenceFact, ResolvedReferenceFact } from "../../../../tooling/src/verify/contract/reference-fact.ts";
import {
  inspectReferenceWrites,
  readMemberReference,
  readStaticNumber,
  readStaticString,
  resolveExportedDeclarations,
  resolveLexicalValueDeclaration,
  resolveModuleMemberOrigin,
  resolveStableExpression,
} from "../../../../tooling/src/verify/lib/reference-fact.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

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

function expectResolved<T>(fact: ReferenceFact<T>): ResolvedReferenceFact<T> {
  expect(fact.kind).toBe("resolved");
  if (fact.kind === "unresolved") {
    throw new Error(fact.detail);
  }
  return fact;
}

test("stable resolution follows a 13-hop const chain by binding identity with no depth budget", () => {
  const aliases = Array.from({ length: 13 }, (_, index) => (index === 12 ? `const a${index} = "stable";` : `const a${index} = a${index + 1};`)).join("\n");
  const sf = sourceOf(`${aliases}\nexport const value = a0;`);
  const fact = expectResolved(readStaticString(initializer(sf, "value")));

  expect(fact.value).toBe("stable");
  expect(fact.trace.declarations).toHaveLength(13);
  expect(fact.trace.origin.getKind()).toBe(SyntaxKind.StringLiteral);
});

test.each([1000, 3000])("stable resolution remains stack-safe through %i const aliases", (hops) => {
  const aliases = Array.from({ length: hops }, (_, index) => (index === hops - 1 ? `const a${index} = "stable";` : `const a${index} = a${index + 1};`)).join(
    "\n",
  );
  const sf = sourceOf(`${aliases}\nexport const value = a0;`);

  expect(readStaticString(initializer(sf, "value"))).toMatchObject({ kind: "resolved", value: "stable" });
});

test("stable resolution distinguishes const from mutable and written bindings", () => {
  const sf = sourceOf(`
    const stable = "yes";
    let mutable = "no";
    const reassigned = "before";
    reassigned = "after";
    const updated = 1;
    ++updated;
    export const reads = [stable, mutable, reassigned, updated];
  `);
  const values = sf.getDescendantsOfKind(SyntaxKind.ArrayLiteralExpression)[0]?.getElements() ?? [];

  expect(readStaticString(values[0] as Node)).toMatchObject({ kind: "resolved", value: "yes" });
  expect(resolveStableExpression(values[1] as Node)).toMatchObject({ kind: "unresolved", reason: "write" });
  expect(resolveStableExpression(values[2] as Node)).toMatchObject({ kind: "unresolved", reason: "write" });
  expect(resolveStableExpression(values[3] as Node)).toMatchObject({ kind: "unresolved", reason: "write" });
});

test("a const alias cycle refuses by visited declaration identity", () => {
  const sf = sourceOf("const a = b;\nconst b = a;\nexport const value = a;");

  expect(resolveStableExpression(initializer(sf, "value"))).toMatchObject({ kind: "unresolved", reason: "cycle" });
});

test("wrappers and no-substitution templates resolve while computed templates stay dynamic", () => {
  const interpolation = ["$", "{", "suffix", "}"].join("");
  const sf = sourceOf(`
    const wrapped = (((\`role\` as string) satisfies string)!);
    export const values = [wrapped, \`role\`, \`role-${interpolation}\`];
  `);
  const values = sf.getDescendantsOfKind(SyntaxKind.ArrayLiteralExpression)[0]?.getElements() ?? [];

  expect(values.map((value) => readStaticString(value))).toEqual([
    expect.objectContaining({ kind: "resolved", value: "role" }),
    expect.objectContaining({ kind: "resolved", value: "role" }),
    expect.objectContaining({ kind: "unresolved", reason: "dynamic" }),
  ]);
});

test("the numeric reader resolves signed consts through the same binding engine", () => {
  const sf = sourceOf(`
    const NEGATIVE = -8;
    const ALIAS = NEGATIVE;
    export const values = [8, -8, +8, ALIAS];
  `);
  const values = sf.getDescendantsOfKind(SyntaxKind.ArrayLiteralExpression)[0]?.getElements() ?? [];

  expect(values.map((value) => readStaticNumber(value))).toEqual([
    expect.objectContaining({ kind: "resolved", value: 8 }),
    expect.objectContaining({ kind: "resolved", value: -8 }),
    expect.objectContaining({ kind: "resolved", value: 8 }),
    expect.objectContaining({ kind: "resolved", value: -8 }),
  ]);
});

test("signed numeric self and mutual alias cycles keep one visited-declaration state", () => {
  const sf = sourceOf(`
    const self = -self;
    const left = -right;
    const right = +left;
    export const values = [self, left];
  `);
  const values = sf.getDescendantsOfKind(SyntaxKind.ArrayLiteralExpression)[0]?.getElements() ?? [];

  expect(values.map((value) => readStaticNumber(value))).toEqual([
    expect.objectContaining({ kind: "unresolved", reason: "cycle" }),
    expect.objectContaining({ kind: "unresolved", reason: "cycle" }),
  ]);
});

test("missing, ambiguous, dynamic, and unsupported terminals are distinct facts", () => {
  const sf = sourceOf(`
    function overloaded(): string;
    function overloaded(): string { return "value"; }
    export const missingValue = missingBinding;
    export const ambiguousValue = overloaded;
    export const dynamicValue = compute();
    export const unsupportedValue = true;
  `);

  expect(readStaticString(initializer(sf, "missingValue"))).toMatchObject({ kind: "unresolved", reason: "missing" });
  expect(resolveStableExpression(initializer(sf, "ambiguousValue"))).toMatchObject({ kind: "unresolved", reason: "ambiguous" });
  expect(readStaticString(initializer(sf, "dynamicValue"))).toMatchObject({ kind: "unresolved", reason: "dynamic" });
  expect(readStaticString(initializer(sf, "unsupportedValue"))).toMatchObject({ kind: "unresolved", reason: "unsupported" });
});

test("a const declaration with no initializer refuses as missing", () => {
  const sf = sourceOf("const absent: string;\nexport const value = absent;");

  expect(readStaticString(initializer(sf, "value"))).toMatchObject({ kind: "unresolved", reason: "missing" });
});

test("member reads unify dotted, optional, and computed literal keys", () => {
  const sf = sourceOf(`
    const KEY = "name";
    export const reads = [obj.name, obj?.name, obj["name"], obj?.["name"], obj[KEY], obj[1]];
  `);
  const reads = sf.getDescendants().filter((node) => node.isKind(SyntaxKind.PropertyAccessExpression) || node.isKind(SyntaxKind.ElementAccessExpression));

  expect(reads.map((read) => readMemberReference(read))).toEqual([
    expect.objectContaining({ kind: "resolved", value: expect.objectContaining({ name: "name" }) }),
    expect.objectContaining({ kind: "resolved", value: expect.objectContaining({ name: "name" }) }),
    expect.objectContaining({ kind: "resolved", value: expect.objectContaining({ name: "name" }) }),
    expect.objectContaining({ kind: "resolved", value: expect.objectContaining({ name: "name" }) }),
    expect.objectContaining({ kind: "resolved", value: expect.objectContaining({ name: "name" }) }),
    expect.objectContaining({ kind: "resolved", value: expect.objectContaining({ name: "1" }) }),
  ]);
});

test("a dynamic member key is a loud dynamic fact", () => {
  const sf = sourceOf("export const read = (key: string) => namespace[key];");
  const access = sf.getFirstDescendantByKindOrThrow(SyntaxKind.ElementAccessExpression);

  expect(readMemberReference(access)).toMatchObject({ kind: "unresolved", reason: "dynamic" });
  expect(resolveModuleMemberOrigin(access)).toMatchObject({ kind: "unresolved", reason: "dynamic" });
});

test("member assignment, postfix/prefix update, and delete targets refuse as writes beside positive reads", () => {
  const sf = sourceOf(`
    export function mutate(ns: Record<string, number>) {
      const readAssignment = ns.foo;
      ns.foo = 1;
      const readPostfix = ns.bar;
      ns.bar++;
      const readPrefix = ns.baz;
      ++ns.baz;
      const readDelete = ns.qux;
      delete ns.qux;
      const readComputed = ns["computed"];
      ns["computed"] = 2;
      return [readAssignment, readPostfix, readPrefix, readDelete, readComputed];
    }
  `);
  const accesses = sf.getDescendants().filter((node) => node.isKind(SyntaxKind.PropertyAccessExpression) || node.isKind(SyntaxKind.ElementAccessExpression));

  expect(accesses.map((access) => readMemberReference(access))).toEqual([
    expect.objectContaining({ kind: "resolved", value: expect.objectContaining({ name: "foo" }) }),
    expect.objectContaining({ kind: "unresolved", reason: "write" }),
    expect.objectContaining({ kind: "resolved", value: expect.objectContaining({ name: "bar" }) }),
    expect.objectContaining({ kind: "unresolved", reason: "write" }),
    expect.objectContaining({ kind: "resolved", value: expect.objectContaining({ name: "baz" }) }),
    expect.objectContaining({ kind: "unresolved", reason: "write" }),
    expect.objectContaining({ kind: "resolved", value: expect.objectContaining({ name: "qux" }) }),
    expect.objectContaining({ kind: "unresolved", reason: "write" }),
    expect.objectContaining({ kind: "resolved", value: expect.objectContaining({ name: "computed" }) }),
    expect.objectContaining({ kind: "unresolved", reason: "write" }),
  ]);
});

// The two rows that build SEVERAL projects in one test: the per-TEST default (5 s, contention-blind) is
// the wrong number for them, and the first timed out at 5,000 ms in a 29-file batch (8.4 s) after passing
// in 1.5 s alone. `scaledBudget` is the house spelling and grows with the box.
const MULTI_PROJECT_TIMEOUT_MS = scaledBudget(60_000);

test(
  "canonical Object.assign mutates arg0 through direct and exact alias shapes",
  () => {
    const cases = [
      "Object.assign(value, { late: 1 });",
      'Object["assign"](value, { late: 1 });',
      "const alias = value; Object.assign(alias, { late: 1 });",
      "let alias; alias = value; Object.assign(alias, { late: 1 });",
      "const [alias] = [value]; Object.assign(alias, { late: 1 });",
      "const { value: alias } = { value }; Object.assign(alias, { late: 1 });",
      "let alias; [alias] = [value]; Object.assign(alias, { late: 1 });",
      "let alias; ({ value: alias } = { value }); Object.assign(alias, { late: 1 });",
    ];
    for (const effect of cases) {
      const sf = sourceOf(`const value = { initial: 1 }; ${effect}\nexport const result = value;`);

      expect(inspectReferenceWrites(sf.getVariableDeclarationOrThrow("value").getNameNode().asKindOrThrow(SyntaxKind.Identifier))).toMatchObject({
        kind: "unresolved",
        reason: "write",
      });
    }
  },
  MULTI_PROJECT_TIMEOUT_MS,
);

test(
  "shadowed Object.assign and references outside arg0 remain stable",
  () => {
    const cases = [
      "const Object = { assign: (...args: unknown[]) => args }; Object.assign(value, { late: 1 });",
      "const run = (Object: ObjectConstructor) => Object.assign(value, { late: 1 });",
      "Object.assign({}, value);",
      "const [alias] = [other, value]; Object.assign(alias, { late: 1 });",
    ];
    for (const effect of cases) {
      const sf = sourceOf(`const value = { initial: 1 }; ${effect}\nexport const result = value;`);

      expect(inspectReferenceWrites(sf.getVariableDeclarationOrThrow("value").getNameNode().asKindOrThrow(SyntaxKind.Identifier))).toMatchObject({
        kind: "resolved",
        value: true,
      });
    }
  },
  MULTI_PROJECT_TIMEOUT_MS,
);

test("a parameter shadow stays distinct from a same-spelled namespace import", () => {
  const sf = sourceOf(`
    import * as api from "@right/module";
    export const imported = api.target;
    export function shadow(api: object) { return api.target; }
  `);
  const reads = sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);

  expect(resolveModuleMemberOrigin(reads[0] as Node)).toMatchObject({
    kind: "resolved",
    value: { moduleSpecifier: "@right/module", exportedName: "target", memberPath: [] },
  });
  expect(resolveModuleMemberOrigin(reads[1] as Node)).toMatchObject({ kind: "unresolved", reason: "missing" });
});

test("named import aliases and same-named imports from the wrong module keep their module identity", () => {
  const sf = sourceOf(`
    import { target as right } from "@right/module";
    import { target as wrong } from "@wrong/module";
    export const values = [right, wrong];
  `);
  const values = sf.getDescendantsOfKind(SyntaxKind.ArrayLiteralExpression)[0]?.getElements() ?? [];

  expect(values.map((value) => resolveModuleMemberOrigin(value))).toEqual([
    expect.objectContaining({
      kind: "resolved",
      value: expect.objectContaining({ moduleSpecifier: "@right/module", exportedName: "target", memberPath: [] }),
    }),
    expect.objectContaining({
      kind: "resolved",
      value: expect.objectContaining({ moduleSpecifier: "@wrong/module", exportedName: "target", memberPath: [] }),
    }),
  ]);
});

test("namespace dot and bracket reads share one module-member origin through a const namespace alias", () => {
  const sf = sourceOf(`
    import * as original from "@right/module";
    const namespace = original;
    export const values = [namespace.target, namespace["target"]];
  `);
  const reads = sf.getDescendants().filter((node) => node.isKind(SyntaxKind.PropertyAccessExpression) || node.isKind(SyntaxKind.ElementAccessExpression));

  expect(reads.map((read) => resolveModuleMemberOrigin(read))).toEqual([
    expect.objectContaining({
      kind: "resolved",
      value: expect.objectContaining({ moduleSpecifier: "@right/module", exportedName: "target", memberPath: [] }),
    }),
    expect.objectContaining({
      kind: "resolved",
      value: expect.objectContaining({ moduleSpecifier: "@right/module", exportedName: "target", memberPath: [] }),
    }),
  ]);
});

test("one- and two-hop re-exports resolve to the leaf declaration with the export chain in the trace", () => {
  const project = projectOf({
    "leaf.ts": "export const thing = 1;",
    "barrel-one.ts": 'export { thing as middle } from "./leaf.ts";',
    "barrel-two.ts": 'export { middle as outer } from "./barrel-one.ts";',
    "use.ts": `
      import { middle as oneHop } from "./barrel-one.ts";
      import { outer as twoHop } from "./barrel-two.ts";
      export const values = [oneHop, twoHop];
    `,
  });
  const sf = project.getSourceFileOrThrow("/repo/use.ts");
  const values = sf.getDescendantsOfKind(SyntaxKind.ArrayLiteralExpression)[0]?.getElements() ?? [];
  const facts = values.map((value) => resolveModuleMemberOrigin(value));
  const resolvedFacts = facts.map((fact) => expectResolved(fact));

  expect(facts).toEqual([
    expect.objectContaining({
      kind: "resolved",
      value: expect.objectContaining({ moduleSpecifier: "./barrel-one.ts", exportedName: "middle", memberPath: [] }),
    }),
    expect.objectContaining({
      kind: "resolved",
      value: expect.objectContaining({ moduleSpecifier: "./barrel-two.ts", exportedName: "outer", memberPath: [] }),
    }),
  ]);
  expect(resolvedFacts.map((fact) => fact.value.declaration.getSourceFile().getBaseName())).toEqual(["leaf.ts", "leaf.ts"]);
  expect(resolvedFacts[0]?.trace.declarations.filter((node) => node.isKind(SyntaxKind.ExportSpecifier))).toHaveLength(1);
  expect(resolvedFacts[1]?.trace.declarations.filter((node) => node.isKind(SyntaxKind.ExportSpecifier))).toHaveLength(2);
});

test("one- and two-hop export-star barrels retain every explicit barrel edge in order", () => {
  const project = projectOf({
    "leaf.ts": "export const target = 1;",
    "barrel-one.ts": 'export * from "./leaf.ts";',
    "barrel-two.ts": 'export * from "./barrel-one.ts";',
    "use.ts": `
      import { target as oneHop } from "./barrel-one.ts";
      import { target as twoHop } from "./barrel-two.ts";
      export const values = [oneHop, twoHop];
    `,
  });
  const sf = project.getSourceFileOrThrow("/repo/use.ts");
  const values = sf.getDescendantsOfKind(SyntaxKind.ArrayLiteralExpression)[0]?.getElements() ?? [];
  const facts = values.map((value) => expectResolved(resolveModuleMemberOrigin(value)));

  expect(facts.map((fact) => fact.value.declaration.getSourceFile().getBaseName())).toEqual(["leaf.ts", "leaf.ts"]);
  expect(
    facts.map((fact) => fact.trace.declarations.filter((node) => node.isKind(SyntaxKind.ExportDeclaration)).map((node) => node.getSourceFile().getBaseName())),
  ).toEqual([["barrel-one.ts"], ["barrel-two.ts", "barrel-one.ts"]]);
});

test("destructuring resolves namespace members and paths below named imported objects", () => {
  const sf = sourceOf(`
    import * as namespace from "@right/module";
    import { config } from "@config/module";
    const { target: local } = namespace;
    const { nested: picked } = config;
    export const values = [local, picked];
  `);
  const values = sf.getDescendantsOfKind(SyntaxKind.ArrayLiteralExpression)[0]?.getElements() ?? [];

  expect(values.map((value) => resolveModuleMemberOrigin(value))).toEqual([
    expect.objectContaining({
      kind: "resolved",
      value: expect.objectContaining({ moduleSpecifier: "@right/module", exportedName: "target", memberPath: [] }),
    }),
    expect.objectContaining({
      kind: "resolved",
      value: expect.objectContaining({ moduleSpecifier: "@config/module", exportedName: "config", memberPath: ["nested"] }),
    }),
  ]);
});

test("a module re-export cycle refuses instead of choosing a textual name", () => {
  const project = projectOf({
    "a.ts": 'export { value } from "./b.ts";',
    "b.ts": 'export { value } from "./a.ts";',
    "use.ts": 'import { value } from "./a.ts";\nexport const result = value;',
  });
  const sf = project.getSourceFileOrThrow("/repo/use.ts");

  expect(resolveModuleMemberOrigin(initializer(sf, "result"))).toMatchObject({ kind: "unresolved", reason: "cycle" });
});

test("an imported const resolves statically through a re-export alias", () => {
  const project = projectOf({
    "leaf.ts": 'export const value = "resolved";',
    "barrel.ts": 'export { value as renamed } from "./leaf.ts";',
    "use.ts": 'import { renamed as local } from "./barrel.ts";\nexport const result = local;',
  });
  const sf = project.getSourceFileOrThrow("/repo/use.ts");

  expect(readStaticString(initializer(sf, "result"))).toMatchObject({ kind: "resolved", value: "resolved" });
});

test("lexical value declarations keep parameters, locals and mutable bindings at their authored home", () => {
  const sf = sourceOf(
    "let mutable = 1; mutable = 2; const alias = mutable; function f(parameter: number) { const local = parameter; return [parameter, local, mutable, alias]; }",
  );
  const fn = sf.getFunctionOrThrow("f");
  const reads = fn.getFirstDescendantByKindOrThrow(SyntaxKind.ArrayLiteralExpression).getElements();
  const homes = reads.map((read) => expectResolved(resolveLexicalValueDeclaration(read)));
  expect(homes.map((fact) => fact.value)).toEqual([
    fn.getParameters()[0],
    fn.getVariableDeclarationOrThrow("local"),
    sf.getVariableDeclarationOrThrow("mutable"),
    sf.getVariableDeclarationOrThrow("alias"),
  ]);
  for (const fact of homes) {
    expect(fact.trace.declarations).toEqual([fact.value]);
    expect(fact.trace.origin).toBe(fact.value);
  }
});

test("lexical value declarations retain the checker value of a merged symbol", () => {
  const sf = sourceOf("function merged() {} namespace merged { export const member = 1; } export const value = merged;");
  const fact = expectResolved(resolveLexicalValueDeclaration(initializer(sf, "value")));
  expect(fact.value).toBe(sf.getFunctionOrThrow("merged"));
});

test("lexical value declarations do not chase imported targets or invent values for types", () => {
  const project = projectOf({
    "leaf.ts": "export const target = 1;",
    "use.ts": 'import { target } from "./leaf.ts"; interface Shape {} export const values = [target, Shape, missing];',
  });
  const sf = project.getSourceFileOrThrow("/repo/use.ts");
  const reads = sf.getFirstDescendantByKindOrThrow(SyntaxKind.ArrayLiteralExpression).getElements();
  expect(reads.map((read) => resolveLexicalValueDeclaration(read))).toEqual([
    expect.objectContaining({ kind: "unresolved", reason: "missing" }),
    expect.objectContaining({ kind: "unresolved", reason: "missing" }),
    expect.objectContaining({ kind: "unresolved", reason: "missing" }),
  ]);
});

test("lexical value declarations keep a recursive const arrow at its binding rather than its initializer", () => {
  const sf = sourceOf("const recur = () => recur();");
  const binding = sf.getVariableDeclarationOrThrow("recur");
  const reference = binding.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression).getExpression();
  expect(expectResolved(resolveLexicalValueDeclaration(reference)).value).toBe(binding);
});

test("exported declarations identify the implementation home through a renamed barrel", () => {
  const project = projectOf({
    "leaf.ts": "export const mint = () => 1;",
    "barrel.ts": 'export { mint as published } from "./leaf.ts";',
    "impostor.ts": "export const published = () => 1;",
  });
  const home = project.getSourceFileOrThrow("/repo/leaf.ts");
  const barrel = project.getSourceFileOrThrow("/repo/barrel.ts");
  const impostor = project.getSourceFileOrThrow("/repo/impostor.ts");
  const expected = home.getVariableDeclarationOrThrow("mint");
  expect(expectResolved(resolveExportedDeclarations(home, "mint")).value).toEqual([expected]);
  expect(expectResolved(resolveExportedDeclarations(barrel, "published")).value).toEqual([expected]);
  expect(expectResolved(resolveExportedDeclarations(impostor, "published")).value).not.toContain(expected);
});

test("exported declarations retain every merged type and overload rather than reducing to one home", () => {
  const project = projectOf({
    "leaf.ts":
      "export interface Seam { a: string } export interface Seam { b: string } export function mint(value: string): string; export function mint(value: string) { return value; }",
    "barrel.ts": 'export { Seam, mint } from "./leaf.ts";',
  });
  const home = project.getSourceFileOrThrow("/repo/leaf.ts");
  const barrel = project.getSourceFileOrThrow("/repo/barrel.ts");
  const types = expectResolved(resolveExportedDeclarations(barrel, "Seam"));
  const functions = expectResolved(resolveExportedDeclarations(barrel, "mint"));
  expect(types.value).toEqual(home.getInterfaces());
  expect(types.value).toHaveLength(2);
  expect(functions.value.map((node) => node.getText())).toEqual([
    "export function mint(value: string): string;",
    "export function mint(value: string) { return value; }",
  ]);
  expect(types.trace.declarations).toEqual(types.value);
});

test("exported declarations refuse an absent export instead of publishing an empty resolved set", () => {
  const sf = sourceOf("const privateValue = 1; export const publicValue = 2;");
  expect(resolveExportedDeclarations(sf, "privateValue")).toMatchObject({ kind: "unresolved", reason: "missing" });
  expect(resolveExportedDeclarations(sf, "absent")).toMatchObject({ kind: "unresolved", reason: "missing" });
  expect(expectResolved(resolveExportedDeclarations(sf, "publicValue")).value).toHaveLength(1);
});
