// Gate: selection-store-via-factory (derive-modernization-audit.md §W3, G27 — the drill-selection factory
// sealed). The five per-section selection stores (corpus/analytics/character/preset/world-info) share one
// shape; `createDrillSelectionStore` (packages/client/src/state/create-drill-selection-store.ts) IS that
// shape. Location-keyed (the G23 shape): a `state/*-selection-store.ts` calling the raw `createGatedStore(`
// door DIRECTLY — instead of the factory — re-grows the byte-identical store that drifts (D72). The factory
// HOME (`create-*`) is excluded (it composes the door on purpose); every OTHER state store is out of scope.
import type { CallExpression } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const STATE_DIR = "packages/client/src/state/";
const SELECTION_SUFFIX = "-selection-store.ts";
const FACTORY_CALLEE = "createGatedStore";
// The ONE `*-selection-store.ts` that is NOT a single-id drill: message-selection is a bulk multi-select
// (presence-in-a-Set keyed by message id, PD-119) — a fundamentally different shape the drill factory does
// not model, so it legitimately mints the raw door. A future NON-drill selection store adds a cited entry.
const NON_DRILL_ALLOWLIST = new Set([`${STATE_DIR}message-selection-store.ts`]);

const MESSAGE =
  "a `*-selection-store.ts` calls the raw createGatedStore door directly — the five per-section drill stores are ONE shape. Mint it with `createDrillSelectionStore(name, { secondary? })` (packages/client/src/state/create-drill-selection-store.ts) instead. (derive-modernization-audit.md §W3, G27; D72 — a machine ships WITH its seal.)";

/** A `createGatedStore(...)` call (identifier callee — the door is imported unqualified). */
function isFactoryDoorCall(call: CallExpression): boolean {
  const callee = call.getExpression();
  return Node.isIdentifier(callee) && callee.getText() === FACTORY_CALLEE;
}

export const gate: GateDescriptor = {
  name: "selection-store-via-factory",
  docRow: "proposed/derive-modernization-audit.md §W3 (G27)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "replace the raw `createGatedStore(...)` + its hand actions/selectors with a `createDrillSelectionStore(name, { secondary? })` mint.",
  // Location-keyed: only the per-section drill `*-selection-store.ts` consumers — never the `create-*`
  // factory home, never the allowlisted non-drill (message-selection, a bulk multi-select).
  scanRoot: (p) => p.startsWith(STATE_DIR) && p.endsWith(SELECTION_SUFFIX) && !p.includes("/create-") && !NON_DRILL_ALLOWLIST.has(p),
  kinds: [SyntaxKind.CallExpression],
  visit: (node, _sf, ctx) => {
    if (!Node.isCallExpression(node)) {
      return;
    }
    if (isFactoryDoorCall(node)) {
      ctx.report(node);
    }
  },
  mustFlag: [
    {
      files:
        'import { createGatedStore } from "./create-gated-store";\nexport const useX = createGatedStore<{ readonly id: string | null }>("x-selection", () => ({ id: null }));\n',
      at: "packages/client/src/state/x-selection-store.ts",
      why: "a per-section selection store minting the raw createGatedStore door directly — the re-rot G27 seals",
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
      why: "the factory HOME composes the door on purpose — the `create-*` name is scanRoot-excluded",
    },
    {
      files: 'export const useShellStore = createGatedStore("shell", () => ({ open: false }));\n',
      at: "packages/client/src/state/shell-store.ts",
      why: "a NON-selection state store may call createGatedStore freely — only `*-selection-store.ts` is keyed",
    },
    {
      files: 'export const useMsgSel = createGatedStore("message-selection", () => ({ ids: new Set() }));\n',
      at: "packages/client/src/state/message-selection-store.ts",
      why: "message-selection is the allowlisted non-drill (a bulk multi-select) — it may mint the raw door",
    },
  ],
};
