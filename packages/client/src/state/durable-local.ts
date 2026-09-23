// The DURABLE-LOCAL NAMESPACE (D138) — the shared half of the two
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
// THE HINT IS NOT IDENTITY, AND SINCE #854 THE TYPES SAY SO. It is browser-writable, so all it may decide
// is which namespace the MINT reads; only the session-verified viewer (`sessions.me`, threaded through
// `data/use-session-recovery.ts`) decides whether that namespace stays live. Every skip below therefore
// compares against the VERIFIED id, and a hint naming anyone else takes the full reset + rehydrate onto the
// verified viewer's namespace. That property used to rest entirely on `bindDurableLocalToUser` HAPPENING to
// have one caller: the module cannot inspect an id's provenance, so a future caller handing it a
// client-derived one would make the skip honour a forged namespace. The entry point now takes a
// `VerifiedUserId` (`@orb/kit/ids`), minted only at the session-recovery seam, and the two module-level
// slots split along the same line — `activeUserId` is a plain `UserId` because it can come from the HINT,
// while `readyUserId`/`desiredUserId` are `VerifiedUserId` because only a verified bind ever writes them.
// A bare `UserId` reaching the write gate is now a tsc error rather than a review question.
//
// THE RESET IS IN-MEMORY, ALWAYS (`resetWithoutPersisting`). zustand's `persist` writes on every
// `setState`, so dropping a projection through the store's own hook would overwrite whichever blob it is
// currently pointed at — bytes that belong to the outgoing identity, to the legacy era about to be
// adopted, or to the returning user. Nothing on this path may erase durable bytes.
//
// LEGACY ADOPTION runs exactly once per browser: with no hint recorded, stores mint on the OLD un-namespaced
// key, and the first bind MOVES each blob to the user key and deletes the original. Every target is then
// rehydrated before readiness: a prior partial attempt or reload may already have moved one blob, so the
// current in-memory legacy projection is not evidence that every target still matches it. The move goes through
// each store's own persist storage (never a raw `localStorage` write) so an injected test storage adopts
// identically, and so a store that opted into a different storage backend is never bypassed.
//
// The raw-`localStorage` reads/writes below are the POINTER only — the reason this file is on
// `persistence-boundary`'s allowlist. Nothing else here touches browser storage directly.

import type { UserId, VerifiedUserId } from "@orb/kit/ids";

/** Where the last-bound identity is recorded, so a cold boot mints on the right namespace (see the header). */
const ACTIVE_USER_KEY = "orb:active-user";
/** A first-user legacy move may span failures, identity switches, and reloads; keep its owner durable. */
const PENDING_ADOPTION_KEY = "orb:pending-legacy-adoption";

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
        /** zustand MERGES these over the live options, so either field alone is a legal call: `name`
         *  re-keys the store, `storage` swaps the backend the middleware writes through (used to
         *  blindfold a reset — see `resetWithoutPersisting`). */
        readonly setOptions: (options: { readonly name?: string; readonly storage?: DurableLocalStorage }) => void;
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
  /** Drop the previous user's in-memory projection before a new namespace is allowed to hydrate. This is
   *  an IN-MEMORY operation: every caller here goes through `resetWithoutPersisting`, which blindfolds the
   *  store's persist storage so the drop cannot reach anyone's durable bytes. */
  readonly reset: () => void;
}

const registry: RegisteredStore[] = [];

/** The identity every durable-local key is currently scoped to, or null for the pre-adoption legacy world. */
let activeUserId: UserId | null = readBootHint();
/** The identity whose bytes the in-memory projections currently hold. At module load that is the BOOT HINT
 *  and not null: every store mints on `durableLocalKey()` and zustand rehydrates it off that namespace
 *  synchronously, so the mint IS a completed hydration of the hinted identity — which is what lets the
 *  same human returning skip the rebind entirely. Distinct from `readyUserId` on purpose: this says whose
 *  bytes are loaded, never that a session verified them, so it must not be used to open the write gate. */
let projectionUserId: UserId | null = activeUserId;
/** The session-verified identity whose hydration currently owns the in-memory stores. `VerifiedUserId`, not
 *  `UserId`: this is the slot the write gate opens on, and the ONLY writer is a verified bind. */
let readyUserId: VerifiedUserId | null = null;
/** The most recent verified bind request — what a queued bind checks it has not been superseded by. */
let desiredUserId: VerifiedUserId | null = null;
let adoptionUserId: UserId | null = readAdoptionHint();
let bindTail: Promise<void> = Promise.resolve();

