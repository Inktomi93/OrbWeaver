// `createGatedStore` — the way a hook-shaped, NON-persisted client store is minted (UI-Arch §2.1 state/;
// UI-Lib-Zustand.md recs #7/#12 + C-2): it bakes the devtools middleware so no store file
// re-decides the wiring, and re-types the setter so the ACTION LABEL (the devtools 3rd arg) is
// REQUIRED at every call site — an unlabeled transition is a `tsc` error, and the Redux DevTools
// timeline stays readable for free. Composition (order is load-bearing, UI-Lib-Zustand.md
// "devtools OUTERMOST"): devtools(subscribeWithSelector(initializer)). subscribeWithSelector is
// always included — it only widens `subscribe`, and every lifecycle store wants the transient
// (render-free) seam (D-6). `enabled` gates on DEV *and* extension presence, so the node test
// lane (vitest: DEV true, no extension, no window) stays warning-clean and prod stays inert.
// Two persist-shaped siblings share STORE_DEVTOOLS_ENABLED + the name-registry discipline from here:
// `createEntityDraftStore` (a per-entity VANILLA-store factory, not a hook — one store per editor id)
// and `createPersistedStore` (a hook-shaped singleton with `persist` baked in — this file's shape plus
// a persisted slice, for one global device-local concern like the shell layout).
// State-law recap the wrapper does NOT relax (gate `state:files`): one store per file, callers
// never see raw set/getState across module boundaries — module-level actions in the store's own
// file call `useXStore.setState(next, replace, "domain/action")` and export intent-named fns.

import type { Mutate, StoreApi } from "zustand";
import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";
import { IS_DEV } from "#lib";

/**
 * Devtools bridge gate: DEV builds only, and only when the Redux DevTools extension is actually
 * installed — zustand's middleware console-warns per store when enabled without the extension
 * (that would spam every vitest node run, where `import.meta.env.DEV` is true).
 */
export const STORE_DEVTOOLS_ENABLED: boolean =
  IS_DEV && Reflect.get(globalThis, "__REDUX_DEVTOOLS_EXTENSION__") !== undefined;

// One devtools connection name per store — a duplicate would interleave two stores' action
// timelines under one label (the same failure class as the draft factory's STORAGE_KEYS clash).
const registeredNames = new Set<string>();

/**
 * The gated setter: zustand's devtools `NamedSet` with the action label made REQUIRED. Structurally
 * assignable FROM the middleware's own setter (whose 3rd arg is optional), so no runtime shim
 * exists — this is a pure compile-time tightening.
 */
export interface GatedSet<T> {
  (
    partial: T | Partial<T> | ((state: T) => T | Partial<T>),
    replace: false | undefined,
    action: string,
  ): void;
  (state: T | ((state: T) => T), replace: true, action: string): void;
}

type GatedMutators = [["zustand/devtools", never], ["zustand/subscribeWithSelector", never]];

/**
 * The bound hook + store API: zustand's own mutated store shape with `setState` re-typed to
 * {@link GatedSet} (label required at every external call site too).
 */
export type GatedStoreHook<T> = {
  (): T;
  <U>(selector: (state: T) => U): U;
} & Omit<Mutate<StoreApi<T>, GatedMutators>, "setState"> & { readonly setState: GatedSet<T> };

/**
 * Mint a gated store hook. `name` is the devtools connection label (unique — duplicate THROWS at
 * creation); the initializer's `set` requires the action label.
 */
export function createGatedStore<T>(
  name: string,
  initializer: (set: GatedSet<T>, get: () => T) => T,
): GatedStoreHook<T> {
  if (registeredNames.has(name)) {
    throw new Error(
      `createGatedStore: duplicate store name "${name}" — two stores would share one devtools ` +
        "connection label. Every gated store needs a unique name.",
    );
  }
  registeredNames.add(name);

  return create<T>()(
    devtools(
      subscribeWithSelector((set, get): T => initializer(set as GatedSet<T>, get)),
      { name, enabled: STORE_DEVTOOLS_ENABLED },
    ),
  ) as GatedStoreHook<T>;
}
