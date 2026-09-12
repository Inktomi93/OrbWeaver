// THE PLANTED CONTROL for the member-identity reader every policing policy asks "is this ts-morph's member?"
// through (#2202, found while fixing #2199's twins growth).
//
// `isTsMorphMember` sits on the ACCUSING side of `policy-binding-resolution` and E2 of `policy-soundness`, so
// a false NO is a silent green on the exact shape those policies exist to catch. It had two doors and one
// spelling closed both at once: `member.nameNode.getSymbol()` is nothing for a bracket read (the nameNode is a
// STRING LITERAL, which carries no symbol of the member it names), and `receiver.getType().getProperty(name)`
// answers `undefined` for ANY union type — which is exactly what an optional chain produces
// (`node.getSymbol()?.…` types its receiver `Symbol | undefined`). So `node.getSymbol()?.getDeclarations()` was
// caught, `node["getDefinitionNodes"]()` was caught, and `node.getSymbol()?.["getDeclarations"]()` — the same
// binding resolution, one spelling over — was not.
//
// THE CONTROL IS THE MATRIX, NOT THE FIXED CASE. Each spelling is asserted against BOTH polarities: the
// ts-morph member must be recognised however written, and the same-named member on a NON-ts-morph owner must
// be refused however written. A reader widened until it says yes to everything passes a one-sided control and
// fails this one — the `LOOKALIKE` rows are what make the YES rows mean something.
import { Project, SyntaxKind } from "ts-morph";
import { isTsMorphMember, resolveCallableMember } from "../../../../tooling/src/verify/lib/gate-contract-origin.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/gate-contract-origin";

/** The ambient stub for the two ts-morph shapes the readers judge by OWNER: a `Node` whose `getSymbol()` is
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

/** Is the OUTERMOST call in `body` a ts-morph member of `owner`? The body is parsed in its own file so no
 *  case inherits another's language-service state. */
function readsTsMorphMember(body: string, owner?: string): boolean {
  seq += 1;
  const sourceFile = project().createSourceFile(`${ROOT}/probe-${seq}.ts`, body);
  const call = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)[0];
  expect(call, "the probe body must contain a call to judge").toBeDefined();
  const member = call === undefined ? undefined : resolveCallableMember(call.getExpression());
  return member !== undefined && isTsMorphMember(member, owner);
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
  expect(readsTsMorphMember(`${TS_MORPH_IMPORT}export const a = (n: Node): unknown => n.getSymbol()?.getDeclarations();`, "Symbol")).toBe(true);
  expect(readsTsMorphMember(`${TS_MORPH_IMPORT}export const a = (n: Node): unknown => n.getSymbol()?.["getDeclarations"]();`, "Symbol")).toBe(true);
  expect(readsTsMorphMember(`${TS_MORPH_IMPORT}export const a = (n: Node): unknown => n["getSymbol"]()?.["getAliasedSymbol"]();`, "Symbol")).toBe(true);
});

test("the same member NAME on a non-ts-morph owner is refused in every spelling — identity, not spelling (#2202)", () => {
  expect(readsTsMorphMember(`${LOOKALIKE_IMPORT}export const a = (h: Holder): unknown => h.getSymbol()?.getDeclarations();`, "Symbol")).toBe(false);
  expect(readsTsMorphMember(`${LOOKALIKE_IMPORT}export const a = (h: Holder): unknown => h.getSymbol()?.["getDeclarations"]();`, "Symbol")).toBe(false);
  // …and the OWNER half still bites: a genuine ts-morph member judged against the wrong owner is not a match,
  // which is what separates `Symbol#getDeclarations` from a syntax accessor of the same name.
  expect(readsTsMorphMember(`${TS_MORPH_IMPORT}export const a = (n: Node): unknown => n.getSymbol()?.["getDeclarations"]();`, "Project")).toBe(false);
});