/** The recorded boot hint, or null (no browser storage, never bound, or a non-string value). */
function readBootHint(): UserId | null {
  const storage = (globalThis as { localStorage?: Storage }).localStorage;
  if (storage === undefined) {
    return null;
  }
  // @orb-waive caught-failure-ownership(catch): refused browser storage has no durable bytes to isolate; null selects the storage-less legacy namespace. Ends if the boot hint becomes authoritative.
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
  // @orb-waive caught-failure-ownership(catch): refused storage costs only the no-flash boot hint; the verified bind still owns isolation. Ends if the hint becomes authoritative.
  try {
    storage?.setItem(ACTIVE_USER_KEY, userId);
  } catch {
    /* ownership marker above */
  }
}

function readAdoptionHint(): UserId | null {
  const storage = (globalThis as { localStorage?: Storage }).localStorage;
  // @orb-waive caught-failure-ownership(catch): refused storage cannot hold legacy blobs or the pending pointer; module memory retains the owner for this page. Ends if storage refusal can coexist with readable durable blobs.
  try {
    return storage?.getItem(PENDING_ADOPTION_KEY) as UserId | null;
  } catch {
    return null;
  }
}

function writeAdoptionHint(userId: UserId): void {
  const storage = (globalThis as { localStorage?: Storage }).localStorage;
  // This write is the ownership handoff for every still-legacy blob. If browser storage exists but refuses
  // the pointer, abort before moving a single byte; otherwise a reload could let another identity claim the
  // remaining unscoped blobs. A missing storage object is the storage-less zustand arm and has no durable
  // browser bytes to outlive this module instance.
  storage?.setItem(PENDING_ADOPTION_KEY, userId);
}

