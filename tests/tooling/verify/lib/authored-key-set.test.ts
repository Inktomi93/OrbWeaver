// Key-set union controls in BOTH directions: what the reader must resolve, and every shape it must REFUSE
// with a reason rather than with an empty set. A resolved empty set and an `unresolved` fact are different
// answers, and a consumer that fails closed depends on the difference.
import type { CallExpression, Node, SourceFile } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import type { ReferenceFact, ReferenceUnresolvedReason } from "../../../../tooling/src/verify/contract/reference-fact.ts";
import { readAuthoredKeySet, readCallReturns } from "../../../../tooling/src/verify/lib/authored-key-set.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function sourceOf(files: Readonly<Record<string, string>>, entry = "use.ts"): SourceFile {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`/repo/${path}`, source);
  }
  return project.getSourceFileOrThrow(`/repo/${entry}`);
}

function one(code: string): SourceFile {
  return sourceOf({ "use.ts": code });
}

function payload(sf: SourceFile, name = "payload"): Node {
  return sf.getVariableDeclarationOrThrow(name).getInitializerOrThrow();
}

function keys(node: Node): readonly string[] {
  const fact = readAuthoredKeySet(node);
  if (fact.kind === "unresolved") {
    throw new Error(`expected a resolved key set, got ${fact.reason}: ${fact.detail}`);
  }
  return [...fact.value].sort();
}

function refusal(node: Node): { readonly reason: ReferenceUnresolvedReason; readonly detail: string } {
  const fact = readAuthoredKeySet(node);
  if (fact.kind === "resolved") {
    throw new Error(`expected a refusal, got keys [${[...fact.value].join(", ")}]`);
  }
  return { reason: fact.reason, detail: fact.detail };
}

test("reads identifier, quoted and shorthand keys off one literal, through as/satisfies/paren wrappers", () => {
  const sf = one(`
    const content = "x";
    export const payload = ({ content, "raw-content": 1, macroFreezes: null } as const) satisfies object;
  `);

  expect(keys(payload(sf))).toEqual(["content", "macroFreezes", "raw-content"]);
});

test("unions a spread of a same-module const and of a same-module LOCAL function call", () => {
  const sf = one(`
    const CLEARED = { rawContent: null, macroFreezes: null } as const;
    function economics(v: { a: number }) { return { model: v.a, tokens: v.a }; }
    export const payload = { id: 1, ...economics({ a: 1 }), ...CLEARED };
  `);

  expect(keys(payload(sf))).toEqual(["id", "macroFreezes", "model", "rawContent", "tokens"]);
});

test("unions EVERY expression a factory returns — the ceiling readReturnedObjectLiteral refuses", () => {
  const sf = one(`
    function columns(flag: boolean) {
      if (flag) {
        return { content: "a", rawContent: null };
      }
      return { content: "a", macroFreezes: null };
    }
    export const payload = columns(true);
  `);

  expect(keys(payload(sf))).toEqual(["content", "macroFreezes", "rawContent"]);
});

test("unions both ternary branches and every element of an array literal", () => {
  const sf = one(`
    export const payload = [{ id: 1 }, true ? { content: "a" } : { rawContent: null }];
  `);

  expect(keys(payload(sf))).toEqual(["content", "id", "rawContent"]);
});

test("follows a concise arrow factory and a nested three-hop composition", () => {
  const sf = one(`
    const provenance = (c: string) => ({ rawContent: c, macroFreezes: null });
    function economics(v: { a: number }) { return { model: v.a }; }
    function columns(v: { a: number }) { return { id: 1, ...economics(v), ...provenance("c") }; }
    export const payload = columns({ a: 1 });
  `);

  expect(keys(payload(sf))).toEqual(["id", "macroFreezes", "model", "rawContent"]);
});

test("resolves a CROSS-MODULE const spread and a cross-module factory call", () => {
  const sf = sourceOf({
    "cols.ts": "export const COLS = { content: 'x' };\nexport const provenance = () => ({ rawContent: null, macroFreezes: null });\n",
    "use.ts": 'import { COLS, provenance } from "./cols.ts";\nexport const payload = { ...COLS, ...provenance() };\n',
  });

  expect(keys(payload(sf))).toEqual(["content", "macroFreezes", "rawContent"]);
});

