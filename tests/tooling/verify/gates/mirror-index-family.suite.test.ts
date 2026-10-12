// The FAMILY test for the `mirror-index` family — `test-layout`, `test-reach` and `test-presence-client`. The three
// share ONE subject reader: `ops/resource-mirror.ts` `loadMirrorIndex`, reached through the `mirrorIndex` host door.
//
// WHAT LIVES HERE AND WHAT DOES NOT (guide §6.6). The declared `mustFlag`/`mustPass` rows run on the static
// tier through `check:policy-conformance`, so they are NOT re-asserted here beyond the one-line receipt.
// What a proof row structurally CANNOT express is the §4.5 REFUSAL and RECEIPT set: `toolFailure` precedes
// the arm verdict, so an arm whose correct outcome is a refusal is neither `mustFlag` nor `mustPass`. Those
// are `runPolicyPass` pins — one per declared resource per reachable status, plus the complete-run receipt
// pair. `test-reach` is `reviewed-grant`; its grant identity and its staleness once a module is reached are pinned
// below. The other two are `hard`, so no identity arm is owed for them.
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
// obligation 6): `unresolved` on BOTH `mirror-index` declarations and `empty` on `package-test`. Those are the
// arms that cannot be built from an overlay — an overlay entry is text, so it is never a symlink, and it cannot
// make a directory EXIST while staying empty — so they plant a real tree under the `scratch` `mkdtemp` root and
// pass an empty overlay.
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { captureFixtureGitHistoryFoundation, configureFixtureGitIdentity, execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { Project } from "ts-morph";
import type { ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import type { ResourceHostOptions } from "../../../../tooling/src/verify/contract/resource-host.ts";
import { gate as unionAlias } from "../../../../tooling/src/verify/gates/no-inline-union-alias.ts";
import { gate as testLayout } from "../../../../tooling/src/verify/gates/test-layout.ts";
import { gate as testPresenceClient } from "../../../../tooling/src/verify/gates/test-presence-client.ts";
import { gate as testReach } from "../../../../tooling/src/verify/gates/test-reach.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

const policies = [testLayout, testReach, testPresenceClient] as const;

// Every mirror policy blocks: none is a warning and none carries a `workItem`. `test-reach` is the one with an
// exception door, the reviewed-grant table that holds the modules no test reached when presence became reach.
test("every mirror policy is an error with no temporary work item", () => {
  expect(
    policies.map((policy) => ({
      id: policy.id,
      authority: policy.authority,
      severity: policy.severity,
      workItem: "workItem" in policy ? policy.workItem : null,
    })),
  ).toEqual([
    { id: "test-layout", authority: "hard", severity: "error", workItem: null },
    { id: "test-reach", authority: "reviewed-grant", severity: "error", workItem: null },
    { id: "test-presence-client", authority: "hard", severity: "error", workItem: null },
  ]);
});

// This one assertion serially drives three policies' complete proof sets, including each resource row's
// isolated filesystem, Git index and parser setup. It measured 2.8s alone and 8.5s under load (#2308).
// Every declared proof row of the family through the conformance runner. MEASURED alone: 18.2 s at per-core load 0.4,
// and 36.2 s beside three whole typechecks. The base is twice the loaded reading.
test("the mirror-index family keeps its two-sided proofs", { timeout: scaledBudget(73_000) }, () => {
  expect(verifyPolicyProofs(policies)).toEqual([]);
});

function pass(policy: GatePolicy, root: string, overlay: Readonly<Record<string, string>>, failOnWarnings = false): PolicyPassResult {
  return passRequesting([policy], root, overlay, { failOnWarnings });
}

function passGranted(
  policy: GatePolicy,
  root: string,
  overlay: Readonly<Record<string, string>>,
  reviewedGrants: readonly ReviewedGateGrant[],
): PolicyPassResult {
  return passRequesting([policy], root, overlay, { reviewedGrants });
}

/** `pass` narrowed to a request, the shape a staged commit hands the dispatcher. */
function passRequesting(
  selected: readonly GatePolicy[],
  root: string,
  overlay: Readonly<Record<string, string>>,
  request: { readonly failOnWarnings?: boolean; readonly requestedPaths?: readonly string[]; readonly reviewedGrants?: readonly ReviewedGateGrant[] },
): PolicyPassResult {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  for (const [path, content] of Object.entries(overlay)) {
    if (path.endsWith(".ts") || path.endsWith(".tsx")) {
      project.createSourceFile(`${root}/${path}`, content);
    }
  }
  const historyOptions = selected.includes(testLayout)
    ? ((): Pick<ResourceHostOptions, "gitHistoryFixtureFoundation"> => {
        execFixtureGit(root, ["init", "--quiet"]);
        configureFixtureGitIdentity(root);
        execFixtureGit(root, ["commit", "--quiet", "--allow-empty", "-m", "fixture foundation"]);
        return { gitHistoryFixtureFoundation: captureFixtureGitHistoryFoundation(root) };
      })()
    : {};
  return runPolicyPass({
    knownPolicies: selected,
    policies: selected,
    root,
    project,
    resourceOptions: { overlay, ...historyOptions },
    reviewedGrants: request.reviewedGrants ?? [],
    failOnWarnings: request.failOnWarnings ?? false,
    ...(request.requestedPaths === undefined ? {} : { requestedPaths: request.requestedPaths }),
  });
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
      ["git-path-history:legacy-tests", 0],
      ["mirror-index:package-test", 0],
      ["mirror-index:tooling-test", 0],
    ],
  ]);
});

