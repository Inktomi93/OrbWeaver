// Gate: selection-store-via-factory (derive-modernization-audit.md §W3, G27 — the drill-selection factory
// sealed). The five per-section selection stores (corpus/analytics/character/preset/world-info) share one
// shape; `createDrillSelectionStore` (packages/client/src/state/create-drill-selection-store.ts) IS that
// shape. Location-keyed (the G23 shape): a `state/*-selection-store.ts` calling the raw `createGatedStore(`
// door DIRECTLY — instead of the factory — re-grows the byte-identical store that drifts (D72). The factory
// HOME (`create-*`) is excluded (it composes the door on purpose); every OTHER state store is out of scope.
//
// SCAN-AND-ALLOWLIST (GATE-AUTHORING.md §3, 2026-08-22): the sanctioned files USED to be scanRoot
// EXCLUSIONS — a name PATTERN (`/create-`) plus a Set — and this header said what that costs: "a rotten row
// silently un-scans a whole store file". They are now SCANNED, exempted by cited rows, and the pattern is
// gone: each factory home is its OWN row, so a THIRD `create-*-selection-store.ts` is judged instead of
// inheriting an exemption from its filename.
//
// TWO-SIDED (gate-hub #10) for every row: RED when its file has left the project (mode B) OR when the file
// no longer mints the raw door (mode A — the sanction is unused; the non-drill migrated onto the factory
// after all, or the factory stopped composing the door). The arm self-guards on a REAL-TREE ANCHOR
// (gate-hub #11): the raw door's own home.
import type { CallExpression } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor } from "../contract/gate.ts";
import { fileLoaded, repoRel } from "../lib/pass.ts";
import { sanctionedHome } from "../lib/sanctioned-home.ts";

const STATE_DIR = "packages/client/src/state/";
const SELECTION_SUFFIX = "-selection-store.ts";
const FACTORY_CALLEE = "createGatedStore";

/** Every `*-selection-store.ts` that may mint the raw door, and why. */
const SANCTIONED_HOMES: ExemptionTable = {
  [`${STATE_DIR}create-drill-selection-store.ts`]: {
    why: "the drill FACTORY itself — it composes the raw door on purpose; that composition IS the seal every other store mints through. Ends if it stops composing the door (mode A) or moves (mode B)",
  },
  [`${STATE_DIR}create-kinded-selection-store.ts`]: {
    why: "the kinded-selection factory, the same composition one shape over — named as its OWN row rather than inherited from a `/create-` filename pattern, so a third factory is judged rather than auto-exempt. Same end conditions",
  },
  [`${STATE_DIR}message-selection-store.ts`]: {
    why: "the ONE `*-selection-store.ts` that is not a single-id drill: message-selection is a bulk multi-select (presence-in-a-Set keyed by message id, PD-119), a shape the drill factory does not model. Ends when it migrates onto a factory (mode A) or moves (mode B)",
  },
};

const GATE_SELF = "tooling/src/verify/gates/selection-store-via-factory.ts";
/** Real-tree anchor (gate-hub #11): the raw door's own home. Deliberately NOT the drill factory's home —
 *  that file is an example subject here (the `create-*` exclusion has its own mustPass), and an anchor that
 *  doubles as an example subject makes the stale arm misfire inside conformance. */
const ANCHOR = `${STATE_DIR}create-gated-store.ts`;
const STALE_GONE = "stale SANCTIONED_HOMES row — the store file is no longer in the project (ratchet down): ";
const STALE_UNUSED =
  "stale SANCTIONED_HOMES row — the file no longer mints the raw `createGatedStore` door, so its sanction " +
  "(a factory composing the door, or the non-drill bulk store) is unused. Ratchet down: ";

const MESSAGE =
  "a `*-selection-store.ts` calls the raw createGatedStore door directly — the five per-section drill stores are ONE shape. Mint it with `createDrillSelectionStore(name, { secondary? })` (packages/client/src/state/create-drill-selection-store.ts) instead. (derive-modernization-audit.md §W3, G27; D72 — a machine ships WITH its seal.)";

/** A `createGatedStore(...)` call (identifier callee — the door is imported unqualified). */
function isFactoryDoorCall(call: CallExpression): boolean {
  const callee = call.getExpression();
  return Node.isIdentifier(callee) && callee.getText() === FACTORY_CALLEE;
}

