// The repo pin for the `dangling-refs` family: the REAL tree for every read (the whole-gate verdict, the
// grant translation, the population receipts) and an invocation-owned `plantedTree` corpus at the same
// relative paths for every direction that needs something PLANTED. A policy proof row's file map cannot
// carry the relative paths the corpus derivation is keyed on, which is why these arms live here.
//
// #2332 — THIS SUITE USED TO WRITE INTO THE CHECKOUT, AND NO LONGER DOES. Six mutations lived here until
// 2026-09-14: a build-output directory created and removed, a phantom line appended to and restored in the
// tracked `tooling/src/verify/gates/GATE-AUTHORING.md`, and a probe doc created and removed under the frozen history tree. Each
// was belted (restore in `finally` plus a process-exit hook, with the working tree asserted byte-identical
// afterwards), and the belt was never the problem: cleanup reduces residue after a NORMAL exit, and cannot
// stop a concurrent `git add -A`, a kill outside the registered path, or another lane reading a gate input
// while it is mutated. That is the 2026-08-24 blinded-gate incident class verbatim, which is why
// `policy-fixture-substrate` is a hard gate over this very directory. The per-arm reasoning for each move —
// including the header premise that said a scratch copy was impossible, and why it was an objection to an
// UNFILTERED assertion rather than to an isolated root — sits with the arms themselves.
import { describe } from "vitest";
import { gate as danglingRefCitations } from "../../../../tooling/src/verify/gates/dangling-ref-citations.ts";
import { gate as danglingRefs } from "../../../../tooling/src/verify/gates/dangling-refs.ts";
import { projectCtx } from "../../../../tooling/src/verify/index.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const HARD_GATE = "dangling-refs";
const CITATION_GATE = "dangling-ref-citations";
const FAMILY_GRANTS = REVIEWED_GRANTS.filter(({ policyId }) => policyId === CITATION_GATE);
// Two rows joined the family AFTER the conversion (a6740edc3, 2026-09-14): the `ELEVATED_ALLOW` and
// `EXEMPT_PROCEDURES` symbol citations that the density-tier and duplicate-action-doors conversions retired
// from the tree while Core-Enforcement-Active-Gates.md kept naming them. They are live grants, not
// translations of a legacy private row, so the arm below names them separately. The `TRANSLATED_GRANTS`
// partition this list used to feed is gone with the set-equality assertion it served (#2397).
const POST_CONVERSION_GRANT_IDS: ReadonlySet<string> = new Set(["dangling-ref-citations:elevated-allow", "dangling-ref-citations:exempt-procedures"]);
const DIFFERENTIAL_ANCHOR = "docs/law/__dangling_refs_differential_anchor.md";
const DIFFERENTIAL_PACKAGE_ANCHOR = "packages/kit/src/__dangling_refs_differential_anchor.ts";
const DIFFERENTIAL_TOOLING_ANCHOR = "tooling/src/__dangling_refs_differential_anchor.ts";
const FINAL_RESOURCE_FLOOR = {
  [DIFFERENTIAL_ANCHOR]: "---\nkind: law\nstatus: active\n---\n\nDifferential resource anchor.\n",
  [DIFFERENTIAL_PACKAGE_ANCHOR]: "export const DANGLING_REFS_DIFFERENTIAL_ANCHOR = true;\n",
  [DIFFERENTIAL_TOOLING_ANCHOR]: "export const danglingRefsDifferentialAnchor = true;\n",
} as const;

function runDanglingRefs(repoRoot: string): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({
    knownPolicies: [danglingRefCitations, danglingRefs],
    policies: [danglingRefCitations, danglingRefs],
    root: repoRoot,
    project: projectCtx(repoRoot).project,
    reviewedGrants: FAMILY_GRANTS,
    failOnWarnings: false,
  });
}

const ISOLATED_LAW = "docs/law/__dangling_refs_isolated_law__.md";
const ISOLATED_DESIGN = "docs/plans/__dangling_refs_isolated__/design.md";

/** A SELF-CONTAINED derived corpus for this gate, at the same RELATIVE paths the real tree uses (#2332).
 *
 *  It exists because every arm below asks a question about the gate's RESOLUTION — is
 *  `tooling/src/verify/gates/GATE-AUTHORING.md` inside the citation net, is a dated review outside it — and
 *  every one of those is answered against `root`. What it deliberately does NOT carry is `docs/law/Constitution.md` and the rest of
 *  the living corpus: their cites resolve against the real tree, so importing them would report thousands of
 *  phantoms that say nothing about the arm. Each assertion below therefore FILTERS to its own subject, and
 *  the whole-gate-clean claim stays where it belongs — on the real-tree read above. */
