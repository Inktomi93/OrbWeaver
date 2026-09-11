// The mirror door. The capability under test is that "there is no mirror here" and "there is no mirror
// TREE" are two different answers — the distinction every consuming gate's `existsSync` cannot express.
//
// Every arm below carries its planted control in BOTH directions: a positive plant that must be SEEN, and
// the same corpus without it, which must go the other way. A door that cannot produce a false verdict on
// demand has not been shown to work.
import type { ResourceLoad } from "../../../../tooling/src/verify/contract/resource.ts";
import type { MirrorFamilyId, MirrorIndex } from "../../../../tooling/src/verify/contract/resource-mirror.ts";
import { loadMirrorIndex } from "../../../../tooling/src/verify/ops/resource-mirror.ts";
import { createResourceReader } from "../../../../tooling/src/verify/ops/resource-reader.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const SOURCE = "packages/server/src/domain/act.ts";
const MIRROR = "tests/server/domain/act.test.ts";
const TOOL = "tooling/src/verify/ops/thing.ts";
const TOOL_MIRROR = "tests/tooling/verify/ops/thing.test.ts";

function load(scratch: string, overlay: Readonly<Record<string, string | null>>, family: MirrorFamilyId = "package-test"): ResourceLoad<MirrorIndex> {
  return loadMirrorIndex(createResourceReader({ root: scratch, overlay }), family);
}

function ready(fact: ResourceLoad<MirrorIndex>): MirrorIndex {
  if (fact.status !== "ready") {
    throw new Error(`fixture mirror index failed: ${fact.reason}`);
  }
  return fact.value;
}

test("both spaces are indexed, and membership answers the question existsSync answers today", ({ scratch }) => {
  const index = ready(load(scratch, { [SOURCE]: "export const act = 1;\n", [MIRROR]: "test('x', () => {});\n" }));

  expect(index.sourceFiles.has(SOURCE)).toBe(true);
  expect(index.testFiles.has(MIRROR)).toBe(true);
  expect(index.sourceDirectories.has("packages/server/src/domain")).toBe(true);
  expect(index.testsByDirectory.get("tests/server/domain")).toEqual([MIRROR]);
  // The NEGATIVE half of the same control: a path one character off is not a member, so a consumer's
  // prefix-swap rule is doing real work rather than matching anything that starts with the right letters.
  expect(index.sourceFiles.has("packages/server/src/domain/acts.ts")).toBe(false);
  expect(index.testsByDirectory.has("tests/server")).toBe(false);
});

test("a MISSING mirror and a MISSING TREE are different facts", ({ scratch }) => {
  // Positive control: source present, mirror absent — a real "no mirror" answer the gate must report.
  const missingMirror = load(scratch, { [SOURCE]: "export const act = 1;\n", "tests/server/other.test.ts": "" });
  const index = ready(missingMirror);
  expect(index.sourceFiles.has(SOURCE)).toBe(true);
  expect(index.testFiles.has(MIRROR)).toBe(false);

  // Negative control: the same question against a tree that is not there. `existsSync` returns false for
  // BOTH, which is how a whole-corpus outage reads as "no test exists for this module".
  const noTestTree = load(scratch, { [SOURCE]: "export const act = 1;\n" });
  expect(noTestTree.status).not.toBe("ready");
  expect(noTestTree.status === "ready" ? "" : noTestTree.reason).toContain("tests");
});

test("the tooling family bounds its own spaces rather than inheriting the whole tests tree", ({ scratch }) => {
  const overlay = {
    [TOOL]: "export const thing = 1;\n",
    [TOOL_MIRROR]: "test('x', () => {});\n",
    [SOURCE]: "export const act = 1;\n",
    [MIRROR]: "test('y', () => {});\n",
  };
  const tooling = ready(load(scratch, overlay, "tooling-test"));

  expect(tooling.testFiles.has(TOOL_MIRROR)).toBe(true);
  // The control that proves the bound is real: a package-space test is NOT a member of the tooling family,
  // even though both families are derived from the one `tests` tree.
  expect(tooling.testFiles.has(MIRROR)).toBe(false);
  expect(ready(load(scratch, overlay, "package-test")).testFiles.has(MIRROR)).toBe(true);
});

test("members is the DENOMINATOR walked, and an unknown family refuses", ({ scratch }) => {
  const fact = load(scratch, { [SOURCE]: "export const act = 1;\n", [MIRROR]: "test('x', () => {});\n" });

  // Two files were walked; the door publishes what it MEASURED, never the mirrors it found.
  expect(fact.members).toBe(2);
  expect(fact.paths).toEqual([SOURCE, MIRROR].toSorted((left, right) => left.localeCompare(right)));

  const unknown = load(scratch, { [SOURCE]: "", [MIRROR]: "" }, "not-a-family" as MirrorFamilyId);
  expect(unknown.status).toBe("unresolved");
  expect(unknown.status === "unresolved" ? unknown.reason : "").toContain("unknown mirror family");
});
