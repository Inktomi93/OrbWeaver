// The FAMILY test for the `mirror-index` family — `test-layout`, `test-presence` and
// `test-presence-client`, converted from legacy `GateDescriptor`s at the child of 90bbeb04f (#2061/#2062).
// The three share ONE subject reader: `ops/resource-mirror.ts` `loadMirrorIndex`, reached through the
// `mirrorIndex` host door. This lane is what WIRED that kind — it shipped frozen with zero gate consumers.
//
// WHAT LIVES HERE AND WHAT DOES NOT (guide §4.9). The declared `mustFlag`/`mustPass` rows run on the static
// tier through `check:policy-conformance`, so they are NOT re-asserted here beyond the one-line receipt.
// What a proof row structurally CANNOT express is the §4.5 REFUSAL and RECEIPT set: `toolFailure` precedes
// the arm verdict, so an arm whose correct outcome is a refusal is neither `mustFlag` nor `mustPass`. Those
// are `runPolicyPass` pins — one per declared resource per reachable status, plus the complete-run receipt
// pair. All three policies are `hard`, so no §4.2 identity arm is owed (a hard finding has no waiver door).
//
// WHY THE REFUSAL PINS ARE THE POINT OF THE WHOLE CONVERSION. Every legacy arm answered its mirror question
// with `existsSync`, which cannot tell "the test tree has no member here" from "the test tree is not there
// at all" — and the second read as a clean corpus. `loadMirrorIndex` refuses a family whose bounded space
// holds zero files; `resolveResourceDeclarations` then throws at the POPULATION phase and the owner is
// withheld before `create` runs. The pins below are the two-sided proof of that: the SAME overlay minus one
// space flips a green pass into a named refusal, which is what rules out "the fixture simply had nothing to
// find". No specifier-resolution control is owed — resource rows import nothing.
//
// THE MATRIX IS ONE PIN PER DECLARATION PER REACHABLE STATUS (`docs/design/resource-policy-contract.md`
// obligation 6), and three cells were missing until #2130: `unresolved` on BOTH `mirror-index` declarations
// and `empty` on `package-test`. Those three are the arms that cannot be built from an overlay — an overlay
// entry is text, so it is never a symlink, and it cannot make a directory EXIST while staying empty — so
// they plant a real tree under the `scratch` `mkdtemp` root and pass an empty overlay. The fourth cell,
// `authored-text` non-ready, is a DECLARED LIMIT rather than a missing pin: every demanded subject is drawn
// from `mirror.testFiles`, and the mirror walk reads each member's BYTES, so an unreadable subject refuses
// the mirror declaration at the population phase and the demand door is never reached. The argument and its
// mechanism live in `test-presence-client.ts`'s header beside the declaration.
import { mkdirSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate as testLayout } from "../../../../tooling/src/verify/gates/test-layout.ts";
import { gate as testPresence } from "../../../../tooling/src/verify/gates/test-presence.ts";
import { gate as testPresenceClient } from "../../../../tooling/src/verify/gates/test-presence-client.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const policies = [testLayout, testPresence, testPresenceClient] as const;

test("the mirror-index family keeps its two-sided proofs", () => {
  expect(verifyPolicyProofs(policies)).toEqual([]);
});

function pass(policy: GatePolicy, root: string, overlay: Readonly<Record<string, string>>): PolicyPassResult {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  for (const [path, content] of Object.entries(overlay)) {
    if (path.endsWith(".ts") || path.endsWith(".tsx")) {
      project.createSourceFile(`${root}/${path}`, content);
    }
  }
  return runPolicyPass({ knownPolicies: [policy], policies: [policy], root, project, resourceOptions: { overlay }, reviewedGrants: [], failOnWarnings: false });
}

/** The shape every refusal shares: a population-phase tool error naming the declaration and its status
 *  word, the owner incomplete and withheld, and NO finding — the four facts that together say "this run is
 *  not a verdict" rather than "the tree is clean". Asserted as one object so a refusal that drifted on ONE
 *  axis (a finding leaking through, an owner completing) fails with the whole shape in the diff. */
function refusalShape(result: PolicyPassResult): Record<string, unknown> {
  return {
    findings: result.authority.effectiveFindings,
    toolErrors: result.toolErrors.map(({ policyId, phase, message }) => ({ policyId, phase, message })),
    owners: result.policies.map(({ id, owner }) => [id, owner.status]),
    withheld: result.authority.withheldPolicyIds,
  };
}

function populationRefusal(policyId: string, fragment: string): Record<string, unknown> {
  return {
    findings: [],
    toolErrors: [{ policyId, phase: "population", message: expect.stringContaining(fragment) }],
    owners: [[policyId, "incomplete"]],
    withheld: [policyId],
  };
}

/** Write an overlay-shaped map to REAL DISK under the scratch root. The `unresolved` and tree-`empty`
 *  statuses are the two refusals no overlay can express — an overlay entry is text, so it can never be a
 *  symlink, and an overlay-free directory cannot be made to exist. Those arms plant the tree instead and
 *  pass an EMPTY overlay, which is why this helper exists beside `pass`. */
