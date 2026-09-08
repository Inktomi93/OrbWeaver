// Gate: test-presence-client — the @orb/client + non-primitive @orb/ui reach test-presence lacks
// (docs/architecture/core/Spine-Testing.md §5: a test is required only where an untested change
// silently breaks behavior downstream, not blanket per-file coverage). Clause A: client
// data/forms/state primitives need a per-file mirror test (each is composed independently). Clause B:
// non-primitive @orb/ui logic groups need any test in their mirror directory (bare primitives/ are covered by ui-primitive-structure's CT).
// Clause C: a mirror EXISTING (clause A) isn't enough — a store gains a new exported action and the
// mirror's OLD tests keep passing untouched (learned: `revealContextPanel`/`selectPresetFromList`/
// `__dismissPresetSectionForTest`/`selectWorldBookFromList` shipped referenced by ZERO test file). Every action
// exported by a `state/*.ts` file that mints a store (`createGatedStore`/`createPersistedStore`/
// `createEntityDraftStore`) must appear BY NAME in its mirror test, of EITHER kind.
// CLAUSE C WAS SILENTLY INERT ON 15 OF 34 STORES UNTIL #619. It resolved the mirror as `.ct.tsx` ONLY and
// `return []` when that path did not exist — so every store whose mirror is a `.test.ts` was never judged and
// the gate reported CLEAN. The header asserted "every existing state store mirror is a .ct.tsx, never a
// .test.ts"; that was FALSE by 15 files (chat-stream, message-selection-store, recent-models-store,
// rpg-round-store, steer-recovery-store, surface-box-store, message-edit-draft, preset-section-drill-store,
// refinery-view-store, regex-bulk-store and the five `create-*` doors). It now resolves over the SHARED
// `TEST_KINDS` vocabulary (one home with clause A), and REFUSES LOUDLY when a mirror exists that it could not
// read — a clause that cannot run must never report clean.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Project, SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import { classifyTestFilename, TEST_KIND_DEFINITIONS } from "../../_shared/test-kinds.ts";
import type { GateDescriptor } from "../contract/gate.ts";
import type { Violation } from "../contract/harness.ts";
import { blankTsCommentsAndStringsInText, codeTextForScan } from "../lib/comment-spans.ts";

