// The verdict semantics of `resolveCallableDeclaration` — the ONE home for "which callable declaration
// does this call denote" (#2097, #2163). Three policies used to finish that question with their own
// `getSymbol().getDeclarations()` chain and each answered alias, multiplicity, reassignment and cycle
// DIFFERENTLY: `class-token-splice` demanded exactly one declaration, `audit-client-tests` took the first
// declaration with a body, `plugin-dump-guard` asked whether ANY declaration matched. Every row below is
// one cell of the semantics table those three now share; each reds on the wrong verdict, not merely on a
// throw, because the assertion names the reason (or the resolved declaration's kind AND file) rather than
// `kind === "resolved"`.
//
// WHY THE REFUSALS ARE PINNED AS TIGHTLY AS THE RESOLUTIONS: a reader whose refusals collapse into one
// reason is a reader whose callers cannot tell "I could not read this" from "this is not that", and both
// of the gates that consume the verdict treat a refusal as an ORDINARY negative verdict (unsafe paint, an
// unresolved assertion helper). A refusal that silently changes reason changes nothing they can see, so
// the reason has to be held here or nowhere.

import { resolveCallableDeclaration } from "@orb/tooling/_shared/reference-fact-call";
import type { CallableDeclaration, ReferenceFact } from "@orb/tooling/_shared/reference-fact-contract";
import type { Node as MorphNode } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import { expect, test } from "../../support/tool-fixtures.ts";

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`/repo/${path}`, source);
  }
  return project;
}

/** The LAST call in `use.ts` — the fixtures put the subject call last so a helper call above it cannot be
 *  picked up by accident, which would make a row green against the wrong node. */
function lastCallOf(files: Readonly<Record<string, string>>): MorphNode {
  const calls = projectOf(files).getSourceFileOrThrow("/repo/use.ts").getDescendantsOfKind(SyntaxKind.CallExpression);
  const call = calls.at(-1);
  if (call === undefined) {
    throw new Error("fixture declares no call expression");
  }
  return call;
}

function verdictOf(files: Readonly<Record<string, string>>): ReferenceFact<CallableDeclaration> {
  return resolveCallableDeclaration(lastCallOf(files));
}

function resolvedOf(files: Readonly<Record<string, string>>): CallableDeclaration {
  const fact = verdictOf(files);
  if (fact.kind === "unresolved") {
    throw new Error(`${fact.reason}: ${fact.detail}`);
  }
  return fact.value;
}

const LOCAL_FUNCTION = 'function f(): string {\n  return "a";\n}\n';
const API = { "api.ts": `export ${LOCAL_FUNCTION}` };

test("a module-local function resolves to its own declaration, with the body a caller reads returns from", () => {
  const value = resolvedOf({ "use.ts": `${LOCAL_FUNCTION}export const out = f();\n` });

  expect(value.declaration.getKind()).toBe(SyntaxKind.FunctionDeclaration);
  expect(value.sourceFile.getBaseName()).toBe("use.ts");
  expect(value.body?.getText()).toContain('return "a"');
});

test("a const alias of a local function denotes the SAME declaration, not the binding", () => {
  const direct = resolvedOf({ "use.ts": `${LOCAL_FUNCTION}export const out = f();\n` });
  const aliased = resolvedOf({ "use.ts": `${LOCAL_FUNCTION}const g = f;\nexport const out = g();\n` });

  // Identity is the point: an alias that resolved to the VariableDeclaration would make two spellings of
  // one callable compare unequal, which is exactly how a per-gate chain drifts from its neighbours.
  expect(aliased.declaration.getKind()).toBe(SyntaxKind.FunctionDeclaration);
  expect(aliased.declaration.getText()).toBe(direct.declaration.getText());
});

test("a const binding holding an arrow resolves to the ARROW, whose body is the callable's", () => {
  const value = resolvedOf({ "use.ts": 'const h = (): string => "a";\nexport const out = h();\n' });

  expect(value.declaration.getKind()).toBe(SyntaxKind.ArrowFunction);
  expect(value.body?.getText()).toBe('"a"');
});

test("an IMPORTED function resolves through the real module resolver to the declaring file", () => {
  const value = resolvedOf({ ...API, "use.ts": 'import { f } from "./api.ts";\nexport const out = f();\n' });

  expect(value.declaration.getKind()).toBe(SyntaxKind.FunctionDeclaration);
  expect(value.sourceFile.getBaseName()).toBe("api.ts");
});