test("a factory whose own nested closure returns is not read as the factory's own return", () => {
  const sf = one(`
    function columns() {
      const inner = () => {
        return { leaked: 1 };
      };
      return { content: "a", nested: inner };
    }
    export const payload = columns();
  `);

  expect(keys(payload(sf))).toEqual(["content", "nested"]);
});

test("an authored literal with no properties resolves to an EMPTY set, not a refusal", () => {
  const sf = one("export const payload = {};");

  expect(keys(payload(sf))).toEqual([]);
});

test("REFUSES a computed key rather than dropping it", () => {
  const sf = one(`
    const KEY = "content";
    export const payload = { [KEY]: "x", rawContent: null };
  `);

  expect(refusal(payload(sf))).toEqual({ reason: "unsupported", detail: expect.stringContaining("computed key") });
});

test("REFUSES a spread whose source is a runtime member read", () => {
  const sf = one("export const payload = (params: { extra: object }) => ({ ...params.extra });");
  const arrow = payload(sf).asKindOrThrow(SyntaxKind.ArrowFunction);

  expect(refusal(arrow.getBody())).toEqual({ reason: "dynamic", detail: expect.stringContaining("PropertyAccessExpression") });
});

test("REFUSES a spread of a binding whose module does not resolve", () => {
  const sf = one('import { COLS } from "./gone.ts";\nexport const payload = { ...COLS };\n');

  expect(refusal(payload(sf)).reason).toBe("missing");
});

test("REFUSES a factory declared in an external package", () => {
  const sf = one('import { build } from "some-package";\nexport const payload = build();\n');

  expect(refusal(payload(sf))).toEqual({ reason: "unsupported", detail: expect.stringContaining("external package") });
});

test("REFUSES an overloaded factory name rather than guessing a signature", () => {
  const sf = one(`
    function columns(a: string): object;
    function columns(a: number): object;
    function columns(a: unknown) { return { content: a }; }
    export const payload = columns(1);
  `);

  expect(refusal(payload(sf))).toEqual({ reason: "ambiguous", detail: expect.stringContaining("declarations") });
});

test("REFUSES a self-referential composition instead of looping", () => {
  const sf = one(`
    function left(): object { return { a: 1, ...right() }; }
    function right(): object { return { b: 2, ...left() }; }
    export const payload = left();
  `);

  expect(refusal(payload(sf)).reason).toBe("cycle");
});

test("REFUSES a factory that returns nothing this reader can enter", () => {
  const sf = one("function columns() { return; }\nexport const payload = columns();\n");

  expect(refusal(payload(sf))).toEqual({ reason: "missing", detail: expect.stringContaining("returns no expression") });
});

test("REFUSES a method or accessor member, which authors behaviour rather than a data key", () => {
  const sf = one('export const payload = { content: "a", get raw() { return null; } };');

  expect(refusal(payload(sf))).toEqual({ reason: "unsupported", detail: expect.stringContaining("GetAccessor") });
});

test("REFUSES an expression that authors no properties at all", () => {
  const sf = one('export const payload = "just a string";');

  expect(refusal(payload(sf))).toEqual({ reason: "unsupported", detail: expect.stringContaining("authors no statically readable property names") });
});

test("readCallReturns hands back every return of a local factory and refuses an unreachable one", () => {
  const sf = one(`
    function two(flag: boolean) {
      if (flag) { return { a: 1 }; }
      return { b: 2 };
    }
    export const both = two(true);
    export const missing = notDeclaredAnywhere();
  `);
  const call = (name: string): CallExpression => payload(sf, name).asKindOrThrow(SyntaxKind.CallExpression);
  const returns: ReferenceFact<readonly Node[]> = readCallReturns(call("both"));

  expect(returns.kind === "resolved" ? returns.value.map((node) => node.getText()) : returns.detail).toEqual(["{ a: 1 }", "{ b: 2 }"]);
  expect(readCallReturns(call("missing")).kind).toBe("unresolved");
});
