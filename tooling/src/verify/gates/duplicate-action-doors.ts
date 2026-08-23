// Gate: duplicate-action-doors (issue #252) — the §13 more-than-one-home IA class, made structural: one
// tRPC MUTATION reachable from N distinct components inside ONE rail section is the same verb wearing N
// doors on one plane ("new chat lives in three places"). NOTHING hardcodes a procedure or a section name:
// the procedure key IS the `trpc.<…>` property path, and the plane is derived from the co-located section
// definitions against `SECTION_IDS`' one home. A shrink-only RATCHET, never a ban — some duals are ruled UX
// (a hero CTA beside a rail button); the gate makes a NEW door a decision instead of an accident.
// COMMENT POSTURE: comment-SAFE — pure node subscription, no file text is matched.
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
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Project, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { mutationProcedures } from "../../_shared/trpc-doors.ts";
import type { ExemptionTable, GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import { readStringValue } from "../lib/ast-read.ts";
import { fileLoaded } from "../lib/pass.ts";

const GATE_SELF = "tooling/src/verify/gates/duplicate-action-doors.ts";
export const BASELINE_REL = "tooling/src/verify/gates/duplicate-action-doors.baseline.json";
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

/** The `SECTION_IDS` tuple, read from its one home. Empty is a tripwire, never a pass. */
export function readSectionIds(project: Project, root: string): readonly string[] {
  const sf = project.getSourceFile(join(root, SECTION_IDS_HOME));
  const decl = sf?.getVariableDeclaration("SECTION_IDS");
  const init = decl?.getInitializer();
  const arr = init === undefined ? undefined : init.asKind(SyntaxKind.ArrayLiteralExpression);
  const unwrapped = arr ?? init?.getFirstDescendantByKind(SyntaxKind.ArrayLiteralExpression);
  return (unwrapped?.getElements() ?? []).flatMap((e) => {
    const v = readStringValue(e);
    return v === undefined ? [] : [v];
  });
}

function repoRel(sf: SourceFile, root: string): string {
  const abs = sf.getFilePath() as string;
  return abs.startsWith(`${root}/`) ? abs.slice(root.length + 1) : abs;
}

/** One derivation per Project, not per caller. `run` needs the plane map three times (blindness, census,
 *  exemptions) and each derivation walks every source file; on the real tree that is five whole-workspace
 *  scans for one verdict, and it pushed gate-conformance past its 30s budget. Keyed on the Project object so
 *  a new run (or a conformance mini-project) never reads another run's answer. */
const PLANE_CACHE = new WeakMap<Project, ReadonlyMap<string, string>>();

/** The memoized plane map for this run. */
function planesFor(project: Project, root: string): ReadonlyMap<string, string> {
  const cached = PLANE_CACHE.get(project);
  if (cached !== undefined) {
    return cached;
  }
  const derived = deriveSectionPlanes(project, root, readSectionIds(project, root));
  PLANE_CACHE.set(project, derived);
  return derived;
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
export function doorCensus(project: Project, root: string): ReadonlyMap<string, ReadonlySet<string>> {
  const planes = planesFor(project, root);
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

function readBaseline(root: string): Readonly<Record<string, number>> {
  const path = join(root, BASELINE_REL);
  if (!existsSync(path)) {
    return {};
  }
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, number>;
}

/** §4.6 — a gate keyed on an exact NAME must detect its own blindness. Both derivations are name-keyed
 *  (`SECTION_IDS`, the `rail`-carrying definition), and either coming back empty would silently regroup
 *  every door under its feature directory while still reporting ✓. Real-tree anchored (§4.5). */
function judgeBlindness(ctx: GateRunCtx): void {
  if (!fileLoaded(ctx, REAL_TREE_ANCHOR)) {
    return;
  }
  const sectionIds = readSectionIds(ctx.project, ctx.root);
  if (sectionIds.length === 0) {
    ctx.report({ file: GATE_SELF, line: 1, column: 0, message: BLIND_VOCAB });
    return;
  }
  if (planesFor(ctx.project, ctx.root).size === 0) {
    ctx.report({ file: GATE_SELF, line: 1, column: 0, message: BLIND_SECTIONS });
  }
}

/** The RATCHET's growth arm. Returns the count of pairs a committed budget absolved (declared debt). */
function judgeGrowth(ctx: GateRunCtx, census: ReadonlyMap<string, ReadonlySet<string>>, baseline: Readonly<Record<string, number>>): number {
  let admitted = 0;
  for (const [key, files] of census) {
    const budget = baseline[key] ?? MIN_DOORS - 1;
    if (files.size <= budget) {
      admitted += files.size >= MIN_DOORS ? 1 : 0;
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
      message: `${MESSAGE} (${key}: ${files.size} doors, budget ${budget}; doors: ${doors.join(", ")}) — the table lives in tooling/src/verify/gates/duplicate-action-doors.ts`,
    });
  }
  return admitted;
}

/** The RATCHET's shrink-only arm (§4.8): a budget the tree no longer earns is RED, never silence. */
function judgeShrink(ctx: GateRunCtx, census: ReadonlyMap<string, ReadonlySet<string>>, baseline: Readonly<Record<string, number>>): void {
  for (const [key, budget] of Object.entries(baseline)) {
    const live = census.get(key)?.size ?? 0;
    if (live < budget) {
      ctx.report({
        file: GATE_SELF,
        line: 1,
        column: 0,
        message: `${STALE_BASELINE_PREFIX}${key} (budget ${budget}, live ${live}) — the table lives in tooling/src/verify/gates/duplicate-action-doors.ts`,
      });
    }
  }
}

/** The EXEMPT_PROCEDURES stale arm: a row that no longer absolves a real dual is a loaded gun. */
function judgeExemptions(ctx: GateRunCtx): void {
  const planes = planesFor(ctx.project, ctx.root);
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
    judgeBlindness(ctx);
    const census = doorCensus(ctx.project, ctx.root);
    const baseline = readBaseline(ctx.root);
    ctx.scan({ admitted: judgeGrowth(ctx, census, baseline) });
    if (!fileLoaded(ctx, REAL_TREE_ANCHOR)) {
      return;
    }
    judgeShrink(ctx, census, baseline);
    judgeExemptions(ctx);
  },
  mustFlag: [
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
  const rows = baselineRows(project, root);
  writeFileSync(join(root, BASELINE_REL), `${JSON.stringify(rows, null, 2)}\n`);
  return Object.keys(rows).length;
}
