// The production door admits only device-local names classified beside these factories.
import type { GatedSet, GatedStoreHook } from "./create-gated-store.ts";
import type { DeviceLocalStoreName } from "./device-local-registry.ts";
import type { PersistedStoreOptions } from "./persisted-store-implementation.ts";
import { createPersistedStore as implementation } from "./persisted-store-implementation.ts";

/** Mint a classified device-local store without changing the shared implementation's function identity. */
export const createPersistedStore: <T, TPersisted = T>(
  name: DeviceLocalStoreName,
  initializer: (set: GatedSet<T>, get: () => T) => T,
  options: PersistedStoreOptions<T, TPersisted>,
) => GatedStoreHook<T> = implementation;
