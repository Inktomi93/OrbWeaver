// Gate: no-raw-zustand-persist (UI-Gates-and-Lessons.md §11.5) — the persistence footguns (partialize,
// version + total migrate, key uniqueness) are baked into the two store factories; a bare `persist(` is a
// store that re-grows them.
//
// SCAN-AND-ALLOWLIST (GATE-AUTHORING.md §3, 2026-08-22): the factories are SCANNED and their `persist(`
// calls exempted by cited rows, not scoped out of scanRoot — an exclusion un-scans the WHOLE file, so a
// second unrelated footgun inside a factory was invisible.
//
// TWO-SIDED (gate-hub #10) at the STRONG grain, because the table names FILES that make a CLAIM ("this file
// is a persist factory"): a row is RED when its file has left the project (mode B) OR when the file no
// longer calls `persist(` (mode A — the row claims a factory that is not one, and the fix text points at a
// factory that has moved). Both arms are this gate's own, with tailored messages, so the shared
// lib/sanctioned-home.ts sweep is deliberately NOT stacked on top of them. They self-guard on a REAL-TREE
// ANCHOR (gate-hub #11): the state barrel these factories are exported from.
//
// ARM B — THE DESTRUCTIVE-RESET HOME (#879, from #837). `setState(store.getInitialState(), true)` on a
// persist-MINTED store is not an in-memory drop: zustand's `persist` PATCHES `setState` to write the new
// state through to whatever key the store currently holds, so the reset OVERWRITES a real blob with
// defaults — and `rehydrate()` then reads the emptied blob back. That made every `orb:*` blob app-wide
// inert on every boot (#837). The reset is legal ONLY inside the two mint factories, whose `reset` closures
// the durable-local registry drives through `resetWithoutPersisting` (which blindfolds the store's storage
// for the duration). SAME sanctioned homes as ARM A, deliberately ONE table: the claim "these two files are
// the persist factories" has one home, and a second gate would carry a second copy of it that rots apart.
//
// ARM C — the seam that makes ARM B total. Inside the durable-local REGISTRY file (found by the file that
// declares `registerDurableLocalStore`, with a §4.6 tripwire when that name resolves to nothing), a
// registered store's `reset()` may only be called from a function that installs the blindfold
// (`persist.setOptions({ storage })`). The registry entry type is file-private, so that file is the whole
// reachable surface — a third caller elsewhere in it would drop a store WITHOUT the blindfold, which is
// #837 verbatim one layer up.
import type { SourceFile, CallExpression as TsCall } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor } from "../contract/gate.ts";
import { fileLoaded, repoRel } from "../lib/pass.ts";
import { sanctionedHome } from "../lib/sanctioned-home.ts";

const SCOPE_REGEX = /\/packages\/client\/src\//u;
const STATE_DIR = "packages/client/src/state/";
const PERSIST = "persist";
/** The persist FACTORIES — the only sanctioned `persist(` call sites. */
const SANCTIONED_HOMES: ExemptionTable = {
  [`${STATE_DIR}create-entity-draft-store.ts`]: {
    why: "the draft-store factory bakes the footguns in (partialize / version+total-migrate / key uniqueness) — the `persist(` call it wraps IS the seal. Ends when it stops calling persist (mode A) or leaves the project (mode B)",
  },
  [`${STATE_DIR}create-persisted-store.ts`]: {
    why: "the general persisted-store factory, same seal one shape over. Same two end conditions",
  },
};
const TEST_REGEX = /\.test\.tsx?$/u;

const GATE_SELF = "tooling/src/verify/gates/no-raw-zustand-persist.ts";
/** Real-tree anchor (gate-hub #11): the state barrel the factories are exported from. */
const ANCHOR = `${STATE_DIR}index.ts`;
const STALE_GONE = "stale SANCTIONED_HOMES row — the persist factory is no longer in the project (ratchet down): ";
const STALE_UNUSED =
  "stale SANCTIONED_HOMES row — this file calls no `persist(` any more, so it is not a persist factory and " +
  "the fix text points at a factory that has moved (ratchet down): ";

const MESSAGE =
  "raw zustand persist() outside the draft-store factory — persistence footguns (partialize / version+total-migrate / key uniqueness) are baked into createEntityDraftStore; use it (or extend it), never a bare persist. ARM B (#879, from #837): and `setState(store.getInitialState(), true)` on a persist-minted store is legal ONLY in those same two factories — `persist` patches `setState` to write through, so the reset OVERWRITES the durable blob with defaults and the next rehydrate reads the emptied one back. Go through the durable-local door (`resetWithoutPersisting`), which blindfolds the storage first. ARM C: inside the durable-local registry file, a registered store's `reset()` may only be called from the function that installs that blindfold. See UI-Gates-and-Lessons.md §11.5.";

/** ARM B: the two calls that spell a persist-through destructive reset. */
const SET_STATE = "setState";
const GET_INITIAL_STATE = "getInitialState";
/** ARM C: the registry file is found by the function it declares, never by a path constant (§3). */
const REGISTRY_DECL = "registerDurableLocalStore";
const RESET = "reset";
/** The blindfold install — `persist.setOptions({ storage: … })`. A `reset()` caller that never touches it
 *  is dropping a store's projection straight through to durable storage. */
