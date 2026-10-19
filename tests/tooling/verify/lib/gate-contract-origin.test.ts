// THE PLANTED CONTROL for the member-identity reader every policing policy asks "is this ts-morph's member?"
// through (#2202, found while fixing #2199's twins growth).
//
// `isTsMorphWalk` sits on the ACCUSING side of E2 of `policy-soundness`, so a false NO is a silent green on the
// exact shape that policy exists to catch. Its member identity had two doors and one spelling closed both at once: `member.nameNode.getSymbol()` is nothing for a bracket read (the nameNode is a
// STRING LITERAL, which carries no symbol of the member it names), and `receiver.getType().getProperty(name)`
// answers `undefined` for ANY union type — which is exactly what an optional chain produces
// (`node.getSymbol()?.…` types its receiver `Symbol | undefined`). So `node.getSymbol()?.getDeclarations()` was
// caught, `node["getDefinitionNodes"]()` was caught, and `node.getSymbol()?.["getDeclarations"]()` — the same
// member, one spelling over — was not.
//
// THE CONTROL IS THE MATRIX, NOT THE FIXED CASE. Each spelling is asserted against BOTH polarities: the
// ts-morph member must be recognised however written, and the same-named member on a NON-ts-morph owner must
// be refused however written. A reader widened until it says yes to everything passes a one-sided control and
// fails this one — the `LOOKALIKE` rows are what make the YES rows mean something.

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Node, Project, SyntaxKind } from "ts-morph";
import { resolveModuleMemberOrigin } from "../../../../tooling/src/floor/code-facts/reference-fact.ts";
import { isCanonicalDefineGate, isTsMorphWalk, resolveCallableMember } from "../../../../tooling/src/verify/lib/gate-contract-origin.ts";

const ROOT = "/gate-contract-origin";

/** The ambient stub for the two ts-morph shapes the readers judge: a `Node` whose `getSymbol()` is
 *  optional-returning (the union the type door used to lose) and the `Symbol` that owns the resolution
 *  members. Declared here rather than imported from the gate `_proof` tree so this control cannot pass
 *  because a fixture elsewhere changed. */
const TS_MORPH_STUB = [
  "export interface Symbol {",
  "  getDeclarations(): Node[];",
  "  getAliasedSymbol(): Symbol | undefined;",
  "}",
  "export interface Node {",
  "  getSymbol(): Symbol | undefined;",
  "  getDefinitionNodes(): Node[];",
  "}",
].join("\n");

/** A LOCAL owner declaring the same member names — the identity half of every assertion below. */
const LOOKALIKE = ["export interface Sym {", "  getDeclarations(): unknown[];", "}", "export interface Holder {", "  getSymbol(): Sym | undefined;", "}"].join(
  "\n",
);

function project(): Project {
  const created = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true } });
  created.createSourceFile(`${ROOT}/node_modules/ts-morph/index.d.ts`, TS_MORPH_STUB);
  created.createSourceFile(`${ROOT}/lookalike.ts`, LOOKALIKE);
  return created;
}

let seq = 0;

/** Is the OUTERMOST call in `body` a ts-morph member? The body is parsed in its own file so no case inherits
 *  another's language-service state. */
function readsTsMorphMember(body: string): boolean {
  seq += 1;
  const sourceFile = project().createSourceFile(`${ROOT}/probe-${seq}.ts`, body);
  const call = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)[0];
  expect(call, "the probe body must contain a call to judge").toBeDefined();
  const member = call === undefined ? undefined : resolveCallableMember(call.getExpression());
  return member !== undefined && isTsMorphWalk(member);
}

const TS_MORPH_IMPORT = 'import type { Node } from "ts-morph";\n';
const LOOKALIKE_IMPORT = 'import type { Holder } from "./lookalike.ts";\n';