// The staged-commit door: `verify --static --changed staged` hands the policy ONLY the paths the commit
// touches. A new test with no source mirror must still be judged there, not deferred to the whole-tree run.
test("test-layout: a staged new test with no source mirror is judged, not deferred", ({ scratch }) => {
  const orphan = "tests/ui/ghost/orphan.ct.tsx";
  const result = passRequesting([testLayout], scratch, { ...LAYOUT_TREE, [orphan]: "export const x = 1;\n" }, { requestedPaths: [orphan] });

  expect(result.toolErrors).toEqual([]);
  expect(result.policies.map(({ owner }) => owner.status)).not.toContain("not-applicable");
  expect(result.authority.effectiveFindings).toMatchObject([{ policyId: "test-layout", file: orphan }]);
});

// An orphan the commit did not touch belongs to whoever left it; blaming every later commit for it would
// stall unrelated work while main is red. The whole-tree run still owns it.
test("test-layout: a staged mirrored test is clean even when an untouched test elsewhere is an orphan", ({ scratch }) => {
  const mirrored = "tests/ui/primitives/other.ct.tsx";
  const result = passRequesting(
    [testLayout],
    scratch,
    {
      ...LAYOUT_TREE,
      [mirrored]: "export const x = 1;\n",
      "packages/ui/src/primitives/other.tsx": "export const other = 1;\n",
      "tests/ui/ghost/old-orphan.ct.tsx": "export const x = 1;\n",
    },
    { requestedPaths: [mirrored] },
  );

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
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

/** `test-reach`'s population is the presence-gated sources plus `tests/`; its two declarations are the package
 *  and tooling mirror spaces, which `@subject` paths are checked against. */
const TOOL_SPACE = {
  "tooling/src/snapx/cli.ts": "export {};\n",
  "tests/tooling/snapx/cli.test.ts": "export const x = 1;\n",
} as const;
const VERB = "packages/server/src/domain/chat/verbs/start-chat.ts";
const VERB_SOURCE = "export const createStartChat = (): number => 1;\n";
const REACHING_TEST =
  'import { createStartChat } from "../../../../../packages/server/src/domain/chat/verbs/start-chat.ts";\nexport const made = createStartChat();\n';
const REACH_TREE = { ...TOOL_SPACE, [VERB]: VERB_SOURCE, "tests/server/domain/chat/verbs/starting.test.ts": REACHING_TEST } as const;
const UNREACHED_TREE = { ...TOOL_SPACE, [VERB]: VERB_SOURCE, "tests/server/domain/chat/verbs/start-chat.test.ts": "export const t = 1;\n" } as const;
const VERB_GRANT: ReviewedGateGrant = {
  id: `test-reach:${VERB}`,
  policyId: "test-reach",
  subject: VERB,
  operation: "unreached:verb",
  why: "fixture",
  endsWhen: "fixture",
};

test("test-reach: an unreached verb blocks with and without promotion", ({ scratch }) => {
  const unpromoted = pass(testReach, scratch, UNREACHED_TREE);
  const promoted = pass(testReach, scratch, UNREACHED_TREE, true);

  expect(unpromoted.authority.effectiveFindings).toMatchObject([{ policyId: "test-reach", file: VERB, severity: "error" }]);
  expect(unpromoted.authority.verdict).toEqual({ errors: 1, warnings: 0, blocking: 1, failOnWarnings: false });
  expect(promoted.authority.verdict).toEqual({ errors: 1, warnings: 0, blocking: 1, failOnWarnings: true });
});

// The baseline's whole contract: one exact row excuses one unreached module, and the same row reds the moment a test
// reaches that module, so the table can only shrink.
test("test-reach: a grant excuses exactly its unreached module and goes stale once a test reaches it", ({ scratch }) => {
  const excused = passGranted(testReach, scratch, UNREACHED_TREE, [VERB_GRANT]);
  expect(excused.authority.effectiveFindings).toEqual([]);
  expect(excused.authority.grantedFindings.map(({ grantId }) => grantId)).toEqual([VERB_GRANT.id]);
  expect(excused.authority.authorityAlarms).toEqual([]);

  const reached = passGranted(testReach, scratch, { ...UNREACHED_TREE, ...REACH_TREE }, [VERB_GRANT]);
  expect(reached.authority.effectiveFindings).toEqual([]);
  expect(reached.authority.authorityAlarms).toMatchObject([{ kind: "stale-reviewed-grant", grantId: VERB_GRANT.id }]);
});

// Reach is a whole-graph relation, so a staged run defers the policy and the whole run owns the verdict.
test("test-reach: a staged run defers to the whole run, which judges a new unreached verb", ({ scratch }) => {
  const added = "packages/server/src/domain/chat/verbs/new-verb.ts";
  const tree = { ...REACH_TREE, [added]: "export const createNewVerb = (): number => 1;\n" };

  const staged = passRequesting([testReach], scratch, tree, { requestedPaths: [added] });
  expect(staged.toolErrors).toEqual([]);
  expect(staged.policies.map(({ owner }) => owner.status)).toEqual(["not-applicable"]);

  const whole = pass(testReach, scratch, tree);
  expect(whole.authority.effectiveFindings).toMatchObject([{ policyId: "test-reach", file: added }]);
});

// A run narrowed to one path must not call another policy's waiver stale in a file it never judged.
test("a subset run does not call a waiver stale in a file only a sibling policy reselected", ({ scratch }) => {
  const added = "packages/server/src/domain/chat/verbs/new-verb.ts";
  const tree = {
    ...REACH_TREE,
    [added]: "export const createNewVerb = () => 1;\n",
    "packages/server/src/domain/chat/verbs/waived.ts":
      "// @orb-waive no-inline-union-alias(Mode): fixture stand-in; ends with the fixture.\nexport type Mode = 'a' | 'b';\n",
  };

  const result = passRequesting([unionAlias, testReach], scratch, tree, { requestedPaths: [added] });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.authorityAlarms).toEqual([]);
});

// `subset` means narrowed below the declared population. The application run always carries a request (its
// subject admission) yet is a whole run, so its whole-tree arms must still fire; only a true staged subset
// switches them off.
function passApplication(policy: GatePolicy, root: string, overlay: Readonly<Record<string, string>>, applicationPaths: readonly string[]): PolicyPassResult {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  for (const [path, content] of Object.entries(overlay)) {
    if (path.endsWith(".ts") || path.endsWith(".tsx")) {
      project.createSourceFile(`${root}/${path}`, content);
    }
  }
  return runPolicyPass({
    knownPolicies: [policy],
    policies: [policy],
    root,
    project,
    resourceOptions: { overlay },
    reviewedGrants: [],
    failOnWarnings: false,
    applicationPaths,
  });
}

const BLIND_TREE = {
  ...TOOL_SPACE,
  "packages/db/src/schema/index.ts": "export const s = 1;\n",
  "packages/server/src/infra/log.ts": "export const log = () => 1;\n",
  "tests/server/infra/log.test.ts": 'import { log } from "../../../packages/server/src/infra/log.ts";\nexport const t = log();\n',
} as const;

test("test-reach: the blindness tripwire fires on a whole run and the application run, not on a staged subset", ({ scratch }) => {
  const sources = ["packages/db/src/schema/index.ts", "packages/server/src/infra/log.ts", "tests/server/infra/log.test.ts"];
  const whole = pass(testReach, scratch, BLIND_TREE);
  const application = passApplication(testReach, scratch, BLIND_TREE, sources);
  const staged = passRequesting([testReach], scratch, BLIND_TREE, { requestedPaths: ["packages/server/src/infra/log.ts"] });

  expect(whole.toolErrors.map(({ message }) => message)).toEqual([expect.stringContaining("the domain scan matched ZERO files")]);
  expect(application.toolErrors.map(({ message }) => message)).toEqual(whole.toolErrors.map(({ message }) => message));
  expect(staged.toolErrors).toEqual([]);
});

const PCA = "packages/server/src/domain/discovery/substrate/pca.ts";
const PCA_SOURCE = "export const projectPca = (rows: number[][]) => rows.map((row) => row[0] ?? 0);\n";
const PCA_TEST = 'import { projectPca } from "../../../../../packages/server/src/domain/discovery/substrate/pca.ts";\nexport const t = projectPca([]);\n';
const HEALTH = "packages/server/src/entry/http/health.ts";
const HEALTH_SOURCE = "export function health(): number {\n  const status = 200;\n  return status;\n}\n";
const HEALTH_TEST = 'import { health } from "../../../../packages/server/src/entry/http/health.ts";\nexport const t = health();\n';

/** An inference, a client and a ui module, each named by an `@subject` header: the tripwires see them, no import
 *  resolves, and nothing is left unreached. */
const FRONT_TREE = {
  "packages/inference/src/extensions/live.ts": "export const live = 1;\n",
  "tests/inference/extensions/live.test.ts": "// @subject packages/inference/src/extensions/live.ts\nexport {};\n",
  "packages/client/src/data/use-thing.ts": "export const useThing = () => 1;\n",
  "tests/client/data/use-thing.test.ts": "// @subject packages/client/src/data/use-thing.ts\nexport {};\n",
  "packages/ui/src/markdown/policy.ts": "export function build(): number {\n  return 1;\n}\n",
  "tests/ui/markdown/policy.test.ts": "// @subject packages/ui/src/markdown/policy.ts\nexport {};\n",
} as const;

test("test-reach: each blindness diagnosis discards a prior potential finding from raw and effective results", ({ scratch }) => {
  const anchor = { ...TOOL_SPACE, ...FRONT_TREE, "packages/db/src/schema/index.ts": "export const schema = 1;\n" };
  const cases = [
    {
      message: "the entry/transport scan matched ZERO files",
      missingFile: VERB,
      refusing: { ...anchor, [VERB]: VERB_SOURCE, [PCA]: PCA_SOURCE, "tests/server/domain/discovery/substrate/pca.test.ts": PCA_TEST },
      seeing: { [HEALTH]: HEALTH_SOURCE, "tests/server/entry/http/health.test.ts": HEALTH_TEST },
    },
    {
      message: "the domain scan matched ZERO files",
      missingFile: "packages/server/src/entry/http/frame-handle-store.ts",
      refusing: {
        ...anchor,
        "packages/server/src/entry/http/frame-handle-store.ts": "export function take(): number {\n  const hit = 1;\n  return hit;\n}\n",
        [HEALTH]: HEALTH_SOURCE,
        "tests/server/entry/http/health.test.ts": HEALTH_TEST,
      },
      seeing: { [PCA]: PCA_SOURCE, "tests/server/domain/discovery/substrate/pca.test.ts": PCA_TEST },
    },
  ] as const;
  for (const { message, missingFile, refusing, seeing } of cases) {
    expect(refusalShape(pass(testReach, scratch, refusing))).toEqual(evaluateRefusal("test-reach", message));

    const sighted = pass(testReach, scratch, { ...refusing, ...seeing });
    expect(sighted.toolErrors).toEqual([]);
    expect(sighted.authority.withheldPolicyIds).toEqual([]);
    expect(sighted.policies.flatMap(({ findings }) => findings)).toMatchObject([{ file: missingFile }]);
  }
});

// The third diagnosis: every demanded module present and every test present, yet not one import resolved. That is
// a resolver failure, and reporting every module unreached would read as debt rather than as a broken instrument.
test("test-reach: a corpus whose tests resolve no reference refuses instead of accusing every module", ({ scratch }) => {
  const tree = {
    ...TOOL_SPACE,
    ...FRONT_TREE,
    "packages/db/src/schema/index.ts": "export const schema = 1;\n",
    [PCA]: PCA_SOURCE,
    [HEALTH]: HEALTH_SOURCE,
    "tests/server/domain/discovery/substrate/pca.test.ts": 'import { projectPca } from "#server/missing/pca.ts";\nexport const t = projectPca;\n',
  };
  expect(refusalShape(pass(testReach, scratch, tree))).toEqual(evaluateRefusal("test-reach", "resolved ZERO references"));

  const resolving = pass(testReach, scratch, { ...tree, "tests/server/domain/discovery/substrate/pca.test.ts": PCA_TEST });
  expect(resolving.toolErrors).toEqual([]);
  expect(resolving.authority.effectiveFindings).toMatchObject([{ file: HEALTH }]);
});

test("test-reach: a complete population files its census and one receipt per declaration", ({ scratch }) => {
  const result = pass(testReach, scratch, REACH_TREE);

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.policies.map(({ receipts }) => receipts.map(({ source, unresolved }) => `${source}=${String(unresolved)}`).toSorted())).toEqual([
    ["mirror-index:package-test=0", "mirror-index:tooling-test=0", "test-reach [demanded=1,unreached=0,tests=2,references=1]=0"],
  ]);
});