const SET_OPTIONS = "setOptions";

/** ARM C's subject, for every example that loads the ANCHOR but is not about ARM C: without it the §4.6
 *  tripwire would fire in rows that prove something else entirely. */
const REGISTRY_STUB = "export function registerDurableLocalStore(entry) {\n  registry.push(entry);\n}\n";

const REGISTRY_BLIND =
  `blindness tripwire (GATE-AUTHORING.md §4.6): the client tree is loaded but NO file declares \`${REGISTRY_DECL}\`, ` +
  "so ARM C — a registered store's `reset()` may only run behind the storage blindfold — judged nothing at " +
  "all and this gate's ✓ for it is a placebo. Re-point the derivation at the durable-local registry's " +
  "current spelling: tooling/src/verify/gates/no-raw-zustand-persist.ts";

/** ARM B: `<anything>.setState(<anything>.getInitialState(), true)` — the destructive persist-through reset.
 *  `true` is zustand's REPLACE flag; without it the call is an ordinary merge and not this defect. */
function isDestructiveReset(call: TsCall): boolean {
  const callee = call.getExpression();
  if (!Node.isPropertyAccessExpression(callee) || callee.getName() !== SET_STATE) {
    return false;
  }
  const [first, second] = call.getArguments();
  const inner = first?.asKind(SyntaxKind.CallExpression)?.getExpression();
  return second?.getKind() === SyntaxKind.TrueKeyword && inner !== undefined && Node.isPropertyAccessExpression(inner) && inner.getName() === GET_INITIAL_STATE;
}

/** ARM C: does the function enclosing this call install the storage blindfold? A `reset()` reached from
 *  anywhere else in the registry file writes the emptied projection through to durable storage (#837). */
function behindTheBlindfold(call: TsCall): boolean {
  for (const a of call.getAncestors()) {
    const body =
      Node.isFunctionDeclaration(a) || Node.isMethodDeclaration(a) || Node.isFunctionExpression(a) || Node.isArrowFunction(a) ? a.getBody() : undefined;
    if (body === undefined) {
      continue;
    }
    return body
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .some(
        (c) =>
          Node.isPropertyAccessExpression(c.getExpression()) && c.getExpression().asKindOrThrow(SyntaxKind.PropertyAccessExpression).getName() === SET_OPTIONS,
      );
  }
  return false;
}

/** Whether ARM C's subject — the durable-local registry — was seen this pass (the §4.6 tripwire's input). */
let registryFileSeen = false;
/** Per-FILE memo for "is this the registry file" — the walk asks once per CallExpression, and
 *  `getFunction` re-scans the file's statements on every call. Pass-scoped by construction (§12: the memo
 *  is a single file, never a Project-keyed map). */
let memoFile: SourceFile | undefined;
let memoIsRegistry = false;

function isRegistryFile(sf: SourceFile): boolean {
  if (memoFile !== sf) {
    memoFile = sf;
    memoIsRegistry = sf.getFunction(REGISTRY_DECL) !== undefined;
  }
  return memoIsRegistry;
}