test("an import RENAME and a re-export RENAME both land on the leaf declaration", () => {
  const renamedImport = resolvedOf({ ...API, "use.ts": 'import { f as g } from "./api.ts";\nexport const out = g();\n' });
  const renamedExport = resolvedOf({
    ...API,
    "barrel.ts": 'export { f as renamed } from "./api.ts";\n',
    "use.ts": 'import { renamed } from "./barrel.ts";\nexport const out = renamed();\n',
  });

  // The LOCAL SPELLING is not identity (tooling/src/verify/gates/TS-MORPH-CAPABILITIES.md): both of these are `api.ts`'s `f`, and a
  // reader keying on the callee's text would answer three different things for one callable.
  expect(renamedImport.sourceFile.getBaseName()).toBe("api.ts");
  expect(renamedExport.sourceFile.getBaseName()).toBe("api.ts");
  expect(renamedExport.declaration.getText()).toBe(renamedImport.declaration.getText());
});

test("an OVERLOAD SET is one home — the implementation — while a genuine merge is `ambiguous`", () => {
  const overloaded = resolvedOf({
    "use.ts":
      "function f(x: number): string;\nfunction f(x: string): string;\nfunction f(x: unknown): string {\n  return String(x);\n}\nexport const out = f(1);\n",
  });

  // The MULTIPLICITY rule is not "one declaration": an overload set is several declarations of one
  // callable with one body, and refusing it as ambiguous is what cost three policy families their verdict
  // on the module axis (`reference-fact-overload.ts#overloadHome`, now shared with this lexical axis).
  expect(overloaded.declaration.getKind()).toBe(SyntaxKind.FunctionDeclaration);
  expect(overloaded.body?.getText()).toContain("String(x)");

  // A function+namespace merge is genuinely two declarations with no single callable home.
  expect(verdictOf({ "use.ts": `${LOCAL_FUNCTION}namespace f {\n  export const version = 1;\n}\nexport const out = f();\n` })).toMatchObject({
    kind: "unresolved",
    reason: "ambiguous",
  });
});

test("a REASSIGNED binding refuses as `write` — which declaration it denotes is not decidable", () => {
  const fact = verdictOf({
    "use.ts": `${LOCAL_FUNCTION}function other(): string {\n  return "b";\n}\nf = other;\nexport const out = f();\n`,
  });

  // NEVER A GUESS. The pre-migration chains all took the FunctionDeclaration here and were silently wrong
  // at every call after the assignment.
  expect(fact).toMatchObject({ kind: "unresolved", reason: "write" });
});

test("a MUTABLE binding refuses as `write` before anything reassigns it", () => {
  expect(verdictOf({ "use.ts": 'let h = (): string => "a";\nexport const out = h();\n' })).toMatchObject({
    kind: "unresolved",
    reason: "write",
  });
});

test("an alias cycle and an import cycle each TERMINATE with an explicit `cycle` verdict", () => {
  expect(verdictOf({ "use.ts": "const a = b;\nconst b = a;\nexport const out = a();\n" })).toMatchObject({ kind: "unresolved", reason: "cycle" });

  expect(
    verdictOf({
      "left.ts": 'export { f } from "./right.ts";\n',
      "right.ts": 'export { f } from "./left.ts";\n',
      "use.ts": 'import { f } from "./left.ts";\nexport const out = f();\n',
    }),
  ).toMatchObject({ kind: "unresolved", reason: "cycle" });
});

test("a bodyless declaration is a RESOLVED identity, not a refusal", () => {
  // `plugin-dump-guard`'s ordering arm asks whether a call names the membrane's own guard; one of its
  // proof rows declares that guard `declare function`. An identity question must still be answerable when
  // there is no body to read, so `body: undefined` is a field and not a verdict.
  const value = resolvedOf({ "use.ts": "declare function f(): string;\nexport const out = f();\n" });

  expect(value.declaration.getKind()).toBe(SyntaxKind.FunctionDeclaration);
  expect(value.body).toBeUndefined();
});

test("a parameter, a destructured binding and an unbound name each carry their own reason", () => {
  expect(verdictOf({ "use.ts": "export function run(f: () => string): string {\n  return f();\n}\n" })).toMatchObject({
    kind: "unresolved",
    reason: "missing",
  });
  expect(verdictOf({ "use.ts": "declare const bag: { f: () => string };\nconst { f } = bag;\nexport const out = f();\n" })).toMatchObject({
    kind: "unresolved",
    reason: "dynamic",
  });
  expect(verdictOf({ "use.ts": "export const out = nowhere();\n" })).toMatchObject({ kind: "unresolved", reason: "missing" });
});