test("test-reach: an absent test tree REFUSES rather than accusing every source file of being untested", ({ scratch }) => {
  const result = pass(testReach, scratch, { [VERB]: VERB_SOURCE, "tooling/src/snapx/cli.ts": "export {};\n" });

  expect(refusalShape(result)).toEqual(populationRefusal("test-reach", "resource declaration mirror-index:package-test is missing"));
});

/** `empty` on the package family needs a `tests/` tree that EXISTS and is empty, which no overlay can build. The
 *  green twin differs by the one planted member, so nothing else about the substrate explains the flip. */
test("test-reach: a tests/ tree that EXISTS and is empty refuses `empty` rather than accusing the corpus", ({ scratch }) => {
  mkdirSync(join(scratch, "tests"), { recursive: true });
  const result = pass(testReach, scratch, { [VERB]: VERB_SOURCE });

  expect(refusalShape(result)).toEqual(populationRefusal("test-reach", "resource declaration mirror-index:package-test is empty"));
});

test("test-reach: the SAME substrate with planted test members reaches a verdict — the empty refusal's green twin", ({ scratch }) => {
  plant(scratch, { "tests/server/domain/chat/verbs/starting.test.ts": REACHING_TEST, ...TOOL_SPACE });
  const result = pass(testReach, scratch, { [VERB]: VERB_SOURCE });

  expect(result.toolErrors).toEqual([]);
  expect(result.policies.map(({ id, owner }) => [id, owner.status])).toEqual([["test-reach", "success"]]);
});

