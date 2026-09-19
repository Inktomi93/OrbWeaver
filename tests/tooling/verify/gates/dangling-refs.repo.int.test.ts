// The PERMANENT PIN for `dangling-refs`'s ABSENT-BY-DESIGN arm (issue #775). The defect it fixes is a LYING
// INSTRUMENT, not a bad doc: `packages/client/dist` is generated build output, so it exists after a client
// build and never on a fresh worktree — and arm 3
// resolved it with `existsSync`. The identical commit was therefore GREEN on main and RED in every worktree,
// for the same doc line. A verdict that depends on WHERE it ran is wrong in one of the two places, and the
// fresh-worktree red is the one lanes actually pay for.
//
// The PASS half is un-provable in conformance: the exemption arms are guarded on the real-tree anchor, and a
// policy proof row's file map cannot carry the RELATIVE paths the corpus derivation is keyed on. So the
// honoured case lives here — the REAL tree for every read (the absent direction, the grant translation, the
// population receipts) and an invocation-owned `plantedTree` corpus at the same relative paths for every
// direction that needs something PLANTED.
//
// #2332 — THIS SUITE USED TO WRITE INTO THE CHECKOUT, AND NO LONGER DOES. Six mutations lived here until
// 2026-09-14: `packages/client/dist` created and removed, a phantom line appended to and restored in the
// tracked `tooling/src/verify/gates/GATE-AUTHORING.md`, and a probe doc created and removed under `docs/architecture/history/`. Each
// was belted (restore in `finally` plus a process-exit hook, with the working tree asserted byte-identical
// afterwards), and the belt was never the problem: cleanup reduces residue after a NORMAL exit, and cannot
// stop a concurrent `git add -A`, a kill outside the registered path, or another lane reading a gate input
// while it is mutated. That is the 2026-08-24 blinded-gate incident class verbatim, which is why
// `policy-fixture-substrate` is a hard gate over this very directory. The per-arm reasoning for each move —
// including the header premise that said a scratch copy was impossible, and why it was an objection to an
// UNFILTERED assertion rather than to an isolated root — sits with the arms themselves.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe } from "vitest";
import { gate as danglingRefCitations } from "../../../../tooling/src/verify/gates/dangling-ref-citations.ts";
import { gate as danglingRefs } from "../../../../tooling/src/verify/gates/dangling-refs.ts";
import { projectCtx } from "../../../../tooling/src/verify/index.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const HARD_GATE = "dangling-refs";
const CITATION_GATE = "dangling-ref-citations";
const ABSENT_PATH = "packages/client/dist";
const CITE = ".dockerignore";
const FAMILY_GRANTS = REVIEWED_GRANTS.filter(({ policyId }) => policyId === CITATION_GATE);
// Two rows joined the family AFTER the conversion (a6740edc3, 2026-09-14): the `ELEVATED_ALLOW` and
// `EXEMPT_PROCEDURES` symbol citations that the density-tier and duplicate-action-doors conversions retired
// from the tree while Core-Enforcement-Active-Gates.md kept naming them. They are live grants, not
// translations of a legacy private row, so the arm below names them separately. The `TRANSLATED_GRANTS`
// partition this list used to feed is gone with the set-equality assertion it served (#2397).
const POST_CONVERSION_GRANT_IDS: ReadonlySet<string> = new Set([
  "dangling-ref-citations:elevated-allow",
  "dangling-ref-citations:exempt-procedures",
  // minted 2026-09-14 (f5cde0569) for the citation the tier-home table rename retired — post-conversion,
  // never one of the 22 rows the legacy tables carried across.
  "dangling-ref-citations:sanctioned-homes",
]);
const DIFFERENTIAL_ANCHOR = "docs/architecture/core/__dangling_refs_differential_anchor.md";
const DIFFERENTIAL_PACKAGE_ANCHOR = "packages/kit/src/__dangling_refs_differential_anchor.ts";
const DIFFERENTIAL_TOOLING_ANCHOR = "tooling/src/__dangling_refs_differential_anchor.ts";
const FINAL_RESOURCE_FLOOR = {
  [DIFFERENTIAL_ANCHOR]: "---\nkind: law\n---\n\nDifferential resource anchor.\n",
  "docs/catalog/catalog.json":
    '{"documents":[{"path":"docs/architecture/core/__dangling_refs_differential_anchor.md","lane":"core","frontmatter":{"fields":{"status":"active"}},"receipt":{"authority":"normative"}}]}\n',
  ".gitignore": "dist/\n",
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

/** The gate's own justification, re-derived independently: the path must be named by a LITERAL `.gitignore`
 *  rule. Spelled out here rather than imported — a pin that calls the subject's own reader proves only that
 *  the reader agrees with itself. */
function gitignoreNames(repoRoot: string, path: string): boolean {
  const basename = path.split("/").pop() ?? path;
  const wanted = new Set([path, `${path}/`, `/${path}`, `/${path}/`, basename, `${basename}/`]);
  return readFileSync(join(repoRoot, ".gitignore"), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .some((line) => wanted.has(line));
}

const ISOLATED_LAW = "docs/architecture/core/__dangling_refs_isolated_law__.md";
const ISOLATED_DESIGN = "docs/design/__dangling_refs_isolated_design__.md";

/** A SELF-CONTAINED derived corpus for this gate, at the same RELATIVE paths the real tree uses (#2332).
 *
 *  It exists because every arm below asks a question about the gate's RESOLUTION — is a gitignored path a
 *  phantom, is `tooling/src/verify/gates/GATE-AUTHORING.md` inside the citation net, is `history/**` outside it — and every one of
 *  those is answered against `root`. What it deliberately does NOT carry is `core/AGENTS.md` and the rest of
 *  the living corpus: their cites resolve against the real tree, so importing them would report thousands of
 *  phantoms that say nothing about the arm. Each assertion below therefore FILTERS to its own subject, and
 *  the whole-gate-clean claim stays where it belongs — on the real-tree read above. */
function isolatedCorpus(): Readonly<Record<string, string>> {
  return {
    ...FINAL_RESOURCE_FLOOR,
    [CITE]: `${ABSENT_PATH}\n`,
    [ISOLATED_LAW]: `---\nkind: law\nstatus: active\n---\n\nThe client build output is \`${ABSENT_PATH}\`.\n`,
    [ISOLATED_DESIGN]: "---\nkind: design\nstatus: active\n---\n\nIsolated design anchor.\n",
    "docs/catalog/catalog.json": JSON.stringify({
      documents: [
        { path: ISOLATED_LAW, lane: "architecture-core", frontmatter: { fields: { status: "active" } }, receipt: { authority: "normative" } },
        { path: ISOLATED_DESIGN, lane: "design", frontmatter: { fields: { status: "active" } }, receipt: { authority: "design" } },
      ],
    }),
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

describe("dangling-refs — gitignored paths are absent by design, not phantoms", () => {
  test("the exemption's justification holds on the real tree, and the control does not", ({ repoRoot }) => {
    expect(gitignoreNames(repoRoot, ABSENT_PATH), `${ABSENT_PATH} must be gitignored — that IS the exemption`).toBe(true);
    // PLANTED NEGATIVE CONTROL: a reader that answers "yes" to anything would make the arm unfailable.
    expect(gitignoreNames(repoRoot, "packages/client/__not_ignored_control__"), "the reader must be able to say no").toBe(false);
    expect(existsSync(join(repoRoot, CITE)), "the cite that justifies the row must resolve").toBe(true);
  });

  test("the real-tree run reports no phantom for the gitignored path, in a checkout that lacks it", ({ repoRoot }) => {
    // This gate is SELF-CONTAINED (it reads docs off disk and needs no sibling's verdict), so it runs alone
    // — a whole-corpus pass here would cost minutes to prove one gate's arm.
    const result = runDanglingRefs(repoRoot);
    expect(result.toolErrors).toEqual([]);
    const findings = result.authority.effectiveFindings.filter((finding) => finding.policyId === HARD_GATE);
    // The point of the arm: this must hold whether or not the gitignored subtree is present on THIS checkout.
    expect(findings.filter((f) => (f.message ?? "").includes(ABSENT_PATH))).toEqual([]);
    // And the row must not have gone silent by accident — the whole gate is still clean, so a NEW phantom
    // anywhere in the core docs still reds. (A green here that came from a broken scan is caught by the
    // gate's own zero-scan alarm at report scope.)
    expect(findings).toEqual([]);
  }, 600_000);

  // The OTHER direction (#26 regression): #775's original fix moved the env-dependence rather than removing
  // it — with the gitignored subtree PRESENT the path resolves, so it was never a phantom, so the shared
  // phantom-hitRefs stale arm falsely red its GITIGNORED_ABSENT row ("matches no live phantom"). The claim is
  // that the verdict is IDENTICAL either way, so the honest shape is one corpus driven BOTH ways and compared.
  //
  // #2332 — WHY THIS NO LONGER PLANTS IN THE CHECKOUT, and what was checked before moving it. Until
  // 2026-09-14 this arm `mkdirSync`'d `packages/client/dist` into the operator's tree and removed it in
  // `finally`, which is the 2026-08-24 incident class verbatim (a concurrent broad `git add`, or a signal,
  // and the probe is committed or stranded). The premise that forced it — that a mini root cannot host this
  // gate — is FALSE for this arm: the absent-by-design row is resolved against `root`, and `.gitignore` plus
  // the catalog census are read from `root` too, so an invocation-owned corpus carrying the same RELATIVE
  // paths asks exactly the same question. What the real tree still owns is the absent direction above and the
  // population receipts below, both of which are READS.
  test("the isolated run reaches the same verdict whether or not the gitignored subtree is present", async ({ plantedTree }) => {
    const absent = await plantedTree(isolatedCorpus());
    const present = await plantedTree({ ...isolatedCorpus(), [`${ABSENT_PATH}/index.js`]: "export const built = true;\n" });
    expect(existsSync(join(absent, ABSENT_PATH)), "the absent arm must genuinely lack the subtree").toBe(false);
    expect(existsSync(join(present, ABSENT_PATH)), "the present arm must genuinely carry it").toBe(true);

    const absentFindings = isolatedFindings(absent, HARD_GATE);
    const presentFindings = isolatedFindings(present, HARD_GATE);
    // No stale-row red for the now-RESOLVING gitignored path …
    expect(presentFindings.filter((message) => message.includes(ABSENT_PATH))).toEqual([]);
    // … and the whole verdict is byte-identical across the two, which is the property #26 actually names.
    expect(presentFindings, "the verdict must not depend on whether the gitignored subtree is checked out").toEqual(absentFindings);
  }, 600_000);
});

const EXPECTED_GRANT_IDENTITIES = [
  ["@orb/kit/vector-math.pairwiseCosine", "dangling-path-cite"],
  ["@orb/tokens", "dangling-path-cite"],
  ["@orb/ui/MessageMedia", "dangling-path-cite"],
  ["ACCOUNT_ACTION", "dangling-symbol-cite"],
  ["ANTH_DIRECT_SAMPLING", "dangling-symbol-cite"],
  ["CHAT_CONTEXT_SLOTS", "dangling-symbol-cite"],
  ["CHAT_SURFACE_SLOTS", "dangling-symbol-cite"],
  ["COMMAND_ACTION", "dangling-symbol-cite"],
  ["CONTEXT_SLOTS", "dangling-symbol-cite"],
  ["HUB_ADAPTERS", "dangling-symbol-cite"],
  ["MOBILE_PRIMARY_SECTIONS", "dangling-symbol-cite"],
  ["MODAL_SLOTS", "dangling-symbol-cite"],
  ["RAIL_ACTIONS", "dangling-symbol-cite"],
  ["RAIL_SECTIONS", "dangling-symbol-cite"],
  ["SECTION_PANEL_DEFAULTS", "dangling-symbol-cite"],
  ["SECTION_PLACEHOLDER_COPY", "dangling-symbol-cite"],
  ["SQLITE_BUSY", "dangling-symbol-cite"],
  ["TAB_EDGE_CLASSES", "dangling-symbol-cite"],
  ["YOU_MODAL_ROWS", "dangling-symbol-cite"],
  ["domain/buddy", "dangling-path-cite"],
  ["infra/network/hubs/", "dangling-path-cite"],
  ["transport/trpc/buddy-bus.ts", "dangling-path-cite"],
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
      ["SANCTIONED_HOMES", "dangling-symbol-cite"],
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
    // `Core-Path-Registry.md:575`, one at `Tier-2-Foundation.md:19`), so the arm red on a defect it does not
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
/** A DISPOSABLE doc in the frozen class (#1583) — `history/**` is out of the audit corpus by CLASS, so the
 *  arm needs a file in that directory, never a specific tracked one. `__p1583_` marks it as a probe path
 *  for anyone who finds one stranded. */
const FROZEN_DOC = "docs/architecture/history/__p1583_frozen_probe__.md";

describe("dangling-refs — the derived corpus reaches living law outside docs/ and stops at frozen evidence", () => {
  test("a phantom path authored in tooling/src/verify/gates/GATE-AUTHORING.md is FOUND", async ({ plantedTree }) => {
    const root = await plantedTree({
      ...isolatedCorpus(),
      [LAW_OUTSIDE_DOC]: `---\nkind: law\n---\n\nThe shape lives at \`${CORPUS_GHOST}\`.\n`,
    });
    const hit = isolatedFindings(root, CITATION_GATE).filter((found) => found.startsWith(`${LAW_OUTSIDE_DOC}:`) && found.includes(CORPUS_GHOST));
    expect(hit.length, "the law every gate author reads must be inside the citation net, at its own relative path").toBe(1);
  }, 600_000);

  test("the same phantom in a FROZEN history doc is not flagged", async ({ plantedTree }) => {
    // The arm's subject is the `history/**` CLASS, not a specific tracked file: the same ghost, authored in a
    // doc of that class and catalogued as historical, must draw NOTHING while the arm above draws one.
    const root = await plantedTree({
      ...isolatedCorpus(),
      [FROZEN_DOC]: `---\nkind: history\nstatus: active\n---\n\nIt used to live at \`${CORPUS_GHOST}\`.\n`,
    });
    // Documentation-Law.md §"Relocation & retirement" step 5: frozen evidence keeps the path that was true
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
    // catalog census or the hand-named law set stopped resolving — the blind-gate placebo, in numbers.
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
const FENCE_PROBE_DOC = "docs/architecture/core/__p2397_fence_probe__.md";
const FENCE_PROBE_GRANT_SIBLING = "tooling/src/verify/lib/reviewed-grants-p2397-fence-probe.ts";
const FENCE_PROBE_ORDINARY = "tooling/src/verify/lib/__p2397_ordinary_probe__.ts";
/** The grant row's shape, reduced to what the fence is about: the subject spelled as a string literal. */
const FENCE_PROBE_ROW = `export const P2397 = [{ id: "x:probe", policyId: "dangling-ref-citations", subject: "${FENCE_PROBE_SYMBOL}", operation: "dangling-symbol-cite" }];\n`;

function fenceProbeCorpus(evidence: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return {
    ...isolatedCorpus(),
    ...evidence,
    [FENCE_PROBE_DOC]: `---\nkind: law\nstatus: active\n---\n\nThe vocabulary is \`${FENCE_PROBE_SYMBOL}\`.\n`,
    "docs/catalog/catalog.json": JSON.stringify({
      documents: [
        { path: ISOLATED_LAW, lane: "architecture-core", frontmatter: { fields: { status: "active" } }, receipt: { authority: "normative" } },
        { path: ISOLATED_DESIGN, lane: "design", frontmatter: { fields: { status: "active" } }, receipt: { authority: "design" } },
        { path: FENCE_PROBE_DOC, lane: "architecture-core", frontmatter: { fields: { status: "active" } }, receipt: { authority: "normative" } },
      ],
    }),
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