function isolatedCorpus(): Readonly<Record<string, string>> {
  return {
    ...FINAL_RESOURCE_FLOOR,
    [ISOLATED_LAW]: "---\nkind: law\nstatus: active\n---\n\nIsolated law anchor.\n",
    [ISOLATED_DESIGN]: "---\nkind: plan\nstatus: active\n---\n\nIsolated design anchor.\n",
    [LAW_OUTSIDE_DOC]: "---\nkind: law\n---\n\nIsolated law outside docs.\n",
    "tooling/src/ui-audit/ops/walker/RULE-AUTHORING.md": "---\nkind: law\n---\n\nIsolated rule-authoring law.\n",
  };
}

/** One policy's effective findings on an isolated root, as `file:message` labels so two runs compare.
 *
 *  THE BLIND-RUN GUARD is here rather than in each arm: an empty finding list on a mini root reads exactly
 *  like a gate that resolved NOTHING, and three of the arms below assert emptiness. The corpus census must be
 *  non-zero on every isolated run, so "clean" is a verdict rather than a placebo (#946's shape, #2332). */
function isolatedFindings(root: string, policyId: string): readonly string[] {
  const result = runDanglingRefs(root);
  expect(result.toolErrors, `the isolated corpus must drive ${policyId} without a tool error`).toEqual([]);
  const receipts = result.policies.find((policy) => policy.id === HARD_GATE)?.receipts ?? [];
  const law = receipts.find((receipt) => receipt.kind === "population" && receipt.source === "citation-corpus:law");
  expect(law?.kind === "population" ? law.members : 0, "the isolated corpus must actually populate the law class").toBeGreaterThan(0);
  return result.authority.effectiveFindings
    .filter((finding) => finding.policyId === policyId)
    .map((finding) => `${finding.file}:${finding.message ?? ""}`)
    .toSorted((left, right) => left.localeCompare(right));
}

describe("dangling-refs — the real tree", () => {
  test("the real-tree run reports no hard finding", ({ repoRoot }) => {
    // This gate is SELF-CONTAINED (it reads docs off disk and needs no sibling's verdict), so it runs alone
    // — a whole-corpus pass here would cost minutes to prove one gate.
    const result = runDanglingRefs(repoRoot);
    expect(result.toolErrors).toEqual([]);
    expect(result.authority.effectiveFindings.filter((finding) => finding.policyId === HARD_GATE)).toEqual([]);
  }, 600_000);
});

const EXPECTED_GRANT_IDENTITIES = [
  ["@orb/kit/vector-math.pairwiseCosine", "dangling-path-cite"],
  ["@orb/tokens", "dangling-path-cite"],
  ["@orb/ui/MessageMedia", "dangling-path-cite"],
  ["ANTH_DIRECT_SAMPLING", "dangling-symbol-cite"],
  ["HUB_ADAPTERS", "dangling-symbol-cite"],
  ["MOBILE_PRIMARY_SECTIONS", "dangling-symbol-cite"],
  ["MODAL_SLOTS", "dangling-symbol-cite"],
  ["RAIL_ACTIONS", "dangling-symbol-cite"],
  ["RAIL_SECTIONS", "dangling-symbol-cite"],
  ["SECTION_PANEL_DEFAULTS", "dangling-symbol-cite"],
  ["SECTION_PLACEHOLDER_COPY", "dangling-symbol-cite"],
  ["SYSTEM_PROMPT_DYNAMIC_BOUNDARY", "dangling-symbol-cite"],
  ["TAB_EDGE_CLASSES", "dangling-symbol-cite"],
  ["infra/network/hubs/", "dangling-path-cite"],
] as const;