const WORST_ART_TREE = {
  "packages/client/src/index.ts": "export const app = 1;\n",
  "packages/client/src/data/use-thing.ts": "export const useThing = () => 1;\n",
  "tests/client/data/use-thing.test.ts": "export const t = 1;\n",
} as const;

test("test-presence-client: the standing-CT absence fires on a whole run and the application run, not on a staged subset", ({ scratch }) => {
  const sources = ["packages/client/src/index.ts", "packages/client/src/data/use-thing.ts"];
  const messages = (result: PolicyPassResult): string[] => result.authority.effectiveFindings.map(({ message }) => message ?? "");
  const whole = pass(testPresenceClient, scratch, WORST_ART_TREE);
  const application = passApplication(testPresenceClient, scratch, WORST_ART_TREE, sources);
  const staged = passRequesting([testPresenceClient], scratch, WORST_ART_TREE, { requestedPaths: ["packages/client/src/data/use-thing.ts"] });

  expect(messages(whole)).toEqual([expect.stringContaining("standing DOM-derived worst-legal-art contrast CT")]);
  expect(messages(application)).toEqual(messages(whole));
  expect(messages(staged)).toEqual([]);
});

const ROOM = "packages/client/src/features/chat/surfaces/chat-room-surface.tsx";
const ROOM_SOURCE = "export function ChatRoomSurface(): null {\n  return null;\n}\n";
const STANDING_CT = "tests/legacy/client/features/chat/surfaces/worst-legal-art-contrast.suite.ct.tsx";