test("an unresolvable module door keeps the DOOR's refusal, never the weaker lexical one", () => {
  const fact = verdictOf({ "use.ts": 'import { f } from "./absent.ts";\nexport const out = f();\n' });

  // The lexical walk would land on the `ImportSpecifier` and say "not a callable declaration", which is
  // true and useless. The module axis owns every import door, so its detail is the one that survives.
  expect(fact).toMatchObject({ kind: "unresolved", reason: "missing" });
  expect(fact.kind === "unresolved" ? fact.detail : "").toContain("./absent.ts");
});

test("a `call`/`apply`/`bind` invocation refuses rather than naming the wrapped callable", () => {
  expect(verdictOf({ "use.ts": `${LOCAL_FUNCTION}export const out = f.call(null);\n` })).toMatchObject({
    kind: "unresolved",
    reason: "unsupported",
  });
});

test("a construct target refuses with the gap NAMED — a class body this reader does not model", () => {
  const project = projectOf({ "use.ts": "class Thing {}\nexport const out = new Thing();\n" });
  const construct = project.getSourceFileOrThrow("/repo/use.ts").getFirstDescendantByKindOrThrow(SyntaxKind.NewExpression);
  const fact = resolveCallableDeclaration(construct);

  // A refusal that names its own gap is the sanctioned answer for a question no consumer asks yet: the
  // next lane reads the reason instead of re-deriving whether the reader "supports classes".
  expect(fact).toMatchObject({ kind: "unresolved", reason: "unsupported" });
  expect(fact.kind === "unresolved" ? fact.detail : "").toContain("constructor body is not modelled");
});

test("an imported const arrow retains its callable body through re-export, import and local aliases", () => {
  const value = resolvedOf({
    "api.ts": 'export const read = (): string => "leaf";\n',
    "barrel.ts": 'export { read as renamed } from "./api.ts";\n',
    "use.ts": 'import { renamed as imported } from "./barrel.ts";\nconst alias = imported;\nexport const out = alias();\n',
  });
  expect(value.declaration.getKind()).toBe(SyntaxKind.ArrowFunction);
  expect(value.sourceFile.getBaseName()).toBe("api.ts");
  expect(value.body?.getText()).toBe('"leaf"');
});

test("an imported const function expression resolves to the function rather than its export binding", () => {
  const value = resolvedOf({
    "api.ts": 'export const read = function (): string { return "leaf"; };\n',
    "use.ts": 'import * as api from "./api.ts";\nexport const out = api.read();\n',
  });
  expect(value.declaration.getKind()).toBe(SyntaxKind.FunctionExpression);
  expect(value.body?.getText()).toContain('return "leaf"');
});

test("a mutable exported callable refuses through an import alias", () => {
  expect(
    verdictOf({
      "api.ts": 'export let read = (): string => "leaf";\n',
      "use.ts": 'import { read as alias } from "./api.ts";\nexport const out = alias();\n',
    }),
  ).toMatchObject({ kind: "unresolved", reason: "write" });
});

test("an exported function reassigned in its declaring module refuses through a namespace", () => {
  expect(
    verdictOf({
      "api.ts": 'export function read(): string { return "before"; }\nread = (): string => "after";\n',
      "use.ts": 'import * as api from "./api.ts";\nexport const out = api.read();\n',
    }),
  ).toMatchObject({ kind: "unresolved", reason: "write" });
});

test("an imported declaration must be callable, and writes to a shadowing binding do not taint its identity", () => {
  expect(
    verdictOf({
      "api.ts": "export const value = 1;\n",
      "use.ts": 'import { value } from "./api.ts";\nexport const out = value();\n',
    }),
  ).toMatchObject({ kind: "unresolved", reason: "dynamic" });
  const stable = resolvedOf({
    "api.ts": 'export function read(): string { return "leaf"; }\nfunction otherScope(): void { let read = () => "local"; read = () => "changed"; }\n',
    "use.ts": 'import { read } from "./api.ts";\nexport const out = read();\n',
  });
  expect(stable.declaration.getKind()).toBe(SyntaxKind.FunctionDeclaration);
  expect(stable.body?.getText()).toContain('return "leaf"');
});