function clearAdoptionHint(): void {
  const storage = (globalThis as { localStorage?: Storage }).localStorage;
  // @orb-waive caught-failure-ownership(catch): a stale pending pointer only causes one safe target rehydrate on a later bind. Ends if adoption stops being idempotent.
  try {
    storage?.removeItem(PENDING_ADOPTION_KEY);
  } catch {
    /* ownership marker above */
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

/** A storage that swallows every write — the blindfold `resetWithoutPersisting` wears. */
const BLIND_STORAGE: DurableLocalStorage = {
  getItem: (): null => null,
  setItem: (): void => undefined,
  removeItem: (): void => undefined,
};

/**
 * Drop ONE store's in-memory projection without writing it through that store's persist storage.
 *
 * zustand's `persist` patches `setState` to write the new state to whatever key it currently holds
 * (verified in the installed `zustand/esm/middleware.mjs`), so a plain reset does not merely clear
 * memory — it OVERWRITES a real blob with the store's defaults, and the blob it lands on is always one
 * this module is supposed to be protecting: the OUTGOING identity's on a switch, the still-unmoved
 * LEGACY blob on an adoption (which then adopts the emptied one), and — before the same-user skip below
 * — the returning user's OWN, which the following `rehydrate()` then read back as defaults. That last
 * one made every `orb:*` blob app-wide inert on every boot (#837).
 *
 * So blindfold the storage for the duration and restore it in a `finally`: the reset is an in-memory
 * operation by contract, and no durable byte here belongs to us to erase. A store with no persist api
 * (the storage-less arm) persists nothing, so there is nothing to blindfold.
 */
function resetWithoutPersisting(entry: RegisteredStore): void {
  const persist = entry.api.persist;
  if (persist === undefined) {
    entry.reset();
    return;
  }
  const storage = persist.getOptions().storage;
  if (storage === undefined) {
    entry.reset();
    return;
  }
  persist.setOptions({ storage: BLIND_STORAGE });
  try {
    entry.reset();
  } finally {
    persist.setOptions({ storage });
  }
}

function resetRegisteredStores(): void {
  for (const entry of registry) {
    resetWithoutPersisting(entry);
  }
}

async function rebindRegisteredStores(adopting: boolean): Promise<void> {
  const rehydrates: Promise<void>[] = [];
  resetRegisteredStores();
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
    rehydrates.push(Promise.resolve(persist.rehydrate()));
  }
  await Promise.all(rehydrates);
}

async function bindQueuedUser(userId: VerifiedUserId): Promise<void> {
  if (desiredUserId !== userId) {
    return; // superseded before this queued bind began
  }
  if (activeUserId === userId && readyUserId === userId) {
    return; // already bound and hydrated in this page
  }
  // THE SAME HUMAN RETURNING — the header's contract, and the reason this file records a boot hint at
  // all. The stores minted on THIS namespace and zustand rehydrated them off it synchronously, so their
  // projection is already this identity's own bytes; a rebind would drop that projection only to load the
  // same bytes back — and before `resetWithoutPersisting` the drop ERASED them on the way through, which
  // is what made every `orb:*` blob inert on every boot (#837).
  //
  // The skip is narrow BY CONSTRUCTION, and each conjunct carries its own weight:
  //   • `activeUserId === userId` — the bound namespace is the VERIFIED viewer's. `userId` comes from
  //     `sessions.me` (`data/use-session-recovery.ts`); the boot hint is browser-writable and only ever
  //     chose which namespace to MINT on, so a forged/stale hint naming anyone else fails here and pays
  //     the full reset + rehydrate. The hint is never trusted as identity.
  //   • `projectionUserId === userId` — the in-memory bytes are that namespace's. A bind that failed
  //     part-way already moved `activeUserId` while leaving the PREVIOUS identity's projection in
  //     memory; skipping on the namespace alone would open the write gate over it.
  //   • `adoptionUserId === null` — a pending legacy adoption still has bytes to MOVE, so it is not a
  //     no-op even when the namespace matches.
  if (activeUserId === userId && projectionUserId === userId && adoptionUserId === null) {
    readyUserId = userId;
    writeBootHint(userId); // idempotent; the skip leaves exactly the post-state the full path would
    return;
  }

  const adopting = activeUserId === null || adoptionUserId === userId;
  if (activeUserId === null) {
    adoptionUserId = userId;
    writeAdoptionHint(userId);
  }
  readyUserId = null;
  projectionUserId = null;
  activeUserId = userId;
  await rebindRegisteredStores(adopting);
  if (desiredUserId !== userId) {
    // A later identity arrived while this storage read was held. Its bytes never become readable: erase
    // them before the queued owner gets its turn, and keep writes gated throughout.
    resetRegisteredStores();
    return;
  }
  projectionUserId = userId;
  readyUserId = userId;
  writeBootHint(userId);
  if (adoptionUserId === userId) {
    adoptionUserId = null;
    clearAdoptionHint();
  }
}

/**
 * Bind every durable-local store to `userId`. Idempotent, and the common path is free:
 *   • ALREADY BOUND to this user — nothing happens (no rehydrate, no flash);
 *   • LEGACY (no identity bound yet) — each store's blob is ADOPTED onto the user key and the legacy key is
 *     deleted, then every target is rehydrated before readiness (including targets moved by a prior attempt);
 *   • A DIFFERENT user — re-key and `rehydrate()`, which drops the previous identity's view state and loads
 *     this one's (or the store's defaults). This is the identity boundary: nothing crosses it.
 * Call once, from the composition route, as soon as the viewer identity resolves.
 */
export function bindDurableLocalToUser(userId: VerifiedUserId): Promise<void> {
  desiredUserId = userId;
  const run = bindTail.then(() => bindQueuedUser(userId));
  // @orb-waive caught-failure-ownership(run): bindTail recovers only the serialization queue; the original run is returned and rejects to AppRoot's visible retry boundary. Ends if callers receive bindTail instead of run.
  bindTail = run.catch(() => undefined);
  return run;
}

/** Whether the verified identity owns every in-memory durable store. */
export function durableLocalReadyFor(userId: UserId): boolean {
  return readyUserId === userId;
}

/** Shared write gate used by both persistence doors during an identity transition. */
export function durableLocalWritesAllowed(): boolean {
  // Before the first identity is requested this is the legacy/adoption world: stores may hydrate and tests
  // may seed it. The instant a bind is requested, writes close until that exact user's hydration owns state.
  return (activeUserId === null && desiredUserId === null) || (readyUserId !== null && readyUserId === activeUserId);
}

/** The bound identity — the lens a test (or the dev bridge) asserts the namespace through. */
export function activeDurableLocalUserId(): UserId | null {
  return activeUserId;
}

/** Test seam — forget every registered store and unbind the identity (the module is page-scoped state). */
export function __resetDurableLocal(): void {
  registry.length = 0;
  activeUserId = null;
  projectionUserId = null;
  readyUserId = null;
  desiredUserId = null;
  adoptionUserId = null;
  bindTail = Promise.resolve();
}
