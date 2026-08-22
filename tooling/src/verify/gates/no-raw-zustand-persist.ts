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
    return SCOPE_REGEX.test(path) && !TEST_REGEX.test(path);
  },
  kinds: [SyntaxKind.CallExpression],
  visit: (node, sf, ctx) => {
    if (!Node.isCallExpression(node)) {
      return;
    }
    if (sanctionedHome(SANCTIONED_HOMES, repoRel(ctx.root, sf.getFilePath())) !== undefined) {
      return;
    }
    if (node.getExpression().getText() === PERSIST) {
      ctx.report(node, { token: `${PERSIST}(`, offset: 0 });
    }
  },
  // A whole-tree claim about the TABLE, read off the shared project (never off what the walk visited).
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, ANCHOR)) {
      return;
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
      },
      why: "both rows STILL EARNED, judged against the real-tree anchor: each named file really is a persist factory, so neither arm fires",
    },
  ],
};
