// Policy: test-presence-client (docs/law/Spine-Testing.md §5) — the `@orb/client` + non-primitive `@orb/ui`
// reach `test-presence` lacks. §5's rule is that a test is required where an untested change silently
// breaks behavior DOWNSTREAM, not blanket per-file coverage, so the policy has three clauses:
//   A. a client `data/` `forms/` `forms/editor/` `state/` DIRECT child with a callable export needs a
//      per-file mirror test (each is composed independently by every feature);
//   B. a non-primitive `@orb/ui` logic group needs ANY test in its mirror DIRECTORY (a group is exercised
//      as a unit — bare `primitives/` are covered by `ui-primitive-structure`'s CT clause);
//   C. a mirror EXISTING is not presence for a NEW action — every action exported by a `state/*.ts` file
//      that MINTS a store must appear BY NAME, as a CALL, in its mirror test of EITHER kind (plus the
//      shared `_ct-stories.tsx`). Learned the hard way: `revealContextPanel`, `selectPresetFromList`,
//      `__dismissPresetSectionForTest` and `selectWorldBookFromList` all shipped referenced by ZERO test.
// Plus the clause-C unreadable-corpus tripwire (#619) and the standing worst-legal-art contrast CT (#883).
//
// CLAUSE C WAS SILENTLY INERT ON 15 OF 34 STORES UNTIL #619. It resolved the mirror as `.ct.tsx` ONLY and
// returned `[]` when that path did not exist — so every store whose mirror is a `.test.ts` was never judged
// and the gate reported CLEAN. The header asserted "every existing state store mirror is a .ct.tsx, never a
// .test.ts"; that was FALSE by 15 files. It resolves over the SHARED `TEST_KINDS` vocabulary (one home with
// clause A) and REFUSES LOUDLY when a mirror exists that it could not read.
//
// FAMILY `mirror-index` — the SHARED SUBJECT READER is `ops/resource-mirror.ts` `loadMirrorIndex` via the
// `mirrorIndex` host door. Siblings: `test-layout` (the test corpus' own homes) and `test-presence`
// (server/contracts). `contract/resource-mirror.ts:17-18` publishes `testsByDirectory` because THIS policy
// "needs the LISTING of one mirror directory" — the kind was designed around clause B.
//
// POPULATION PORT — legacy at 6b1d01be0 (the parent of the conversion commit aecbc6c6c), a `GateDescriptor` with
// `scopeSafety: "whole-project"` and `fsBacked: true`. The legacy corpus was
// `project.getSourceFiles()` filtered by `path.indexOf("/packages/client/src/")` /
// `"/packages/ui/src/"` with `sf.getBaseName() === "index.ts"` skipped — i.e. the harness globs ∩ those two
// roots, minus every `index.ts`. The final expression is
// `population: { in: ["@client", "@ui"], notNamed: ["index.ts"] }`, which is the same set by construction
// (`POPULATION_ROOTS["@client"] = packages/client/src/`, `["@ui"] = packages/ui/src/`). The four filesystem
// reads move to declared doors, each with a deliberate delta:
//   `existsSync(tests/client/<rel><kind>)`          → `mirrorIndex("package-test").testFiles`
//   `readdirSync(tests/ui/<dir>)`                   → `.testsByDirectory`
//   `readFileSync(<mirror>)` + `_ct-stories.tsx`    → the `authored-text` DEMAND door
//   the two real-tree anchors (`fileLoaded`-style)  → `.sourceFiles` membership
// Deltas: (1) a mirror under a non-authored segment (`node_modules`, `.git`, `dist`, `.cache`) or behind a
// symlink is no longer read as a mirror — the authored reader refuses both, where `existsSync` accepted
// them; (2) findings anchor at `line: 1, column: 1` rather than the legacy synthetic `line: 0`; (3) the
// #883 arm's anchor MOVED (see below); (4) the legacy `CLIENT_EXCLUDE_NESTED` list was DELETED as dead
// decoration — the direct-child test already rejects every member, so no fixture could cross it (§4.1
// MUTUALLY REDUNDANT, measured; `clientTierRel`'s own comment carries the receipt). Nothing else: the
// clauses, their order, their remaining vocabulary and their messages are unchanged.
//
// THE #883 ANCHOR MOVE, and it is the one non-mechanical thing in this conversion. The legacy arm reported
// "the standing CT is missing" AT the missing CT's own path. `ctx.report.file` REFUSES a path outside the
// effective population, and a file that does not exist is in no population — so that arm becomes a runtime
// THROW on conversion (guide §2.1, "an absence verdict cannot anchor on its own subject"). It now consumes
// `lib/absent-subject-anchor.ts` `subjectAnchor`: anchor on the CT when present, else on the first present
// named subject (the room source, then the client entry), else on the lowest admitted path — with the
// missing filename in the MESSAGE, where it was always the load-bearing half. §4.6 category 6 (ANCHOR
// MOVE) owes a marker receipt; the live `@orb-gate-ignore test-presence-client` census is ZERO measured
// with a planted positive control, so nothing binds to the old position and nothing is orphaned
// (RE-MEASURED 2026-09-13 at `5045a6a68`: the planted control was found, the corpus holds no other hit).
//
// §4.6 DIFFERENTIAL — RECORDED 2026-09-13 (#2273), AND IT IS A POPULATION + OUTCOME RECEIPT, NOT CATCH
// PARITY. `aecbc6c6c` landed a population/refusal receipt and no findings comparison for this policy:
//   · FINDINGS. FINAL side through `runPolicyPass` over the real workspace at `5045a6a68`: 0 findings,
//     owner `success`. The LEGACY side was never EXECUTED for findings, so this is guide §6.4 VACUITY
//     SHAPE 1 and is NOT closable by rule; the fixture-level replay is what would close it. The port is
//     also not 1:1 — `CLIENT_EXCLUDE_NESTED` and `CLIENT_EXCLUDE_FILES` were deleted (above), which the
//     §4.1 rows carry from the other side.
//   · POPULATION. `{ in: ["@client", "@ui"], notNamed: ["index.ts"] }` = the legacy corpus by construction;
//     resource members on the real tree: `mirror-index:package-test` 6525 (`unresolved` 0) and
//     `authored-text#1` 46 demanded paths — the store corpus plus the stories module.
//   · TOOL ERRORS. 0 on the final side; the legacy `existsSync` arms could emit none by construction.
//
// AUTHORITY `hard`; SEVERITY `error`. The #2346 TEMPORARY WARNING POSTURE IS CLOSED OUT (owner ruling
// 2026-09-19, #2377) on the rollout's own closeout condition — restore hard/error, drop the temporary
// `workItem`, mint no marker or grant path — and it cost nothing: this policy measured ZERO findings on the
// tree it was restored on. The legacy gate declared no `ExemptionTable`,
// no baseline and no marker grammar — its
// `CLIENT_EXCLUDE_FILES` list (DELETED at #2103, below) and its surviving `UI_LOGIC_GROUPS` list were
// POPULATION VOCABULARY, not grants — and every finding is FILE-anchored with no position token, so under
// this contract no ordinary door exists BY CONSTRUCTION. Findings are effective, unwaived, and blocking by
// default rather than only under `--fail-on-warnings`. The unreadable-corpus REFUSAL control the rollout
// added is not part of the temporary posture and stays (clause C, below).
//
// WHERE A BROKEN RESOURCE REFUSES. A non-ready declared resource makes
// `resolveResourceDeclarations` THROW at the POPULATION phase and the owner is withheld before `create`
// runs (§3); this module owns no not-ready branch and reads through `readyResourceValue`. Clause C also
// refuses during EVALUATION when its declared mirror paths yield no readable corpus, because action
// coverage cannot be judged from empty bytes. The family
// `runPolicyPass` controls retain the full runtime outcome beyond refusal-text matching: an absent mirror
// produces no findings, a named population-phase tool error, an incomplete owner, and this policy withheld;
// the evaluation-refusal row likewise produces no findings and withholds the owner. The healthy twin pins
// both the mirror receipt and per-call `authored-text` receipt (§6.3).
//
// DECLARED LIMIT ON THE `authored-text` DECLARATION (#2130): it has NO pinnable non-ready status, and the
// reason is structural rather than an unwritten test. Every subject this policy demands comes out of
// `mirror.testFiles` — a store's own mirrors, the stories module when it is a live member, else the lowest
// test-space member — and the mirror walk READS THE BYTES of every member it indexes
// (`ops/resource-reader.ts` `fileEntry`), so a subject that is absent, symlinked or unreadable has already
// refused the whole `mirror-index` declaration at the POPULATION phase, before the demand door is reached.
// The door's own zero-path refusal is equally out of reach: `evaluate` always passes at least one path.
//
// DECLARED LIMITS, each naming the row that holds it: a NESTED bucket (`data/bus/`,
// `forms/editor/bound-fields/`) is not a direct child of any owner and keeps its shared CT home
// (`mustPass[5]`, the direct-child fence); bare `primitives/` belong to `ui-primitive-structure`
// (`mustPass[8]`).
//
// FOUR NARROWINGS WENT UNHELD UNTIL 2026-09-12 AND NOW CARRY ROWS (#2133, cut one at a time and measured):
// the `notNamed: ["index.ts"]` population fence (`mustPass[14]` — the fixture carries a SECOND, admitted
// client file, because a population falsifier that admits nothing comes back a tool error rather than a
// finding), clause C's `TYPE_ARGS` span (`mustPass[15]`, the generic-call shape whose absence would have
// shipped four false REDs at #619 and which nothing was proving), `hasDirTest`'s registered-kind filter
// (`mustFlag[11]` — a mirror directory holding ONLY a type test is not dir-level presence) and clause C's
// `use*` exclusion on the CONST arm (`mustPass[16]`; `mustFlag[6]`'s count held only the function-decl
// twin).
//
// THE `data/trpc.ts` EXCLUSION IS GONE, AND ITS STATED REASON WAS FALSE (#2103, 2026-09-12). A
// `CLIENT_EXCLUDE_FILES` list subtracted that ONE file by name from a population it otherwise belongs to
// (it IS a direct child of the included `data/` home), on the ground that its two exports were "thin
// `@trpc/client` constructors with no bespoke logic of their own to unit-test in isolation". The file
// refutes that in four places — a `splitLink` condition routing subscriptions away from the batch branch,
// a CSRF header attached to every non-subscription request (the server 403s a cookie-authed mutation
// without it), a two-armed `loggerLink.enabled` predicate, and a `TRPC_URL` default mirroring the server's
// own mount path — so the subtraction was §12.5's named ban (a sanctioned implementation home surviving as
// a `notUnder`-shaped exclusion) resting on a premise its own subject contradicts.
//
// AND NOTHING RED WHEN IT ROTTED, which is the half a proof row cannot cover: `mustPass[7]` pinned that the
// exclusion BITES, never that it was still EARNED — no arm fired if `data/trpc.ts` disappeared or grew
// bespoke logic. **A `mustPass` proves the fence bites, never that the exemption is still earned.** The
// disposition is the fix rather than a grant: `tests/client/data/trpc.test.ts` now pins the three wire
// behaviours a node lane can reach, and the file is judged by clause A like every other direct child. No
// path key was carried forward.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `test-presence-client` descriptor at 6b1d01be054c113c68595540f3a6a28c9f7d1744, the parent of the conversion
// `aecbc6c6c` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The legacy
// descriptor had no `scanRoot`, so its effective population is its in-run path filter —
// `CLIENT_SRC = "/packages/client/src/"`, `UI_SRC = "/packages/ui/src/"`, `sf.getBaseName() === "index.ts"` skipped.
// Over the SAME 7,487 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`) it
// admits 1,555 and the final `population` admits 1,555 (the bare harness dispatch was 7,487). legacy − final = ∅.
// final − legacy = ∅. Controls: inside `packages/client/src/agent-nav/__cbbhr_in_panel-request.ts` (virtual) admitted
// by both; outside `packages/client/src/agent-handles/__cbbhr_out/index.ts` rejected by both.
import { dirname } from "node:path";
import type { SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import { classifyTestFilename, TEST_KIND_DEFINITIONS } from "../../_shared/test-kinds.ts";
import { defineGate } from "../contract/policy.ts";
import type { MirrorIndex } from "../contract/resource-mirror.ts";
import { subjectAnchor } from "../lib/absent-subject-anchor.ts";
import { blankTsCommentsAndStringsInText, codeTextForScan } from "../lib/comment-spans.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const CLIENT_SRC = "packages/client/src/";
const UI_SRC = "packages/ui/src/";
const EXT_RE = /\.tsx?$/u;
const STATE_STORE_FACTORY_RE = /\b(?:createGatedStore|createPersistedStore|createEntityDraftStore)(?:<[^(]*>)?\(/u;
// Direct children of these source owners compose independently; bound fields retain their shared CT home.
const CLIENT_MIRROR_HOMES = ["data/", "forms/", "forms/editor/", "state/"];
// Non-primitive @orb/ui logic groups (primitives/ are covered by ui-primitive-structure's CT clause).
const UI_LOGIC_GROUPS = ["charts/", "markdown/", "stream/", "content/", "code-editor/", "diff/", "fuzzy-search/"];
const TEST_KINDS = TEST_KIND_DEFINITIONS.filter(({ family, mirror }) => family !== "type" && mirror === "module").map(({ suffix }) => suffix);
const CLIENT_ENTRY_ANCHOR = "packages/client/src/index.ts";
const WORST_ART_ANCHOR = "packages/client/src/features/chat/surfaces/chat-room-surface.tsx";
const WORST_ART_STANDING_CT = "tests/client/features/chat/surfaces/worst-legal-art-contrast.suite.ct.tsx";
const STORE_STORIES = "tests/client/state/_ct-stories.tsx";

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
  "clause C could not read ANY corpus from this store's mirror, even though a mirror test EXISTS — so its actions went UNJUDGED and a ✓ here would be a lie about coverage this gate does not have (issue #619). Either the mirror is empty, or its kind is not registered in tooling/src/_shared/test-kinds.ts — fix the shared vocabulary, never special-case it here.";
/** The missing filename rides the MESSAGE because the finding cannot anchor on an absent subject. */
const MSG_WORST_ART = `the standing DOM-derived worst-legal-art contrast CT is missing — restore ${WORST_ART_STANDING_CT}. The room's rendered text population must stay sampled across shipped and custom theme polarities (issue #883).`;

interface Finding {
  readonly file: string;
  readonly message: string;
}

/** A store-file fact collected on the walk and judged in `evaluate`, once the mirror text has arrived. */
interface StoreSubject {
  readonly rel: string;
  readonly actions: readonly string[];
  readonly mirrors: readonly string[];
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

// Clause C — the mirror text must reference every action BY NAME (boundary-anchored, not a substring of a
// longer identifier). A call may carry EXPLICIT TYPE ARGUMENTS between the name and the paren —
// `createGatedStore<CounterState>(` — and a bare `NAME\(` matcher is blind to every one of them. That
// blindness was INVISIBLE until #619 widened clause C: four `create-*` mirrors that genuinely DO exercise
// their factory (generically) reported as untested, which would have shipped four false REDs on a live
// gate. One nesting level of generics is covered (`<Map<string, number>>`), and parens are excluded from
// the type-argument span so the pattern cannot run away across a line into an unrelated call.
const TYPE_ARGS = String.raw`(?:\s*<[^<>()]*(?:<[^<>()]*>)?[^<>()]*>)?`;

function actionReferencedInMirror(mirrorText: string, action: string): boolean {
  return new RegExp(`(?:[^\\w]|^)${action}${TYPE_ARGS}\\s*\\(`, "u").test(mirrorText);
}

/** Clause A — a DIRECT child of a client owner (`data/x.ts`, `forms/editor/x.ts`). There is no per-file
 *  exclusion list: the one row it ever held was deleted at #2103 (see the header) and a future one is a
 *  central reviewed grant, never a name in this module.
 *
 *  THE LEGACY `CLIENT_EXCLUDE_NESTED` LIST WAS DELETED AT THE CONVERSION, as dead decoration rather than as
 *  a behaviour change (§4.1's MUTUALLY REDUNDANT class, the `server-layout` / `ui-exports-map-complete`
 *  precedent). It named `data/bus/` and `forms/editor/bound-fields/`, and the DIRECT-CHILD test below
 *  already rejects both: `data/bus/apply-chat-bus-event.ts` leaves `bus/apply-chat-bus-event.ts` after the
 *  `data/` home, and `forms/editor/bound-fields/text-field.tsx` leaves a slash-bearing remainder after BOTH
 *  the `forms/` and `forms/editor/` homes. Measured at the conversion: cutting the two lists TOGETHER killed
 *  only the `CLIENT_EXCLUDE_FILES` row — no fixture can cross the nested list, so it read like a guarantee
 *  and enforced nothing. That row is gone too (#2103), and `mustPass[5]` names the direct-child fence,
 *  which its own cut reddens. */
function clientTierRel(rel: string): string | undefined {
  return CLIENT_MIRROR_HOMES.some((home) => rel.startsWith(home) && !rel.slice(home.length).includes("/")) ? rel : undefined;
}

/** Clause A's mirror question, and clause C's mirror ENUMERATION, off ONE membership set — the #619
 *  divergence made structural: the two clauses cannot disagree about what a mirror IS. */
function mirrorsFor(tests: ReadonlySet<string>, pkg: string, rel: string): readonly string[] {
  const base = `tests/${pkg}/${rel.replace(EXT_RE, "")}`;
  return TEST_KINDS.map((kind) => `${base}${kind}`).filter((path) => tests.has(path));
}

// Clause B — dir-level presence: ANY test file in the module's mirror directory (a ui-logic group is
// exercised as a unit, often under a different basename — a helper via its component's CT, a builder
// via a sibling snap/option test).
function hasDirTest(mirror: MirrorIndex, pkg: string, rel: string): boolean {
  const members = mirror.testsByDirectory.get(`tests/${pkg}/${dirname(rel)}`) ?? [];
  return members.some((path) => {
    const kind = classifyTestFilename(path.slice(path.lastIndexOf("/") + 1))?.definition;
    return kind !== undefined && kind.family !== "type" && kind.mirror !== "e2e-only";
  });
}

/** What one walk accumulates: clause A/B findings and the clause-C subjects judged after the text lands. */
interface Collected {
  readonly findings: Finding[];
  readonly stores: StoreSubject[];
}

/** Clause A + the clause-C COLLECTION pass, for one client source file. */
function visitClient(mirror: MirrorIndex, rel: string, sourceFile: SourceFile, into: Collected): void {
  const { findings, stores } = into;
  if (clientTierRel(rel) === undefined) {
    return;
  }
  const mirrors = mirrorsFor(mirror.testFiles, "client", rel);
  if (hasCallableExport(sourceFile) && mirrors.length === 0) {
    findings.push({ file: `${CLIENT_SRC}${rel}`, message: MSG_CLIENT });
  }
  if (rel.startsWith("state/") && isStoreFile(sourceFile)) {
    stores.push({ rel, actions: storeActionNames(sourceFile), mirrors });
  }
}

/** Clause B, for one `@orb/ui` source file. */
function visitUi(mirror: MirrorIndex, rel: string, sourceFile: SourceFile, findings: Finding[]): void {
  if (UI_LOGIC_GROUPS.some((group) => rel.startsWith(group)) && hasCallableExport(sourceFile) && !hasDirTest(mirror, "ui", rel)) {
    findings.push({ file: `${UI_SRC}${rel}`, message: MSG_UI });
  }
}

/** Clause C, once the demanded mirror text has arrived. The corpus is comment- AND string-blanked: a
 *  COMMENTED-OUT `revealContextPanel(` call is the founding "referenced by ZERO test" defect wearing a
 *  `//`, and a vitest description `it("calls revealContextPanel( …")` is the same defect wearing quotes
 *  (found lying 2026-08-24). Template INTERPOLATIONS survive the blanking, so a real call inside `${…}`
 *  still counts. */
function judgeStores(stores: readonly StoreSubject[], texts: ReadonlyMap<string, string>, findings: Finding[]): void {
  const stories = texts.get(STORE_STORIES) ?? "";
  for (const store of stores) {
    if (store.mirrors.length === 0) {
      // No mirror at all — clause A's violation, already reported. Silent here on purpose (not a skip).
      continue;
    }
    const file = `${CLIENT_SRC}${store.rel}`;
    const mirrorText = store.mirrors.map((path) => texts.get(path) ?? "").join("");
    if (mirrorText.trim() === "") {
      throw new Error(MSG_STATE_UNREADABLE);
    }
    const corpus = mirrorText + stories;
    for (const action of store.actions) {
      if (!actionReferencedInMirror(corpus, action)) {
        findings.push({ file, message: MSG_STATE_ACTION(action) });
      }
    }
  }
}

/** #883, RE-ANCHORED: the standing CT is an ABSENCE verdict, so it cannot report at its own path. */
function judgeWorstArt(mirror: MirrorIndex, reportable: ReadonlySet<string>, findings: Finding[]): void {
  const armed = mirror.sourceFiles.has(WORST_ART_ANCHOR) || mirror.sourceFiles.has(CLIENT_ENTRY_ANCHOR);
  if (!armed || mirror.testFiles.has(WORST_ART_STANDING_CT)) {
    return;
  }
  const anchor = subjectAnchor(reportable, [WORST_ART_STANDING_CT, WORST_ART_ANCHOR, CLIENT_ENTRY_ANCHOR]);
  findings.push({ file: anchor(WORST_ART_STANDING_CT), message: MSG_WORST_ART });
}

export const gate = defineGate({
  id: "test-presence-client",
  family: "mirror-index",
  authority: "hard",
  severity: "error",
  population: { in: ["@client", "@ui"], notNamed: ["index.ts"] },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "mirror-index", id: "package-test" }, { kind: "authored-text" }],
  message: MSG_CLIENT,
  fix: "add the mirror test (tests/client/<rest> or the ui dir test) for the logic-bearing source file.",
  create: (ctx) => {
    const collected: Collected = { findings: [], stores: [] };
    const { findings, stores } = collected;
    return {
      evaluate: () => {
        const mirror = readyResourceValue(ctx.resources.mirrorIndex("package-test"));
        for (const sourceFile of ctx.files) {
          const rel = ctx.relativePath(sourceFile);
          if (rel.startsWith(CLIENT_SRC)) {
            visitClient(mirror, rel.slice(CLIENT_SRC.length), sourceFile, collected);
            continue;
          }
          if (rel.startsWith(UI_SRC)) {
            visitUi(mirror, rel.slice(UI_SRC.length), sourceFile, findings);
          }
        }
        // The DEMAND door is called on EVERY run: an unconsumed declaration is a receipt-phase refusal
        // (`lib/resource-policy.ts` `acceptDemand` credits consumption only on a READY fact), and the door
        // itself refuses a ZERO-path demand. So a corpus carrying no store at all still demands ONE path —
        // the lowest test-space member. Same shape as `tooling-instrument-proof`'s blind-registry arm,
        // which demands one selector before it returns. The stories module joins the corpus only when it is
        // a live member (Spine-Testing §7 — "CT only mounts from a non-test module").
        //
        // THE LOWEST MEMBER IS TAKEN AS A SLICE, NOT AS A DEFAULTED ELEMENT (#2280). A `lowestTest ??
        // STORE_STORIES` fallback stood here and was UNREACHABLE by the guarantee its own comment asserted:
        // `mirror.testFiles` is empty only when the test space is empty, and that refuses one phase earlier
        // (`ops/resource-mirror.ts` — `testFiles.length === 0` → status `empty`, so `readyResourceValue`
        // never returns and `create` never runs; the refusal is driven in `mirror-index-family.suite.test.ts`).
        // §4.1 deletes an unreachable clause rather than documenting it, and the slice is the TOTAL
        // expression that needs none: were that guarantee ever withdrawn, an empty demand is the door's own
        // named refusal rather than a silently substituted subject.
        const demanded = [...new Set(stores.flatMap(({ mirrors }) => mirrors))];
        if (mirror.testFiles.has(STORE_STORIES)) {
          demanded.push(STORE_STORIES);
        }
        const subjects = demanded.length > 0 ? demanded.toSorted() : [...mirror.testFiles].toSorted().slice(0, 1);
        const corpus = readyResourceValue(ctx.resources.authoredText(subjects));
        judgeStores(stores, new Map(corpus.files.map(({ path, text }) => [path, blankTsCommentsAndStringsInText(text)])), findings);
        judgeWorstArt(mirror, new Set(ctx.resourcePaths), findings);
        for (const finding of findings) {
          ctx.report.file(finding.file, { line: 1, column: 1, message: finding.message });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "resource",
      files: {
        "packages/client/src/forms/editor/validate.ts": "export function validate(): boolean {\n  return true;\n}\n",
        "tests/client/forms/editor/validate.dom.test-d.ts": "export {};\n",
        [WORST_ART_ANCHOR]: "export function ChatRoomSurface(): null {\n  return null;\n}\n",
        [WORST_ART_STANDING_CT]: "export {};\n",
      },
      expect: { count: 1, messageIncludes: "has no test" },
      why: "a type-only test cannot substitute for runtime behavior coverage, even when its browser world is registered",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/forms/editor/focus.ts": "export function focusInvalid(): void {}\n",
        "tests/client/forms/focus.ct.tsx": "export {};\n",
        [WORST_ART_ANCHOR]: "export function ChatRoomSurface(): null {\n  return null;\n}\n",
        [WORST_ART_STANDING_CT]: "export {};\n",
      },
      expect: { count: 1, messageIncludes: "client data/forms/state primitive has no test" },
      why: "an editor-owned callable needs its current mirror; a test left under the former forms owner is not coverage",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/data/use-thing.ts": "export const useThing = () => 1;\n",
        "tests/client/data/other.test.ts": "export const t = 1;\n",
        [WORST_ART_ANCHOR]: "export function ChatRoomSurface(): null {\n  return null;\n}\n",
        [WORST_ART_STANDING_CT]: "export {};\n",
      },
      expect: { count: 1, messageIncludes: "client data/forms/state primitive has no test" },
      why: "a logic-bearing client data hook with no mirror test — an untested surface (§5). The sibling test in the same DIRECTORY does not satisfy clause A, which is per-FILE",
    },
    {
      mode: "resource",
      files: {
        [WORST_ART_ANCHOR]: "export function ChatRoomSurface(): null {\n  return null;\n}\n",
        "tests/client/features/chat/surfaces/chat-room-surface.ct.tsx": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "standing DOM-derived worst-legal-art contrast CT" },
      why: "#883: the real room exists but its standing framebuffer contrast sweep is missing — presence must fail loud. THE ANCHOR MOVE: the finding reports at the ROOM (present, in population), never at the absent CT",
    },
    {
      mode: "resource",
      files: {
        [CLIENT_ENTRY_ANCHOR]: "export {};\n",
        "packages/client/src/data/parse.ts": "export function parse(): boolean {\n  return true;\n}\n",
        "tests/client/data/parse.test.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "standing DOM-derived worst-legal-art contrast CT" },
      why: "#883 stale arm: the independent client-entry anchor survives while the room source and the standing CT are both absent — a coupled rename/delete must still fail loud, and with the room gone the anchor falls through to the SECOND named subject",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/markdown/policy.ts": "export function build(): number {\n  return 1;\n}\n",
        "packages/client/src/data/parse.ts": "export const parse = 1;\n",
        "tests/client/data/parse.test.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "non-primitive @orb/ui logic module" },
      why: "clause B: a ui-logic module (markdown/policy) with no test in its mirror dir — fires (dir-level)",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/state/gpresclient-store.ts":
          'import { createGatedStore } from "./create-gated-store";\n' +
          'const useX = createGatedStore<{ n: number }>("g-presclient", () => ({ n: 0 }));\n' +
          'export function gPresClientAction(): void {\n  useX.setState({ n: 1 }, false, "x/set");\n}\n' +
          "export function useGPresClient(): number {\n  return useX((s) => s.n);\n}\n",
        "tests/client/state/gpresclient-store.ct.tsx": 'import { useGPresClient } from "@orb/client/state";\nexport const t = useGPresClient;\n',
      },
      expect: { count: 1, messageIncludes: "gPresClientAction" },
      why: "clause C: the mirror exists but never calls gPresClientAction( by name — untested new action",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/state/gprescomment-store.ts":
          'import { createGatedStore } from "./create-gated-store";\n' +
          'const useX = createGatedStore<{ n: number }>("g-prescomment", () => ({ n: 0 }));\n' +
          'export function gPresCommentAction(): void {\n  useX.setState({ n: 1 }, false, "x/set");\n}\n' +
          "export function useGPresComment(): number {\n  return useX((s) => s.n);\n}\n",
        "tests/client/state/gprescomment-store.ct.tsx":
          'import { useGPresComment } from "@orb/client/state";\n// TODO drive it: gPresCommentAction();\nexport const t = useGPresComment;\n',
      },
      expect: { count: 1, messageIncludes: "gPresCommentAction" },
      why: "COMMENT POSTURE: a COMMENTED-OUT action call in the mirror satisfied clause C to a file-text scan — which is the `shipped referenced by ZERO test file` defect the clause exists for, wearing a `//`. The mirror corpus is comment-blanked, so it still REDs",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/state/gpresstrlit-store.ts":
          'import { createGatedStore } from "./create-gated-store";\n' +
          'const useX = createGatedStore<{ n: number }>("g-presstrlit", () => ({ n: 0 }));\n' +
          'export function gPresStrLitAction(): void {\n  useX.setState({ n: 1 }, false, "x/set");\n}\n' +
          "export function useGPresStrLit(): number {\n  return useX((s) => s.n);\n}\n",
        "tests/client/state/gpresstrlit-store.test.ts":
          'import { useGPresStrLit } from "@orb/client/state";\nexport const label = "calls gPresStrLitAction( when the panel opens";\nexport const t = useGPresStrLit;\n',
      },
      expect: { count: 1, messageIncludes: "gPresStrLitAction" },
      why: "STRING POSTURE: an action name inside a string literal satisfied clause C to a comment-blanked text scan — the same `referenced by ZERO test` defect wearing quotes. Strings are blanked from the corpus, so it REDs",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/state/gpresdotts-store.ts":
          'import { createGatedStore } from "./create-gated-store";\n' +
          'const useX = createGatedStore<{ n: number }>("g-presdotts", () => ({ n: 0 }));\n' +
          'export function gPresDotTsAction(): void {\n  useX.setState({ n: 1 }, false, "x/set");\n}\n',
        "tests/client/state/gpresdotts-store.test.ts": 'import { useX } from "@orb/client/state";\nexport const t = useX;\n',
      },
      expect: { count: 1, messageIncludes: "gPresDotTsAction" },
      why: "#619 — THE FOUNDING SILENCE: a `.test.ts`-mirrored store is JUDGED now. Clause C resolved `.ct.tsx` ONLY and returned [] on a miss, so this exact shape reported CLEAN over an action referenced by zero test, on 15 of the tree's 34 stores",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/markdown/policy.ts": "export function build(): number {\n  return 1;\n}\n",
        "tests/ui/markdown/markdown.test-d.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "non-primitive @orb/ui logic module" },
      why: "THE REGISTERED-KIND FILTER inside `hasDirTest` (#2133): clause B is dir-level, which is exactly why the KIND still has to be a runtime one — a mirror directory holding only a `.test-d.ts` proves types, never that the group runs. Cutting the filter counts any member and this row goes silent, the same shape `mustFlag[0]` holds for clause A's per-file question",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: {
        "packages/client/src/state/gpresempty-store.ts":
          'import { createGatedStore } from "./create-gated-store";\n' +
          'const useX = createGatedStore<{ n: number }>("g-presempty", () => ({ n: 0 }));\n' +
          'export function gPresEmptyAction(): void {\n  useX.setState({ n: 1 }, false, "x/set");\n}\n',
        "tests/client/state/gpresempty-store.test.ts": "\n",
      },
      expect: { messageIncludes: "could not read ANY corpus" },
      why: "§4.6: a mirror that yields no readable corpus leaves every action unjudged, so clause C refuses evaluation instead of reporting debt or a clean result",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        "packages/client/src/forms/editor/validate.ts": "export function validate(): boolean {\n  return true;\n}\n",
        "tests/client/forms/editor/validate.dom.test.ts": "export {};\n",
        "packages/client/src/data/parse.ts": "export function parse(): boolean {\n  return true;\n}\n",
        "tests/client/data/parse.contract.test.ts": "export {};\n",
      },
      why: "registered DOM and contract runtime tests satisfy their exact source mirrors without another suffix list",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/forms/editor/focus.ts": "export function focusInvalid(): void {}\n",
        "tests/client/forms/editor/focus.ct.tsx": "export {};\n",
      },
      why: "an editor-owned callable with its exact CT mirror retains the same presence protection as a direct forms child",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/data/use-thing.ts": "export const useThing = () => 1;\n",
        "tests/client/data/use-thing.test.ts": "export const t = 1;\n",
      },
      why: "the hook has its mirror .test.ts — presence satisfied, passes",
    },
    {
      mode: "resource",
      files: {
        [WORST_ART_ANCHOR]: "export function ChatRoomSurface(): null {\n  return null;\n}\n",
        [WORST_ART_STANDING_CT]: "export {};\n",
      },
      why: "#883: the standing worst-art CT exists beside the real room — presence satisfied",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/data/constants.ts": "export const X = 1;\n",
        "tests/client/data/other.test.ts": "export const t = 1;\n",
      },
      why: "clause A: a file with NO callable export (plain value) is not a logic surface — passes. THE CALLABLE NARROWING: replacing `hasCallableExport` with `true` reds exactly this row",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/data/bus/apply-chat-bus-event.ts": "export function build(): number {\n  return 1;\n}\n",
        "packages/client/src/forms/editor/bound-fields/text-field.tsx": "export function build(): number {\n  return 1;\n}\n",
        "tests/client/data/other.test.ts": "export const t = 1;\n",
      },
      why: 'clause A: a nested bucket (data/bus, forms/editor/bound-fields) is not a DIRECT child of any client owner, so it keeps its shared CT home — passes. THE DIRECT-CHILD FENCE: dropping `!rel.slice(home.length).includes("/")` reds exactly this row, with two findings',
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/markdown/policy.ts": "export function build(): number {\n  return 1;\n}\n",
        "packages/ui/src/markdown/to-plain-text.ts": "export function build(): number {\n  return 1;\n}\n",
        "tests/ui/markdown/markdown.ct.tsx": "export {};\n",
      },
      why: "clause B dir-level: a sibling test (different basename) in the mirror dir satisfies presence — passes",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/data/trpc.ts": "export const createTrpcClient = () => 1;\n",
        "tests/client/data/trpc.test.ts": "export const t = 1;\n",
      },
      why: "`data/trpc.ts` IS an ordinary direct child of the `data/` home and is satisfied by its OWN mirror — the successor to the deleted `CLIENT_EXCLUDE_FILES` row (#2103). The polarity is the whole point: the old row passed because the file was SUBTRACTED (a sibling mirror at `other.test.ts` was enough), this one passes because the file is JUDGED and answers. Rename the mirror here and it reds, which the subtracted version could never do",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/primitives/button/button.tsx": "export function build(): number {\n  return 1;\n}\n",
        "tests/ui/markdown/markdown.ct.tsx": "export {};\n",
      },
      why: "DECLARED LIMIT — bare primitives/ are covered by ui-primitive-structure's CT clause, not scanned here. THE `UI_LOGIC_GROUPS` NARROWING: replacing the prefix test with `true` reds this row",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/state/gpresclientok-store.ts":
          'import { createGatedStore } from "./create-gated-store";\n' +
          'const useX = createGatedStore<{ n: number }>("g-presclientok", () => ({ n: 0 }));\n' +
          'export function gPresClientOkAction(): void {\n  useX.setState({ n: 1 }, false, "x/set");\n}\n' +
          "export function useGPresClientOk(): number {\n  return useX((s) => s.n);\n}\n",
        "tests/client/state/gpresclientok-store.ct.tsx":
          'import { gPresClientOkAction, useGPresClientOk } from "@orb/client/state";\ngPresClientOkAction();\nexport const t = useGPresClientOk;\n',
      },
      why: "clause C: gPresClientOkAction( appears by name in the mirror — covered, passes",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/state/gprestories-store.ts":
          'import { createGatedStore } from "./create-gated-store";\n' +
          'const useX = createGatedStore<{ n: number }>("g-prestories", () => ({ n: 0 }));\n' +
          'export function gPresStoriesAction(): void {\n  useX.setState({ n: 1 }, false, "x/set");\n}\n',
        "tests/client/state/gprestories-store.test.ts": 'import { useX } from "@orb/client/state";\nexport const t = useX;\n',
        [STORE_STORIES]:
          'import { gPresStoriesAction } from "@orb/client/state";\nexport const Story = (): null => {\n  gPresStoriesAction();\n  return null;\n};\n',
      },
      why: "THE SHARED-STORIES HALF of clause C (Spine-Testing §7 — a CT only mounts from a non-test module): the action is driven in `_ct-stories.tsx` and nowhere in the mirror itself, and that IS coverage. Dropping the stories module from the demanded corpus reds exactly this row",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/state/gprestpl-store.ts":
          'import { createGatedStore } from "./create-gated-store";\n' +
          'const useX = createGatedStore<{ n: number }>("g-prestpl", () => ({ n: 0 }));\n' +
          'export function gPresTplAction(): number {\n  useX.setState({ n: 1 }, false, "x/set");\n  return 1;\n}\n',
        "tests/client/state/gprestpl-store.test.ts": [
          "export const t = `drove ",
          "${gPresTplAction()}",
          " write`;\ndeclare function gPresTplAction(): number;\n",
        ].join(""),
      },
      why: "STRING POSTURE limit: a real `gPresTplAction()` call interpolated inside a template literal is CODE — the blanking keeps interpolation spans, so clause C still counts it and passes",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/state/purehandle.ts": 'export function gPureBuild(): { kind: "x" } {\n  return { kind: "x" };\n}\n',
        "tests/client/state/purehandle.ct.tsx": "export {};\n",
      },
      why: "clause C: no store-factory call in the file — not a store, out of clause C's scope, passes. THE `isStoreFile` NARROWING: replacing it with `true` reds this row on `gPureBuild`",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/state/gprescomm-store.ts":
          "// This module is the one that documents the door: createGatedStore(…) is called by the STORES,\n" +
          "// never by this file.\n" +
          "export function gPresCommDoc(): number {\n  return 1;\n}\n",
        "tests/client/state/gprescomm-store.test.ts": "export const t = 1;\n",
      },
      why: "COMMENT POSTURE (issue #117/#132), clause C, the FALSE-POSITIVE direction: a `state/*.ts` whose COMMENT names a factory door mints no store, so demanding mirror coverage for actions it has none of would be an invented finding. `isStoreFile` reads CODE",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/data/index.ts": "export const build = () => 1;\n",
        "packages/client/src/data/parse.ts": "export function parse(): boolean {\n  return true;\n}\n",
        "tests/client/data/parse.test.ts": "export {};\n",
      },
      why: 'THE `notNamed: ["index.ts"]` POPULATION FENCE (#2133): a client barrel is a re-export surface, not a composed seal, and clause A must never reach it — dropping the fence admits `data/index.ts` and reds this row. `data/parse.ts` is here as the IN-POPULATION ANCHOR: a population falsifier whose only file is the excluded one admits nothing, and an empty population comes back a `[population]` TOOL ERROR rather than the finding the cut is supposed to produce',
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/state/gprestypeargs-store.ts":
          'import { createGatedStore } from "./create-gated-store";\n' +
          'const useX = createGatedStore<{ n: number }>("g-prestypeargs", () => ({ n: 0 }));\n' +
          'export function gPresTypeArgsAction<T>(value: T): T {\n  useX.setState({ n: 1 }, false, "x/set");\n  return value;\n}\n',
        "tests/client/state/gprestypeargs-store.test.ts":
          'import { gPresTypeArgsAction } from "@orb/client/state";\nexport const t = gPresTypeArgsAction<number>(1);\n',
      },
      why: "THE `TYPE_ARGS` SPAN of clause C (#2133): a generic action is driven as `NAME<T>(…)`, and a bare `NAME\\(` matcher is blind to every one of them — the blindness that would have shipped four false REDs when #619 widened the clause, credited in the header and held by nothing until now. Cutting the span reds this row",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/state/gpresconsthook-store.ts":
          'import { createGatedStore } from "./create-gated-store";\n' +
          'const useX = createGatedStore<{ n: number }>("g-presconsthook", () => ({ n: 0 }));\n' +
          "export const useGPresConstHook = (): number => useX((s) => s.n);\n" +
          'export function gPresConstHookAction(): void {\n  useX.setState({ n: 1 }, false, "x/set");\n}\n',
        "tests/client/state/gpresconsthook-store.test.ts":
          'import { gPresConstHookAction } from "@orb/client/state";\ngPresConstHookAction();\nexport const t = 1;\n',
      },
      why: "THE `use*` EXCLUSION ON THE CONST ARM (#2133): a read-hook is a selector, not a write, so clause C never demands it be DRIVEN — and the hook here is an exported arrow, the arm `mustFlag[6]`'s count does not reach (that row's `useGPresClient` is a function declaration). Cutting the const arm's prefix test demands `useGPresConstHook` and reds this row",
    },
  ],
});
