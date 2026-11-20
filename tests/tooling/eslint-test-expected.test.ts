// Two ESLint guards against a case that cannot fail: an expected value built by the production call the subject
// runs (`orb/no-subject-derived-expected`), and a case whose only assertions are on literals (`orb/ct-negative-only-case`
// with `literal: true`). Each accepted form sits beside a refused neighbour, so a widened acceptance fails here.
import { expect, test } from "@orb/testkit/tooling";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { ctNegativeOnlyCaseRule } from "../../tooling/src/eslint/test-absence.ts";
import { noSubjectDerivedExpectedRule } from "../../tooling/src/eslint/test-expected.ts";

const DERIVED = "orb/no-subject-derived-expected";
const ABSENCE = "orb/ct-negative-only-case";
const PROBE = "tests/server/domain/probe/probe.test.ts";

const IMPORTS = [
  'import { build, extract, hash, other, parse, schema } from "@orb/contracts/probe";',
  'import * as ns from "#server/probe";',
  'import { ROWS } from "../../packages/kit/src/probe.ts";',
  'import { make } from "@orb/testkit/iso";',
].join("\n");

/** The rule ids and lines a source draws, so a finding on the wrong line or from another rule fails the case. */
function findings(rule: string, options: readonly unknown[], body: string): readonly (readonly [string | null, number])[] {
  const source = `${IMPORTS}\n${body}`;
  const found = new Linter().verify(
    source,
    {
      files: ["**/*.ts"],
      plugins: { orb: { rules: { "no-subject-derived-expected": noSubjectDerivedExpectedRule, "ct-negative-only-case": ctNegativeOnlyCaseRule } } },
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false } },
      rules: { [rule]: ["error", ...options] },
    },
    { filename: PROBE },
  );
  return found.map(({ ruleId, line }) => [ruleId, line - IMPORTS.split("\n").length] as const);
}

const caseOf = (...lines: readonly string[]): string => `test("probe", () => {\n${lines.join("\n")}\n});`;

// Each row: the case body, then the body lines (1-based, the `test(` line is 1) the rule must report: an assertion for the expected rule, the case for the literal one.
test.for([
  ["the expected side runs the subject's call", caseOf("expect(extract(decoded)).toEqual(extract(stated));"), [2]],
  ["the accepted neighbour: a stated expected value", caseOf("expect(extract(decoded)).toEqual({ party: [] });"), []],
  ["the expected side through a const", caseOf("const expected = extract(stated);", "expect(extract(decoded)).toEqual(expected);"), [3]],
  ["the subject through a const", caseOf("const actual = extract(decoded);", "expect(actual).toStrictEqual(extract(stated));"), [3]],
  ["a namespace member on both sides", caseOf("expect(ns.fold(a)).toBe(ns.fold(b));"), [2]],
  ["a matcher that compares by part", caseOf("expect(extract(decoded)).toMatchObject(extract(stated));"), [2]],
  // Round trip: the subject is built from the expected binding.
  ["accepted: a round trip of the expected bytes", caseOf("const bytes = build(parsed);", "expect(build(parse(bytes))).toEqual(bytes);"), []],
  [
    "refused neighbour: the subject does not read the expected bytes",
    caseOf("const bytes = build(parsed);", "expect(build(parse(other))).toEqual(bytes);"),
    [3],
  ],
  // Equivalence with a control on the same binding in the same case.
  ["accepted: an equivalence with a .not control", caseOf("expect(hash(a)).toBe(hash(b));", "expect(hash(c)).not.toBe(hash(a));"), []],
  ["accepted: an equivalence with a stated pin", caseOf("expect(hash(a)).toBe(hash(b));", 'expect(hash(a)).toBe("f00d");'), []],
  ["refused neighbour: the control is on another binding", caseOf("expect(hash(a)).toBe(hash(b));", "expect(other(c)).not.toBe(other(a));"), [2]],
  ["refused neighbour: the pin states nothing", caseOf("expect(hash(a)).toBe(hash(b));", "expect(hash(a)).toBeDefined();"), [2]],
  [
    "refused neighbour: the control sits in a sibling case",
    `${caseOf("expect(hash(a)).toBe(hash(b));")}\n${caseOf("expect(hash(c)).not.toBe(hash(a));")}`,
    [2],
  ],
  // A schema parse that normalizes two real reads.
  ["accepted: a parse over two real reads", caseOf("expect(schema.parse(await live())).toEqual(schema.parse(capture.output));"), []],
  ["refused neighbour: the parse's expected input is stated data", caseOf('expect(schema.parse(await live())).toEqual(schema.parse({ delta: "x" }));'), [2]],
  [
    "refused neighbour: a stated input through a const",
    caseOf('const input = { delta: "x" };', "expect(schema.parse(await live())).toEqual(schema.parse(input));"),
    [3],
  ],
  // Shapes the rule does not judge.
  ["a negated comparison", caseOf("expect(hash(a)).not.toBe(hash(b));"), []],
  ["an ordering matcher", caseOf("expect(hash(a).length).toBeGreaterThan(hash(b).length);"), []],
  ["a testkit helper on both sides", caseOf("expect(make(a)).toEqual(make(b));"), []],
  ["a built-in method on an imported value", caseOf("expect(ROWS.map(f)).toEqual(ROWS.map(g));"), []],
] as const)("subject-derived expected: %s", ([, body, lines]) => {
  expect(findings(DERIVED, [], body)).toEqual(lines.map((line) => [DERIVED, line]));
});

test.for([
  ["a case whose only assertion is a literal", caseOf("expect(true).toBe(true);"), [1]],
  ["a literal template and an undefined", caseOf("expect(`x`).toBe(`x`);", "expect(undefined).toBeUndefined();"), [1]],
  ["the accepted neighbour: a computed subject", caseOf("expect(extract(decoded)).toBe(true);"), []],
  ["a literal beside a computed subject", caseOf("expect(true).toBe(true);", "expect(extract(decoded)).toEqual({});"), []],
  ["a snapshot of a literal runs the serializer", caseOf('expect("captured <ts>").toMatchInlineSnapshot(`"captured <ts>"`);'), []],
  ["a literal beside an absence", caseOf("expect(found).toEqual([]);", "expect(1).toBe(1);"), [1]],
] as const)("literal subject: %s", ([, body, lines]) => {
  expect(findings(ABSENCE, [{ absence: false, literal: true }], body)).toEqual(lines.map((line) => [ABSENCE, line]));
});

test("with the literal check off, a literal still counts as the positive control of an absence case", () => {
  const body = caseOf("expect(found).toEqual([]);", "expect(1).toBe(1);");
  expect(findings(ABSENCE, [{ absence: true, literal: false }], body)).toEqual([]);
  expect(findings(ABSENCE, [{ absence: true, literal: true }], body)).toEqual([[ABSENCE, 1]]);
});