export const gate: GateDescriptor = {
  name: "selection-store-via-factory",
  docRow: "history/derive-modernization-audit.md §W3 (G27)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "replace the raw `createGatedStore(...)` + its hand actions/selectors with a `createDrillSelectionStore(name, { secondary? })` mint.",
  // Location-keyed: every `*-selection-store.ts` under state/, the factories and the non-drill INCLUDED —
  // their exemption is a cited SANCTIONED_HOMES row.
  scanRoot: (p) => p.startsWith(STATE_DIR) && p.endsWith(SELECTION_SUFFIX),
  kinds: [SyntaxKind.CallExpression],
  visit: (node, sf, ctx) => {
    if (!Node.isCallExpression(node)) {
      return;
    }
    if (sanctionedHome(SANCTIONED_HOMES, repoRel(ctx.root, sf.getFilePath())) !== undefined) {
      return;
    }
    if (isFactoryDoorCall(node)) {
      ctx.report(node);
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
          message: `${STALE_GONE}"${rel}" — delete the row in tooling/src/verify/gates/selection-store-via-factory.ts`,
        });
        continue;
      }
      const mintsDoor = sf.getDescendantsOfKind(SyntaxKind.CallExpression).some((c) => isFactoryDoorCall(c));
      if (!mintsDoor) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `${STALE_UNUSED}"${rel}" — delete the row in tooling/src/verify/gates/selection-store-via-factory.ts`,
        });
      }
    }
  },
  mustFlag: [
    {
      files:
        'import { createGatedStore } from "./create-gated-store";\nexport const useX = createGatedStore<{ readonly id: string | null }>("x-selection", () => ({ id: null }));\n',
      at: "packages/client/src/state/x-selection-store.ts",
      why: "a per-section selection store minting the raw createGatedStore door directly — the re-rot G27 seals",
    },
    {
      files: {
        [ANCHOR]: "export const createGatedStore = null;\n",
        [`${STATE_DIR}create-drill-selection-store.ts`]: 'export const make = () => createGatedStore("x", () => ({}));\n',
        [`${STATE_DIR}create-kinded-selection-store.ts`]: 'export const makeKinded = () => createGatedStore("k", () => ({}));\n',
        [`${STATE_DIR}message-selection-store.ts`]:
          'import { createDrillSelectionStore } from "./create-drill-selection-store";\nexport const useMsgSel = createDrillSelectionStore<string>("message-selection");\n',
      },
      expect: { count: 1, messageIncludes: "no longer mints the raw" },
      why: "MODE A: the anchor (the raw door's home) is loaded, both factories still compose the door, and the allowlisted non-drill store has migrated onto the factory — its sanction is dead and ratchets down",
    },
    {
      files: {
        [ANCHOR]: "export const createGatedStore = null;\n",
      },
      expect: { count: 3, messageIncludes: "no longer in the project" },
      why: "MODE B, one finding per row: every sanctioned file is gone entirely — path rot ratchets down too, and the count proves the sweep judges EVERY row rather than the first",
    },
  ],
  mustPass: [
    {
      files:
        'import { createDrillSelectionStore } from "./create-drill-selection-store";\nconst x = createDrillSelectionStore<string>("x-selection");\nexport const selectX = x.select;\n',
      at: "packages/client/src/state/x-selection-store.ts",
      why: "a selection store minted through the factory — the sanctioned shape, no raw door call",
    },
    {
      files:
        'import { createGatedStore } from "./create-gated-store";\nexport function make(name: string): unknown {\n  return createGatedStore(name, () => ({ id: null }));\n}\n',
      at: "packages/client/src/state/create-drill-selection-store.ts",
      why: "THE ALLOWLIST ITSELF: the factory HOME composes the door on purpose — now SCANNED, and passing on its own cited row rather than on a `/create-` filename pattern that would exempt any future file with that prefix",
    },
    {
      files: 'export const useShellStore = createGatedStore("shell", () => ({ open: false }));\n',
      at: "packages/client/src/state/shell-store.ts",
      why: "a NON-selection state store may call createGatedStore freely — only `*-selection-store.ts` is keyed",
    },
    {
      files: 'export const useMsgSel = createGatedStore("message-selection", () => ({ ids: new Set() }));\n',
      at: "packages/client/src/state/message-selection-store.ts",
      why: "message-selection is the allowlisted non-drill (a bulk multi-select) — it may mint the raw door; with no anchor in this project the stale arm stays silent (THE ANCHOR GUARD)",
    },
    {
      files: {
        [ANCHOR]: "export const createGatedStore = null;\n",
        [`${STATE_DIR}create-drill-selection-store.ts`]: 'export const make = () => createGatedStore("x", () => ({}));\n',
        [`${STATE_DIR}create-kinded-selection-store.ts`]: 'export const makeKinded = () => createGatedStore("k", () => ({}));\n',
        [`${STATE_DIR}message-selection-store.ts`]: 'export const useMsgSel = createGatedStore("message-selection", () => ({ ids: new Set() }));\n',
      },
      why: "every row STILL EARNED, judged against the real-tree anchor: each sanctioned file exists AND mints the raw door, so neither arm fires — the pass half of both staleness modes",
    },
  ],
};
