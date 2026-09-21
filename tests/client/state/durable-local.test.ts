// The per-user durable-local namespace (staleness-and-session-freshness.md §4.2.1, owner fork F1). The
// defect it closes: every `orb:*` blob was per-ORIGIN, so view state, tag filters and composer PROSE
// survived an identity change that no event could ever invalidate — the reload-resistant half of the
// reported repro, and the reason deleting localStorage by hand was the only cure.
//
// The store doubles here are hand-rolled rather than real zustand mints: what is under test is the KEY
// SCHEME and the three bind arms (no-op / adopt / switch), and a real `persist` would add a rehydrate
// pipeline that hides which of those arms actually ran. They are HALF the picture on purpose, and the
// missing half is its own describe block at the bottom of this file: a double's `reset` writes nothing,
// so no double can see what an arm does to the durable BYTES — which is precisely where #837 lived.

import type { DurableLocalPersistApi, DurableLocalStorage, PersistedStoreOptions } from "@orb/client/state";
import {
  __resetDurableLocal,
  activeDurableLocalUserId,
  bindDurableLocalToUser,
  durableLocalKey,
  durableLocalReadyFor,
  durableLocalWritesAllowed,
  registerDurableLocalStore,
} from "@orb/client/state";
import type { UserId, VerifiedUserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { afterEach, describe, vi } from "vitest";
import type { StateStorage } from "zustand/middleware";
import { expect, test } from "../../support/fixtures.ts";

// #854 — the bind boundary now takes the SESSION-VERIFIED brand (`VerifiedUserId`), so the doubles mint
// it here exactly as the session-recovery seam does off `sessions.me`. It is a sub-brand of `UserId`, so
// every other assertion in this file (keys, the forged-hint arm, `durableLocalReadyFor`) is unchanged.
const ALICE = castId<VerifiedUserId>("usr_alice");
const BOB = castId<VerifiedUserId>("usr_bob");

interface StoreDouble {
  readonly api: DurableLocalPersistApi;
  readonly map: Map<string, unknown>;
  readonly keys: string[];
  currentState: unknown;
  rehydrates: number;
  resets: number;
  rehydrate: () => Promise<void> | void;
  reset: () => void;
}

/** A store double: records every `setOptions` key and every `rehydrate`, over one shared storage map. */
/** `persist` is OPTIONAL in production because zustand omits it when the resolved storage is falsy
 *  (durable-local.ts's own note). The double ALWAYS installs one, so narrow in ONE place rather than
 *  re-asserting at every call site — and throw rather than optional-chain, because a double that lost its
 *  persist api would otherwise make these tests silently exercise nothing. */
function persistOf(double: StoreDouble): NonNullable<DurableLocalPersistApi["persist"]> {
  const { persist } = double.api;
  if (persist === undefined) {
    throw new Error("storeDouble must install a persist api");
  }
  return persist;
}

function storeDouble(map: Map<string, unknown>): StoreDouble {
  const own: DurableLocalStorage = {
    getItem: (name): unknown => map.get(name) ?? null,
    setItem: (name, value): void => {
      map.set(name, value);
    },
    removeItem: (name): void => {
      map.delete(name);
    },
  };
  // zustand MERGES `setOptions` over the live options and swaps the storage when one is supplied, so the
  // double must too — the rebind re-keys with `{ name }` and blindfolds with `{ storage }`.
  let storage = own;
  const double: StoreDouble = {
    api: {
      persist: {
        setOptions: (options): void => {
          if (options.name !== undefined) {
            double.keys.push(options.name);
          }
          if (options.storage !== undefined) {
            storage = options.storage;
          }
        },
        rehydrate: (): Promise<void> | void => {
          double.rehydrates += 1;
          return double.rehydrate();
        },
        getOptions: (): { readonly storage?: DurableLocalStorage } => ({ storage }),
      },
    },
    map,
    keys: [],
    currentState: "DEFAULT",
    rehydrates: 0,
    resets: 0,
    rehydrate: (): void => {
      double.currentState = map.get(double.keys.at(-1) ?? "") ?? "DEFAULT";
    },
    // Faithful to production: zustand's `persist` patches `setState`, so a reset WRITES the defaults to
    // the key the store currently holds. Writing it through `storage` (not `own`) is what makes the
    // blindfold observable here at all. Before the first `setOptions` the double cannot know its mint
    // key, so a first-bind reset writes nowhere — that window is covered by the REAL-store block below.
    reset: (): void => {
      double.resets += 1;
      double.currentState = "DEFAULT";
      const key = double.keys.at(-1);
      if (key !== undefined) {
        storage.setItem(key, "DEFAULT");
      }
    },
  };
  return double;
}

afterEach(() => {
  __resetDurableLocal();
  vi.unstubAllGlobals();
});

describe("durableLocalKey", () => {
  test("legacy (un-namespaced) before any identity is bound, user-scoped after", async () => {
    expect(durableLocalKey("orb:", "shell")).toBe("orb:shell");
    const store = storeDouble(new Map());
    registerDurableLocalStore({ prefix: "orb:", name: "shell", api: store.api, reset: store.reset });
    await bindDurableLocalToUser(ALICE);
    expect(durableLocalKey("orb:", "shell")).toBe(`orb:u/${ALICE}/shell`);
    expect(durableLocalKey("orb-draft:", "character")).toBe(`orb-draft:u/${ALICE}/character`);
    expect(activeDurableLocalUserId()).toBe(ALICE);
  });
});

describe("bindDurableLocalToUser — the three arms", () => {
  // ADOPT: the once-per-browser migration. The blob must MOVE (a copy would leave the leaked bytes behind
  // for the next identity), then the target must rehydrate because an earlier partial attempt may already
  // have moved a sibling blob before this module instance was created.
  test("legacy → first user ADOPTS the blob onto the user key and DELETES the original", async () => {
    const map = new Map<string, unknown>([["orb:character-library", { state: { tagFilter: ["tag_x"] }, version: 1 }]]);
    const store = storeDouble(map);
    registerDurableLocalStore({ prefix: "orb:", name: "character-library", api: store.api, reset: store.reset });

    await bindDurableLocalToUser(ALICE);

    expect(map.get(`orb:u/${ALICE}/character-library`)).toEqual({ state: { tagFilter: ["tag_x"] }, version: 1 });
    expect(map.has("orb:character-library")).toBe(false);
    expect(store.keys).toEqual([`orb:u/${ALICE}/character-library`]);
    expect(store.rehydrates).toBe(1);
  });

  // SWITCH: the identity boundary. Nothing is adopted (that would hand Alice's state to Bob) and the store
  // MUST rehydrate — otherwise the in-memory state is still the previous identity's, just writing to a new key.
  test("user → a DIFFERENT user re-keys and REHYDRATES, and never adopts", async () => {
    const map = new Map<string, unknown>([["orb:shell", { state: { activeSection: "corpus" }, version: 2 }]]);
    const store = storeDouble(map);
    registerDurableLocalStore({ prefix: "orb:", name: "shell", api: store.api, reset: store.reset });

    await bindDurableLocalToUser(ALICE);
    await bindDurableLocalToUser(BOB);

    expect(store.keys).toEqual([`orb:u/${ALICE}/shell`, `orb:u/${BOB}/shell`]);
    expect(store.rehydrates).toBe(2); // initial adoption + the switch
    // Alice's adopted blob stays hers; Bob's namespace is empty, so Bob boots on defaults.
    expect(map.get(`orb:u/${ALICE}/shell`)).toBeDefined();
    expect(map.has(`orb:u/${BOB}/shell`)).toBe(false);
  });

  test("re-binding the SAME user is a no-op — no re-key, no rehydrate, no flash", async () => {
    const store = storeDouble(new Map());
    registerDurableLocalStore({ prefix: "orb:", name: "tag-library", api: store.api, reset: store.reset });

    await bindDurableLocalToUser(ALICE);
    await bindDurableLocalToUser(ALICE);

    expect(store.keys).toEqual([`orb:u/${ALICE}/tag-library`]);
    expect(store.rehydrates).toBe(1);
  });

  // THE D2 CLAIM, stated as an assertion: two identities on one browser cannot read each other's blobs.
  test("two users on ONE storage never read each other's state", async () => {
    const map = new Map<string, unknown>();
    const store = storeDouble(map);
    registerDurableLocalStore({ prefix: "orb:", name: "composer-draft", api: store.api, reset: store.reset });

    await bindDurableLocalToUser(ALICE);
    map.set(durableLocalKey("orb:", "composer-draft"), { state: { drafts: { room: "alice's unsent line" } }, version: 1 });
    await bindDurableLocalToUser(BOB);

    expect(map.get(durableLocalKey("orb:", "composer-draft"))).toBeUndefined();
    expect(map.get(`orb:u/${ALICE}/composer-draft`)).toEqual({ state: { drafts: { room: "alice's unsent line" } }, version: 1 });
  });

  test("every registered store is re-keyed, not just the first", async () => {
    const map = new Map<string, unknown>();
    const shell = storeDouble(map);
    const drafts = storeDouble(map);
    registerDurableLocalStore({ prefix: "orb:", name: "shell", api: shell.api, reset: shell.reset });
    registerDurableLocalStore({ prefix: "orb-draft:", name: "character", api: drafts.api, reset: drafts.reset });

    await bindDurableLocalToUser(ALICE);

    expect(shell.keys).toEqual([`orb:u/${ALICE}/shell`]);
    expect(drafts.keys).toEqual([`orb-draft:u/${ALICE}/character`]);
  });

  // zustand's `persist` EARLY-RETURNS without assigning `api.persist` when the resolved storage is falsy
  // (verified in the installed middleware source) — a browser that refuses storage, or a node lane. Such a
  // store persists nothing, so the rebind must skip it rather than crash the boot on a missing property.
  test("a storage-less store (no `api.persist`) is skipped, not thrown on", async () => {
    registerDurableLocalStore({ prefix: "orb:", name: "storage-less", api: {}, reset: (): void => undefined });
    await expect(bindDurableLocalToUser(ALICE)).resolves.toBeUndefined();
    expect(activeDurableLocalUserId()).toBe(ALICE);
  });

  test("adoption with NO legacy blob writes nothing (a fresh browser is not a migration)", async () => {
    const map = new Map<string, unknown>();
    const store = storeDouble(map);
    registerDurableLocalStore({ prefix: "orb:", name: "fixture-store", api: store.api, reset: store.reset });

    await bindDurableLocalToUser(ALICE);

    expect([...map.keys()]).toEqual([]);
    expect(store.keys).toEqual([`orb:u/${ALICE}/fixture-store`]);
  });

  test("a partial legacy adoption retries every remaining store before declaring the user ready", async () => {
    const map = new Map<string, unknown>([
      ["orb:shell", { state: { activeSection: "corpus" }, version: 1 }],
      ["orb-draft:character", { state: { name: "legacy draft" }, version: 1 }],
    ]);
    const shell = storeDouble(map);
    const drafts = storeDouble(map);
    const draftStorage = persistOf(drafts).getOptions().storage;
    let failOnce = true;
    if (draftStorage === undefined) {
      throw new Error("draft storage double must exist");
    }
    const draftApi: DurableLocalPersistApi = {
      persist: {
        setOptions: (options): void => drafts.api.persist?.setOptions(options),
        rehydrate: (): Promise<void> | void => drafts.api.persist?.rehydrate(),
        getOptions: (): { readonly storage: DurableLocalStorage } => ({
          storage: {
            ...draftStorage,
            setItem: (name, value): unknown => {
              if (failOnce) {
                failOnce = false;
                throw new Error("draft adoption failed");
              }
              return draftStorage.setItem(name, value);
            },
          },
        }),
      },
    };
    registerDurableLocalStore({ prefix: "orb:", name: "shell", api: shell.api, reset: shell.reset });
    registerDurableLocalStore({ prefix: "orb-draft:", name: "character", api: draftApi, reset: drafts.reset });

    await expect(bindDurableLocalToUser(ALICE)).rejects.toThrow("draft adoption failed");
    expect(durableLocalReadyFor(ALICE)).toBe(false);
    expect(map.has("orb:shell")).toBe(false);
    expect(map.has("orb-draft:character")).toBe(true);

    await bindDurableLocalToUser(ALICE);

    expect(map.get(`orb:u/${ALICE}/shell`)).toEqual({ state: { activeSection: "corpus" }, version: 1 });
    expect(map.get(`orb-draft:u/${ALICE}/character`)).toEqual({ state: { name: "legacy draft" }, version: 1 });
    expect(map.has("orb:shell")).toBe(false);
    expect(map.has("orb-draft:character")).toBe(false);
    expect(durableLocalReadyFor(ALICE)).toBe(true);
  });

  test("a failed adoption never persists the boot hint, so a reload still adopts remaining legacy blobs", async () => {
    const hints = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => hints.get(key) ?? null,
      setItem: (key: string, value: string) => hints.set(key, value),
      removeItem: (key: string) => hints.delete(key),
    });
    const map = new Map<string, unknown>([
      ["orb:shell", { state: { activeSection: "corpus" }, version: 1 }],
      ["orb-draft:character", { state: { name: "legacy draft" }, version: 1 }],
    ]);
    const shell = storeDouble(map);
    const drafts = storeDouble(map);
    const draftStorage = persistOf(drafts).getOptions().storage;
    if (draftStorage === undefined) {
      throw new Error("draft storage double must exist");
    }
    registerDurableLocalStore({ prefix: "orb:", name: "shell", api: shell.api, reset: shell.reset });
    registerDurableLocalStore({
      prefix: "orb-draft:",
      name: "character",
      api: {
        persist: {
          setOptions: persistOf(drafts).setOptions,
          rehydrate: persistOf(drafts).rehydrate,
          getOptions: () => ({
            storage: {
              ...draftStorage,
              setItem: (): never => {
                throw new Error("draft adoption failed");
              },
            },
          }),
        },
      },
      reset: drafts.reset,
    });

    await expect(bindDurableLocalToUser(ALICE)).rejects.toThrow("draft adoption failed");
    expect(hints.get("orb:active-user")).toBeUndefined();
    expect(hints.get("orb:pending-legacy-adoption")).toBe(ALICE);

    __resetDurableLocal();
    const shellAfterReload = storeDouble(map);
    const draftsAfterReload = storeDouble(map);
    registerDurableLocalStore({ prefix: "orb:", name: "shell", api: shellAfterReload.api, reset: shellAfterReload.reset });
    registerDurableLocalStore({ prefix: "orb-draft:", name: "character", api: draftsAfterReload.api, reset: draftsAfterReload.reset });
    await bindDurableLocalToUser(ALICE);

    expect(map.has("orb-draft:character")).toBe(false);
    expect(map.get(`orb-draft:u/${ALICE}/character`)).toEqual({ state: { name: "legacy draft" }, version: 1 });
    expect(shellAfterReload.currentState).toEqual({ state: { activeSection: "corpus" }, version: 1 });
    expect(draftsAfterReload.currentState).toEqual({ state: { name: "legacy draft" }, version: 1 });
    expect(hints.get("orb:active-user")).toBe(ALICE);
    expect(hints.get("orb:pending-legacy-adoption")).toBeUndefined();
    expect(durableLocalReadyFor(ALICE)).toBe(true);
  });

  test("a refused pending-owner write aborts before adoption, so another identity cannot claim legacy bytes after reload", async () => {
    const hints = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => hints.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        if (key === "orb:pending-legacy-adoption") {
          throw new Error("pending owner refused");
        }
        hints.set(key, value);
      },
      removeItem: (key: string) => hints.delete(key),
    });
    const map = new Map<string, unknown>([
      ["orb:shell", { state: { owner: "alice" }, version: 1 }],
      ["orb-draft:character", { state: { owner: "alice-draft" }, version: 1 }],
    ]);
    const shell = storeDouble(map);
    const drafts = storeDouble(map);
    registerDurableLocalStore({ prefix: "orb:", name: "shell", api: shell.api, reset: shell.reset });
    registerDurableLocalStore({ prefix: "orb-draft:", name: "character", api: drafts.api, reset: drafts.reset });

    await expect(bindDurableLocalToUser(ALICE)).rejects.toThrow("pending owner refused");
    expect(map.has("orb:shell")).toBe(true);
    expect(map.has("orb-draft:character")).toBe(true);
    expect(map.has(`orb:u/${ALICE}/shell`)).toBe(false);

    vi.resetModules();
    const reloaded = await import("@orb/client/state");
    const bobShell = storeDouble(map);
    const bobDrafts = storeDouble(map);
    reloaded.registerDurableLocalStore({ prefix: "orb:", name: "shell", api: bobShell.api, reset: bobShell.reset });
    reloaded.registerDurableLocalStore({ prefix: "orb-draft:", name: "character", api: bobDrafts.api, reset: bobDrafts.reset });
    await expect(reloaded.bindDurableLocalToUser(BOB)).rejects.toThrow("pending owner refused");
    expect(map.has(`orb:u/${BOB}/shell`)).toBe(false);
    expect(map.has(`orb-draft:u/${BOB}/character`)).toBe(false);
    expect(map.has("orb:shell")).toBe(true);
    expect(map.has("orb-draft:character")).toBe(true);
    reloaded.__resetDurableLocal();
  });

  test("a failed first-user adoption followed by another identity rehydrates the original user on return", async () => {
    const map = new Map<string, unknown>([
      ["orb:shell", { state: { owner: "alice" }, version: 1 }],
      ["orb-draft:character", { state: { owner: "alice-draft" }, version: 1 }],
      [`orb:u/${BOB}/shell`, { state: { owner: "bob" }, version: 1 }],
      [`orb-draft:u/${BOB}/character`, { state: { owner: "bob-draft" }, version: 1 }],
    ]);
    const shell = storeDouble(map);
    const drafts = storeDouble(map);
    const draftStorage = persistOf(drafts).getOptions().storage;
    let failOnce = true;
    if (draftStorage === undefined) {
      throw new Error("draft storage double must exist");
    }
    registerDurableLocalStore({ prefix: "orb:", name: "shell", api: shell.api, reset: shell.reset });
    registerDurableLocalStore({
      prefix: "orb-draft:",
      name: "character",
      api: {
        persist: {
          setOptions: persistOf(drafts).setOptions,
          rehydrate: persistOf(drafts).rehydrate,
          getOptions: () => ({
            storage: {
              ...draftStorage,
              setItem: (name, value): unknown => {
                if (failOnce) {
                  failOnce = false;
                  throw new Error("draft adoption failed");
                }
                return draftStorage.setItem(name, value);
              },
            },
          }),
        },
      },
      reset: drafts.reset,
    });

    await expect(bindDurableLocalToUser(ALICE)).rejects.toThrow("draft adoption failed");
    await bindDurableLocalToUser(BOB);
    expect(shell.currentState).toEqual({ state: { owner: "bob" }, version: 1 });
    expect(drafts.currentState).toEqual({ state: { owner: "bob-draft" }, version: 1 });

    await bindDurableLocalToUser(ALICE);
    expect(shell.currentState).toEqual({ state: { owner: "alice" }, version: 1 });
    expect(drafts.currentState).toEqual({ state: { owner: "alice-draft" }, version: 1 });
    expect(map.has("orb-draft:character")).toBe(false);
    expect(durableLocalReadyFor(ALICE)).toBe(true);
  });

  test("failed Alice adoption survives a Bob bind and reload, then finishes when Alice returns", async () => {
    const hints = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => hints.get(key) ?? null,
      setItem: (key: string, value: string) => hints.set(key, value),
      removeItem: (key: string) => hints.delete(key),
    });
    const map = new Map<string, unknown>([
      ["orb:shell", { state: { owner: "alice" }, version: 1 }],
      ["orb-draft:character", { state: { owner: "alice-draft" }, version: 1 }],
      [`orb:u/${BOB}/shell`, { state: { owner: "bob" }, version: 1 }],
      [`orb-draft:u/${BOB}/character`, { state: { owner: "bob-draft" }, version: 1 }],
    ]);
    const shell = storeDouble(map);
    const drafts = storeDouble(map);
    const draftStorage = persistOf(drafts).getOptions().storage;
    if (draftStorage === undefined) {
      throw new Error("draft storage double must exist");
    }
    let failOnce = true;
    registerDurableLocalStore({ prefix: "orb:", name: "shell", api: shell.api, reset: shell.reset });
    registerDurableLocalStore({
      prefix: "orb-draft:",
      name: "character",
      api: {
        persist: {
          setOptions: persistOf(drafts).setOptions,
          rehydrate: persistOf(drafts).rehydrate,
          getOptions: () => ({
            storage: {
              ...draftStorage,
              setItem: (name, value): unknown => {
                if (failOnce) {
                  failOnce = false;
                  throw new Error("draft adoption failed");
                }
                return draftStorage.setItem(name, value);
              },
            },
          }),
        },
      },
      reset: drafts.reset,
    });

    await expect(bindDurableLocalToUser(ALICE)).rejects.toThrow("draft adoption failed");
    await bindDurableLocalToUser(BOB);
    expect(hints.get("orb:active-user")).toBe(BOB);
    expect(hints.get("orb:pending-legacy-adoption")).toBe(ALICE);

    vi.resetModules();
    const reloaded = await import("@orb/client/state");
    const shellAfterReload = storeDouble(map);
    const draftsAfterReload = storeDouble(map);
    reloaded.registerDurableLocalStore({ prefix: "orb:", name: "shell", api: shellAfterReload.api, reset: shellAfterReload.reset });
    reloaded.registerDurableLocalStore({ prefix: "orb-draft:", name: "character", api: draftsAfterReload.api, reset: draftsAfterReload.reset });
    await reloaded.bindDurableLocalToUser(ALICE);

    expect(map.has("orb-draft:character")).toBe(false);
    expect(draftsAfterReload.currentState).toEqual({ state: { owner: "alice-draft" }, version: 1 });
    expect(shellAfterReload.currentState).toEqual({ state: { owner: "alice" }, version: 1 });
    expect(hints.get("orb:active-user")).toBe(ALICE);
    expect(hints.get("orb:pending-legacy-adoption")).toBeUndefined();
    expect(reloaded.durableLocalReadyFor(ALICE)).toBe(true);
    reloaded.__resetDurableLocal();
  });

  test("a user switch resets and gates writes until that user's held hydration owns every store", async () => {
    const store = storeDouble(new Map());
    registerDurableLocalStore({ prefix: "orb:", name: "shell", api: store.api, reset: store.reset });
    await bindDurableLocalToUser(ALICE);
    const held = Promise.withResolvers<void>();
    store.rehydrate = (): Promise<void> => held.promise;

    const bindingBob = bindDurableLocalToUser(BOB);
    await Promise.resolve();
    expect(store.resets).toBe(2);
    expect(durableLocalWritesAllowed()).toBe(false);
    expect(durableLocalReadyFor(BOB)).toBe(false);

    held.resolve();
    await bindingBob;
    expect(durableLocalReadyFor(BOB)).toBe(true);
    expect(durableLocalWritesAllowed()).toBe(true);
  });

  // ALSO the guard on the same-user SKIP below: after a failed bind the namespace is already this user's,
  // but the in-memory projection is still the PREVIOUS identity's. A retry that short-circuited on the
  // namespace alone would open the write gate over Alice's state under Bob's key — so the retry must
  // re-key and rehydrate (`resets`/`rehydrates` count it), never skip.
  test("a failed hydration remains gated and a same-user retry rehydrates before opening the stores", async () => {
    const store = storeDouble(new Map());
    registerDurableLocalStore({ prefix: "orb:", name: "shell", api: store.api, reset: store.reset });
    await bindDurableLocalToUser(ALICE);
    store.rehydrate = (): Promise<void> => Promise.reject(new Error("storage unavailable"));

    await expect(bindDurableLocalToUser(BOB)).rejects.toThrow("storage unavailable");
    expect(durableLocalReadyFor(BOB)).toBe(false);
    expect(durableLocalWritesAllowed()).toBe(false);

    store.rehydrate = (): void => undefined;
    await bindDurableLocalToUser(BOB);
    expect(store.rehydrates).toBe(3);
    expect(store.resets).toBe(3); // the retry did NOT take the same-user skip
    expect(durableLocalReadyFor(BOB)).toBe(true);
    expect(durableLocalWritesAllowed()).toBe(true);
  });
});

