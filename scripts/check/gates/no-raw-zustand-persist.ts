// Gate: no-raw-zustand-persist (UI-Gates-and-Lessons.md §11.5) — the persistence footguns (partialize,
// version + total migrate, key uniqueness) are baked into the two store factories; a bare `persist(` is a
// store that re-grows them.
//
// TWO-SIDED (gate-hub #10) at the STRONG grain, because the allowlist names FILES that make a CLAIM
// ("this file is a persist factory"): a row is RED when its file has left the project OR when the file no
// longer calls `persist(` — at which point the row is un-scanning a file for nothing (the allowlist is a
// scanRoot exclusion) and the factory the fix text points at has moved. The arm self-guards on a REAL-TREE
// ANCHOR (gate-hub #11): the state barrel these factories are exported from.
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

const SCOPE_REGEX = /\/packages\/client\/src\//u;
const STATE_DIR = "packages/client/src/state/";
const PERSIST = "persist";
/** The persist FACTORIES — the only sanctioned `persist(` call sites. */
const ALLOWLIST = [`${STATE_DIR}create-entity-draft-store.ts`, `${STATE_DIR}create-persisted-store.ts`] as const;
const TEST_REGEX = /\.test\.tsx?$/u;

const GATE_SELF = "scripts/check/gates/no-raw-zustand-persist.ts";
/** Real-tree anchor (gate-hub #11): the state barrel the factories are exported from. */
const ANCHOR = `${STATE_DIR}index.ts`;
const STALE_GONE = "stale ALLOWLIST row — the persist factory is no longer in the project (ratchet down): ";
const STALE_UNUSED =
  "stale ALLOWLIST row — this file calls no `persist(` any more, so it is not a persist factory: the row " +
  "un-scans a whole file for nothing and the fix text points at a factory that has moved (ratchet down): ";

const MESSAGE =
  "raw zustand persist() outside the draft-store factory — persistence footguns (partialize / version+total-migrate / key uniqueness) are baked into createEntityDraftStore; use it (or extend it), never a bare persist. See UI-Gates-and-Lessons.md §11.5.";

export const gate: GateDescriptor = {
  name: "no-raw-zustand-persist",
  docRow: "UI-Gates-and-Lessons.md §11.5",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "Use createEntityDraftStore or createPersistedStore instead of bare persist().",
  scanRoot: (p) => {
    const path = `/${p}`;
    if (!SCOPE_REGEX.test(path)) {
      return false;
    }
    if (ALLOWLIST.some((rel) => path.endsWith(`/${rel}`)) || TEST_REGEX.test(path)) {
      return false;
    }
    return true;
  },
  kinds: [SyntaxKind.CallExpression],
  visit: (node, _sf, ctx) => {
    if (!Node.isCallExpression(node)) {
      return;
    }
    if (node.getExpression().getText() === PERSIST) {
      ctx.report(node, { token: `${PERSIST}(`, offset: 0 });
    }
  },
  // The factories are scanRoot-EXCLUDED, so the walk never sees them — the stale arm reads them off the
  // shared project directly.
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, ANCHOR)) {
      return;
    }
    for (const rel of ALLOWLIST) {
      const sf = ctx.project.getSourceFile(`${ctx.root}/${rel}`);
      if (sf === undefined) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `${STALE_GONE}"${rel}" — delete the row in scripts/check/gates/no-raw-zustand-persist.ts`,
        });
        continue;
      }
      const persists = sf.getDescendantsOfKind(SyntaxKind.CallExpression).some((c) => c.getExpression().getText() === PERSIST);
      if (!persists) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `${STALE_UNUSED}"${rel}" — delete the row in scripts/check/gates/no-raw-zustand-persist.ts`,
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
      },
      expect: { count: 1, messageIncludes: "calls no `persist(` any more" },
      why: "THE STALE ARM: the anchor is loaded; one factory still persists and keeps its row, the other has stopped — that row is un-scanning a file for nothing and ratchets down",
    },
    {
      files: {
        [ANCHOR]: "export const state = {};\n",
        [`${STATE_DIR}create-persisted-store.ts`]: "export const useStore = create(persist(() => ({})));\n",
      },
      expect: { count: 1, messageIncludes: "no longer in the project" },
      why: "the other staleness: a row whose factory file is gone entirely — path rot ratchets down too",
    },
  ],
  mustPass: [
    {
      files: "export const useStore = create(persist(() => ({})));",
      at: "packages/client/src/state/create-persisted-store.ts",
      why: "allowlisted factory",
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
      },
      why: "both rows STILL EARNED, judged against the real-tree anchor: each named file really is a persist factory, so neither arm fires",
    },
  ],
};
