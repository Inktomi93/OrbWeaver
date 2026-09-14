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
// tracked `GATE-AUTHORING.md`, and a probe doc created and removed under `docs/architecture/history/`. Each
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
import { verifyGateProofs } from "../../../../tooling/src/verify/ops/conformance.ts";
import type { DifferentialClaim, Files } from "../../../support/legacy-differential.ts";
import {
  createTmpdirDifferential,
  differentialViolations,
  frozenFilesystemLegacyGate,
  label,
  legacyScenarios,
  sorted,
} from "../../../support/legacy-differential.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

// Quiet-box ceiling for the 19-row filesystem replay; `scaledBudget` stretches it under measured load.
const REPLAY_BASE_MS = 600_000;

const HARD_GATE = "dangling-refs";
const CITATION_GATE = "dangling-ref-citations";
const ABSENT_PATH = "packages/client/dist";
const CITE = ".dockerignore";
const FAMILY_GRANTS = REVIEWED_GRANTS.filter(({ policyId }) => policyId === CITATION_GATE);
// Two rows joined the family AFTER the conversion (a6740edc3, 2026-09-14): the `ELEVATED_ALLOW` and
// `EXEMPT_PROCEDURES` symbol citations that the density-tier and duplicate-action-doors conversions retired
// from the tree while Core-Enforcement-Active-Gates.md kept naming them. They are live grants, not
// translations of a legacy private row, so the translation arms below count only the 22 that were.
const POST_CONVERSION_GRANT_IDS: ReadonlySet<string> = new Set(["dangling-ref-citations:elevated-allow", "dangling-ref-citations:exempt-procedures"]);
const TRANSLATED_GRANTS = FAMILY_GRANTS.filter(({ id }) => !POST_CONVERSION_GRANT_IDS.has(id));
const LEGACY_BASE = "d8cda584fb1665907c0a6d7479780b9f4e691aca";
const LEGACY_PATH = "tooling/src/verify/gates/dangling-refs.ts";
const LEGACY_FALLBACK = "__no-example-files-map__/dangling-refs.ts";
const DIFFERENTIAL_ANCHOR = "docs/architecture/core/__dangling_refs_differential_anchor.md";
const DIFFERENTIAL_PACKAGE_ANCHOR = "packages/kit/src/__dangling_refs_differential_anchor.ts";
const DIFFERENTIAL_TOOLING_ANCHOR = "tooling/src/__dangling_refs_differential_anchor.ts";
const DIFFERENTIAL_HISTORY_ANCHOR = "docs/history/__dangling_refs_differential_anchor.md";
const FINAL_RESOURCE_FLOOR = {
  [DIFFERENTIAL_ANCHOR]: "---\nkind: law\n---\n\nDifferential resource anchor.\n",
  "docs/catalog/catalog.json":
    '{"documents":[{"path":"docs/architecture/core/__dangling_refs_differential_anchor.md","lane":"core","frontmatter":{"fields":{"status":"active"}},"receipt":{"authority":"normative"}}]}\n',
  ".gitignore": "dist/\n",
  [DIFFERENTIAL_PACKAGE_ANCHOR]: "export const DANGLING_REFS_DIFFERENTIAL_ANCHOR = true;\n",
  [DIFFERENTIAL_TOOLING_ANCHOR]: "export const danglingRefsDifferentialAnchor = true;\n",
} as const;
const BLIND_CATALOG_FLOOR = {
  ...FINAL_RESOURCE_FLOOR,
  ".gitignore": "node_modules/\n",
  "docs/catalog/catalog.json":
    '{"documents":[{"path":"docs/history/__dangling_refs_differential_anchor.md","lane":"history","frontmatter":{"fields":{"status":"active"}},"receipt":{"authority":"historical"}}]}\n',
  [DIFFERENTIAL_HISTORY_ANCHOR]: "---\nkind: history\n---\n\nFrozen differential resource anchor.\n",
} as const;

