// The FAMILY test for the `mirror-index` family — `test-layout`, `test-presence`,
// `test-presence-inference` and `test-presence-client`. The original three were converted from legacy
// `GateDescriptor`s at `aecbc6c6c` (#2061/#2062). The legacy
// tree is that conversion's PARENT, `6b1d01be0` — the sha the three modules' own header lines cite (#2136:
// this line read "the child of 90bbeb04f", which is a different commit, `90c7be9e7`).
// The four share ONE subject reader: `ops/resource-mirror.ts` `loadMirrorIndex`, reached through the
// `mirrorIndex` host door. This lane is what WIRED that kind — it shipped frozen with zero gate consumers.
//
// WHAT LIVES HERE AND WHAT DOES NOT (guide §6.6). The declared `mustFlag`/`mustPass` rows run on the static
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
// THE MATRIX IS ONE PIN PER DECLARATION PER REACHABLE STATUS (`docs/law/resource-policy-contract.md`
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
import { gate as testPresenceInference } from "../../../../tooling/src/verify/gates/test-presence-inference.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const policies = [testLayout, testPresence, testPresenceInference, testPresenceClient] as const;

// The #2346 TEMPORARY WARNING POSTURE IS CLOSED OUT (owner ruling 2026-09-19, #2377): all mirror
// policies are hard/error again and NONE carries a `workItem`. This row is the closeout's pin — a
// reintroduced `severity: "warning"` on either presence policy fails here, not only in the conformance
// corpus. The warning-era promotion arms below survive as the proof that an ERROR blocks with and without
// `--fail-on-warnings`, which is the property the restoration bought.
test("every mirror policy is a hard error with no temporary work item", () => {
  expect(
    policies.map((policy) => ({
      id: policy.id,
      authority: policy.authority,
      severity: policy.severity,
      workItem: "workItem" in policy ? policy.workItem : null,
    })),
  ).toEqual([
    { id: "test-layout", authority: "hard", severity: "error", workItem: null },
    { id: "test-presence", authority: "hard", severity: "error", workItem: null },
    { id: "test-presence-inference", authority: "hard", severity: "error", workItem: null },
    { id: "test-presence-client", authority: "hard", severity: "error", workItem: null },
  ]);
});

// This one assertion serially drives three policies' complete proof sets, including each resource row's
// isolated filesystem, Git index and parser setup. It measured 2.8s alone and 8.5s under load (#2308).
test("the mirror-index family keeps its two-sided proofs", { timeout: scaledBudget(15_000) }, () => {
  expect(verifyPolicyProofs(policies)).toEqual([]);
});

function pass(policy: GatePolicy, root: string, overlay: Readonly<Record<string, string>>, failOnWarnings = false): PolicyPassResult {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  for (const [path, content] of Object.entries(overlay)) {
    if (path.endsWith(".ts") || path.endsWith(".tsx")) {
      project.createSourceFile(`${root}/${path}`, content);
    }
  }
  return runPolicyPass({ knownPolicies: [policy], policies: [policy], root, project, resourceOptions: { overlay }, reviewedGrants: [], failOnWarnings });
}

/** The shape every refusal shares: a named tool error, the owner incomplete and withheld, and NO raw OR
 *  effective finding — the facts that together say "this run is not a verdict" rather than "the tree is
 *  clean". Both finding surfaces are load-bearing: authority correctly withholds an incomplete owner, but
 *  callers can also inspect its raw policy result, which must not expose a partial evaluation. */
function refusalShape(result: PolicyPassResult): Record<string, unknown> {
  return {
    rawFindings: result.policies.flatMap(({ findings }) => findings),
    effectiveFindings: result.authority.effectiveFindings,
    toolErrors: result.toolErrors.map(({ policyId, phase, message }) => ({ policyId, phase, message })),
    owners: result.policies.map(({ id, owner }) => [id, owner.status]),
    withheld: result.authority.withheldPolicyIds,
  };
}

function populationRefusal(policyId: string, fragment: string): Record<string, unknown> {
  return {
    rawFindings: [],
    effectiveFindings: [],
    toolErrors: [{ policyId, phase: "population", message: expect.stringContaining(fragment) }],
    owners: [[policyId, "incomplete"]],
    withheld: [policyId],
  };
}