export const gate: GateDescriptor = {
  name: "no-raw-zustand-persist",
  docRow: "UI-Gates-and-Lessons.md §11.5",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "Use createEntityDraftStore or createPersistedStore instead of bare persist().",
  scanRoot: (p) => {
    const path = `/${p}`;
    return SCOPE_REGEX.test(path) && !TEST_REGEX.test(path);
  },
  kinds: [SyntaxKind.CallExpression],
  begin: () => {
    registryFileSeen = false;
  },
  visit: (node, sf, ctx) => {
    if (!Node.isCallExpression(node)) {
      return;
    }
    // ARM C first: the registry file is a SANCTIONED HOME for ARM A/B (it is not, today — but the check
    // order must not depend on that), and its own rule is about `reset()`, not about the factory table.
    if (isRegistryFile(sf)) {
      registryFileSeen = true;
      const callee = node.getExpression();
      if (Node.isPropertyAccessExpression(callee) && callee.getName() === RESET && !behindTheBlindfold(node)) {
        ctx.report(node, { token: `${RESET}(`, offset: 0 });
      }
    }
    if (sanctionedHome(SANCTIONED_HOMES, repoRel(ctx.root, sf.getFilePath())) !== undefined) {
      return;
    }
    if (node.getExpression().getText() === PERSIST) {
      ctx.report(node, { token: `${PERSIST}(`, offset: 0 });
    }
    if (isDestructiveReset(node)) {
      ctx.report(node, { token: `${GET_INITIAL_STATE}(`, offset: node.getText().indexOf(`${GET_INITIAL_STATE}(`) });
    }
  },
  // A whole-tree claim about the TABLE, read off the shared project (never off what the walk visited).
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, ANCHOR)) {
      return;
    }
    if (!registryFileSeen) {
      ctx.report({ file: GATE_SELF, line: 1, column: 0, message: REGISTRY_BLIND });
    }
    for (const rel of Object.keys(SANCTIONED_HOMES)) {
      const sf = ctx.project.getSourceFile(`${ctx.root}/${rel}`);
      if (sf === undefined) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `${STALE_GONE}"${rel}" — delete the row in tooling/src/verify/gates/no-raw-zustand-persist.ts`,
        });
        continue;
      }
      const persists = sf.getDescendantsOfKind(SyntaxKind.CallExpression).some((c) => c.getExpression().getText() === PERSIST);
      if (!persists) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `${STALE_UNUSED}"${rel}" — delete the row in tooling/src/verify/gates/no-raw-zustand-persist.ts`,
        });
      }
    }
  },
  mustFlag: [
    {
      files: "export const useStore = create(persist(() => ({})));",
      at: "packages/client/src/feature/store.ts",
      why: "bare persist call in client",
    },
    {
      files: {
        [ANCHOR]: "export const state = {};\n",
        [`${STATE_DIR}create-persisted-store.ts`]: "export const useStore = create(persist(() => ({})));\n",
        [`${STATE_DIR}create-entity-draft-store.ts`]: "export const useDrafts = create(() => ({}));\n",
        [`${STATE_DIR}durable-local.ts`]: REGISTRY_STUB,
      },
      expect: { count: 1, messageIncludes: "calls no `persist(` any more" },
      why: "THE STALE ARM: the anchor is loaded; one factory still persists and keeps its row, the other has stopped — that row is un-scanning a file for nothing and ratchets down",
    },
    {
      files: {
        [ANCHOR]: "export const state = {};\n",
        [`${STATE_DIR}create-persisted-store.ts`]: "export const useStore = create(persist(() => ({})));\n",
        [`${STATE_DIR}durable-local.ts`]: REGISTRY_STUB,
      },
      expect: { count: 1, messageIncludes: "no longer in the project" },
      why: "the other staleness: a row whose factory file is gone entirely — path rot ratchets down too",
    },
    {
      files: "export function wipe() {\n  useSectionStore.setState(useSectionStore.getInitialState(), true);\n}\n",
      at: "packages/client/src/features/x/reset.ts",
      expect: { count: 1, token: "getInitialState(" },
      why: "THE #837 RED (ARM B): a destructive persist-through reset outside the two mint factories. `persist` patches `setState`, so this writes the emptied state to the store's real key and the next rehydrate reads it back — every `orb:*` blob inert on every boot",
    },
    {
      files: {
        [ANCHOR]: "export const state = {};\n",
        [`${STATE_DIR}create-persisted-store.ts`]: "export const useStore = create(persist(() => ({})));\n",
        [`${STATE_DIR}create-entity-draft-store.ts`]: "export const useDrafts = create(persist(() => ({})));\n",
        [`${STATE_DIR}durable-local.ts`]:
          "export function registerDurableLocalStore(entry) {\n  registry.push(entry);\n}\nfunction resetWithoutPersisting(entry) {\n  entry.api.persist.setOptions({ storage: BLIND });\n  entry.reset();\n}\nexport function forget(entry) {\n  entry.reset();\n}\n",
      },
      expect: { count: 1, token: "reset(" },
      why: "ARM C: a SECOND caller of a registered store's `reset()` inside the registry file, outside the function that installs the storage blindfold — it drops the projection straight through to durable storage, which is #837 one layer up. The blindfolded caller in the same file passes, so the arm is not just counting `reset()` calls",
    },
    {
      files: {
        [ANCHOR]: "export const state = {};\n",
        [`${STATE_DIR}create-persisted-store.ts`]: "export const useStore = create(persist(() => ({})));\n",
        [`${STATE_DIR}create-entity-draft-store.ts`]: "export const useDrafts = create(persist(() => ({})));\n",
      },
      expect: { count: 1, messageIncludes: "blindness tripwire" },
      why: "THE §4.6 TRIPWIRE: the anchor and both factories are loaded but NO file declares `registerDurableLocalStore`, so ARM C judged nothing — a rename must RED here, never report ✓ over a rule that stopped having a subject",
    },
  ],
  mustPass: [
    {
      files: "export const useStore = create(persist(() => ({})));",
      at: "packages/client/src/state/create-persisted-store.ts",
      why: "THE ALLOWLIST ITSELF: the factory is now SCANNED, and its `persist(` passes only because a cited SANCTIONED_HOMES row covers the file",
    },
    {
      files: "export const useStore = create(persist(() => ({})));",
      at: "packages/client/src/feature/store.test.ts",
      why: "allowlisted test file — and with no anchor in this project the stale arm stays silent (THE ANCHOR GUARD)",
    },
    {
      files: {
        [ANCHOR]: "export const state = {};\n",
        [`${STATE_DIR}create-persisted-store.ts`]: "export const useStore = create(persist(() => ({})));\n",
        [`${STATE_DIR}create-entity-draft-store.ts`]: "export const useDrafts = create(persist(() => ({})));\n",
        [`${STATE_DIR}durable-local.ts`]: REGISTRY_STUB,
      },
      why: "both rows STILL EARNED, judged against the real-tree anchor: each named file really is a persist factory, so neither arm fires",
    },
  ],
};