const CLIENT_SRC = "/packages/client/src/";
const UI_SRC = "/packages/ui/src/";
const EXT_RE = /\.tsx?$/u;
const STATE_STORE_FACTORY_RE = /\b(?:createGatedStore|createPersistedStore|createEntityDraftStore)(?:<[^(]*>)?\(/u;
// Direct children of these source owners compose independently; bound fields retain their shared CT home.
const CLIENT_MIRROR_HOMES = ["data/", "forms/", "forms/editor/", "state/"];
const CLIENT_EXCLUDE_NESTED = ["data/bus/", "forms/editor/bound-fields/"];
// `data/trpc.ts`'s two exports are thin `@trpc/client` constructors with no bespoke logic of their
// own to unit-test in isolation — their wire behavior is exercised end-to-end by every `.ct.tsx` that
// mounts via `CtDataProviders`, so an isolated test here would just re-assert "the library was called".
const CLIENT_EXCLUDE_FILES = ["data/trpc.ts"];
// Non-primitive @orb/ui logic groups (primitives/ are covered by ui-primitive-structure's CT clause).
const UI_LOGIC_GROUPS = ["charts/", "markdown/", "stream/", "content/", "code-editor/", "diff/", "fuzzy-search/"];
const TEST_KINDS = TEST_KIND_DEFINITIONS.filter(({ family, mirror }) => family !== "type" && mirror === "module").map(({ suffix }) => suffix);
const REAL_TREE_ANCHOR = "packages/client/src/index.ts";
const WORST_ART_ANCHOR = "packages/client/src/features/chat/surfaces/chat-room-surface.tsx";
const WORST_ART_STANDING_CT = "tests/client/features/chat/surfaces/worst-legal-art-contrast.suite.ct.tsx";

const MSG_CLIENT =
  "client data/forms/state primitive has no test — add a registered runtime test at its tests/client mirror. These seals are composed by every feature; an untested change breaks behavior downstream silently (Spine-Testing.md §5).";
const MSG_UI = "non-primitive @orb/ui logic module has no test — add a .test.ts / .ct.tsx at its tests/ui mirror (Spine-Testing.md §5).";
const MSG_STATE_ACTION = (action: string): string =>
  `store action \`${action}\` is not referenced by name in its mirror test (tests/client/state/<store>.{ct.tsx,test.ts,...} + the shared _ct-stories.tsx) — a mirror EXISTING isn't presence for a NEW action (Spine-Testing.md §5). Drive it and assert the resulting store state.`;

/** The §4.6 blindness tripwire for clause C, and the thing #619 was minted from: clause C used to resolve
 *  the mirror as `.ct.tsx` ONLY and `return []` on a miss, so 15 `.test.ts`-mirrored stores were never
 *  judged and the gate reported CLEAN. A clause that CANNOT run must never look like one that ran and found
 *  nothing. Fires when clause A says a mirror exists but clause C read no corpus from it. */
const MSG_STATE_UNREADABLE =
  "clause C could not read ANY corpus from this store's mirror, even though a mirror test EXISTS — so its actions went UNJUDGED and a ✓ here would be a lie about coverage this gate does not have (issue #619; tooling/src/verify/gates/GATE-AUTHORING.md §4.6). Either the mirror is empty, or its kind is not registered in tooling/src/_shared/test-kinds.ts — fix the shared vocabulary, never special-case it here.";
const MSG_WORST_ART =
  "the standing DOM-derived worst-legal-art contrast CT is missing — restore tests/client/features/chat/surfaces/worst-legal-art-contrast.suite.ct.tsx. The room's rendered text population must stay sampled across shipped and custom theme polarities (issue #883).";

function relAfter(path: string, marker: string): string | undefined {
  const idx = path.indexOf(marker);
  return idx === -1 ? undefined : path.slice(idx + marker.length);
}

// A file carries runtime LOGIC (vs only types/data/re-exports) if it exports a function, a class, or a
// const bound to an arrow/function expression. Destructured or plain-value exports are NOT callable.
function hasCallableExport(sf: SourceFile): boolean {
  if (sf.getFunctions().some((f) => f.isExported())) {
    return true;
  }
  if (sf.getClasses().some((c) => c.isExported())) {
    return true;
  }
  for (const stmt of sf.getVariableStatements()) {
    if (!stmt.isExported()) {
      continue;
    }
    for (const decl of stmt.getDeclarations()) {
      const init = decl.getInitializer();
      if (init !== undefined && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
        return true;
      }
    }
  }
  return false;
}

// Clause A — strict per-file mirror: a test at tests/<pkg>/<same path, test suffix>.
function hasMirrorTest(root: string, pkg: string, rel: string): boolean {
  const base = rel.replace(EXT_RE, "");
  return TEST_KINDS.some((kind) => existsSync(join(root, "tests", pkg, `${base}${kind}`)));
}

// Clause C — every exported top-level function in a store file (state/*.ts minting createGatedStore /
// createPersistedStore / createEntityDraftStore) is a store ACTION unless it's a `use*` read-hook (a
// selector, not a write) or the store-factory export itself (the `create*` doors re-exported from their
// own file — not applicable here since those files never call their OWN factory).
function exportedFunctionDeclActionNames(sf: SourceFile): string[] {
  const names: string[] = [];
  for (const fn of sf.getFunctions()) {
    const name = fn.getName();
    if (fn.isExported() && name !== undefined && !name.startsWith("use")) {
      names.push(name);
    }
  }
  return names;
}

function exportedConstActionNames(sf: SourceFile): string[] {
  const names: string[] = [];
  for (const stmt of sf.getVariableStatements()) {
    if (!stmt.isExported()) {
      continue;
    }
    for (const decl of stmt.getDeclarations()) {
      const init = decl.getInitializer();
      const name = decl.getName();
      const isFnValue = init !== undefined && (Node.isArrowFunction(init) || Node.isFunctionExpression(init));
      if (isFnValue && !name.startsWith("use")) {
        names.push(name);
      }
    }
  }
  return names;
}

function storeActionNames(sf: SourceFile): string[] {
  return [...exportedFunctionDeclActionNames(sf), ...exportedConstActionNames(sf)];
}

// A `state/*.ts` file mints its OWN store only when it calls one of the three factory doors directly —
// excludes the factory-definition files themselves (create-gated-store.ts etc. define, never call, the
// door) and the context/provider/registry files (no store, nothing to gate here).
// Read from CODE (issue #117/#132): a `state/*.ts` whose comment NAMES a factory door — which the
// factory-definition files and the doc comments above every store both do — is not a store, and clause C
// would then demand mirror coverage for actions it has none of.
function isStoreFile(sf: SourceFile): boolean {
  return STATE_STORE_FACTORY_RE.test(codeTextForScan(sf, (raw) => STATE_STORE_FACTORY_RE.test(raw)));
}

// Clause C — a store's mirror .ct.tsx (the only kind these hook-backed stores use — useSyncExternalStore
// needs a browser) must reference every action BY NAME (boundary-anchored, not a substring of a longer
// identifier).
// A call may carry EXPLICIT TYPE ARGUMENTS between the name and the paren — `createGatedStore<CounterState>(`
// — and a bare `NAME\(` matcher is blind to every one of them. That blindness was INVISIBLE until #619
// widened clause C: four `create-*` mirrors that genuinely DO exercise their factory (generically) reported
// as untested, which would have shipped four false REDs on a live gate. One nesting level of generics is
// covered (`<Map<string, number>>`), and parens are excluded from the type-argument span so the pattern
// cannot run away across a line into an unrelated call.
const TYPE_ARGS = String.raw`(?:\s*<[^<>()]*(?:<[^<>()]*>)?[^<>()]*>)?`;

function actionReferencedInMirror(mirrorText: string, action: string): boolean {
  return new RegExp(`(?:[^\\w]|^)${action}${TYPE_ARGS}\\s*\\(`, "u").test(mirrorText);
}

// Clause B — dir-level presence: ANY test file in the module's mirror directory (a ui-logic group is
// exercised as a unit, often under a different basename — a helper via its component's CT, a builder
// via a sibling snap/option test).
function hasDirTest(root: string, pkg: string, rel: string): boolean {
  const mirrorDir = join(root, "tests", pkg, dirname(rel));
  if (!existsSync(mirrorDir)) {
    return false;
  }
  return readdirSync(mirrorDir, { withFileTypes: true }).some((entry) => {
    const kind = classifyTestFilename(entry.name)?.definition;
    return entry.isFile() && kind !== undefined && kind.family !== "type" && kind.mirror !== "e2e-only";
  });
}

// Clause A — a DIRECT child of a client owner (data/x.ts or forms/editor/x.ts), excluding nested buckets + named
// per-file exclusions (CLIENT_EXCLUDE_FILES — see its own comment for why each one is there).
function clientTierRel(rel: string): string | undefined {
  if (CLIENT_EXCLUDE_NESTED.some((n) => rel.startsWith(n)) || CLIENT_EXCLUDE_FILES.includes(rel)) {
    return;
  }
  return CLIENT_MIRROR_HOMES.some((home) => rel.startsWith(home) && !rel.slice(home.length).includes("/")) ? rel : undefined;
}

// Clause C — the mirror is resolved over the SHARED `TEST_KINDS` vocabulary (the same list clause A uses:
// one home, so the two clauses can never disagree about what a mirror IS — the #619 divergence). A store
// backed by `useSyncExternalStore` usually mirrors as `.ct.tsx`, but a `.test.ts` that drives an action is
// coverage too, and 15 stores are mirrored exactly that way. EVERY existing mirror is read, not just the
// first: `active-chat-store` and `composer-draft-store` carry BOTH kinds, and an action driven in either one
// is genuinely covered. Missing mirror ENTIRELY is clause A's violation, so clause C stays silent there
// rather than double-reporting. The action call sites also live in the shared `_ct-stories.tsx` story module
// (Spine-Testing §7 — "CT only mounts from a non-test module"), so that sibling joins the corpus.
// The mirror corpus is read off the REAL FS (it is a test file, judged by existence), so its comments AND
// its string prose are blanked from TEXT. This is the PERMISSIVE direction of the comment-blindness class
// and the one that matters here: a COMMENTED-OUT `revealContextPanel(` call in the mirror would satisfy
// clause C — the "shipped referenced by ZERO test" defect the clause was minted for, wearing a `//`. STRINGS
// are the same channel wearing quotes (found lying 2026-08-24): a vitest description
// `it("calls revealContextPanel( …")` satisfied the matcher, so a test that only NAMES the action in prose
// blessed coverage. Template interpolations survive the blanking, so a real call inside `${…}` still counts.
function readIfExists(path: string): string {
  if (!existsSync(path)) {
    return "";
  }
  return blankTsCommentsAndStringsInText(readFileSync(path, "utf8"));
}

function scanStoreActionPresence(root: string, clientRel: string, sf: SourceFile): Violation[] {
  const mirrorDir = join(root, "tests", "client", "state");
  const base = join(root, "tests", "client", clientRel.replace(EXT_RE, ""));
  const present = TEST_KINDS.map((kind) => `${base}${kind}`).filter((p) => existsSync(p));
  if (present.length === 0) {
    // No mirror at all — clause A's violation, already reported. Silent here on purpose (not a skip).
    return [];
  }
  const file = `packages/client/src/${clientRel}`;
  const mirrorText = present.map((p) => readIfExists(p)).join("");
  // The blindness tripwire: a mirror EXISTS but yielded no readable corpus, so nothing below could judge.
  if (mirrorText.trim() === "") {
    return [{ file, line: 0, message: MSG_STATE_UNREADABLE }];
  }
  const corpus = mirrorText + readIfExists(join(mirrorDir, "_ct-stories.tsx"));
  const out: Violation[] = [];
  for (const action of storeActionNames(sf)) {
    if (!actionReferencedInMirror(corpus, action)) {
      out.push({ file, line: 0, message: MSG_STATE_ACTION(action) });
    }
  }
  return out;
}

function scanClientTier(root: string, clientRel: string, sf: SourceFile): Violation[] {
  const out: Violation[] = [];
  const tierRel = clientTierRel(clientRel);
  if (tierRel === undefined) {
    return out;
  }
  if (hasCallableExport(sf) && !hasMirrorTest(root, "client", clientRel)) {
    out.push({ file: `packages/client/src/${clientRel}`, line: 0, message: MSG_CLIENT });
  }
  if (clientRel.startsWith("state/") && isStoreFile(sf)) {
    out.push(...scanStoreActionPresence(root, clientRel, sf));
  }
  return out;
}

function scanUiTier(root: string, uiRel: string, sf: SourceFile): Violation[] {
  if (UI_LOGIC_GROUPS.some((g) => uiRel.startsWith(g)) && hasCallableExport(sf) && !hasDirTest(root, "ui", uiRel)) {
    return [{ file: `packages/ui/src/${uiRel}`, line: 0, message: MSG_UI }];
  }
  return [];
}

/** The fs+AST scan shared by the legacy Check and the single-pass `run` descriptor. */
function scanTestPresenceClient(root: string, project: Project): Violation[] {
  const out: Violation[] = [];
  let hasRealTreeAnchor = false;
  let hasWorstArtAnchor = false;
  for (const sf of project.getSourceFiles()) {
    const path = sf.getFilePath();
    hasRealTreeAnchor ||= path.endsWith(REAL_TREE_ANCHOR);
    if (sf.getBaseName() === "index.ts") {
      continue;
    }
    hasWorstArtAnchor ||= path.endsWith(WORST_ART_ANCHOR);
    const clientRel = relAfter(path, CLIENT_SRC);
    if (clientRel !== undefined) {
      out.push(...scanClientTier(root, clientRel, sf));
      continue;
    }
    const uiRel = relAfter(path, UI_SRC);
    if (uiRel !== undefined) {
      out.push(...scanUiTier(root, uiRel, sf));
    }
  }
  if ((hasRealTreeAnchor || hasWorstArtAnchor) && !existsSync(join(root, WORST_ART_STANDING_CT))) {
    out.push({ file: WORST_ART_STANDING_CT, line: 0, message: MSG_WORST_ART });
  }
  return out;
}

// The client/ui twin of test-presence: reconciles client/ui logic-bearing source (AST callable-export
// detection) against its mirror test (existsSync).
export const gate: GateDescriptor = {
  name: "test-presence-client",
  docRow: "core/Spine-Testing.md §5",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message: MSG_CLIENT,
  fix: "add the mirror test (tests/client/<rest> or the ui dir test) for the logic-bearing source file.",
  run: (ctx) => {
    for (const v of scanTestPresenceClient(ctx.root, ctx.project)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: {
        "packages/client/src/forms/editor/validate.ts": "export function validate(): boolean { return true; }\n",
        "tests/client/forms/editor/validate.dom.test-d.ts": "export {};\n",
      },
      expect: { messageIncludes: "has no test" },
      why: "a type-only test cannot substitute for runtime behavior coverage, even when its browser world is registered",
    },
    {
      files: {
        "packages/client/src/forms/editor/focus.ts": "export function focusInvalid(): void {}\n",
        "tests/client/forms/focus.ct.tsx": "export {};\n",
      },
      expect: { messageIncludes: "client data/forms/state primitive has no test" },
      why: "an editor-owned callable needs its current mirror; a test left under the former forms owner is not coverage",
    },
    {
      files: {
        "packages/client/src/data/use-thing.ts": "export const useThing = () => 1;\n",
      },
      why: "a logic-bearing client data hook with no mirror test — an untested surface (§5)",
    },
    {
      files: {
        [WORST_ART_ANCHOR]: "export function ChatRoomSurface(): null { return null; }\n",
      },
      expect: { messageIncludes: "standing DOM-derived worst-legal-art contrast CT" },
      why: "#883: the real room exists but its standing framebuffer contrast sweep is missing — presence must fail loud",
    },
    {
      files: { [REAL_TREE_ANCHOR]: "export {};\n" },
      expect: { messageIncludes: "standing DOM-derived worst-legal-art contrast CT" },
      why: "#883 stale arm: the independent real-tree anchor survives while the room source and standing CT are both absent — a coupled rename/delete must still fail loud",
    },
    {
      // clause B: a ui-logic module with NO test anywhere in its mirror dir.
      files: {
        "packages/ui/src/markdown/policy.ts": "export function build(): number {\n  return 1;\n}\n",
      },
      expect: { messageIncludes: "non-primitive @orb/ui logic module" },
      why: "clause B: a ui-logic module (markdown/policy) with no test in its mirror dir — fires (dir-level)",
    },
    {
      // clause C: a store action with a mirror .ct.tsx that never references it by name.
      files: {
        "packages/client/src/state/__g_gpresclient-store.ts":
          'import { createGatedStore } from "./create-gated-store";\n' +
          'const useX = createGatedStore<{ n: number }>("g-presclient", () => ({ n: 0 }));\n' +
          'export function gPresClientAction(): void {\n  useX.setState({ n: 1 }, false, "x/set");\n}\n' +
          "export function useGPresClient(): number {\n  return useX((s) => s.n);\n}\n",
        "tests/client/state/__g_gpresclient-store.ct.tsx": 'import { useGPresClient } from "@orb/client/state";\nexport const t = useGPresClient;\n',
      },
      expect: { messageIncludes: "gPresClientAction" },
      why: "clause C: the mirror exists but never calls gPresClientAction( by name — untested new action",
    },
    {
      // COMMENT POSTURE (issue #117/#132), clause C, the PERMISSIVE direction — the one that reinstates the
      // founding defect: a parked call in the mirror is not coverage.
      files: {
        "packages/client/src/state/__g_gprescomment-store.ts":
          'import { createGatedStore } from "./create-gated-store";\n' +
          'const useX = createGatedStore<{ n: number }>("g-prescomment", () => ({ n: 0 }));\n' +
          'export function gPresCommentAction(): void {\n  useX.setState({ n: 1 }, false, "x/set");\n}\n' +
          "export function useGPresComment(): number {\n  return useX((s) => s.n);\n}\n",
        "tests/client/state/__g_gprescomment-store.ct.tsx":
          'import { useGPresComment } from "@orb/client/state";\n// TODO drive it: gPresCommentAction();\nexport const t = useGPresComment;\n',
      },
      expect: { messageIncludes: "gPresCommentAction" },
      why: "COMMENT POSTURE: a COMMENTED-OUT action call in the mirror satisfied clause C to a file-text scan — which is the `shipped referenced by ZERO test file` defect the clause exists for, wearing a `//`. The mirror corpus is comment-blanked, so it still REDs",
    },
    {
      // STRING POSTURE (found lying 2026-08-24), clause C, the PERMISSIVE direction again: the mirror's ONLY
      // occurrence of the action name is inside a STRING LITERAL (a vitest description). Prose is not
      // coverage — the un-fixed matcher read the comment-blanked text and let the string bless the action.
      files: {
        "packages/client/src/state/__g_gpresstrlit-store.ts":
          'import { createGatedStore } from "./create-gated-store";\n' +
          'const useX = createGatedStore<{ n: number }>("g-presstrlit", () => ({ n: 0 }));\n' +
          'export function gPresStrLitAction(): void {\n  useX.setState({ n: 1 }, false, "x/set");\n}\n' +
          "export function useGPresStrLit(): number {\n  return useX((s) => s.n);\n}\n",
        "tests/client/state/__g_gpresstrlit-store.test.ts":
          'import { useGPresStrLit } from "@orb/client/state";\nexport const label = "calls gPresStrLitAction( when the panel opens";\nexport const t = useGPresStrLit;\n',
      },
      expect: { messageIncludes: "gPresStrLitAction" },
      why: "STRING POSTURE: an action name inside a string literal satisfied clause C to a comment-blanked text scan — the same `referenced by ZERO test` defect wearing quotes. Strings are blanked from the corpus, so it REDs",
    },
    {
      // #619 — THE FOUNDING SILENCE: a store mirrored as `.test.ts`. Clause C resolved `.ct.tsx` ONLY and
      // returned [] on a miss, so this shape reported CLEAN over an action referenced by zero test. 15 of
      // the tree's 34 stores were mirrored exactly this way.
      files: {
        "packages/client/src/state/__g_gpresdotts-store.ts":
          'import { createGatedStore } from "./create-gated-store";\n' +
          'const useX = createGatedStore<{ n: number }>("g-presdotts", () => ({ n: 0 }));\n' +
          'export function gPresDotTsAction(): void {\n  useX.setState({ n: 1 }, false, "x/set");\n}\n',
        "tests/client/state/__g_gpresdotts-store.test.ts": 'import { useX } from "@orb/client/state";\nexport const t = useX;\n',
      },
      expect: { messageIncludes: "gPresDotTsAction" },
      why: "#619: a `.test.ts`-mirrored store is JUDGED now — this exact shape was silently inert and reported clean on 15 stores",
    },
    {
      // #619 blindness tripwire: a mirror EXISTS but yields no corpus, so nothing could be judged. That must
      // REFUSE, never look like a clean pass.
      files: {
        "packages/client/src/state/__g_gpresempty-store.ts":
          'import { createGatedStore } from "./create-gated-store";\n' +
          'const useX = createGatedStore<{ n: number }>("g-presempty", () => ({ n: 0 }));\n' +
          'export function gPresEmptyAction(): void {\n  useX.setState({ n: 1 }, false, "x/set");\n}\n',
        "tests/client/state/__g_gpresempty-store.test.ts": "\n",
      },
      expect: { messageIncludes: "could not read ANY corpus" },
      why: "§4.6: a mirror that yields NO corpus leaves every action unjudged — the clause must say so, not report clean (the #619 class, generalized)",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/client/src/forms/editor/validate.ts": "export function validate(): boolean { return true; }\n",
        "tests/client/forms/editor/validate.dom.test.ts": "export {};\n",
        "packages/client/src/data/parse.ts": "export function parse(): boolean { return true; }\n",
        "tests/client/data/parse.contract.test.ts": "export {};\n",
      },
      why: "registered DOM and contract runtime tests satisfy their exact source mirrors without another suffix list",
    },
    {
      files: {
        "packages/client/src/forms/editor/focus.ts": "export function focusInvalid(): void {}\n",
        "tests/client/forms/editor/focus.ct.tsx": "export {};\n",
      },
      why: "an editor-owned callable with its exact CT mirror retains the same presence protection as a direct forms child",
    },
    {
      files: {
        "packages/client/src/data/use-thing.ts": "export const useThing = () => 1;\n",
        "tests/client/data/use-thing.test.ts": "export const t = 1;\n",
      },
      why: "the hook has its mirror .test.ts — presence satisfied, passes",
    },
    {
      files: {
        [WORST_ART_ANCHOR]: "export function ChatRoomSurface(): null { return null; }\n",
        [WORST_ART_STANDING_CT]: "export {};\n",
      },
      why: "#883: the standing worst-art CT exists beside the real room — presence satisfied",
    },
    {
      // clause A: a file with no callable export (plain value / barrel) is naturally skipped.
      files: {
        "packages/client/src/data/constants.ts": "export const X = 1;\n",
      },
      why: "clause A: a file with NO callable export (plain value) is not a logic surface — passes",
    },
    {
      // clause A: the nested buckets (data/bus, forms/editor/bound-fields) are excluded.
      files: {
        "packages/client/src/data/bus/apply-chat-bus-event.ts": "export function build(): number {\n  return 1;\n}\n",
        "packages/client/src/forms/editor/bound-fields/text-field.tsx": "export function build(): number {\n  return 1;\n}\n",
      },
      why: "clause A: nested buckets (data/bus, forms/editor/bound-fields) are deliberately excluded — passes",
    },
    {
      // clause B dir-level: a sibling test (different basename) in the mirror dir satisfies presence.
      files: {
        "packages/ui/src/markdown/policy.ts": "export function build(): number {\n  return 1;\n}\n",
        "packages/ui/src/markdown/to-plain-text.ts": "export function build(): number {\n  return 1;\n}\n",
        "tests/ui/markdown/markdown.ct.tsx": "export {};\n",
      },
      why: "clause B dir-level: a sibling test (different basename) in the mirror dir satisfies presence — passes",
    },
    {
      // bare primitives/ are covered by ui-primitive-structure's CT clause — not scanned here.
      files: {
        "packages/ui/src/primitives/button/button.tsx": "export function build(): number {\n  return 1;\n}\n",
      },
      why: "bare primitives/ are covered by ui-primitive-structure's CT clause — not scanned here, passes",
    },
    {
      // clause C: the mirror DOES call the action by name — covered, passes.
      files: {
        "packages/client/src/state/__g_gpresclientok-store.ts":
          'import { createGatedStore } from "./create-gated-store";\n' +
          'const useX = createGatedStore<{ n: number }>("g-presclientok", () => ({ n: 0 }));\n' +
          'export function gPresClientOkAction(): void {\n  useX.setState({ n: 1 }, false, "x/set");\n}\n' +
          "export function useGPresClientOk(): number {\n  return useX((s) => s.n);\n}\n",
        "tests/client/state/__g_gpresclientok-store.ct.tsx":
          'import { gPresClientOkAction, useGPresClientOk } from "@orb/client/state";\ngPresClientOkAction();\nexport const t = useGPresClientOk;\n',
      },
      why: "clause C: gPresClientOkAction( appears by name in the mirror — covered, passes",
    },
    {
      // STRING POSTURE's declared limit: a REAL call inside a template INTERPOLATION is code, not prose —
      // the `${…}` expression spans survive the string blanking, so this stays covered.
      files: {
        "packages/client/src/state/__g_gprestpl-store.ts":
          'import { createGatedStore } from "./create-gated-store";\n' +
          'const useX = createGatedStore<{ n: number }>("g-prestpl", () => ({ n: 0 }));\n' +
          'export function gPresTplAction(): number {\n  useX.setState({ n: 1 }, false, "x/set");\n  return 1;\n}\n',
        "tests/client/state/__g_gprestpl-store.test.ts": [
          "export const t = `drove ",
          "${gPresTplAction()}",
          " write`;\ndeclare function gPresTplAction(): number;\n",
        ].join(""),
      },
      why: "STRING POSTURE limit: a real `gPresTplAction()` call interpolated inside a template literal is CODE — the blanking keeps interpolation spans, so clause C still counts it and passes",
    },
    {
      // clause C: a state/*.ts file that mints NO store (no factory call) is out of clause C's scope
      // entirely — e.g. chat-handle.ts's pure constructors, never gated as store actions.
      files: {
        "packages/client/src/state/__g_purehandle.ts": 'export function gPureBuild(): { kind: "x" } {\n  return { kind: "x" };\n}\n',
        "tests/client/state/__g_purehandle.ct.tsx": "export {};\n",
      },
      why: "clause C: no store-factory call in the file — not a store, out of clause C's scope, passes",
    },
  ],
};