function plant(root: string, files: Readonly<Record<string, string>>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

/** A complete, legal overlay for `test-layout`: both mirror families have members in both spaces, and every
 *  test member prefix-swaps. Removing ONE key at a time is what makes each refusal below two-sided. */
const LAYOUT_TREE = {
  "packages/ui/src/primitives/example.tsx": "export const example = 1;\n",
  "tests/ui/primitives/example.ct.tsx": "export const x = 1;\n",
  "tooling/src/snapx/cli.ts": "export {};\n",
  "tests/tooling/snapx/cli.test.ts": "export const x = 1;\n",
} as const;

test("test-layout: a complete mirror population reaches a verdict and files one receipt per declaration", ({ scratch }) => {
  const result = pass(testLayout, scratch, LAYOUT_TREE);

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  expect(result.policies.map(({ receipts }) => receipts.map(({ source, unresolved }) => [source, unresolved]))).toEqual([
    [
      ["mirror-index:package-test", 0],
      ["mirror-index:tooling-test", 0],
    ],
  ]);
});

test("test-layout: an ABSENT test tree REFUSES — the exact blindness `existsSync` could not distinguish", ({ scratch }) => {
  const { "tests/ui/primitives/example.ct.tsx": _ct, "tests/tooling/snapx/cli.test.ts": _tooling, ...rest } = LAYOUT_TREE;
  const result = pass(testLayout, scratch, rest);

  expect(refusalShape(result)).toEqual(populationRefusal("test-layout", "resource declaration mirror-index:package-test is missing"));
});

test("test-layout: an absent PACKAGE source space refuses on its own declaration, not the tooling one", ({ scratch }) => {
  const { "packages/ui/src/primitives/example.tsx": _src, ...rest } = LAYOUT_TREE;
  const result = pass(testLayout, scratch, rest);

  expect(refusalShape(result)).toEqual(populationRefusal("test-layout", "resource declaration mirror-index:package-test is missing"));
});

test("test-layout: an absent tooling/src space refuses on the SECOND declaration — neither is privileged", ({ scratch }) => {
  const { "tooling/src/snapx/cli.ts": _tool, ...rest } = LAYOUT_TREE;
  const result = pass(testLayout, scratch, rest);

  expect(refusalShape(result)).toEqual(populationRefusal("test-layout", "resource declaration mirror-index:tooling-test is missing"));
});

test("test-layout: an EMPTY tests/tooling half refuses with the family's own bounded-space reason", ({ scratch }) => {
  const { "tests/tooling/snapx/cli.test.ts": _tooling, ...rest } = LAYOUT_TREE;
  const result = pass(testLayout, scratch, rest);

  expect(refusalShape(result)).toEqual(populationRefusal("test-layout", "mirror family tooling-test has an empty space"));
});

/** `unresolved` — the THIRD reachable status, declared in all three module headers ("a symlink anywhere on
 *  the walked path makes the tree `unresolved` — a REFUSAL") and pinned by nothing until #2130. It is the
 *  status that distinguishes "I read this tree and it holds no mirror" from "I could not read this tree",
 *  which is the entire capability the conversion bought, so leaving it unpinned left the strongest claim in
 *  the family resting on prose. Both declarations get their own arm: neither is privileged, and a reader
 *  who only saw the `package-test` arm could not tell whether the second declaration refuses at all. */
test("test-layout: the SAME tree planted on disk with no symlink reaches a verdict — the control for both arms below", ({ scratch }) => {
  plant(scratch, LAYOUT_TREE);
  const result = pass(testLayout, scratch, {});

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
});

test("test-layout: a SYMLINK on the walked TEST path refuses `unresolved` on the package declaration", ({ scratch }) => {
  plant(scratch, LAYOUT_TREE);
  symlinkSync("example.ct.tsx", join(scratch, "tests/ui/primitives/linked.ct.tsx"));
  const result = pass(testLayout, scratch, {});

  expect(refusalShape(result)).toEqual(populationRefusal("test-layout", "mirror-index:package-test is unresolved"));
  expect(result.toolErrors[0]?.message).toContain("authored resource traverses a symbolic link: tests/ui/primitives/linked.ct.tsx");
});

test("test-layout: a SYMLINK under tooling/src refuses `unresolved` on the SECOND declaration, package-test staying ready", ({ scratch }) => {
  plant(scratch, LAYOUT_TREE);
  symlinkSync("cli.ts", join(scratch, "tooling/src/snapx/linked.ts"));
  const result = pass(testLayout, scratch, {});

  expect(refusalShape(result)).toEqual(populationRefusal("test-layout", "mirror-index:tooling-test is unresolved"));
  expect(result.toolErrors[0]?.message).toContain("authored resource traverses a symbolic link: tooling/src/snapx/linked.ts");
});

/** `test-presence`'s one declaration. A complete corpus reaches a verdict and files ONE resource receipt;
 *  removing either bounded space of the SAME family flips it into a named population-phase refusal. */
const PRESENCE_TREE = {
  "packages/server/src/domain/chat/verbs/start-chat.ts": "export const createStartChat = () => 1;\n",
  "tests/server/domain/chat/verbs/start-chat.test.ts": "export const t = 1;\n",
} as const;

test("test-presence: a complete mirror population reaches a verdict and files its one receipt", ({ scratch }) => {
  const result = pass(testPresence, scratch, PRESENCE_TREE);

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.policies.map(({ receipts }) => receipts.map(({ source, unresolved }) => [source, unresolved]))).toEqual([[["mirror-index:package-test", 0]]]);
});

