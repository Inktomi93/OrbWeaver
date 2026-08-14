// The DURABLE-LOCAL NAMESPACE (staleness-and-session-freshness.md §4.2.1) — the shared half of the two
// persistence doors (`create-persisted-store.ts`, `create-entity-draft-store.ts`). Every `orb:*` /
// `orb-draft:*` blob was keyed per-ORIGIN, which makes a browser's localStorage a single flat world that no
// identity change can invalidate: the dev latch re-mints the db, user ids move era to era, and the surviving
// blobs keep pointing view state (a tag filter, a composer draft, a shell section) at rows that belong to a
// different identity. That is durable staleness by construction — no event can ever reach it, and a plain
// reload rehydrates the same bytes, which is exactly why the reported repro survived a reload and only died
// when localStorage was deleted by hand.
//
// THE KEY IS THE FIX: `orb:u/<userId>/<name>`. A blob written by one identity is unreachable to another, and
// an identity change is a namespace change rather than a sanitize problem.
//
// THE BOOT HINT is why this is not a flash. Stores are module-level singletons: they mint (and zustand
// rehydrates them SYNCHRONOUSLY off localStorage) long before any query can say who the viewer is. So the
// door records the last-bound userId under one pointer key and mints against it at boot; `app-root` calls
// `bindDurableLocalToUser` once the viewer read lands and the common case — the same human returning — is a
// no-op with zero rehydrate and zero flash. Only a genuine identity CHANGE pays a rehydrate.
//
// LEGACY ADOPTION runs exactly once per browser: with no hint recorded, stores mint on the OLD un-namespaced
// key, and the first bind MOVES each blob to the user key and deletes the original. The move goes through
// each store's own persist storage (never a raw `localStorage` write) so an injected test storage adopts
// identically, and so a store that opted into a different storage backend is never bypassed.
//
// The raw-`localStorage` reads/writes below are the POINTER only — the reason this file is on
// `persistence-boundary`'s allowlist. Nothing else here touches browser storage directly.

import type { UserId } from "@orb/kit/ids";

/** Where the last-bound identity is recorded, so a cold boot mints on the right namespace (see the header). */
const ACTIVE_USER_KEY = "orb:active-user";

/** The un-namespaced era's key shape, kept only to be adopted away from. */
function legacyKey(prefix: string, name: string): string {
  return `${prefix}${name}`;
}

/** The persist-middleware surface this module drives. Structural: both doors hand over a zustand store api,
 *  and a unit test can hand over a hand-rolled double without importing zustand.
 *
 *  `persist` is OPTIONAL because zustand makes it optional: when the resolved storage is falsy — no
 *  `localStorage` at all (a node lane, a browser with storage disabled) — the middleware EARLY-RETURNS
 *  before assigning `api.persist` (verified in the installed `zustand/esm/middleware.mjs`). A store in that
 *  state persists nothing, so there is nothing to re-key; treating it as absent is the honest reading, and
 *  the alternative is a boot crash on a browser that merely refused storage. */
export interface DurableLocalPersistApi {
  readonly persist?:
    | {
        readonly setOptions: (options: { readonly name: string }) => void;
        readonly rehydrate: () => Promise<void> | void;
        readonly getOptions: () => { readonly storage?: DurableLocalStorage | undefined };
      }
    | undefined;
}

/** The slice of zustand's `PersistStorage` the adoption move needs (values are already-parsed envelopes). */
export interface DurableLocalStorage {
  readonly getItem: (name: string) => unknown;
  readonly setItem: (name: string, value: unknown) => unknown;
  readonly removeItem: (name: string) => unknown;
}

interface RegisteredStore {
  /** The door prefix — `orb:` for a persisted store, `orb-draft:` for an entity-draft store. */
  readonly prefix: string;
  readonly name: string;
  readonly api: DurableLocalPersistApi;
}

const registry: RegisteredStore[] = [];