describe("dangling-ref-citations — central reviewed authority replaces the legacy tables", () => {
  test("every translated identity survives, every row carries its contract, and the real corpus consumes each once", ({ repoRoot }) => {
    // CONTAINMENT, NOT SET EQUALITY (#2397, 2026-09-18). This read `toEqual` against the frozen roster, which
    // is the `countFrom` defect one level up: 26 legitimate `dangling-path-cite` grants have been minted
    // since (the tooling-tree moves), so an exact set made every new grant a RED PIN on a lane that did
    // nothing wrong — and it reds where the author cannot see it, because `tests/tooling/**` is `--full`-only
    // (#1842). The claim the arm actually owns is that no TRANSLATED identity silently disappeared, which is
    // containment; "nothing was invented" is owned better and live by the consumption pin below, where a row
    // that licenses nothing alarms rather than waiting for someone to re-read a literal.
    const identities = new Set(FAMILY_GRANTS.map(({ subject, operation }) => `${subject} ${operation}`));
    expect(EXPECTED_GRANT_IDENTITIES.filter(([subject, operation]) => !identities.has(`${subject} ${operation}`))).toEqual([]);
    // The contract half, over EVERY row including the ones minted after this literal was written: a grant
    // with no `why`/`endsWhen` is a permission nobody can retire, which is what set equality used to fence.
    expect(FAMILY_GRANTS.filter(({ why, endsWhen }) => why.trim().length === 0 || endsWhen.trim().length === 0)).toEqual([]);
    expect(FAMILY_GRANTS.filter(({ id }) => POST_CONVERSION_GRANT_IDS.has(id)).map(({ subject, operation }) => [subject, operation])).toEqual([
      ["ELEVATED_ALLOW", "dangling-symbol-cite"],
      ["EXEMPT_PROCEDURES", "dangling-symbol-cite"],
    ]);

    const result = runDanglingRefs(repoRoot);
    expect(result.toolErrors).toEqual([]);
    expect(result.authority.effectiveFindings).toEqual([]);
    expect(result.authority.grantedFindings.filter(({ finding }) => finding.policyId === CITATION_GATE)).toHaveLength(FAMILY_GRANTS.length);
    expect(result.authority.authorityAlarms.filter(({ policyId }) => policyId === CITATION_GATE)).toEqual([]);
  }, 600_000);

  test("a wrong operation and renamed subject license nothing and stale both rows", ({ repoRoot }) => {
    const mutated = FAMILY_GRANTS.map((grant, index) => {
      if (index === 0) {
        return { ...grant, operation: "wrong-dangling-operation" };
      }
      if (index === 1) {
        return { ...grant, subject: `${grant.subject}-renamed` };
      }
      return grant;
    });
    const result = runPolicyPass({
      knownPolicies: [danglingRefCitations, danglingRefs],
      policies: [danglingRefCitations, danglingRefs],
      root: repoRoot,
      project: projectCtx(repoRoot).project,
      reviewedGrants: mutated,
      failOnWarnings: false,
    });

    expect(result.toolErrors).toEqual([]);
    // FILTERED TO THE TWO MUTATED IDENTITIES (#2397): a bare count of this gate's effective findings also
    // counts whatever real doc drift the tree carries today (three rows as of 2026-09-18 — two at
    // the D-ledger's D160 row, one at `Tier-2-Foundation.md:19`), so the arm red on a defect it does not
    // own and says nothing about the mutation it exists to prove. The mutated subjects are the subject.
    const mutatedIdentities = new Set([mutated[0], mutated[1]].flatMap((grant) => (grant === undefined ? [] : [`${grant.subject} ${grant.operation}`])));
    const original = [FAMILY_GRANTS[0], FAMILY_GRANTS[1]].flatMap((grant) => (grant === undefined ? [] : [`${grant.subject} ${grant.operation}`]));
    const unlicensed = result.authority.effectiveFindings.filter(
      (finding) => finding.policyId === CITATION_GATE && original.includes(`${finding.subject ?? ""} ${finding.operation ?? ""}`),
    );
    // The two rows whose identity was broken now license NOTHING, so their findings go effective …
    expect(unlicensed).toHaveLength(2);
    // … and the mutated identities match no finding at all, which is why both rows stale.
    expect(mutatedIdentities.size).toBe(2);
    expect(result.authority.authorityAlarms.filter(({ policyId }) => policyId === CITATION_GATE).map(({ kind }) => kind)).toEqual([
      "stale-reviewed-grant",
      "stale-reviewed-grant",
    ]);
  }, 600_000);
});