test("a ts-morph member is recognised in EVERY spelling, including through the union an optional chain mints (#2202)", () => {
  // The direct member: the type door alone carries these, because the receiver type is not nullable.
  expect(readsTsMorphMember(`${TS_MORPH_IMPORT}export const a = (n: Node): unknown => n.getDefinitionNodes();`)).toBe(true);
  expect(readsTsMorphMember(`${TS_MORPH_IMPORT}export const a = (n: Node): unknown => n["getDefinitionNodes"]();`)).toBe(true);

  // The OWNED member behind an optional chain — the receiver type is `Symbol | undefined`. The dotted form
  // survived on the nameNode door alone; the bracket form is the one that was blind, and is the regression
  // this row exists to catch.
  expect(readsTsMorphMember(`${TS_MORPH_IMPORT}export const a = (n: Node): unknown => n.getSymbol()?.getDeclarations();`)).toBe(true);
  expect(readsTsMorphMember(`${TS_MORPH_IMPORT}export const a = (n: Node): unknown => n.getSymbol()?.["getDeclarations"]();`)).toBe(true);
  expect(readsTsMorphMember(`${TS_MORPH_IMPORT}export const a = (n: Node): unknown => n["getSymbol"]()?.["getAliasedSymbol"]();`)).toBe(true);
});

test("the same member NAME on a non-ts-morph owner is refused in every spelling — identity, not spelling (#2202)", () => {
  expect(readsTsMorphMember(`${LOOKALIKE_IMPORT}export const a = (h: Holder): unknown => h.getSymbol()?.getDeclarations();`)).toBe(false);
  expect(readsTsMorphMember(`${LOOKALIKE_IMPORT}export const a = (h: Holder): unknown => h.getSymbol()?.["getDeclarations"]();`)).toBe(false);
});

test("canonical policy declaration identity excludes source-file trace carriers across direct, alias, namespace and re-export doors", () => {
  const fixture = new Project({ useInMemoryFileSystem: true });
  const policy = fixture.createSourceFile("/repo/tooling/src/verify/contract/policy.ts", "export function defineGate<T>(value: T): T { return value; }");
  fixture.createSourceFile("/repo/tooling/src/verify/lib/policy-door.ts", 'export { defineGate } from "../contract/policy.ts";');
  const probe = fixture.createSourceFile(
    "/repo/tooling/src/verify/gates/probe.ts",
    `
import { defineGate } from "../contract/policy.ts";
import { defineGate as alias } from "../contract/policy.ts";
import * as policy from "../contract/policy.ts";
import { defineGate as viaDoor } from "../lib/policy-door.ts";
defineGate({}); alias({}); policy.defineGate({}); viaDoor({});
`,
  );
  const calls = probe.getDescendantsOfKind(SyntaxKind.CallExpression);
  expect(calls).toHaveLength(4);
  for (const call of calls) {
    const origin = resolveModuleMemberOrigin(call.getExpression());
    expect(origin.kind).toBe("resolved");
    if (origin.kind !== "resolved") {
      throw new Error(origin.detail);
    }
    expect(origin.trace.declarations.some((declaration) => Node.isSourceFile(declaration) && declaration === policy)).toBe(true);
    expect(origin.value.canonical.declaration).toBe(policy.getFunctionOrThrow("defineGate"));
    expect(isCanonicalDefineGate(call.getExpression())).toBe(true);
  }
});

test("canonical policy identity refuses local, shadowed, wrong-module and ambiguous re-export bindings", () => {
  const fixture = new Project({ useInMemoryFileSystem: true });
  fixture.createSourceFile("/repo/tooling/src/verify/contract/policy.ts", "export function defineGate<T>(value: T): T { return value; }");
  fixture.createSourceFile("/repo/tooling/src/verify/contract/other.ts", "export function defineGate<T>(value: T): T { return value; }");
  fixture.createSourceFile(
    "/repo/tooling/src/verify/lib/ambiguous.ts",
    `
export { defineGate } from "../contract/policy.ts";
export { defineGate } from "../contract/other.ts";
`,
  );
  const probe = fixture.createSourceFile(
    "/repo/tooling/src/verify/gates/probe.ts",
    `
import { defineGate as actual } from "../contract/policy.ts";
import { defineGate as wrong } from "../contract/other.ts";
import { defineGate as ambiguous } from "../lib/ambiguous.ts";
function defineGate(value: object): object { return value; }
defineGate({}); wrong({}); ambiguous({});
function shadow(actual: (value: object) => object): object { return actual({}); }
`,
  );
  const calls = probe.getDescendantsOfKind(SyntaxKind.CallExpression);
  expect(calls).toHaveLength(4);
  expect(calls.map((call) => isCanonicalDefineGate(call.getExpression()))).toEqual([false, false, false, false]);
});