/** The room exists and its standing contrast CT does not. */
const MISSING_STANDING_CT_TREE = {
  [ROOM]: ROOM_SOURCE,
  "tests/client/features/chat/surfaces/chat-room-surface.ct.tsx": "export const t = 1;\n",
} as const;

test("test-presence-client: a missing standing CT is an unsuppressible error that blocks WITHOUT promotion", ({ scratch }) => {
  const unpromoted = pass(testPresenceClient, scratch, MISSING_STANDING_CT_TREE);
  const promoted = pass(testPresenceClient, scratch, MISSING_STANDING_CT_TREE, true);

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
    ...MISSING_STANDING_CT_TREE,
    [ROOM]: `// @orb-waive test-presence-client(export): hard finding must reject this marker.\n${ROOM_SOURCE}`,
  });

  expect(attempted.authority.effectiveFindings).toHaveLength(1);
  expect(attempted.authority.waivedFindings).toEqual([]);
  expect(attempted.authority.authorityAlarms.map(({ message }) => message)).toContainEqual(
    expect.stringContaining("targets non-ordinary policy test-presence-client"),
  );
});

test("test-presence-client: a complete population files the mirror receipt", ({ scratch }) => {
  const result = pass(testPresenceClient, scratch, { [ROOM]: ROOM_SOURCE, [STANDING_CT]: "export const t = 1;\n" });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.policies.map(({ receipts }) => receipts.map(({ source, unresolved }) => `${source}=${String(unresolved)}`))).toEqual([
    ["mirror-index:package-test=0"],
  ]);
});

