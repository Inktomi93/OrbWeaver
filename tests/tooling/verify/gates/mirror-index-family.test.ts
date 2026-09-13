// The FAMILY test for the `mirror-index` family — `test-layout`, `test-presence` and
// `test-presence-client`, converted from legacy `GateDescriptor`s at `aecbc6c6c` (#2061/#2062). The legacy
// tree is that conversion's PARENT, `6b1d01be0` — the sha the three modules' own header lines cite (#2136:
// this line read "the child of 90bbeb04f", which is a different commit, `90c7be9e7`).
// The three share ONE subject reader: `ops/resource-mirror.ts` `loadMirrorIndex`, reached through the
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
import { scaledBudget } from "../../_load-budget.ts";

const policies = [testLayout, testPresence, testPresenceClient] as const;

// This one assertion serially drives three policies' complete proof sets, including each resource row's
// isolated filesystem, Git index and parser setup. It measured 2.8s alone and 8.5s under load (#2308).
test("the mirror-index family keeps its two-sided proofs", { timeout: scaledBudget(15_000) }, () => {
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
/** THE PARKED `test-layout` POPULATION, HELD AS A CLASS (#2270; the park is #2142).
 *
 *  WHY NOT THE ENUMERATED ROSTER THIS REPLACES. `183e49714` pinned the whole live population as a 57-path
 *  literal under `toEqual`. The 57 were correct and reconciled member-for-member against the park's 51 and
 *  wave-8c's 53 (`docs/reviews/gate-runtime/v-wave-12b-2026-09-13.md` §2), but the INSTRUMENT was the
 *  defect: this program mints one more member of this exact class PER CONVERSION — all six post-park
 *  members landed on a single day, 2026-09-12 — so exact set equality makes a legitimate family-test
 *  addition a RED PIN. That is guide §6.1's `countFrom` ruling one level up ("a literal `count` makes a
 *  legitimate registry addition a RED PROOF"), and it reds where the author cannot see it: `pnpm check`
 *  runs no tests and `tests/tooling/**` is `--full`-only (#1842). Planted control at the time of the
 *  refutation: an `export {};` file at `tests/tooling/verify/gates/<name>-family.test.ts` took the drive
 *  57 → 58 and broke the equality.
 *
 *  THE CLASS, derived from what the 57 have in common (drive of 2026-09-13, 57 findings, 0 tool errors).
 *  Every member is BOTH:
 *    (a) reported by the §4.7 TOOLING arm — `message` starts with `mirror miss — no source for tooling/src/`
 *        — never the package arm (`… no source for packages/…`), never `unregistered test kind`, never
 *        `wrong test home`, never `test outside a package mirror`; and
 *    (b) a path under `tests/tooling/verify/gates/` — the conversion program's family/wave tests, which
 *        drive SEVERAL converted policy modules through `runPolicyPass` and so have no single source
 *        module to prefix-swap to. That is precisely the class #2142 froze behind the test-mirror revamp.
 *  Both conjuncts are load-bearing and each has its own discriminating arm below: (b) alone would admit a
 *  wrong-home or unregistered-kind defect sitting at a gates path, and (a) alone would admit a tooling
 *  mirror miss anywhere else under `tests/tooling/`.
 *
 *  ANYTHING ELSE IS A NAMED EXCEPTION, EARNED PER MEMBER. Two exist, and neither is the family class — both
 *  are CONCEPT-named tests whose subject is reached through a barrel or spans two modules, so a revamp
 *  aimed at family tests would leave them behind. `git log --all --diff-filter=A` confirms no source has
 *  ever existed at either mirror name.
 *
 *  THE TWO-SIDED HALF (#2270 asked that a parked member disappearing still be noticed). It is the
 *  EXCEPTION rows, asserted live one by one: an exception is a claim about ONE path, so the moment that
 *  path is fixed or renamed the row is stale and reds. A whole-population FLOOR COUNT was considered and
 *  REFUSED — it re-introduces the refuted defect in the opposite direction (one legitimate rename inside
 *  the class reds it, and the number then has to be hand-bumped), and a shrinking family class is not a
 *  defect: it is the revamp arriving, which the emptiness arm below reports once, loudly, at the end.
 *
 *  RE-DERIVE, never hand-edit the exception rows: drive the policy exactly as `realTreeMisses` does and
 *  read the printed list. The run costs ~1s because `test-layout` declares `population: { of: "none" }` —
 *  it reads membership, never source text, so an EMPTY project is the honest corpus for it.
 *
 *  THE POST-PARK RECORD (#2270's naming half, written here 2026-09-13 because the class deliberately does
 *  NOT red on an in-class addition, so growth is auditable ONLY if it is written down). #2142 parked 51
 *  members at `78a411ab0`; wave-8c measured 53 at `50e31c534`; wave-12b's roster was 57 at `9ad17fb5a`;
 *  and `pnpm check:structure --check test-layout` at `204607e84` reads **59** (`raw 59 = effective 59`,
 *  0 tool errors, 0 withheld). The six that took 51 → 57 are named below with the commit that ADDED each
 *  (`git log --diff-filter=A`), so the +6 is attributable per member rather than through a report that
 *  ages. All six landed 2026-09-12 — one day — which is the measurement that killed the exact-set pin:
 *    `a196a35d7`  tests/tooling/verify/gates/bus-payload-family.test.ts
 *    `2dabae9ce`  tests/tooling/verify/gates/seed-theme-ink-family.test.ts
 *    `a97454714`  tests/tooling/verify/gates/token-contract-family.test.ts
 *    `17a59099b`  tests/tooling/verify/gates/css-home-topology-family.test.ts
 *    `ae7a40e0b`  tests/tooling/verify/gates/real-corpus-liveness-family.repo.int.test.ts
 *    `61cae0710`  tests/tooling/doc-catalog/ops/catalog-scope.test.ts  — NOT in the class; it is the first
 *                 `PARKED_EXCEPTIONS` row below, and it is the member that vindicates the roster argument:
 *                 a bare count would have absorbed it silently.
 *  So five of the six are the family-test class this program mints per conversion and one is an exception.
 *  The per-member `git cat-file -e` reconciliation of 51 / 53 / 57 across those three shas is in
 *  `docs/reviews/gate-runtime/v-wave-12b-2026-09-13.md` §2 and is not restated here.
 *
 *  AND IT KEPT GROWING WHILE THIS RECORD WAS BEING WRITTEN, which is the record's own best argument. The
 *  57 → 59 delta, derived by diffing the roster literal `183e49714` shipped against the tip drive above
 *  (the literal also carried three overlay FIXTURE paths — `use-thing`, `start-chat`, `snapx/cli` — which
 *  are not members, so 60 tokens is 57 members):
 *    `9104f718f`  tests/tooling/verify/gates/css-hook-provenance-family.test.ts   (2026-09-12)
 *    `158dbdd96`  tests/tooling/verify/gates/no-color-literals-parity.test.ts     (2026-09-13)
 *  Both are in-class, both entered SILENTLY under the class invariant, and neither reds anything. An
 *  exact-set pin would have reported them as two red proofs on the lanes that landed them.
 *
 *  WHAT THIS RECORD IS NOT: it is not a pin. Nothing above reds when the sixtieth member lands — by design
 *  (that is the whole point of the class), and the honest consequence is that the next reader RE-DERIVES
 *  the number with the command named above rather than trusting the one written here. #2142's own body
 *  still reads 51; a park whose number nothing re-measures is exactly what #2270 was filed for, and
 *  closing that residue is a board edit, not a code one. */
const PARKED_CLASS_PATH_PREFIX = "tests/tooling/verify/gates/";
const PARKED_CLASS_MESSAGE_PREFIX = "mirror miss — no source for tooling/src/";

interface ParkedException {
  readonly file: string;
  readonly why: string;
}

const PARKED_EXCEPTIONS: readonly ParkedException[] = [
  {
    file: "tests/tooling/doc-catalog/ops/catalog-scope.test.ts",
    why: "`61cae0710` — a CONCEPT-named unit test whose subject is `tooling/src/doc-catalog/ops/catalog.ts` reached through the package barrel; no `catalog-scope.ts` has ever existed, and a family-test revamp would not absorb it.",
  },
  {
    file: "tests/tooling/verify/lib/bus-fact-relay.test.ts",
    why: "`d9ac09d58` — a CONCEPT-named fact-level control spanning `lib/bus-definition-fact.ts` and `lib/bus-fact.ts` through a locally defined probe policy; no `bus-fact-relay.ts` has ever existed, and its two subjects mean no prefix swap can name it.",
  },
];

function inParkedClass(finding: { readonly file: string; readonly message?: string }): boolean {
  return finding.file.startsWith(PARKED_CLASS_PATH_PREFIX) && (finding.message ?? "").startsWith(PARKED_CLASS_MESSAGE_PREFIX);
}

/** The real-tree drive, shared by the three park arms. Asserts the run is a VERDICT before returning it —
 *  a refusal here would make every arm below vacuously green on an empty finding list. */
function realTreeMisses(repoRoot: string): readonly { readonly file: string; readonly message?: string }[] {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const result = runPolicyPass({ knownPolicies: [testLayout], policies: [testLayout], root: repoRoot, project, reviewedGrants: [], failOnWarnings: false });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  return result.authority.effectiveFindings;
}

test("test-layout's real-tree population stays INSIDE the parked class — a member of another class reds", ({ repoRoot }) => {
  const outsiders = realTreeMisses(repoRoot).filter((finding) => !inParkedClass(finding));

  expect(outsiders.map(({ file }) => file).toSorted()).toEqual(PARKED_EXCEPTIONS.map(({ file }) => file).toSorted());
  expect(outsiders.filter(({ message }) => !(message ?? "").startsWith(PARKED_CLASS_MESSAGE_PREFIX))).toEqual([]);
});

test("every NAMED parked exception is still live — a row that gets fixed goes stale and reds (the two-sided half)", ({ repoRoot }) => {
  const files = new Set(realTreeMisses(repoRoot).map(({ file }) => file));

  expect(PARKED_EXCEPTIONS.filter(({ file }) => !files.has(file))).toEqual([]);
});

test("the park is not empty — when the class empties, #2142's park and this pin retire together", ({ repoRoot }) => {
  expect(realTreeMisses(repoRoot).filter(inParkedClass).length).toBeGreaterThan(0);
});

/** THE DISCRIMINATING ARMS. Each drives `test-layout` over an overlay whose only defect is the one named,
 *  then asks `inParkedClass` about the finding the gate actually produced — so the class predicate is
 *  judged against real gate output, never against a hand-written finding record. `PARKED_CLASS_TREE` is
 *  the in-population ANCHOR set both mirror families need: a fixture that admits nothing comes back a
 *  `[population]` TOOL ERROR rather than a finding (guide §4). */
const PARKED_CLASS_TREE = {
  "packages/ui/src/primitives/example.tsx": "export const example = 1;\n",
  "tests/ui/primitives/example.ct.tsx": "export const x = 1;\n",
  "tooling/src/verify/gates/example.ts": "export {};\n",
  "tests/tooling/verify/gates/example.test.ts": "export const x = 1;\n",
  "tooling/src/snapx/cli.ts": "export {};\n",
  "tests/tooling/snapx/cli.test.ts": "export const x = 1;\n",
} as const;

/** Drive the overlay and return the findings paired with the class verdict, so each arm asserts BOTH that
 *  the gate flagged what it was meant to and how the class reads it. */
function classify(scratch: string, extra: Readonly<Record<string, string>>): readonly (readonly [string, boolean])[] {
  const result = pass(testLayout, scratch, { ...PARKED_CLASS_TREE, ...extra });

  expect(result.toolErrors).toEqual([]);
  return result.authority.effectiveFindings.map((finding) => [finding.file, inParkedClass(finding)] as const);
}

test("PARKED CLASS: a legitimate new gates family test is IN the class — the addition this program makes daily", ({ scratch }) => {
  expect(classify(scratch, { "tests/tooling/verify/gates/cb-example-family.test.ts": "export const x = 1;\n" })).toEqual([
    ["tests/tooling/verify/gates/cb-example-family.test.ts", true],
  ]);
});

test("PARKED CLASS: a tooling mirror miss OUTSIDE tests/tooling/verify/gates/ is NOT in the class", ({ scratch }) => {
  expect(classify(scratch, { "tests/tooling/snapx/ghost.test.ts": "export const x = 1;\n" })).toEqual([["tests/tooling/snapx/ghost.test.ts", false]]);
});

test("PARKED CLASS: a PACKAGE-side mirror miss is NOT in the class — wrong ownership, not the parked space", ({ scratch }) => {
  expect(classify(scratch, { "tests/ui/primitives/ghost.ct.tsx": "export const x = 1;\n" })).toEqual([["tests/ui/primitives/ghost.ct.tsx", false]]);
});

test("PARKED CLASS: a wrong-HOME defect at a gates path is NOT in the class — the message conjunct earns its keep", ({ scratch }) => {
  expect(classify(scratch, { "tests/tooling/verify/gates/ghost.spec.ts": "export const x = 1;\n" })).toEqual([
    ["tests/tooling/verify/gates/ghost.spec.ts", false],
  ]);
});