/** THE CAPABILITY THE CONVERSION BUYS, as its own two-sided pin. Under `existsSync` the run below produced
 *  a FINDING ("this verb has no test"), because an absent `tests/` tree and a `tests/` tree with no member
 *  at that path were the same answer. It is now a REFUSAL: no finding, and a message naming the corpus it
 *  could not read. */
test("test-presence: an absent test tree REFUSES rather than accusing every source file of being untested", ({ scratch }) => {
  const { "tests/server/domain/chat/verbs/start-chat.test.ts": _test, ...rest } = PRESENCE_TREE;
  const result = pass(testPresence, scratch, rest);

  expect(refusalShape(result)).toEqual(populationRefusal("test-presence", "resource declaration mirror-index:package-test is missing"));
  expect(result.toolErrors[0]?.message).toContain("mirror family package-test");
});

/** `empty` on the PACKAGE family, the status its `tooling-test` twin above pins and this one did not
 *  (#2130). The two are not the same shape: `tooling-test`'s empty arm is reached by a `tests/` tree that
 *  HAS members but none under its narrower `tests/tooling` root, while `package-test`'s test root IS the
 *  tree, so the only way in is a test tree that EXISTS and is empty — a state no overlay can build, and
 *  exactly the tree a wiped `tests/` leaves behind. Under `existsSync` this was indistinguishable from a
 *  complete corpus and would have accused every source file on the tree. */
test("test-presence: a tests/ tree that EXISTS and is empty refuses `empty` rather than accusing the corpus", ({ scratch }) => {
  plant(scratch, { "packages/server/src/domain/chat/verbs/start-chat.ts": "export const createStartChat = () => 1;\n" });
  mkdirSync(join(scratch, "tests"), { recursive: true });
  const result = pass(testPresence, scratch, {});

  expect(refusalShape(result)).toEqual(populationRefusal("test-presence", "resource declaration mirror-index:package-test is empty"));
  expect(result.toolErrors[0]?.message).toContain("resource tree has no members: tests");
});

/** `test-presence-client`'s TWO declarations, including the `authored-text` DEMAND door — which owns no
 *  population, so its receipt is per-CALL (`#1`) rather than per-declaration. */
const CLIENT_TREE = {
  "packages/client/src/data/use-thing.ts": "export const useThing = () => 1;\n",
  "tests/client/data/use-thing.test.ts": "export const t = 1;\n",
} as const;

test("test-presence-client: a complete population files the mirror receipt AND the per-call demand receipt", ({ scratch }) => {
  const result = pass(testPresenceClient, scratch, CLIENT_TREE);

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  // Sorted: the receipt LIST is what matters (one per declaration, plus one per demand CALL), not the order
  // the sink happens to publish them in.
  expect(result.policies.map(({ receipts }) => receipts.map(({ source, unresolved }) => `${source}=${String(unresolved)}`).toSorted())).toEqual([
    ["authored-text#1=0", "mirror-index:package-test=0"],
  ]);
});

test("test-presence-client: an absent test tree REFUSES — clause A cannot read a mirror that is not there", ({ scratch }) => {
  const { "tests/client/data/use-thing.test.ts": _test, ...rest } = CLIENT_TREE;
  const result = pass(testPresenceClient, scratch, rest);

  expect(refusalShape(result)).toEqual(populationRefusal("test-presence-client", "resource declaration mirror-index:package-test is missing"));
});

/** THE LIVE-TREE ARM, carried over from the retired `test-presence-client.int.test.ts` because it is the
 *  only assertion there that does not touch the gate's code at all. Clause C was inert on 15 of 34 stores
 *  because its header asserted every state-store mirror is a `.ct.tsx`; the tree disagreed by 15 files. If
 *  anyone re-narrows the mirror resolution to a single suffix, THIS is the receipt that the narrowing is
 *  wrong — and it keeps proving after every conversion, since it reads the tree and nothing else. */
test("state store mirrors are NOT all .ct.tsx — the false premise that made clause C inert (#619)", ({ repoRoot }) => {
  const names = readdirSync(join(repoRoot, "tests/client/state")).filter((name) => name.endsWith(".test.ts") || name.endsWith(".ct.tsx"));

  expect(names.filter((name) => name.endsWith(".ct.tsx")).length).toBeGreaterThan(0);
  expect(names.filter((name) => name.endsWith(".test.ts")).length).toBeGreaterThan(5);
});
