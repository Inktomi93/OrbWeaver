// `createPersistedStore` — the hook-shaped, PERSISTED sibling of `createGatedStore` (UI-Arch §2.1
// state/; §5; UI-Primitives §13.1). A single global, device-local concern (the shell layout: which
// section is active, per-panel dock/overlay/collapse) is one store, read through hooks — but its
// state must survive a reload, so `persist` is baked in. `createGatedStore` (non-persisted hooks)
// and `createEntityDraftStore` (per-entity vanilla persist stores) are the other two mint doors;
// this is the third, and the only one that is BOTH a singleton hook AND persisted.
//
// It reuses everything the hook factory already decided so no store re-litigates the wiring:
//   • Composition (devtools OUTERMOST, UI-Lib-Zustand.md D-5/§140): devtools(subscribeWithSelector(
//     persist(initializer, …))). subscribeWithSelector is always included (it only widens `subscribe`),
//     matching `createGatedStore`'s shape so the returned handle types identically.
//   • The gated `set`: cast to {@link GatedSet} so the devtools action LABEL is REQUIRED at every
//     transition (an unlabeled `set` is a `tsc` error) — the Redux-DevTools timeline stays readable.
//   • `STORE_DEVTOOLS_ENABLED` (DEV + extension present) gates the bridge — node lane stays warn-clean.
//   • A module STORAGE-key registry: two stores persisting to one `orb:<name>` key would clobber each
//     other silently; a duplicate name THROWS at creation (the §11.5 STORAGE_KEYS uniqueness belt).
//
// Persist discipline the caller MUST supply (UI-Primitives §13.1 — the default `merge` is SHALLOW):
//   • `partialize` picks EXACTLY the keys that persist — a transient field (e.g. an open-modal id)
//     never resurrects stale from localStorage.
//   • `version` + a TOTAL, crash-proof `migrate` — any unknown/corrupt persisted shape degrades to a
//     valid default, never a throw that bricks the shell.
// State-law recap the wrapper does NOT relax (gate `state:files`): one store per file, callers never
// see raw set/getState across a module boundary — the store's own file exports intent-named actions
// + narrow read hooks (see shell-store.ts).

import { create } from "zustand";
import type { StateStorage } from "zustand/middleware";
import { createJSONStorage, devtools, persist, subscribeWithSelector } from "zustand/middleware";
import type { GatedSet, GatedStoreHook } from "./create-gated-store";
import { STORE_DEVTOOLS_ENABLED } from "./create-gated-store";

const STORAGE_KEY_PREFIX = "orb:";
const registeredNames = new Set<string>();

export interface PersistedStoreOptions<T, TPersisted> {
  /** Bump when the persisted SHAPE changes; `migrate` decides what survives a bump. */
  readonly version: number;
  /** TOTAL migrate: every unrecognized/older persisted shape returns a valid default (never throws). */
  readonly migrate: (persisted: unknown, version: number) => T;
  /** The EXACT keys that persist — transient fields are excluded so they can't resurrect stale. */
  readonly partialize: (state: T) => TPersisted;
  /** Injectable storage (tests pin an in-memory Map). @defaultValue localStorage */
  readonly storage?: StateStorage;
}

/**
 * Mint a gated, persisted store hook. `name` becomes both the devtools connection label AND the
 * namespaced localStorage key (`orb:<name>`) — unique across all persisted stores (a duplicate
 * THROWS at creation). The initializer's `set` requires the devtools action label at every call.
 */
export function createPersistedStore<T, TPersisted = T>(
  name: string,
  initializer: (set: GatedSet<T>, get: () => T) => T,
  options: PersistedStoreOptions<T, TPersisted>,
): GatedStoreHook<T> {
  if (registeredNames.has(name)) {
    throw new Error(
      `createPersistedStore: duplicate store name "${name}" — two stores would clobber one ` +
        "localStorage key. Every persisted store needs a unique name.",
    );
  }
  registeredNames.add(name);

  const storageKey = `${STORAGE_KEY_PREFIX}${name}`;

  return create<T>()(
    devtools(
      subscribeWithSelector(
        persist((set, get): T => initializer(set as GatedSet<T>, get), {
          name: storageKey,
          version: options.version,
          migrate: options.migrate,
          partialize: (s): TPersisted => options.partialize(s),
          ...(options.storage === undefined
            ? {}
            : { storage: createJSONStorage(() => options.storage as StateStorage) }),
        }),
      ),
      { name: storageKey, enabled: STORE_DEVTOOLS_ENABLED },
    ),
  ) as GatedStoreHook<T>;
}