// THE DERIVED-CORPUS PIN (#1036). The defect was again a LYING INSTRUMENT, not a bad doc: arms 2-4 read a
// HAND-NAMED pair of directories, so `tooling/src/verify/gates/GATE-AUTHORING.md` — the law every gate author is routed to — sat
// outside the citation net entirely and its cite of the population controls rotted with nothing watching.
// Conformance cannot prove this half: its examples live in a policy-owned mini-project whose file map is
// authored per row, so it cannot ask whether the corpus derivation reaches `tooling/src/verify/gates/GATE-AUTHORING.md` AT ITS REAL
// RELATIVE PATH. Both directions are driven here, on an invocation-owned corpus that carries that path.
//
// #2332 — THE PLANT MOVED OUT OF THE CHECKOUT, AND THE PREMISE THAT KEPT IT THERE IS RECORDED REFUTED.
// Until 2026-09-14 the positive arm APPENDED a line to the tracked `tooling/src/verify/gates/GATE-AUTHORING.md` and restored it in
// `finally` plus an exit hook, and the header here argued that no scratch copy could work because the arm's
// subject is MEMBERSHIP — `dangling-refs.ts`'s `LAW_OUTSIDE_DOCS` is a literal two-entry list, so a copy at
// any other path is not a member — and because arm 3 resolves every backticked path against the real tree,
// so a docs-only root would report thousands of phantoms.
//
// The first half is true and is HONOURED rather than discarded: `LAW_OUTSIDE_DOCS` names a RELATIVE path, so
// a corpus that carries `tooling/src/verify/gates/GATE-AUTHORING.md` at that same relative path IS a member.
// The second half was the real objection, and it is an objection to an UNFILTERED assertion, not to an
// isolated root: each arm below filters to its own subject (the ghost path in the file it was authored in),
// exactly as the positive arm already did. What the real tree still owns — and what the membership claim
// ultimately rests on — is the population receipt at the end of this describe: `citation-corpus:law-outside-docs`
// must resolve members ON THE REAL TREE, which is a READ. Together those two are what the one checkout write
// used to buy, without a tracked doc changing under a concurrent `git add`.
const CORPUS_GHOST = "domain/__p1036_ghost_domain__/x.ts";
const LAW_OUTSIDE_DOC = "tooling/src/verify/gates/GATE-AUTHORING.md";
/** A DISPOSABLE doc in the frozen class (#1583) — a dated review is out of the audit corpus by CLASS, so
 *  the arm needs a file in that directory, never a specific tracked one. `__p1583_` marks it as a probe path
 *  for anyone who finds one stranded. */
const FROZEN_DOC = "docs/reviews/__p1583_frozen_probe__.md";

describe("dangling-refs — the derived corpus reaches living law outside docs/ and stops at frozen evidence", () => {
  test("a phantom path authored in tooling/src/verify/gates/GATE-AUTHORING.md is FOUND", async ({ plantedTree }) => {
    const root = await plantedTree({
      ...isolatedCorpus(),
      [LAW_OUTSIDE_DOC]: `---\nkind: law\n---\n\nThe shape lives at \`${CORPUS_GHOST}\`.\n`,
    });
    const hit = isolatedFindings(root, CITATION_GATE).filter((found) => found.startsWith(`${LAW_OUTSIDE_DOC}:`) && found.includes(CORPUS_GHOST));
    expect(hit.length, "the law every gate author reads must be inside the citation net, at its own relative path").toBe(1);
  }, 600_000);

  test("the same phantom in a FROZEN review doc is not flagged", async ({ plantedTree }) => {
    // The arm's subject is the dated-review CLASS, not a specific tracked file: the same ghost, authored
    // in a doc of that class, must draw NOTHING while the arm above draws one.
    const root = await plantedTree({
      ...isolatedCorpus(),
      [FROZEN_DOC]: `---\nkind: review\nstatus: active\n---\n\nIt used to live at \`${CORPUS_GHOST}\`.\n`,
    });
    // .claude/rules/docs.md §"Moving or deleting a doc": frozen evidence keeps the path that was true
    // then and is NOT repointed, so resolving its cites would red a doc for obeying the law.
    expect(
      isolatedFindings(root, CITATION_GATE).filter((found) => found.startsWith(`${FROZEN_DOC}:`)),
      "frozen evidence is out of the corpus by CLASS — a widening must not swallow it",
    ).toEqual([]);
  }, 600_000);

  test("every declared corpus class is populated on the real tree", ({ repoRoot }) => {
    const result = runDanglingRefs(repoRoot);
    const receipts = result.policies.find((policy) => policy.id === HARD_GATE)?.receipts ?? [];
    // The population receipt is what makes a class SILENTLY emptying loud (#946). A zero here would mean the
    // frontmatter walk or the hand-named law set stopped resolving — the blind-gate placebo, in numbers.
    for (const source of ["citation-corpus:law", "citation-corpus:design", "citation-corpus:law-outside-docs"]) {
      const population = receipts.find((receipt) => receipt.kind === "population" && receipt.source === source);
      expect(population?.kind === "population" ? population.members : 0, `${source} must resolve members on the real tree`).toBeGreaterThan(0);
    }
  }, 600_000);
});