// The arms above run over hand-rolled doubles, which prove WHICH arm ran but cannot prove what an arm
// does to the durable BYTES: a double's `reset` writes nothing. Production's does — zustand's `persist`
// patches `setState`, so a reset WRITES the emptied state to whichever key the store is currently pointed
// at, and the rehydrate that follows reads back the blob the reset just erased (#837: every `orb:*` blob
// reset-and-rebuilt on every boot, app-wide). These mint REAL persisted stores over an injected memory
// storage and boot them the way a browser does: the `orb:active-user` hint is seeded BEFORE the module
// graph loads, because `durable-local.ts` reads it at module scope and every store mints — and zustand
// synchronously rehydrates it — against that namespace.
describe("bindDurableLocalToUser — the boot arms over REAL persisted stores", () => {
  interface Probe {
    readonly count: number;
    readonly label: string;
  }

  const defaultProbe: Probe = { count: 0, label: "default" };

  /** TOTAL, and a PASS-THROUGH for a well-formed blob: a migrate that always returned the default would
   *  make every assertion below vacuously "reset". */
  function migrateProbe(persisted: unknown): Probe {
    const p = persisted as { count?: unknown; label?: unknown } | null | undefined;
    return {
      count: typeof p?.count === "number" ? p.count : defaultProbe.count,
      label: typeof p?.label === "string" ? p.label : defaultProbe.label,
    };
  }

  function blob(probe: Probe): string {
    return JSON.stringify({ state: probe, version: 1 });
  }

  interface Booted {
    readonly mod: typeof import("@orb/client/state");
    readonly map: Map<string, string>;
    /** Every key the store's persist storage was asked to WRITE — a boot that preserves writes nothing. */
    readonly writes: string[];
    readonly options: PersistedStoreOptions<Probe, Probe>;
  }

  /** A fresh module graph booted like a browser tab: the hint exists before the first store mints. */
  async function boot(hint: UserId | null, seed: Record<string, string>): Promise<Booted> {
    const hints = new Map<string, string>(hint === null ? [] : [["orb:active-user", hint]]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string): string | null => hints.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        hints.set(key, value);
      },
      removeItem: (key: string): void => {
        hints.delete(key);
      },
    });
    vi.resetModules();
    const mod = await import("@orb/client/state");
    const map = new Map<string, string>(Object.entries(seed));
    const writes: string[] = [];
    const storage: StateStorage = {
      getItem: (name): string | null => map.get(name) ?? null,
      setItem: (name, value): void => {
        writes.push(name);
        map.set(name, value);
      },
      removeItem: (name): void => {
        map.delete(name);
      },
    };
    return { mod, map, writes, options: { version: 1, migrate: migrateProbe, partialize: (s): Probe => s, storage } };
  }

  // THE HEADER'S CONTRACT (`durable-local.ts`, "THE BOOT HINT"): the same human returning is a no-op with
  // zero rehydrate and zero flash. It was not — `readyUserId` is null at every boot, so this took the full
  // rebind: reset (which erased the blob through persist) then rehydrate of what it had just erased.
  test("the same human returning keeps every persisted byte — no reset write, no rehydrate over an erased blob", async () => {
    const seeded = blob({ count: 42, label: "seeded" });
    const { mod, map, writes, options } = await boot(ALICE, { [`orb:u/${ALICE}/t-return`]: seeded });
    const store = mod.createPersistedStore<Probe, Probe>("t-return", (): Probe => defaultProbe, options);
    // Positive control: the hint chose the namespace and zustand hydrated it AT THE MINT, writing nothing.
    expect(store.getState()).toEqual({ count: 42, label: "seeded" });
    expect(writes).toEqual([]);

    await mod.bindDurableLocalToUser(ALICE);

    expect(store.getState()).toEqual({ count: 42, label: "seeded" });
    expect(map.get(`orb:u/${ALICE}/t-return`)).toBe(seeded); // byte-identical — the bind touched nothing
    expect(writes).toEqual([]);
    expect(mod.durableLocalReadyFor(ALICE)).toBe(true);
    expect(mod.durableLocalWritesAllowed()).toBe(true);
    mod.__resetDurableLocal();
  });

  // THE IDENTITY BOUNDARY, stated against a FORGED pointer: `orb:active-user` is browser-writable, so it
  // is a HINT about which namespace to mint on, never an identity. Only the session-verified viewer
  // (`sessions.me`, passed by `use-session-recovery`) may keep a namespace live — a hint naming someone
  // else still pays the full reset + rehydrate, and must not cost that someone else their bytes either.
  test("a hint naming ANOTHER identity never keeps that namespace live — the verified viewer decides", async () => {
    const alices = blob({ count: 7, label: "alice-only" });
    const { mod, map, writes, options } = await boot(ALICE, { [`orb:u/${ALICE}/t-forged`]: alices });
    const store = mod.createPersistedStore<Probe, Probe>("t-forged", (): Probe => defaultProbe, options);
    expect(store.getState().label).toBe("alice-only"); // the hint chose the mint namespace...

    await mod.bindDurableLocalToUser(BOB); // ...but BOB is who the session verified

    expect(store.getState()).toEqual(defaultProbe); // Alice's bytes are out of memory
    expect(mod.durableLocalKey("orb:", "t-forged")).toBe(`orb:u/${BOB}/t-forged`);
    expect(map.has(`orb:u/${BOB}/t-forged`)).toBe(false); // and never landed in Bob's namespace
    expect(map.get(`orb:u/${ALICE}/t-forged`)).toBe(alices); // Alice's blob is untouched, byte for byte
    expect(writes).toEqual([]);
    expect(mod.durableLocalReadyFor(BOB)).toBe(true);
    mod.__resetDurableLocal();
  });

  // The once-per-browser migration has to move the USER'S bytes. Resetting first emptied the legacy blob
  // through persist and then adopted the emptied one, losing the pre-namespacing era's state at exactly
  // the moment it was supposed to be rescued.
  test("legacy adoption MOVES the bytes, never an emptied blob", async () => {
    const legacy = blob({ count: 3, label: "legacy" });
    const { mod, map, options } = await boot(null, { "orb:t-adopt": legacy });
    const store = mod.createPersistedStore<Probe, Probe>("t-adopt", (): Probe => defaultProbe, options);
    expect(store.getState().label).toBe("legacy"); // no hint → minted on the un-namespaced key

    await mod.bindDurableLocalToUser(ALICE);

    expect(JSON.parse(map.get(`orb:u/${ALICE}/t-adopt`) ?? "null")).toEqual({ state: { count: 3, label: "legacy" }, version: 1 });
    expect(map.has("orb:t-adopt")).toBe(false);
    expect(store.getState()).toEqual({ count: 3, label: "legacy" });
    mod.__resetDurableLocal();
  });

  test("a cold boot with no hint and no legacy blob binds on defaults and writes nothing", async () => {
    const { mod, map, writes, options } = await boot(null, {});
    const store = mod.createPersistedStore<Probe, Probe>("t-cold", (): Probe => defaultProbe, options);

    await mod.bindDurableLocalToUser(ALICE);

    expect(store.getState()).toEqual(defaultProbe);
    expect([...map.keys()]).toEqual([]); // nothing to adopt is nothing to write — not even a defaults blob
    expect(writes).toEqual([]);
    expect(mod.durableLocalKey("orb:", "t-cold")).toBe(`orb:u/${ALICE}/t-cold`);
    mod.__resetDurableLocal();
  });
});
