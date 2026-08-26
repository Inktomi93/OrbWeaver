// The per-user durable-local namespace (staleness-and-session-freshness.md §4.2.1, owner fork F1). The
// defect it closes: every `orb:*` blob was per-ORIGIN, so view state, tag filters and composer PROSE
// survived an identity change that no event could ever invalidate — the reload-resistant half of the
// reported repro, and the reason deleting localStorage by hand was the only cure.
//
// The store doubles here are hand-rolled rather than real zustand mints: what is under test is the KEY
// SCHEME and the three bind arms (no-op / adopt / switch), and a real `persist` would add a rehydrate
// pipeline that hides which of those arms actually ran.

import type { DurableLocalPersistApi, DurableLocalStorage } from "@orb/client/state";
import {
  __resetDurableLocal,
  activeDurableLocalUserId,
  bindDurableLocalToUser,
  durableLocalKey,
  durableLocalReadyFor,
  durableLocalWritesAllowed,
  registerDurableLocalStore,
} from "@orb/client/state";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { afterEach, describe, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const ALICE = castId<UserId>("usr_alice");
const BOB = castId<UserId>("usr_bob");

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
function storeDouble(map: Map<string, unknown>): StoreDouble {
  const storage: DurableLocalStorage = {
    getItem: (name): unknown => map.get(name) ?? null,
    setItem: (name, value): void => {
      map.set(name, value);
    },
    removeItem: (name): void => {
      map.delete(name);
    },
  };
  const double: StoreDouble = {
    api: {
      persist: {
        setOptions: ({ name }): void => {
          double.keys.push(name);
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
    reset: (): void => {
      double.resets += 1;
      double.currentState = "DEFAULT";
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
    registerDurableLocalStore({ prefix: "orb:", name: "recent-models", api: store.api, reset: store.reset });

    await bindDurableLocalToUser(ALICE);

    expect([...map.keys()]).toEqual([]);
    expect(store.keys).toEqual([`orb:u/${ALICE}/recent-models`]);
  });

  test("a partial legacy adoption retries every remaining store before declaring the user ready", async () => {
    const map = new Map<string, unknown>([
      ["orb:shell", { state: { activeSection: "corpus" }, version: 1 }],
      ["orb-draft:character", { state: { name: "legacy draft" }, version: 1 }],
    ]);
    const shell = storeDouble(map);
    const drafts = storeDouble(map);
    const draftStorage = drafts.api.persist.getOptions().storage;
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
    const draftStorage = drafts.api.persist.getOptions().storage;
    if (draftStorage === undefined) {
      throw new Error("draft storage double must exist");
    }
    registerDurableLocalStore({ prefix: "orb:", name: "shell", api: shell.api, reset: shell.reset });
    registerDurableLocalStore({
      prefix: "orb-draft:",
      name: "character",
      api: {
        persist: {
          setOptions: drafts.api.persist.setOptions,
          rehydrate: drafts.api.persist.rehydrate,
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
    const draftStorage = drafts.api.persist.getOptions().storage;
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
          setOptions: drafts.api.persist.setOptions,
          rehydrate: drafts.api.persist.rehydrate,
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
    const draftStorage = drafts.api.persist.getOptions().storage;
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
          setOptions: drafts.api.persist.setOptions,
          rehydrate: drafts.api.persist.rehydrate,
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
    expect(durableLocalReadyFor(BOB)).toBe(true);
    expect(durableLocalWritesAllowed()).toBe(true);
  });
});