test("test-presence-client: an absent test tree REFUSES rather than reading as a missing standing CT", ({ scratch }) => {
  const result = pass(testPresenceClient, scratch, { [ROOM]: ROOM_SOURCE });

  expect(refusalShape(result)).toEqual(populationRefusal("test-presence-client", "resource declaration mirror-index:package-test is missing"));
});

/** #2142'S `test-layout` PARK IS RETIRED, AND SO ARE ITS THREE PINS (#2388, 2026-09-18).
 *
 *  The park held one class: `tests/tooling/verify/gates/**` family/wave tests reported by the §4.7 TOOLING
 *  arm as `mirror miss — no source for tooling/src/…`. They drive SEVERAL converted policy modules through
 *  `runPolicyPass`, so no single source module exists to prefix-swap to. The park's own retirement clause
 *  was "when the class empties, #2142's park and this pin retire together".
 *
 *  THE CLASS EMPTIED BY BEING FIXED, not by being silenced. `4f01a59139` ("resolve 178 structure-gate
 *  violations across 4 gates") RENAMED the whole class onto the registered `.suite.test.ts` /
 *  `.suite.repo.int.test.ts` kinds — this file is one of the renamed members — and `mirror: "suite"` is the
 *  declared cross-cutting-property exemption both mirror arms honour (`test-layout.ts` §4.7 tooling arm and
 *  the package arm; the exemption's own proof row is `test-layout` `mustPass[7]`). The two NAMED exceptions
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
 *  miss is `mustFlag[2]`, a tooling mirror miss under a live tool dir is `mustFlag[6]`, a wrong-home native
 *  `.spec.ts` is `mustFlag[4]`, and the suite exemption is `mustPass[7]`. No successor real-tree pin is added
 *  here: a new violation of either arm is caught by `check:structure --check test-layout` on the STATIC bar,
 *  which every `pnpm check` runs, whereas `tests/tooling/**` is `--full`-only (#1842) — a vitest copy of it
 *  would be the weaker of the two instruments, not an extra one. */
