// The drilled member's Back, as the shell's topbar reads it. The member's identity row is the one author of its way back: its
// name and what pressing it does, focus return to the opening row included. Where the topbar carries the Back instead of the
// row, it runs and names the same one, so the two cannot say or do different things.
//
// Every mounted row holds its own entry, in mount order, and withdraws only that entry when it unmounts. The topbar runs the
// newest: the member opened last. A second mounted row never erases the first, and a row that leaves leaves no stale Back.
import type { DrillBack } from "#lib";
import { createGatedStore } from "./create-gated-store.ts";

const useDrillBackStore = createGatedStore<{ readonly backs: readonly DrillBack[] }>("drill-back", () => ({ backs: [] }));

/** Publish a mounted drilled row's Back; the returned call withdraws exactly that entry. */
export function publishDrillBack(back: DrillBack): () => void {
  useDrillBackStore.setState((s) => ({ backs: [...s.backs, back] }), false, "drill-back/publish");
  return (): void => {
    useDrillBackStore.setState((s) => ({ backs: s.backs.filter((held) => held !== back) }), false, "drill-back/withdraw");
  };
}

/** Reactive: the newest mounted drilled row's Back, or `null` while none is mounted. */
export function useDrillBack(): DrillBack | null {
  return useDrillBackStore((s) => s.backs.at(-1) ?? null);
}