const NORMAL_SUBJECTS = [
  ".gitignore",
  DIFFERENTIAL_ANCHOR,
  "docs/catalog/catalog.json",
  "packages/kit",
  "packages/kit/src",
  DIFFERENTIAL_PACKAGE_ANCHOR,
  "tooling/src",
  DIFFERENTIAL_TOOLING_ANCHOR,
] as const;
const BLIND_SUBJECTS = [...NORMAL_SUBJECTS, DIFFERENTIAL_HISTORY_ANCHOR] as const;

const CITATION_HEAD = "a backticked path or UPPER_SNAKE symbol in a l";
const BLIND_FINAL = [
  "dangling-refs | .gitignore:1 | - | absent-by-design row `packages/client/dist` is",
  "dangling-refs | docs/architecture/core/AGENTS.md:1 | - | `tooling/src/ui-audit/ops/walker/RULE-AUTHORIN",
  "dangling-refs | docs/architecture/core/AGENTS.md:1 | - | `tooling/src/verify/gates/GATE-AUTHORING.md` i",
  "dangling-refs | docs/architecture/core/AGENTS.md:1 | - | absent-by-design row `packages/client/dist` ma",
  "dangling-refs | docs/architecture/core/AGENTS.md:1 | - | absent-by-design row `packages/client/dist`'s ",
  "dangling-refs | docs/catalog/catalog.json:1 | - | the doc-catalog census (docs/catalog/catalog.j",
] as const;
const LEGACY_BLIND = [
  "legacy | .gitignore:0 | - | absent-by-design row `packages/client/dist` is",
  "legacy | docs/architecture/core:0 | - | absent-by-design row `packages/client/dist` ma",
  "legacy | docs/architecture/core:0 | - | absent-by-design row `packages/client/dist`'s ",
  "legacy | docs/architecture/core:0 | - | arm 3 path allowlist row `@orb/kit/vector-math",
  "legacy | docs/architecture/core:0 | - | arm 3 path allowlist row `@orb/tokens` matches",
  "legacy | docs/architecture/core:0 | - | arm 3 path allowlist row `@orb/ui/MessageMedia",
  "legacy | docs/architecture/core:0 | - | arm 3 path allowlist row `domain/buddy` matche",
  "legacy | docs/architecture/core:0 | - | arm 3 path allowlist row `infra/network/hubs/`",
  "legacy | docs/architecture/core:0 | - | arm 3 path allowlist row `transport/trpc/buddy",
  "legacy | docs/architecture/core:0 | - | arm 4 symbol allowlist row `ACCOUNT_ACTION` ma",
  "legacy | docs/architecture/core:0 | - | arm 4 symbol allowlist row `ANTH_DIRECT_SAMPLI",
  "legacy | docs/architecture/core:0 | - | arm 4 symbol allowlist row `CHAT_CONTEXT_SLOTS",
  "legacy | docs/architecture/core:0 | - | arm 4 symbol allowlist row `CHAT_SURFACE_SLOTS",
  "legacy | docs/architecture/core:0 | - | arm 4 symbol allowlist row `COMMAND_ACTION` ma",
  "legacy | docs/architecture/core:0 | - | arm 4 symbol allowlist row `CONTEXT_SLOTS` mat",
  "legacy | docs/architecture/core:0 | - | arm 4 symbol allowlist row `HUB_ADAPTERS` matc",
  "legacy | docs/architecture/core:0 | - | arm 4 symbol allowlist row `MOBILE_PRIMARY_SEC",
  "legacy | docs/architecture/core:0 | - | arm 4 symbol allowlist row `MODAL_SLOTS` match",
  "legacy | docs/architecture/core:0 | - | arm 4 symbol allowlist row `RAIL_ACTIONS` matc",
  "legacy | docs/architecture/core:0 | - | arm 4 symbol allowlist row `RAIL_SECTIONS` mat",
  "legacy | docs/architecture/core:0 | - | arm 4 symbol allowlist row `SECTION_PANEL_DEFA",
  "legacy | docs/architecture/core:0 | - | arm 4 symbol allowlist row `SECTION_PLACEHOLDE",
  "legacy | docs/architecture/core:0 | - | arm 4 symbol allowlist row `SQLITE_BUSY` match",
  "legacy | docs/architecture/core:0 | - | arm 4 symbol allowlist row `TAB_EDGE_CLASSES` ",
  "legacy | docs/architecture/core:0 | - | arm 4 symbol allowlist row `YOU_MODAL_ROWS` ma",
  "legacy | docs/catalog/catalog.json:0 | - | the doc-catalog census (docs/catalog/catalog.j",
  "legacy | tooling/src/verify/gates/dangling-refs.ts:0 | - | `tooling/src/ui-audit/ops/walker/RULE-AUTHORIN",
  "legacy | tooling/src/verify/gates/dangling-refs.ts:0 | - | `tooling/src/verify/gates/GATE-AUTHORING.md` i",
] as const;

