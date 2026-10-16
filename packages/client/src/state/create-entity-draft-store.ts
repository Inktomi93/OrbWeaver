// The production draft door admits only canonical device-local names.
import type { DeviceLocalStoreName } from "./device-local-registry.ts";
import type { EntityDraftStore, EntityDraftStoreConfig as RawConfig } from "./entity-draft-store-implementation.ts";
import { createEntityDraftStore as implementation } from "./entity-draft-store-implementation.ts";

export type { EntityDraftStore } from "./entity-draft-store-implementation.ts";
export type EntityDraftStoreConfig<TInput> = Omit<RawConfig<TInput>, "name"> & { readonly name: DeviceLocalStoreName };

/** Mint a classified draft store; raw fixture names remain private to the legacy test seam. */
export const createEntityDraftStore: <TInput>(config: EntityDraftStoreConfig<TInput>) => EntityDraftStore<TInput> = implementation;