// THE SELF-EVIDENCE FENCE, PINNED AT THE SPLIT (#2397, 2026-09-18). A LYING INSTRUMENT, and the third one
// in this file: `lib/dangling-ref-citations.ts` credits every UPPER_SNAKE STRING LITERAL in an admitted
// source as a declaration, and fences the files that would let a permission manufacture its own evidence —
// the gate corpus, the gate tests, and the reviewed-grant table. The fence named the table by ONE filename
// (`endsWith("…/lib/reviewed-grants.ts")`) while the table had been SPLIT into `reviewed-grants-<section>.ts`
// siblings. Each sibling row spells its own `subject`, so all 19 `dangling-symbol-cite` grants made their
// own cited symbols resolve: no finding, no consumption, and 19 `stale-reviewed-grant` alarms whose obvious
// reading — "the doc was repaired, delete the row" — would have DELETED the permissions for 19 live,
// unjudged citations. Measured on the real tree: `granted 32 → 51`, alarms `19 → 0`, effective unchanged at
// 3, and the aggregate pin above (`grantedFindings` length equals `FAMILY_GRANTS.length`) was already RED.
//
// That aggregate cannot name the MECHANISM, which is why these two arms exist: the same probe symbol,
// spelled once in a grant-table SIBLING and once in an ordinary module, must produce opposite verdicts.
const FENCE_PROBE_SYMBOL = "ORB_FENCE_PROBE";
const FENCE_PROBE_DOC = "docs/law/__p2397_fence_probe__.md";
const FENCE_PROBE_GRANT_SIBLING = "tooling/src/verify/lib/reviewed-grants-p2397-fence-probe.ts";
const FENCE_PROBE_ORDINARY = "tooling/src/verify/lib/__p2397_ordinary_probe__.ts";
/** The grant row's shape, reduced to what the fence is about: the subject spelled as a string literal. */
const FENCE_PROBE_ROW = `export const P2397 = [{ id: "x:probe", policyId: "dangling-ref-citations", subject: "${FENCE_PROBE_SYMBOL}", operation: "dangling-symbol-cite" }];\n`;

function fenceProbeCorpus(evidence: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return {
    ...isolatedCorpus(),
    ...evidence,
    [FENCE_PROBE_DOC]: `---\nkind: law\nstatus: active\n---\n\nThe vocabulary is \`${FENCE_PROBE_SYMBOL}\`.\n`,
  };
}

function fenceProbeFindings(root: string): readonly string[] {
  return isolatedFindings(root, CITATION_GATE).filter((found) => found.startsWith(`${FENCE_PROBE_DOC}:`) && found.includes(FENCE_PROBE_SYMBOL));
}

describe("dangling-ref-citations — a grant row cannot manufacture the declaration it licenses", () => {
  test("a SPLIT grant-table sibling spelling the subject is fenced — the citation still flags", async ({ plantedTree }) => {
    const root = await plantedTree(fenceProbeCorpus({ [FENCE_PROBE_GRANT_SIBLING]: FENCE_PROBE_ROW }));

    expect(fenceProbeFindings(root), "a `reviewed-grants-<section>.ts` sibling is grant EVIDENCE, not a declaration").toHaveLength(1);
  }, 600_000);

  test("the SAME literal in an ordinary module is NOT fenced — the fence is a fence, not a blanket", async ({ plantedTree }) => {
    const root = await plantedTree(fenceProbeCorpus({ [FENCE_PROBE_ORDINARY]: FENCE_PROBE_ROW }));

    // The discriminating half: without it, a predicate that simply stopped crediting string literals at all
    // would pass the arm above while silently retiring the whole string-literal declaration reader.
    expect(fenceProbeFindings(root), "an ordinary module's UPPER_SNAKE literal still counts as a declaration").toEqual([]);
  }, 600_000);
});
