// Self-test for the `no-test-fabrication` gate (scripts/check/gates/no-test-fabrication.ts —
// core/Spine-Testing.md §5 / W1h). Proves: a `X as unknown as Y` double-cast fires; an object/array-literal
// `as Y` fires; `as const`/`as unknown`/`as any` pass; a `// FABRICATION-OK` escape (same line + line-above)
// exempts; the baseline ratchet suppresses UP TO its count and REDs the excess; a file absent from the
// baseline has budget 0; and non-tests/ files are out of scope.
//
// The fabrication CASTS below live inside STRING fixtures (not this file's own AST) — the gate detects
// AsExpression nodes, so a cast written as a string literal is invisible to it and can't self-trip.
import {
  createNoTestFabrication,
  noTestFabrication,
} from "../../scripts/check/gates/no-test-fabrication.ts";
import { expect, test } from "../support/fixtures.ts";
import { ctxFor } from "./_support.ts";

const F = "tests/server/domain/widget/thing.int.test.ts";
const DOUBLE = "export const a = {} as unknown as { n: number };\n";
const LITERAL = "export const b = { n: 1 } as Widget;\n";

test("fires on a `X as unknown as Y` double-cast in a test", () => {
  const v = noTestFabrication.run(ctxFor({ [F]: DOUBLE }));
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("double-cast");
});

test("fires on an object-literal `as Y` (Y not const/any/unknown)", () => {
  const v = noTestFabrication.run(ctxFor({ [F]: LITERAL }));
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("literal");
});

test("fires on an array-literal `as Y[]`", () => {
  const v = noTestFabrication.run(ctxFor({ [F]: "export const c = [1, 2] as Widget[];\n" }));
  expect(v).toHaveLength(1);
});

test("passes `as const`, `as unknown`, and `as any` literals", () => {
  const src =
    "export const a = { n: 1 } as const;\n" +
    "export const b = { n: 1 } as unknown;\n" +
    "export const c = [1] as any;\n";
  expect(noTestFabrication.run(ctxFor({ [F]: src }))).toEqual([]);
});

test("a `// FABRICATION-OK` comment on the SAME line exempts the site", () => {
  const src = "export const b = { n: 1 } as Widget; // FABRICATION-OK: invalid-input probe\n";
  expect(noTestFabrication.run(ctxFor({ [F]: src }))).toEqual([]);
});

test("a `// FABRICATION-OK` comment on the line ABOVE exempts the site", () => {
  const src =
    "// FABRICATION-OK: negative-space never-cast\nexport const a = {} as unknown as Widget;\n";
  expect(noTestFabrication.run(ctxFor({ [F]: src }))).toEqual([]);
});

test("baseline ratchet: a file AT its baseline count passes", () => {
  const gate = createNoTestFabrication({ [F]: 1 });
  expect(gate.run(ctxFor({ [F]: LITERAL }))).toEqual([]);
});

test("baseline ratchet: a file EXCEEDING its baseline REDs only the excess", () => {
  const gate = createNoTestFabrication({ [F]: 1 });
  const two = `${LITERAL}export const d = { m: 2 } as Gadget;\n`;
  const v = gate.run(ctxFor({ [F]: two }));
  expect(v).toHaveLength(1);
});

test("a file ABSENT from the baseline has budget 0 (any fabrication is RED)", () => {
  const gate = createNoTestFabrication({ "tests/other.int.test.ts": 5 });
  expect(gate.run(ctxFor({ [F]: LITERAL }))).toHaveLength(1);
});

test("ignores fabrication casts OUTSIDE tests/ (source is not gated here)", () => {
  const src = "packages/server/src/domain/widget/x.ts";
  expect(noTestFabrication.run(ctxFor({ [src]: DOUBLE }))).toEqual([]);
});
