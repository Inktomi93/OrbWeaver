// Gate: duplicate-action-doors (issue #252) — the §13 more-than-one-home IA class, made structural: one
// tRPC MUTATION reachable from N distinct components inside ONE rail section is the same verb wearing N
// doors on one plane ("new chat lives in three places"). NOTHING hardcodes a procedure or a section name:
// the procedure key IS the `trpc.<…>` property path, and the plane is derived from the co-located section
// definitions against `SECTION_IDS`' one home. A shrink-only RATCHET, never a ban — some duals are ruled UX
// (a hero CTA beside a rail button); the gate makes a NEW door a decision instead of an accident.
// COMMENT POSTURE: comment-SAFE — pure node subscription, no file text is matched.
// THE VOCABULARY IS RESOLVED, NOT READ FLAT (#947): `SECTION_IDS` is read through `lib/tuple-read.ts`, so
// `[...CORE_SECTION_IDS, "home"]` contributes every id. A direct-element reader would leave the imported
// section planes out of the vocabulary — their definitions would stop being recognised as rail sections and
// every duplicate door on them would regroup under a feature directory, silently, with the vocabulary still
// non-empty and the blindness tripwire still satisfied. The scan line prints the resolved id count + sources.
//
// "WHICH VERB IS THIS SITE?" IS NOT THIS GATE'S OWN ANSWER: the creation-site reader lives at
// `tooling/src/_shared/trpc-doors.ts` (`mutationProcedures`) and is SHARED with the `ast subset-callers`
// lens, which compares the PAYLOADS the doors this gate counts pass. Two spellings of "what is a door"
// would let the census and the lens disagree; there is one.
//
// DECLARED BLIND SPOTS, both stated in #252 and both owned by the RUNTIME half (design-audit's
// same-role-and-name lens): a registry-rendered action is ONE call site behind N rendered slots (this is
// exactly how the founding "new chat" complaint escapes tier 1 — its three doors all call one shared state
// action), and a responsive pair is N call sites behind ONE rendered door.
import { join } from "node:path";
import type { Project, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { RatchetAdmission, RatchetRow } from "../../_shared/ratchet-rows.ts";
import { classNote, readBudgetRows, writeBudgetLedger } from "../../_shared/ratchet-rows.ts";
import { DOORS_BASELINE_REL, mutationProcedures } from "../../_shared/trpc-doors.ts";
import type { ExemptionTable, GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import { readStringValue } from "../lib/ast-read.ts";
import { fileLoaded } from "../lib/pass.ts";
import type { TupleVocabulary } from "../lib/tuple-read.ts";
import { readTupleDeclaration } from "../lib/tuple-read.ts";

const GATE_SELF = "tooling/src/verify/gates/duplicate-action-doors.ts";
/** Re-exported from the shared door home (`_shared/trpc-doors.ts`) so the debt walk's import still resolves
 *  here while the PATH itself has ONE home both consumers read (#569 — the subset-callers lens needs it too). */
export const BASELINE_REL = DOORS_BASELINE_REL;
/** The section VOCABULARY's ONE home (`no-parallel-section-map`'s sanctioned tuple) — read, never respelled. */
const SECTION_IDS_HOME = "packages/client/src/state/section-ids.ts";
/** THE REAL-TREE ANCHOR for every stale/blindness arm (GATE-AUTHORING.md §4.5), and deliberately NOT
 *  `SECTION_IDS_HOME`: this gate's own examples PLANT that file, so anchoring on it fired all three arms
 *  inside every conformance mini-project (measured — the founding mustFlag came back with 2 findings and
 *  three mustPass rows went red). A file present on every real run and needed by no example. */
const REAL_TREE_ANCHOR = "packages/db/src/schema/index.ts";
const FEATURES_PREFIX = "packages/client/src/features/";
/** A co-located rail-section definition: `features/<owner>/lib/<id>-section.tsx`. */
const SECTION_FILE_RE = /^packages\/client\/src\/features\/([^/]+)\/lib\/[^/]+-section\.tsx$/u;
const FEATURE_DIR_RE = /^packages\/client\/src\/features\/([^/]+)\//u;
/** Fewer doors than this on one plane is not a duplication at all. */
const MIN_DOORS = 2;

/** Procedures whose multi-door shape is ARCHITECTURE, not IA drift. Keyed on the procedure path so a
 *  section rename cannot silently widen it. */
const EXEMPT_PROCEDURES: ExemptionTable = {
  "settings.updateUserSettingsSection": {
    why:
      "the settings-SECTION contributor seam (client-architecture-lockdown.md §6c): one contributed section owns " +
      "one `owns:` key-set and saves it itself, so N sections on one plane means N call sites BY CONSTRUCTION — " +
      "they are N different verbs sharing one wire procedure, not one verb wearing N doors. ENDS when the save " +
      "seam stops being per-section (a single pane-level committer), at which point every row here goes to 1.",
  },
};

const MESSAGE =
  "one tRPC mutation is invoked from more components inside a single rail section than the committed baseline " +
  "allows — the same verb has grown a NEW door on a plane that already has one (the §13 more-than-one-home IA " +
  "class). See docs/architecture/core/client-architecture-lockdown.md §13.";
const FIX =
  "Give the section ONE component that owns the verb and let the other affordances reach it (a shared hook, a " +
  "state action, or the existing door). If the second door is ruled UX, add a row to EXEMPT_PROCEDURES in " +
  "tooling/src/verify/gates/duplicate-action-doors.ts carrying the ruling that granted it.";
const STALE_EXEMPT_PREFIX =
  "stale EXEMPT_PROCEDURES row — the procedure no longer has two doors anywhere, so the exemption grants nothing while reading as live law. Delete it: ";
const STALE_BASELINE_PREFIX =
  "stale baseline row — this pair now has FEWER doors than the committed budget (or none at all). Regenerate and " +
  "commit the shrink (`node tooling/src/verify/cli.ts baseline duplicate-action-doors`): ";
const BLIND_SECTIONS =
  "BLINDNESS TRIPWIRE — zero rail-section definitions were derived from the tree, so every call site would fall " +
  "back to its feature directory and the gate would silently stop judging planes. Re-point SECTION_FILE_RE in " +
  "tooling/src/verify/gates/duplicate-action-doors.ts";
const BLIND_VOCAB =
  "BLINDNESS TRIPWIRE — `SECTION_IDS` resolved to zero members, so no definition can be recognised as a rail " +
  "section. Re-point SECTION_IDS_HOME in tooling/src/verify/gates/duplicate-action-doors.ts";

/** The `SECTION_IDS` tuple, read from its one home and RESOLVED through the sanctioned spreads of
 *  local/imported sibling tuples (#947 — `[...CORE_SECTION_IDS, "home"]` would otherwise contribute only
 *  the locally-written id, and every door on an imported section plane would evade the rule while the
 *  vocabulary still looked non-empty). Empty is a tripwire, never a pass; an unsanctioned composition
 *  shape refuses loudly in `tuple-read.ts`. */
export function readSectionIds(project: Project, root: string): readonly string[] {
  return [...readSectionVocabulary(project, root).members];
}

/** The same read, keeping the SOURCE manifest for the scan line. */
function readSectionVocabulary(project: Project, root: string): TupleVocabulary {
  const sf = project.getSourceFile(join(root, SECTION_IDS_HOME));
  const decl = sf?.getVariableDeclaration("SECTION_IDS");
  if (decl === undefined || decl.getInitializer() === undefined) {
    return { members: new Set<string>(), entries: [], sources: [] };
  }
  return readTupleDeclaration(decl);
}

function repoRel(sf: SourceFile, root: string): string {
  const abs = sf.getFilePath() as string;
  return abs.startsWith(`${root}/`) ? abs.slice(root.length + 1) : abs;
}

/** ONE derivation per PASS, threaded — not memoized. `run` needs the plane map three times (blindness,
 *  census, exemptions) and each derivation walks every source file; on the real tree that is five
 *  whole-workspace scans for one verdict, and it pushed gate-conformance past its 30s budget. So it is
 *  computed once at the top of `run` and passed down.
 *
 *  A `WeakMap<Project, …>` memo sat here until 2026-08-28 and was REMOVED (#780, GATE-AUTHORING §12): it was
 *  correct only because the conformance substrate happened to build a fresh Project per example. That
 *  substrate now reuses ONE Project across every in-memory example, so a Project-keyed memo would serve a
 *  PREVIOUS example's plane map — with the gate still passing its own proofs while judging the wrong facts.
 *  The pass has no identity to key on and needs none: the value's lifetime IS the call. */
function derivePlanes(project: Project, root: string): ReadonlyMap<string, string> {
  return deriveSectionPlanes(project, root, readSectionIds(project, root));
}

/** feature directory → the rail SectionId it owns. Derived from the co-located definitions: a `SectionDefinition`
 *  object literal carries BOTH an `id` in the vocabulary AND a `rail` field (which is what separates it from a
 *  settings-section contribution living in the same `lib/`). */
export function deriveSectionPlanes(project: Project, root: string, sectionIds: readonly string[]): ReadonlyMap<string, string> {
  const planes = new Map<string, string>();
  const vocab = new Set(sectionIds);
  for (const sf of project.getSourceFiles()) {
    const rel = repoRel(sf, root);
    const owner = SECTION_FILE_RE.exec(rel)?.[1];
    if (owner === undefined) {
      continue;
    }
    const id = railSectionId(sf, vocab);
    if (id !== undefined) {
      planes.set(owner, id);
    }
  }
  return planes;
}

/** The vocabulary id of a `SectionDefinition` object literal in `sf`, if one is there. `rail` is what
 *  separates a RAIL section from a settings-section contribution sharing the same `lib/` filename shape. */
function railSectionId(sf: SourceFile, vocab: ReadonlySet<string>): string | undefined {
  const ids = sf.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression).flatMap((obj) => {
    const idProp = obj.getProperty("rail") === undefined ? undefined : obj.getProperty("id");
    if (idProp === undefined || !Node.isPropertyAssignment(idProp)) {
      return [];
    }
    const id = readStringValue(idProp.getInitializer() ?? idProp);
    return id !== undefined && vocab.has(id) ? [id] : [];
  });
  return ids[0];
}

/** `<plane>::<procedure>` → the distinct component files that invoke it. The ONE derivation; the generator
 *  imports it so the baseline can never be computed by a second spelling. */
export function doorCensus(
  project: Project,
  root: string,
  planes: ReadonlyMap<string, string> = derivePlanes(project, root),
): ReadonlyMap<string, ReadonlySet<string>> {
  const census = new Map<string, Set<string>>();
  for (const sf of project.getSourceFiles()) {
    const rel = repoRel(sf, root);
    const owner = FEATURE_DIR_RE.exec(rel)?.[1];
    if (owner === undefined) {
      continue;
    }
    // A feature with no rail section of its own is still ONE plane — its own subtree.
    const plane = planes.get(owner) ?? `feature:${owner}`;
    for (const proc of mutationProcedures(sf)) {
      if (proc in EXEMPT_PROCEDURES) {
        continue;
      }
      const key = `${plane}::${proc}`;
      const files = census.get(key) ?? new Set<string>();
      files.add(rel);
      census.set(key, files);
    }
  }
  return census;
}

/** The pairs a baseline should carry: every plane/procedure at or above the duplication floor. */
export function baselineRows(project: Project, root: string): Readonly<Record<string, number>> {
  const rows: Record<string, number> = {};
  for (const [key, files] of doorCensus(project, root)) {
    if (files.size >= MIN_DOORS) {
      rows[key] = files.size;
    }
  }
  return Object.fromEntries(Object.entries(rows).sort(([a], [b]) => a.localeCompare(b)));
}

/** The committed ledger, read through the ONE row reader (`_shared/ratchet-rows.ts`) so this gate sees each
 *  pair's DEBT-vs-RATIFIED class, not just its count. All six live rows are RATIFIED (#568/#569): ruled
 *  cross-plane affordances, whose reasoning is recorded at both call sites the row cites. */
function readBaseline(root: string): ReadonlyMap<string, RatchetRow> {
  return readBudgetRows(root, BASELINE_REL);
}

/** §4.6 — a gate keyed on an exact NAME must detect its own blindness. Both derivations are name-keyed
 *  (`SECTION_IDS`, the `rail`-carrying definition), and either coming back empty would silently regroup
 *  every door under its feature directory while still reporting ✓. Real-tree anchored (§4.5). */
function judgeBlindness(ctx: GateRunCtx, planes: ReadonlyMap<string, string>): void {
  if (!fileLoaded(ctx, REAL_TREE_ANCHOR)) {
    return;
  }
  const sectionIds = readSectionIds(ctx.project, ctx.root);
  if (sectionIds.length === 0) {
    ctx.report({ file: GATE_SELF, line: 1, column: 0, message: BLIND_VOCAB });
    return;
  }
  if (planes.size === 0) {
    ctx.report({ file: GATE_SELF, line: 1, column: 0, message: BLIND_SECTIONS });
  }
}

/** The RATCHET's growth arm. Returns the count of pairs a committed budget absolved (declared debt). */
function judgeGrowth(ctx: GateRunCtx, census: ReadonlyMap<string, ReadonlySet<string>>, baseline: ReadonlyMap<string, RatchetRow>): RatchetAdmission {
  let admitted = 0;
  let ratified = 0;
  for (const [key, files] of census) {
    const row = baseline.get(key);
    const budget = row?.count ?? MIN_DOORS - 1;
    if (files.size <= budget) {
      const counts = files.size >= MIN_DOORS ? 1 : 0;
      admitted += counts;
      // The unit here is the PAIR, not the door, so a row carrying any ratified portion admits as ratified —
      // a pair is ruled or it is not (a per-door partition would be a number this census cannot earn).
      ratified += row !== undefined && row.ratified > 0 ? counts : 0;
      continue;
    }
    // A COUNT budget cannot say WHICH door is the new one, so the diagnostic names them ALL and anchors on
    // the first — naming one arbitrarily would point a reader at an innocent file (measured: the planted
    // third `chat.forkChat` door made the arm accuse `message-actions-row.tsx`, the door that was there
    // first). The reader diffs the list against their own change.
    const doors = [...files].sort();
    ctx.report({
      file: doors[0] ?? GATE_SELF,
      line: 1,
      column: 0,
      token: key,
      // A RATIFIED row's diagnostic cites its RULING instead of remediation advice (#569): the reader is
      // being told a THIRD door landed on a pair somebody already decided, not that the pair is a defect.
      message: `${MESSAGE} (${key}: ${files.size} doors, budget ${budget}; doors: ${doors.join(", ")}) — the table lives in tooling/src/verify/gates/duplicate-action-doors.ts${row === undefined ? "" : classNote(row)}`,
    });
  }
  return { admitted, ratified };
}

/** The RATCHET's shrink-only arm (§4.8): a budget the tree no longer earns is RED, never silence. */
function judgeShrink(ctx: GateRunCtx, census: ReadonlyMap<string, ReadonlySet<string>>, baseline: ReadonlyMap<string, RatchetRow>): void {
  for (const [key, row] of baseline) {
    const live = census.get(key)?.size ?? 0;
    if (live < row.count) {
      ctx.report({
        file: GATE_SELF,
        line: 1,
        column: 0,
        message: `${STALE_BASELINE_PREFIX}${key} (budget ${row.count}, live ${live}) — the table lives in tooling/src/verify/gates/duplicate-action-doors.ts${classNote(row)}`,
      });
    }
  }
}

/** The EXEMPT_PROCEDURES stale arm: a row that no longer absolves a real dual is a loaded gun. */
function judgeExemptions(ctx: GateRunCtx, planes: ReadonlyMap<string, string>): void {
  const perPair = new Map<string, Set<string>>();
  for (const sf of ctx.project.getSourceFiles()) {
    const rel = repoRel(sf, ctx.root);
    const owner = FEATURE_DIR_RE.exec(rel)?.[1];
    if (owner === undefined) {
      continue;
    }
    const plane = planes.get(owner) ?? `feature:${owner}`;
    for (const proc of mutationProcedures(sf)) {
      if (!(proc in EXEMPT_PROCEDURES)) {
        continue;
      }
      const files = perPair.get(`${plane}::${proc}`) ?? new Set<string>();
      files.add(rel);
      perPair.set(`${plane}::${proc}`, files);
    }
  }
  for (const proc of Object.keys(EXEMPT_PROCEDURES)) {
    const earned = [...perPair].some(([key, files]) => key.endsWith(`::${proc}`) && files.size >= MIN_DOORS);
    if (!earned) {
      ctx.report({
        file: GATE_SELF,
        line: 1,
        column: 0,
        message: `${STALE_EXEMPT_PREFIX}${proc} — the table lives in tooling/src/verify/gates/duplicate-action-doors.ts`,
      });
    }
  }
}

export const gate: GateDescriptor = {
  name: "duplicate-action-doors",
  docRow: "client-architecture-lockdown.md §13",
  status: "active",
  scopeSafety: "whole-project",
  message: MESSAGE,
  fix: FIX,
  scanRoot: (p) => p.startsWith(FEATURES_PREFIX) || p === SECTION_IDS_HOME,
  run: (ctx) => {
    const vocabulary = readSectionVocabulary(ctx.project, ctx.root);
    ctx.scan({
      unit: `section vocabulary [SECTION_IDS=${vocabulary.members.size} from ${vocabulary.sources.length === 0 ? "<none>" : vocabulary.sources.join("+")}]`,
      candidates: vocabulary.sources.length,
      scanned: vocabulary.sources.length,
    });
    // ONE plane derivation for the whole pass, threaded to every arm that needs it (see `derivePlanes`).
    const planes = derivePlanes(ctx.project, ctx.root);
    judgeBlindness(ctx, planes);
    const census = doorCensus(ctx.project, ctx.root, planes);
    const baseline = readBaseline(ctx.root);
    const admission = judgeGrowth(ctx, census, baseline);
    ctx.scan({ admitted: admission.admitted, admittedRatified: admission.ratified });
    if (!fileLoaded(ctx, REAL_TREE_ANCHOR)) {
      return;
    }
    judgeShrink(ctx, census, baseline);
    judgeExemptions(ctx, planes);
  },
  mustFlag: [
    {
      // THE #947 SPLIT: the section id reaches the vocabulary only through the imported CORE_SECTION_IDS
      // spread. Unresolved, `chats` is not a known id, the definition is not recognised as a rail section,
      // and both doors regroup under the FEATURE DIRECTORY — the finding still fires but under the wrong
      // plane key (`feature:chat::…`), which is the ratchet's and the exemption table's key. So a budget
      // row or an EXEMPT_PROCEDURES entry written for the real plane silently stops matching, and two
      // sections sharing a feature dir collapse into one bucket. The token below pins the REAL plane.
      files: {
        "packages/client/src/state/core-section-ids.ts": 'export const CORE_SECTION_IDS = ["chats"] as const;\n',
        [SECTION_IDS_HOME]: 'import { CORE_SECTION_IDS } from "./core-section-ids.ts";\nexport const SECTION_IDS = [...CORE_SECTION_IDS, "home"] as const;\n',
        "packages/client/src/features/chat/lib/chats-section.tsx": 'export const s = { id: "chats", rail: { label: "Chats" } };\n',
        "packages/client/src/features/chat/components/a.tsx": "export const A = () => trpc.chat.forkChat.mutationOptions();\n",
        "packages/client/src/features/chat/components/b.tsx": "export const B = () => trpc.chat.forkChat.mutationOptions();\n",
      },
      expect: { count: 1, token: "chats::chat.forkChat" },
      why: "THE #947 SPLIT RED: the founding duplicate-door shape on a section plane whose id arrives through an imported spread. Measured at HEAD, the unresolved reader reported the SAME pair under `feature:chat::chat.forkChat` — a mis-keyed plane, so every plane-keyed budget row and exemption for `chats` quietly stopped matching. The token pins the derived plane, not merely the presence of a finding",
    },
    {
      files: {
        [SECTION_IDS_HOME]: 'export const SECTION_IDS = ["chats"] as const;\n',
        "packages/client/src/features/chat/lib/chats-section.tsx": 'export const s = { id: "chats", rail: { label: "Chats" } };\n',
        "packages/client/src/features/chat/components/a.tsx": "export const A = () => trpc.chat.forkChat.mutationOptions();\n",
        "packages/client/src/features/chat/components/b.tsx": "export const B = () => trpc.chat.forkChat.mutationOptions();\n",
      },
      expect: { count: 1, token: "chats::chat.forkChat" },
      why: "THE FOUNDING SHAPE — one verb, two components, one rail section, no committed budget: the second door is a NEW door and must be a decision",
    },
    {
      files: {
        [REAL_TREE_ANCHOR]: "export const schema = {};\n",
        [SECTION_IDS_HOME]: "export const OTHER = 1;\n",
        // The exempt procedure keeps EARNING its row here, so this example isolates the tripwire instead of
        // also tripping the (equally correct) stale-exemption arm the anchor turns on.
        "packages/client/src/features/chat/components/a.tsx": "export const A = () => trpc.settings.updateUserSettingsSection.mutationOptions();\n",
        "packages/client/src/features/chat/components/b.tsx": "export const B = () => trpc.settings.updateUserSettingsSection.mutationOptions();\n",
      },
      expect: { count: 1, messageIncludes: "BLINDNESS TRIPWIRE" },
      why: "THE §4.6 BLINDNESS TRIPWIRE: the vocabulary home loaded but named no SECTION_IDS, so the plane derivation came back empty — a rename must RED, never silently regroup every door under its feature dir",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/client/src/state/core-section-ids.ts": 'export const CORE_SECTION_IDS = ["chats"] as const;\n',
        [SECTION_IDS_HOME]: 'import { CORE_SECTION_IDS } from "./core-section-ids.ts";\nexport const SECTION_IDS = [...CORE_SECTION_IDS, "home"] as const;\n',
        "packages/client/src/features/chat/lib/chats-section.tsx": 'export const s = { id: "chats", rail: { label: "Chats" } };\n',
        "packages/client/src/features/chat/components/a.tsx": "export const A = () => trpc.chat.forkChat.mutationOptions();\n",
      },
      why: "the SPLIT's green half: the same imported-spread vocabulary with ONE door on the plane — resolving the spread restores the plane without inventing a duplicate",
    },
    {
      files: {
        [SECTION_IDS_HOME]: 'export const SECTION_IDS = ["chats"] as const;\n',
        "packages/client/src/features/chat/lib/chats-section.tsx": 'export const s = { id: "chats", rail: { label: "Chats" } };\n',
        "packages/client/src/features/chat/components/a.tsx": "export const A = () => trpc.settings.updateUserSettingsSection.mutationOptions();\n",
        "packages/client/src/features/chat/components/b.tsx": "export const B = () => trpc.settings.updateUserSettingsSection.mutationOptions();\n",
      },
      why: "the EXEMPT row earns its keep — the per-section save seam is N verbs sharing one wire procedure, and its stale arm stays quiet because the pair really does have two doors",
    },
    {
      files: {
        [SECTION_IDS_HOME]: 'export const SECTION_IDS = ["chats", "characters"] as const;\n',
        "packages/client/src/features/chat/lib/chats-section.tsx": 'export const s = { id: "chats", rail: { label: "Chats" } };\n',
        "packages/client/src/features/character/lib/characters-section.tsx": 'export const c = { id: "characters", rail: { label: "Characters" } };\n',
        "packages/client/src/features/chat/components/a.tsx": "export const A = () => trpc.chat.forkChat.mutationOptions();\n",
        "packages/client/src/features/character/components/b.tsx": "export const B = () => trpc.chat.forkChat.mutationOptions();\n",
      },
      why: "DECLARED LIMIT — two doors on two DIFFERENT planes is not the defect: the class is one verb duplicated where a user can see both at once",
    },
    {
      files: {
        [SECTION_IDS_HOME]: 'export const SECTION_IDS = ["chats"] as const;\n',
        "packages/client/src/features/chat/lib/chats-section.tsx": 'export const s = { id: "chats", rail: { label: "Chats" } };\n',
        "packages/client/src/features/chat/components/a.tsx":
          "export const A = () => { trpc.chat.forkChat.mutationOptions(); return trpc.chat.forkChat.mutationOptions(); };\n",
      },
      why: "THE UNIT IS THE COMPONENT, not the call: one file wiring the same verb twice is one door — a user sees one affordance",
    },
    {
      files: {
        [SECTION_IDS_HOME]: 'export const SECTION_IDS = ["chats"] as const;\n',
        "packages/client/src/features/chat/lib/memory-settings-section.tsx": 'export const m = { id: "chat-memory", anchor: "chat-behavior" };\n',
        "packages/client/src/features/chat/components/a.tsx": "export const A = () => trpc.chat.forkChat.mutationOptions();\n",
      },
      why: "DECLARED LIMIT — a settings-section CONTRIBUTION lives in the same `lib/` and matches the filename shape, but carries no `rail` field and no vocabulary id, so it never mints a plane",
    },
  ],
};

/** The generator's single writer (GATE-AUTHORING.md §4.8) — invoked by tooling/src/verify/ops/gen/duplicate-action-doors.ts. */
export function writeBaseline(project: Project, root: string): number {
  // The COUNTS are re-derived from the tree; the CLASS is a ruling and rides through from the committed
  // ledger (#569) — a regenerate that silently demoted six ratified pairs back to backlog would be the
  // classification erasing itself on its first shrink.
  return writeBudgetLedger(root, BASELINE_REL, baselineRows(project, root), readBaseline(root));
}
