// Hook-shaped, PERSISTED sibling of createGatedStore. A duplicate storage key across two stores would
// clobber each other silently, so a duplicate `name` THROWS at creation.

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