interface DanglingDifferentialRow extends DifferentialClaim {
  readonly why: string;
  readonly rawLegacyFindings: readonly string[];
  readonly rawLegacyPopulation: number;
  readonly rawLegacySubjects: readonly string[];
  readonly completedLegacyPopulation: number;
  readonly completedLegacySubjects: readonly string[];
  readonly finalFindings: readonly string[];
  readonly finalPopulation: number;
  readonly finalSubjects: readonly string[];
  readonly drivesProductionGrants?: boolean;
}

function citation(file: string, line = 5): string {
  return `${CITATION_GATE} | ${file}:${String(line)} | - | ${CITATION_HEAD}`;
}

function subjects(base: readonly string[], ...extra: readonly string[]): readonly string[] {
  return sorted([...base, ...extra]);
}

const DIFFERENTIAL_ROWS: readonly DanglingDifferentialRow[] = [
  {
    why: "mustFlag[0] descriptor docRow ghost — the hard successor moves the report from legacy line 0 to the authored descriptor line",
    classification: "anchor-move",
    successor: "gate descriptor's",
    rawLegacyFindings: ["legacy | tooling/src/verify/gates/__probe.ts:0 | - | gate descriptor's `docRow` names `GHOST-DOC-TH"],
    rawLegacyPopulation: 1,
    rawLegacySubjects: ["doc: candidates=0 scanned=0"],
    completedLegacyPopulation: 3,
    completedLegacySubjects: ["doc: candidates=1 scanned=1"],
    finalFindings: ["dangling-refs | tooling/src/verify/gates/__probe.ts:1 | - | gate descriptor's `docRow` names `GHOST-DOC-TH"],
    finalPopulation: 3,
    finalSubjects: subjects(NORMAL_SUBJECTS, "tooling/src/verify", "tooling/src/verify/gates", "tooling/src/verify/gates/__probe.ts"),
  },
  {
    why: "mustFlag[1] Markdown-link ghost — the hard successor anchors the finding on line 1 instead of legacy line 0",
    classification: "anchor-move",
    successor: "markdown link",
    rawLegacyFindings: ["legacy | docs/architecture/core/__probe.md:0 | - | markdown link `(ghost-sibling-xyz.md)` resolve"],
    rawLegacyPopulation: 0,
    rawLegacySubjects: ["doc: candidates=1 scanned=1"],
    completedLegacyPopulation: 2,
    completedLegacySubjects: ["doc: candidates=2 scanned=2"],
    finalFindings: ["dangling-refs | docs/architecture/core/__probe.md:1 | - | markdown link `(ghost-sibling-xyz.md)` resolve"],
    finalPopulation: 2,
    finalSubjects: subjects(NORMAL_SUBJECTS, "docs/architecture/core/__probe.md"),
  },
  {
    why: "mustFlag[2] phantom path — split into the reviewed citation sibling, still effective without an exact grant",
    classification: "split",
    successor: CITATION_GATE,
    rawLegacyFindings: ["legacy | docs/architecture/core/__probe3.md:5 | - | backticked path `domain/__ghost_domain__/x.ts`"],
    rawLegacyPopulation: 0,
    rawLegacySubjects: ["doc: candidates=1 scanned=1"],
    completedLegacyPopulation: 2,
    completedLegacySubjects: ["doc: candidates=2 scanned=2"],
    finalFindings: [citation("docs/architecture/core/__probe3.md")],
    finalPopulation: 2,
    finalSubjects: subjects(NORMAL_SUBJECTS, "docs/architecture/core/__probe3.md"),
  },
  {
    why: "mustFlag[3] phantom symbol — split into the reviewed citation sibling, still effective without an exact grant",
    classification: "split",
    successor: CITATION_GATE,
    rawLegacyFindings: ["legacy | docs/architecture/core/__probe4.md:5 | - | backticked symbol `GHOST_CONST_XYZ` in a livin"],
    rawLegacyPopulation: 0,
    rawLegacySubjects: ["doc: candidates=1 scanned=1"],
    completedLegacyPopulation: 2,
    completedLegacySubjects: ["doc: candidates=2 scanned=2"],
    finalFindings: [citation("docs/architecture/core/__probe4.md")],
    finalPopulation: 2,
    finalSubjects: subjects(NORMAL_SUBJECTS, "docs/architecture/core/__probe4.md"),
  },
  {
    why: "mustFlag[4] absent-by-design liveness — six hard catches remain; 22 legacy permission-table stale catches moved to central grant liveness",
    classification: "split",
    successor: "absent-by-design row",
    rawLegacyFindings: LEGACY_BLIND,
    rawLegacyPopulation: 0,
    rawLegacySubjects: ["doc: candidates=1 scanned=1"],
    completedLegacyPopulation: 2,
    completedLegacySubjects: ["doc: candidates=2 scanned=2"],
    finalFindings: BLIND_FINAL,
    finalPopulation: 2,
    finalSubjects: subjects(BLIND_SUBJECTS, "docs/architecture/core/AGENTS.md"),
    drivesProductionGrants: true,
  },
  {
    why: "mustFlag[5] living design phantom — split into the reviewed citation sibling",
    classification: "split",
    successor: CITATION_GATE,
    rawLegacyFindings: ["legacy | docs/design/__probe6.md:5 | - | backticked path `domain/__ghost_domain__/x.ts`"],
    rawLegacyPopulation: 0,
    rawLegacySubjects: ["doc: candidates=1 scanned=1"],
    completedLegacyPopulation: 2,
    completedLegacySubjects: ["doc: candidates=2 scanned=2"],
    finalFindings: [citation("docs/design/__probe6.md")],
    finalPopulation: 2,
    finalSubjects: subjects(NORMAL_SUBJECTS, "docs/design/__probe6.md"),
  },
  {
    why: "mustFlag[6] law-outside-docs phantom — split into the reviewed citation sibling",
    classification: "split",
    successor: CITATION_GATE,
    rawLegacyFindings: ["legacy | tooling/src/verify/gates/GATE-AUTHORING.md:5 | - | backticked path `tests/tooling/__ghost_control"],
    rawLegacyPopulation: 0,
    rawLegacySubjects: ["doc: candidates=1 scanned=1"],
    completedLegacyPopulation: 2,
    completedLegacySubjects: ["doc: candidates=2 scanned=2"],
    finalFindings: [citation("tooling/src/verify/gates/GATE-AUTHORING.md")],
    finalPopulation: 2,
    finalSubjects: subjects(NORMAL_SUBJECTS, "tooling/src/verify", "tooling/src/verify/gates", "tooling/src/verify/gates/GATE-AUTHORING.md"),
  },
  {
    why: "mustFlag[7] missing named laws — hard blindness catches remain; legacy permission-table staleness moved to central grant liveness",
    classification: "split",
    successor: "GATE-AUTHORING.md",
    rawLegacyFindings: LEGACY_BLIND,
    rawLegacyPopulation: 0,
    rawLegacySubjects: ["doc: candidates=1 scanned=1"],
    completedLegacyPopulation: 2,
    completedLegacySubjects: ["doc: candidates=2 scanned=2"],
    finalFindings: BLIND_FINAL,
    finalPopulation: 2,
    finalSubjects: subjects(BLIND_SUBJECTS, "docs/architecture/core/AGENTS.md"),
    drivesProductionGrants: true,
  },
  {
    why: "mustFlag[8] empty living-doc catalog — hard blindness and absent-by-design catches remain; legacy permission staleness is central",
    classification: "split",
    successor: "doc-catalog census",
    rawLegacyFindings: LEGACY_BLIND.filter(
      (finding) => !(finding.includes("tooling/src/ui-audit") || finding.includes("tooling/src/verify/gates/GATE-AUTHORING")),
    ),
    rawLegacyPopulation: 0,
    rawLegacySubjects: ["doc: candidates=3 scanned=3"],
    completedLegacyPopulation: 2,
    completedLegacySubjects: ["doc: candidates=4 scanned=4"],
    finalFindings: BLIND_FINAL.filter((finding) => !(finding.includes("tooling/src/ui-audit") || finding.includes("tooling/src/verify/gates/GATE-AUTHORING"))),
    finalPopulation: 2,
    finalSubjects: subjects(
      BLIND_SUBJECTS,
      "docs/architecture/core/AGENTS.md",
      "tooling/src/ui-audit",
      "tooling/src/ui-audit/ops",
      "tooling/src/ui-audit/ops/walker",
      "tooling/src/ui-audit/ops/walker/RULE-AUTHORING.md",
      "tooling/src/verify",
      "tooling/src/verify/gates",
      "tooling/src/verify/gates/GATE-AUTHORING.md",
    ),
    drivesProductionGrants: true,
  },
  {
    why: "mustFlag[9] dead-end wording is not a history rider — split into the reviewed citation sibling",
    classification: "split",
    successor: CITATION_GATE,
    rawLegacyFindings: ["legacy | docs/architecture/core/__probe_dead_end.md:5 | - | backticked symbol `GHOST_DEADEND_CONST` in a l"],
    rawLegacyPopulation: 0,
    rawLegacySubjects: ["doc: candidates=1 scanned=1"],
    completedLegacyPopulation: 2,
    completedLegacySubjects: ["doc: candidates=2 scanned=2"],
    finalFindings: [citation("docs/architecture/core/__probe_dead_end.md")],
    finalPopulation: 2,
    finalSubjects: subjects(NORMAL_SUBJECTS, "docs/architecture/core/__probe_dead_end.md"),
  },
  {
    why: "mustPass[0] deliberate dead machinery rider remains clean",
    classification: "vacuous-both-zero",
    successor: null,
    rawLegacyFindings: [],
    rawLegacyPopulation: 0,
    rawLegacySubjects: ["doc: candidates=1 scanned=1"],
    completedLegacyPopulation: 2,
    completedLegacySubjects: ["doc: candidates=2 scanned=2"],
    finalFindings: [],
    finalPopulation: 2,
    finalSubjects: subjects(NORMAL_SUBJECTS, "docs/architecture/core/__probe_dead_sense.md"),
  },
  {
    why: "mustPass[1] resolved descriptor cites and concatenated token remain clean",
    classification: "vacuous-both-zero",
    successor: null,
    rawLegacyFindings: [],
    rawLegacyPopulation: 1,
    rawLegacySubjects: ["doc: candidates=2 scanned=2"],
    completedLegacyPopulation: 3,
    completedLegacySubjects: ["doc: candidates=3 scanned=3"],
    finalFindings: [],
    finalPopulation: 3,
    finalSubjects: subjects(
      NORMAL_SUBJECTS,
      "docs/architecture/core/__g_ref_a.md",
      "docs/architecture/core/__g_split-target.md",
      "tooling/src/verify",
      "tooling/src/verify/gates",
      "tooling/src/verify/gates/__probe.ts",
    ),
  },
  {
    why: "mustPass[2] resolved relative Markdown link remains clean",
    classification: "vacuous-both-zero",
    successor: null,
    rawLegacyFindings: [],
    rawLegacyPopulation: 0,
    rawLegacySubjects: ["doc: candidates=2 scanned=2"],
    completedLegacyPopulation: 2,
    completedLegacySubjects: ["doc: candidates=3 scanned=3"],
    finalFindings: [],
    finalPopulation: 2,
    finalSubjects: subjects(NORMAL_SUBJECTS, "docs/architecture/core/__g_link-target.md", "docs/architecture/core/__probe.md"),
  },
  {
    why: "mustPass[3] domain and package shorthand targets remain clean",
    classification: "vacuous-both-zero",
    successor: null,
    rawLegacyFindings: [],
    rawLegacyPopulation: 2,
    rawLegacySubjects: ["doc: candidates=1 scanned=1"],
    completedLegacyPopulation: 4,
    completedLegacySubjects: ["doc: candidates=2 scanned=2"],
    finalFindings: [],
    finalPopulation: 4,
    finalSubjects: subjects(
      NORMAL_SUBJECTS,
      "docs/architecture/core/__probe3.md",
      "packages/kit/src/__g_ok",
      "packages/kit/src/__g_ok/index.ts",
      "packages/server",
      "packages/server/src",
      "packages/server/src/domain",
      "packages/server/src/domain/__g_ok",
      "packages/server/src/domain/__g_ok/x.ts",
    ),
  },
  {
    why: "mustPass[4] tooling package shorthand target remains clean",
    classification: "vacuous-both-zero",
    successor: null,
    rawLegacyFindings: [],
    rawLegacyPopulation: 1,
    rawLegacySubjects: ["doc: candidates=1 scanned=1"],
    completedLegacyPopulation: 3,
    completedLegacySubjects: ["doc: candidates=2 scanned=2"],
    finalFindings: [],
    finalPopulation: 3,
    finalSubjects: subjects(NORMAL_SUBJECTS, "docs/architecture/core/__probe3b.md", "tooling/src/__g_ok", "tooling/src/__g_ok/index.ts"),
  },
  {
    why: "mustPass[5] dispatcher-fed declaration identity resolves the symbol",
    classification: "vacuous-both-zero",
    successor: null,
    rawLegacyFindings: [],
    rawLegacyPopulation: 1,
    rawLegacySubjects: ["doc: candidates=1 scanned=1"],
    completedLegacyPopulation: 3,
    completedLegacySubjects: ["doc: candidates=2 scanned=2"],
    finalFindings: [],
    finalPopulation: 3,
    finalSubjects: subjects(NORMAL_SUBJECTS, "docs/architecture/core/__probe4.md", "packages/kit/src/__probe4.ts"),
  },
  {
    why: "mustPass[6] rider and struck history remain clean",
    classification: "vacuous-both-zero",
    successor: null,
    rawLegacyFindings: [],
    rawLegacyPopulation: 0,
    rawLegacySubjects: ["doc: candidates=1 scanned=1"],
    completedLegacyPopulation: 2,
    completedLegacySubjects: ["doc: candidates=2 scanned=2"],
    finalFindings: [],
    finalPopulation: 2,
    finalSubjects: subjects(NORMAL_SUBJECTS, "docs/architecture/core/__probe5.md"),
  },
  {
    why: "mustPass[7] every supported line-reference suffix remains clean",
    classification: "vacuous-both-zero",
    successor: null,
    rawLegacyFindings: [],
    rawLegacyPopulation: 1,
    rawLegacySubjects: ["doc: candidates=1 scanned=1"],
    completedLegacyPopulation: 3,
    completedLegacySubjects: ["doc: candidates=2 scanned=2"],
    finalFindings: [],
    finalPopulation: 3,
    finalSubjects: subjects(
      NORMAL_SUBJECTS,
      "docs/architecture/core/__probe7.md",
      "packages/server",
      "packages/server/src",
      "packages/server/src/domain",
      "packages/server/src/domain/__g_ok",
      "packages/server/src/domain/__g_ok/x.ts",
    ),
  },
  {
    why: "mustPass[8] frozen evidence and design-only symbols stay outside the judged corpus",
    classification: "vacuous-both-zero",
    successor: null,
    rawLegacyFindings: [],
    rawLegacyPopulation: 0,
    rawLegacySubjects: ["doc: candidates=1 scanned=1"],
    completedLegacyPopulation: 2,
    completedLegacySubjects: ["doc: candidates=2 scanned=2"],
    finalFindings: [],
    finalPopulation: 2,
    finalSubjects: subjects(NORMAL_SUBJECTS, "docs/design/__probe9.md", "docs/history/__probe8.md"),
  },
];