/** The identity every durable-local key is currently scoped to, or null for the pre-adoption legacy world. */
let activeUserId: UserId | null = readBootHint();

/** The recorded boot hint, or null (no browser storage, never bound, or a non-string value). */
function readBootHint(): UserId | null {
  const storage = (globalThis as { localStorage?: Storage }).localStorage;
  if (storage === undefined) {
    return null;
  }
  try {
    return storage.getItem(ACTIVE_USER_KEY) as UserId | null;
  } catch {
    // A browser with storage disabled throws on access; the app degrades to the legacy (unscoped) namespace
    // rather than failing to boot — nothing is persisted there either, so there is nothing to leak.
    return null;
  }
}

function writeBootHint(userId: UserId): void {
  const storage = (globalThis as { localStorage?: Storage }).localStorage;
  try {
    storage?.setItem(ACTIVE_USER_KEY, userId);
  } catch {
    // Same posture as the read: a browser refusing storage costs the no-flash optimization, nothing more.
  }
}

/**
 * The storage key a durable-local store persists under. `orb:u/<userId>/<name>` once an identity is bound;
 * the legacy `orb:<name>` before the first bind on this browser (see the header's adoption note).
 */
export function durableLocalKey(prefix: string, name: string): string {
  return activeUserId === null ? legacyKey(prefix, name) : `${prefix}u/${activeUserId}/${name}`;
}

/** Enrol a minted store so `bindDurableLocalToUser` can re-key (and, once, adopt) it. Called by the doors. */
export function registerDurableLocalStore(entry: RegisteredStore): void {
  registry.push(entry);
}

/** Move a legacy blob onto the user-scoped key through the store's OWN storage, then delete the original. */
function adoptLegacyBlob(entry: RegisteredStore, targetKey: string, storage: DurableLocalStorage | undefined): void {
  if (storage === undefined) {
    return;
  }
  const value = storage.getItem(legacyKey(entry.prefix, entry.name));
  // Async storages are not used by either door; a thenable here means someone wired one, and silently
  // half-adopting it would be worse than leaving the legacy blob where it is.
  if (value === null || value === undefined || value instanceof Promise) {
    return;
  }
  storage.setItem(targetKey, value);
  storage.removeItem(legacyKey(entry.prefix, entry.name));
}

/**
 * Bind every durable-local store to `userId`. Idempotent, and the common path is free:
 *   • ALREADY BOUND to this user — nothing happens (no rehydrate, no flash);
 *   • LEGACY (no identity bound yet) — each store's blob is ADOPTED onto the user key and the legacy key is
 *     deleted. The in-memory state already came from that blob, so no rehydrate is needed;
 *   • A DIFFERENT user — re-key and `rehydrate()`, which drops the previous identity's view state and loads
 *     this one's (or the store's defaults). This is the identity boundary: nothing crosses it.
 * Call once, from the composition route, as soon as the viewer identity resolves.
 */
export function bindDurableLocalToUser(userId: UserId): void {
  if (activeUserId === userId) {
    return;
  }
  const adopting = activeUserId === null;
  activeUserId = userId;
  writeBootHint(userId);
  for (const entry of registry) {
    const persist = entry.api.persist;
    if (persist === undefined) {
      continue; // storage-less store — it persists nothing, so there is no key to move (see the type's note)
    }
    const key = durableLocalKey(entry.prefix, entry.name);
    if (adopting) {
      adoptLegacyBlob(entry, key, persist.getOptions().storage);
    }
    persist.setOptions({ name: key });
    if (!adopting) {
      void persist.rehydrate();
    }
  }
}

/** The bound identity — the lens a test (or the dev bridge) asserts the namespace through. */
export function activeDurableLocalUserId(): UserId | null {
  return activeUserId;
}

/** Test seam — forget every registered store and unbind the identity (the module is page-scoped state). */
export function __resetDurableLocal(): void {
  registry.length = 0;
  activeUserId = null;
}
