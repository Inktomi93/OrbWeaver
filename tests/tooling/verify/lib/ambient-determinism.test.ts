// The ambient time/entropy reader is ARMED: every row here asserts something a NAME comparison could not
// answer. An immutable alias of the global and a computed-literal member resolve to the SAME ambient source
// (a text check reads `clock.now` / `Date["now"]` and passes them); a local shadow and an injected seam
// resolve to a DIFFERENT binding and answer `other` (a text check reds the shadow); and a callee the checker
// cannot bind at all answers `unreadable` rather than absence, which is what a fail-closed policy consumes.
import { Project, SyntaxKind } from "ts-morph";
import type { AmbientSource } from "../../../../tooling/src/verify/lib/ambient-determinism.ts";
import { invocationCallee, readAmbientInvocation } from "../../../../tooling/src/verify/lib/ambient-determinism.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/repo";
const CLOCK: readonly AmbientSource[] = [{ globalName: "Date", memberPath: ["now"], token: "Date.now" }];
const CONSTRUCTOR: readonly AmbientSource[] = [{ globalName: "Date", memberPath: [], token: "new Date" }];
const ENTROPY: readonly AmbientSource[] = [{ globalName: "Math", memberPath: ["random"], token: "Math.random" }];

function invocation(source: string, needle: string, kind: SyntaxKind = SyntaxKind.CallExpression): import("ts-morph").Node {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile(`${ROOT}/use.ts`, source);
  const found = file.getDescendantsOfKind(kind).find((candidate) => candidate.getText().includes(needle));
  if (found === undefined) {
    throw new Error(`no ${SyntaxKind[kind]} carrying ${needle}`);
  }
  return found;
}

test("the ambient clock resolves through an immutable alias and a computed-literal member alike", () => {
  // @orb-waive test-determinism(Date.now): FIXTURE SOURCE for the ambient-clock arm — a string handed to ts-morph and parsed, never evaluated. Ends when this reader stops recognising Date.now(); the gate's DECLARED LIMIT (string literals scan) cannot be narrowed, since a syntax line-scanner cannot tell a parsed fixture from a string that runs.
  expect(readAmbientInvocation(invocation("export const t = Date.now();\n", "Date.now()"), CLOCK)).toMatchObject({ kind: "ambient" });
  expect(readAmbientInvocation(invocation('export const t = Date["now"]();\n', 'Date["now"]()'), CLOCK)).toMatchObject({ kind: "ambient" });
  expect(readAmbientInvocation(invocation("const clock = Date;\nexport const t = clock.now();\n", "clock.now()"), CLOCK)).toMatchObject({ kind: "ambient" });
});

test("the zero-argument constructor is the same source read through `new`", () => {
  // @orb-waive test-determinism(new Date): FIXTURE SOURCE for the zero-argument-constructor arm — parsed by ts-morph, never evaluated.
  expect(readAmbientInvocation(invocation("export const d = new Date();\n", "new Date()", SyntaxKind.NewExpression), CONSTRUCTOR)).toMatchObject({
    kind: "ambient",
  });
});

test("ambient entropy resolves, and a DIFFERENT ambient global with the same member name does not", () => {
  // @orb-waive test-determinism(Math.random): FIXTURE SOURCE for the ambient-entropy arm — parsed by ts-morph, never evaluated.
  expect(readAmbientInvocation(invocation("export const r = Math.random();\n", "Math.random()"), ENTROPY)).toMatchObject({ kind: "ambient" });
  // `performance.now()` is a real ambient global whose member is spelled exactly like the clock's.
  // @orb-waive test-determinism(performance.now): FIXTURE SOURCE for the counterfactual — a DIFFERENT ambient global whose member is spelled exactly like the clock's. The arm does not exist unless the fixture spells it.
  expect(readAmbientInvocation(invocation("export const t = performance.now();\n", "performance.now()"), CLOCK)).toEqual({ kind: "other" });
});

test("a local shadow and an injected seam are OTHER — the half a text comparison gets backwards", () => {
  // @orb-waive test-determinism(Date.now): FIXTURE SOURCE for the local-shadow arm — the reader must answer `other` here, which requires the fixture to spell the ambient call.
  const shadow = "class Date {\n  static now(): number {\n    return 0;\n  }\n}\nexport const t = Date.now();\n";
  // @orb-waive test-determinism(Date.now): the NEEDLE that LOCATES the shadowed call inside the fixture above — a search string, not a call.
  expect(readAmbientInvocation(invocation(shadow, "Date.now()"), CLOCK)).toEqual({ kind: "other" });
  const injected = "export const t = (deps: { readonly now: () => number }): number => deps.now();\n";
  expect(readAmbientInvocation(invocation(injected, "deps.now()"), CLOCK)).toEqual({ kind: "other" });
});

test("an unbindable callee answers UNREADABLE, never absence — the fail-closed arm's input", () => {
  const unreadable = 'import { clock } from "./missing.ts";\nexport const t = clock.now();\n';
  expect(readAmbientInvocation(invocation(unreadable, "clock.now()"), CLOCK)).toMatchObject({ kind: "unreadable" });
});

test("a node that is not an invocation refuses rather than answering `other`", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile(`${ROOT}/x.ts`, "export const n = 1;\n");
  const identifier = file.getDescendantsOfKind(SyntaxKind.Identifier)[0];
  expect(identifier).toBeDefined();
  expect(invocationCallee(identifier as import("ts-morph").Node)).toBeUndefined();
  expect(readAmbientInvocation(identifier as import("ts-morph").Node, CLOCK)).toMatchObject({ kind: "unreadable", reason: "unsupported" });
});
