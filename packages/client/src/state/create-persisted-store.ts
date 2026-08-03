// Hook-shaped, PERSISTED sibling of createGatedStore. A duplicate storage key across two stores would
// clobber each other silently, so a duplicate `name` THROWS at creation.

import { create } from "zustand";
import type { StateStorage } from "zustand/middleware";
import { createJSONStorage, devtools, persist, subscribeWithSelector } from "zustand/middleware";
import type { GatedSet, GatedStoreHook } from "./create-gated-store.ts";
import { STORE_DEVTOOLS_ENABLED } from "./create-gated-store.ts";

const STORAGE_KEY_PREFIX = "orb:";
const registeredNames = new Set<string>();

export interface PersistedStoreOptions<T, TPersisted> {
  /** Bump when the persisted SHAPE changes; `migrate` decides what survives a bump. */
  readonly version: number;
  /** TOTAL sanitizer, run on EVERY rehydrate — not just version bumps. Zustand's `migrate` fires only on
   *  a version MISMATCH, so a same-version blob carrying stale/corrupt ids (e.g. a pre-rollback
   *  `activeSection` a shrunk section registry no longer knows) would otherwise flow through untouched and
   *  brick the app at the registry lookup. We wire this as the always-run `merge` seam so every persisted
   *  store's crash-proof `migrate` also self-heals a poisoned current-version blob (#11 autosave doctrine:
   *  an invalid persisted state is DISCARDED, never trusted, never allowed to crash). MUST be TOTAL:
   *  every unrecognized/older/corrupt persisted shape returns a valid default (never throws). */
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
      `createPersistedStore: duplicate store name "${name}" — two stores would clobber one localStorage key. Every persisted store needs a unique name.`,
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
          // The always-run rehydrate seam. Zustand calls `migrate` ONLY on a version mismatch and `merge`
          // on EVERY rehydrate (version-matched blobs included) — so we run `migrate` here too, over the
          // (possibly already-migrated on a bump) persisted blob, to sanitize a same-version poisoned blob
          // before it reaches the store. `migrate` is TOTAL + idempotent, so the double-pass on a bump is a
          // no-op. We ignore zustand's default shallow-merge-with-current: a persisted store's identity is
          // its migrated persisted slice, and any transient field is (re)seeded by the initializer, not the
          // stale blob. `persisted` is `unknown` (zustand's own type) — `migrate` owns the validation.
          merge: (persisted: unknown, _current: T): T => options.migrate(persisted, options.version),
          partialize: (s): TPersisted => options.partialize(s),
          ...(options.storage === undefined ? {} : { storage: createJSONStorage(() => options.storage as StateStorage) }),
        }),
      ),
      { name: storageKey, enabled: STORE_DEVTOOLS_ENABLED },
    ),
  ) as GatedStoreHook<T>;
}
