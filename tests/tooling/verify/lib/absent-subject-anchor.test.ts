import { subjectAnchor } from "../../../../tooling/src/verify/lib/absent-subject-anchor.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const SUBJECTS = ["a/door.ts", "b/entry.ts", "c/proof.ts"] as const;

test("a present subject anchors on itself", () => {
  const anchor = subjectAnchor(new Set(SUBJECTS), SUBJECTS);

  expect(SUBJECTS.map(anchor)).toEqual(["a/door.ts", "b/entry.ts", "c/proof.ts"]);
});

test("an absent subject falls back to the first present NAMED subject, in the caller's order", () => {
  const anchor = subjectAnchor(new Set(["b/entry.ts", "zz/unrelated.ts"]), SUBJECTS);

  // `a/door.ts` is gone, so its verdict anchors on `b/entry.ts` — the next named subject — rather than on
  // the lexicographically lower `zz/unrelated.ts`, which is merely in the population.
  expect(anchor("a/door.ts")).toBe("b/entry.ts");
  expect(anchor("b/entry.ts")).toBe("b/entry.ts");
});

test("with every named subject gone the anchor is the lowest admitted path, not a silent skip", () => {
  const anchor = subjectAnchor(new Set(["m/other.ts", "d/other.ts"]), SUBJECTS);

  expect(anchor("a/door.ts")).toBe("d/other.ts");
});

test("an empty population is a loud refusal — the state a tripwire must never render as clean", () => {
  expect(() => subjectAnchor(new Set<string>(), SUBJECTS)).toThrow(/empty effective population/u);
});