function unclassifiedToolError(owner: string, phase: string, message: string): never {
  throw new Error(`unclassified dangling differential refusal from ${owner}/${phase}: ${message}`);
}

test("§4.6 — the final split replays all 10 mustFlag and 9 mustPass legacy rows on the same bytes", { timeout: scaledBudget(REPLAY_BASE_MS) }, async ({
  scratch,
}) => {
  const differential = createTmpdirDifferential(unclassifiedToolError);
  const legacy = await frozenFilesystemLegacyGate(scratch, LEGACY_BASE, LEGACY_PATH);
  expect(legacy.name, "the frozen conversion-parent blob is the legacy descriptor").toBe(HARD_GATE);
  expect(verifyGateProofs([legacy]), "the frozen descriptor's own expectation tokens/messages still hold").toEqual([]);
  const examples = legacyScenarios(legacy, LEGACY_FALLBACK);
  expect(examples).toHaveLength(19);
  expect(DIFFERENTIAL_ROWS).toHaveLength(examples.length);
  const authorityTransitions: Array<{ readonly index: number; readonly legacyPrivateRows: number; readonly countDelta: number }> = [];

  for (const [index, files] of examples.entries()) {
    const row = DIFFERENTIAL_ROWS[index];
    expect(row, `a declared differential row exists for legacy example ${String(index)}`).toBeDefined();
    if (row === undefined) {
      continue;
    }
    const tag = `#${String(index)} ${row.why}`;
    const floor = files["docs/architecture/core/AGENTS.md"] === undefined ? FINAL_RESOURCE_FLOOR : BLIND_CATALOG_FLOOR;
    const completed: Files = { ...floor, ...files };
    for (const [path, source] of Object.entries(files)) {
      expect(completed[path], `${tag} — the resource completion preserves every legacy fixture byte`).toBe(source);
    }

    const rawLegacy = differential.legacyReplay(legacy, files, label);
    const completedLegacy = differential.legacyReplay(legacy, completed, label);
    const after = differential.finalReplay([danglingRefCitations, danglingRefs], completed, label, row.drivesProductionGrants === true ? FAMILY_GRANTS : []);

    expect(rawLegacy.findings, `${tag} — frozen legacy file/line/token/message identity`).toEqual(sorted(row.rawLegacyFindings));
    expect(rawLegacy.population, `${tag} — raw legacy source population`).toBe(row.rawLegacyPopulation);
    expect(rawLegacy.subjects, `${tag} — raw legacy scan receipt`).toEqual(row.rawLegacySubjects);
    expect(rawLegacy.toolErrors, `${tag} — raw legacy tool errors`).toEqual([]);
    expect(rawLegacy.thrown, `${tag} — raw legacy replay`).toBeUndefined();

    expect(completedLegacy.findings, `${tag} — the resource-only completion is inert on the legacy findings`).toEqual(rawLegacy.findings);
    expect(completedLegacy.population, `${tag} — completed legacy source population`).toBe(row.completedLegacyPopulation);
    expect(completedLegacy.subjects, `${tag} — completed legacy scan receipt`).toEqual(row.completedLegacySubjects);
    expect(completedLegacy.toolErrors, `${tag} — completed legacy tool errors`).toEqual([]);
    expect(completedLegacy.thrown, `${tag} — completed legacy replay`).toBeUndefined();

    expect(after.findings, `${tag} — final effective findings`).toEqual(sorted(row.finalFindings));
    expect(after.raw, `${tag} — final raw findings before authority`).toEqual(sorted(row.finalFindings));
    expect(after.granted, `${tag} — fixture rows consume no production-scoped grant`).toEqual([]);
    expect(after.population, `${tag} — final source population`).toBe(row.finalPopulation);
    expect(after.subjects, `${tag} — final resource subjects`).toEqual(row.finalSubjects);
    expect(after.toolErrors, `${tag} — final tool errors`).toEqual([]);
    expect(after.thrown, `${tag} — final replay`).toBeUndefined();
    expect(differentialViolations(row, completedLegacy, after), `${tag} — the declared split/difference is evidence-backed`).toEqual([]);
    if (row.drivesProductionGrants === true) {
      // The legacy real-tree anchor turned every unused private permission into a finding. The split retires
      // exactly those 22 rows from this descriptor: their shipped identities and production consumption are
      // proven by the two central-authority tests below, including wrong-operation/renamed-subject staleness.
      authorityTransitions.push({
        index,
        legacyPrivateRows: completedLegacy.findings.filter((finding) => finding.includes("allowlist row")).length,
        countDelta: completedLegacy.findings.length - after.findings.length,
      });
    }
  }
  expect(authorityTransitions, "the three legacy real-tree-anchor rows each retire exactly the 22 private permission rows").toEqual([
    { index: 4, legacyPrivateRows: TRANSLATED_GRANTS.length, countDelta: TRANSLATED_GRANTS.length },
    { index: 7, legacyPrivateRows: TRANSLATED_GRANTS.length, countDelta: TRANSLATED_GRANTS.length },
    { index: 8, legacyPrivateRows: TRANSLATED_GRANTS.length, countDelta: TRANSLATED_GRANTS.length },
  ]);
});

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
 *  phantom, is `GATE-AUTHORING.md` inside the citation net, is `history/**` outside it — and every one of
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
  test("the 22 translated rows are exact, the two post-conversion rows are present, and the real corpus consumes each once", ({ repoRoot }) => {
    expect(TRANSLATED_GRANTS.map(({ subject, operation }) => [subject, operation]).toSorted()).toEqual([...EXPECTED_GRANT_IDENTITIES].toSorted());
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
    expect(result.authority.effectiveFindings.filter(({ policyId }) => policyId === CITATION_GATE)).toHaveLength(2);
    expect(result.authority.authorityAlarms.filter(({ policyId }) => policyId === CITATION_GATE).map(({ kind }) => kind)).toEqual([
      "stale-reviewed-grant",
      "stale-reviewed-grant",
    ]);
  }, 600_000);
});

// THE DERIVED-CORPUS PIN (#1036). The defect was again a LYING INSTRUMENT, not a bad doc: arms 2-4 read a
// HAND-NAMED pair of directories, so `GATE-AUTHORING.md` — the law every gate author is routed to — sat
// outside the citation net entirely and its cite of the population controls rotted with nothing watching.
// Conformance cannot prove this half: its examples live in a policy-owned mini-project whose file map is
// authored per row, so it cannot ask whether the corpus derivation reaches `GATE-AUTHORING.md` AT ITS REAL
// RELATIVE PATH. Both directions are driven here, on an invocation-owned corpus that carries that path.
//
// #2332 — THE PLANT MOVED OUT OF THE CHECKOUT, AND THE PREMISE THAT KEPT IT THERE IS RECORDED REFUTED.
// Until 2026-09-14 the positive arm APPENDED a line to the tracked `GATE-AUTHORING.md` and restored it in
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
  test("a phantom path authored in GATE-AUTHORING.md is FOUND", async ({ plantedTree }) => {
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