function evaluateRefusal(policyId: string, fragment: string): Record<string, unknown> {
  return {
    rawFindings: [],
    effectiveFindings: [],
    toolErrors: [{ policyId, phase: "evaluate", message: expect.stringContaining(fragment) }],
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

const MISSING_SERVER_TEST_TREE = {
  "packages/server/src/domain/chat/verbs/start-chat.ts": "export const createStartChat = () => 1;\n",
  "tests/server/domain/chat/verbs/other.test.ts": "export const t = 1;\n",
} as const;

test("test-presence: a missing server test is an unsuppressible error that blocks WITHOUT promotion", ({ scratch }) => {
  const unpromoted = pass(testPresence, scratch, MISSING_SERVER_TEST_TREE);
  const promoted = pass(testPresence, scratch, MISSING_SERVER_TEST_TREE, true);

  expect(unpromoted.policies[0]?.findings).toHaveLength(1);
  expect(unpromoted.authority.effectiveFindings).toMatchObject([{ policyId: "test-presence", severity: "error" }]);
  expect(unpromoted.authority.waivedFindings).toEqual([]);
  expect(unpromoted.authority.authorityAlarms).toEqual([]);
  expect(unpromoted.authority.verdict).toEqual({ errors: 1, warnings: 0, blocking: 1, failOnWarnings: false });
  expect(promoted.authority.effectiveFindings).toEqual(unpromoted.authority.effectiveFindings);
  expect(promoted.authority.verdict).toEqual({ errors: 1, warnings: 0, blocking: 1, failOnWarnings: true });
});

test("test-presence: a marker cannot suppress the hard finding", ({ scratch }) => {
  const attempted = pass(testPresence, scratch, {
    ...MISSING_SERVER_TEST_TREE,
    "packages/server/src/domain/chat/verbs/start-chat.ts":
      "// @orb-waive test-presence(export): hard finding must reject this marker.\nexport const createStartChat = () => 1;\n",
  });

  expect(attempted.authority.effectiveFindings).toHaveLength(1);
  expect(attempted.authority.waivedFindings).toEqual([]);
  expect(attempted.authority.authorityAlarms.map(({ message }) => message)).toContainEqual(
    expect.stringContaining("targets non-ordinary policy test-presence"),
  );
});

test("test-presence: each blindness diagnosis discards a prior potential finding from raw and effective results", ({ scratch }) => {
  const cases = [
    {
      message: "the entry/transport scan matched ZERO files",
      missingFile: "packages/server/src/domain/chat/verbs/start-chat.ts",
      refusing: {
        "packages/db/src/schema/index.ts": "export const schema = 1;\n",
        "packages/server/src/domain/chat/verbs/start-chat.ts": "export function createStartChat(): number {\n  const id = 1;\n  return id;\n}\n",
        "packages/server/src/domain/discovery/substrate/pca.ts": "export const projectPca = (rows: number[][]) => rows.map((row) => row[0] ?? 0);\n",
        "tests/server/domain/discovery/substrate/pca.test.ts": "export const t = 1;\n",
        "tests/server/domain/chat/verbs/other.test.ts": "export const t = 1;\n",
      },
      seeing: {
        "packages/server/src/entry/http/health.ts": "export function health(): number {\n  const status = 200;\n  return status;\n}\n",
        "tests/server/entry/http/health.test.ts": "export const t = 1;\n",
      },
    },
    {
      message: "the domain scan matched ZERO files",
      missingFile: "packages/server/src/entry/http/frame-handle-store.ts",
      refusing: {
        "packages/db/src/schema/index.ts": "export const schema = 1;\n",
        "packages/server/src/entry/http/frame-handle-store.ts": "export function take(): number {\n  const hit = 1;\n  return hit;\n}\n",
        "tests/server/entry/http/other.test.ts": "export const t = 1;\n",
      },
      seeing: {
        "packages/server/src/domain/discovery/substrate/pca.ts": "export const projectPca = (rows: number[][]) => rows.map((row) => row[0] ?? 0);\n",
        "tests/server/domain/discovery/substrate/pca.test.ts": "export const t = 1;\n",
      },
    },
  ] as const;
  for (const { message, missingFile, refusing, seeing } of cases) {
    expect(refusalShape(pass(testPresence, scratch, refusing))).toEqual(evaluateRefusal("test-presence", message));

    const sighted = pass(testPresence, scratch, { ...refusing, ...seeing });
    expect(sighted.toolErrors).toEqual([]);
    expect(sighted.authority.withheldPolicyIds).toEqual([]);
    expect(sighted.policies.flatMap(({ findings }) => findings)).toMatchObject([{ file: missingFile }]);
    expect(sighted.authority.effectiveFindings).toMatchObject([{ file: missingFile, severity: "error" }]);
  }
});

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
 *  complete corpus and would have accused every source file on the tree.
 *
 *  THE SUBSTRATE IS MIXED ON PURPOSE, AND THE GREEN TWIN BELOW IS WHY (#2279). The first landing of this
 *  pin planted the SOURCE on disk and passed an EMPTY overlay, which left the ts-morph project with no
 *  files — so the healthy arrangement of that same substrate does not go green, it tool-errors
 *  `candidate corpus is empty`, a DIFFERENT failure this pin's `messageIncludes` happens to exclude. The
 *  pin then proved "the refusal fires", never "the same substrate can pass", which is half of §4.5. The
 *  source now arrives through the OVERLAY in both arms and the only difference between them is the one
 *  line that gives the disk-planted test space a member: nothing else about the arrangement can explain
 *  the flip. */
const { "tests/server/domain/chat/verbs/start-chat.test.ts": PRESENCE_MIRROR, ...PRESENCE_SOURCE_ONLY } = PRESENCE_TREE;

test("test-presence: a tests/ tree that EXISTS and is empty refuses `empty` rather than accusing the corpus", ({ scratch }) => {
  mkdirSync(join(scratch, "tests"), { recursive: true });
  const result = pass(testPresence, scratch, PRESENCE_SOURCE_ONLY);

  expect(refusalShape(result)).toEqual(populationRefusal("test-presence", "resource declaration mirror-index:package-test is empty"));
  expect(result.toolErrors[0]?.message).toContain("resource tree has no members: tests");
});

test("test-presence: the SAME substrate with ONE member in the planted test space reaches a verdict — the empty refusal's green twin", ({ scratch }) => {
  plant(scratch, { "tests/server/domain/chat/verbs/start-chat.test.ts": PRESENCE_MIRROR });
  const result = pass(testPresence, scratch, PRESENCE_SOURCE_ONLY);

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.policies.map(({ id, owner }) => [id, owner.status])).toEqual([["test-presence", "success"]]);
});

/** `test-presence-client`'s TWO declarations, including the `authored-text` DEMAND door — which owns no
 *  population, so its receipt is per-CALL (`#1`) rather than per-declaration. */
const CLIENT_TREE = {
  "packages/client/src/data/use-thing.ts": "export const useThing = () => 1;\n",
  "tests/client/data/use-thing.test.ts": "export const t = 1;\n",
} as const;

const MISSING_CLIENT_TEST_TREE = {
  "packages/client/src/data/use-thing.ts": "export const useThing = () => 1;\n",
  "tests/client/data/other.test.ts": "export const t = 1;\n",
} as const;

test("test-presence-client: a missing client test is an unsuppressible error that blocks WITHOUT promotion", ({ scratch }) => {
  const unpromoted = pass(testPresenceClient, scratch, MISSING_CLIENT_TEST_TREE);
  const promoted = pass(testPresenceClient, scratch, MISSING_CLIENT_TEST_TREE, true);

  expect(unpromoted.policies[0]?.findings).toHaveLength(1);
  expect(unpromoted.authority.effectiveFindings).toMatchObject([{ policyId: "test-presence-client", severity: "error" }]);
  expect(unpromoted.authority.waivedFindings).toEqual([]);
  expect(unpromoted.authority.authorityAlarms).toEqual([]);
  expect(unpromoted.authority.verdict).toEqual({ errors: 1, warnings: 0, blocking: 1, failOnWarnings: false });
  expect(promoted.authority.effectiveFindings).toEqual(unpromoted.authority.effectiveFindings);
  expect(promoted.authority.verdict).toEqual({ errors: 1, warnings: 0, blocking: 1, failOnWarnings: true });
});

test("test-presence-client: a marker cannot suppress the hard finding", ({ scratch }) => {
  const attempted = pass(testPresenceClient, scratch, {
    ...MISSING_CLIENT_TEST_TREE,
    "packages/client/src/data/use-thing.ts":
      "// @orb-waive test-presence-client(export): hard finding must reject this marker.\nexport const useThing = () => 1;\n",
  });

  expect(attempted.authority.effectiveFindings).toHaveLength(1);
  expect(attempted.authority.waivedFindings).toEqual([]);
  expect(attempted.authority.authorityAlarms.map(({ message }) => message)).toContainEqual(
    expect.stringContaining("targets non-ordinary policy test-presence-client"),
  );
});

test("test-presence-client: an unreadable store mirror discards a prior potential finding from raw and effective results", ({ scratch }) => {
  const refusing = {
    ...MISSING_CLIENT_TEST_TREE,
    "packages/client/src/state/example-store.ts":
      'import { createGatedStore } from "./create-gated-store";\nconst store = createGatedStore<{ n: number }>("example", () => ({ n: 0 }));\nexport function setExample(): void {\n  store.setState({ n: 1 });\n}\n',
    "tests/client/state/example-store.test.ts": "\n",
  } as const;
  const result = pass(testPresenceClient, scratch, refusing);

  expect(refusalShape(result)).toEqual(evaluateRefusal("test-presence-client", "could not read ANY corpus"));

  const readable = pass(testPresenceClient, scratch, { ...refusing, "tests/client/state/example-store.test.ts": "setExample();\n" });
  expect(readable.toolErrors).toEqual([]);
  expect(readable.authority.withheldPolicyIds).toEqual([]);
  expect(readable.policies.flatMap(({ findings }) => findings)).toMatchObject([{ file: "packages/client/src/data/use-thing.ts" }]);
  expect(readable.authority.effectiveFindings).toMatchObject([{ file: "packages/client/src/data/use-thing.ts", severity: "error" }]);
});

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
/** #2142'S `test-layout` PARK IS RETIRED, AND SO ARE ITS THREE PINS (#2388, 2026-09-18).
 *
 *  The park held one class: `tests/tooling/verify/gates/**` family/wave tests reported by the §4.7 TOOLING
 *  arm as `mirror miss — no source for tooling/src/…`. They drive SEVERAL converted policy modules through
 *  `runPolicyPass`, so no single source module exists to prefix-swap to. The park's own retirement clause
 *  was "when the class empties, #2142's park and this pin retire together".
 *
 *  THE CLASS EMPTIED BY BEING FIXED, not by being silenced. `c6ae36152` ("resolve 178 structure-gate
 *  violations across 4 gates") RENAMED the whole class onto the registered `.suite.test.ts` /
 *  `.suite.repo.int.test.ts` kinds — this file is one of the renamed members — and `mirror: "suite"` is the
 *  declared cross-cutting-property exemption both mirror arms honour (`test-layout.ts` §4.7 tooling arm and
 *  the package arm; the exemption's own proof row is `test-layout` `mustPass[6]`). The two NAMED exceptions
 *  the park carried went the same way: a since-retired catalog-scope suite (its whole module tree is gone) and
 *  `tests/tooling/verify/lib/bus-fact-relay.suite.test.ts` both carried `.suite.` while they existed.
 *
 *  RECEIPT, this tree: `pnpm check:structure --check test-layout` reports ZERO members of the class
 *  (`population 0 source · 8474 resource`). The only two findings left were PACKAGE-arm misses of a
 *  different class — `tests/server/entry/local-light-prefetch-{boot,off}.int.test.ts`, whole-composition-root
 *  property tests with no single source module — and #2388 fixed them the same way, onto `.suite.int.test.ts`
 *  beside their `oidc-logout-roundtrip` / `rate-limiter-inversion` siblings in the same directory.
 *
 *  WHAT WENT WITH THE PARK AND WHY NOTHING REPLACES IT. The three pins (`stays INSIDE the parked class`,
 *  `every NAMED parked exception is still live`, `the park is not empty`) were all predicated on a non-empty
 *  class and are vacuous or inverted without one. The four `PARKED CLASS:` discriminating arms judged the
 *  CLASS PREDICATE, not the gate, so they retire with the predicate — and the gate behaviours they happened
 *  to exercise are each already owned by a declared proof row that runs on the static tier: a package mirror
 *  miss is `mustFlag[2]`, a tooling mirror miss under a live tool dir is `mustFlag[5]`, a wrong-home native
 *  `.spec.ts` is `mustFlag[4]`, and the suite exemption is `mustPass[6]`. No successor real-tree pin is added
 *  here: a new violation of either arm is caught by `check:structure --check test-layout` on the STATIC bar,
 *  which every `pnpm check` runs, whereas `tests/tooling/**` is `--full`-only (#1842) — a vitest copy of it
 *  would be the weaker of the two instruments, not an extra one. */
