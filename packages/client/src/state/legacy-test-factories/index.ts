// Private compatibility for existing legacy fixtures; never a production or new-test entry.

export type { DurableLocalPersistApi, DurableLocalStorage } from "../durable-local.ts";
export {
  __resetDurableLocal,
  activeDurableLocalUserId,
  bindDurableLocalToUser,
  durableLocalKey,
  durableLocalReadyFor,
  durableLocalWritesAllowed,
  registerDurableLocalStore,
} from "../durable-local.ts";
export { createEntityDraftStore } from "../entity-draft-store-implementation.ts";
export { createPersistedStore, type PersistedStoreOptions } from "../persisted-store-implementation.ts";
