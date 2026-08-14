// The per-user durable-local namespace (staleness-and-session-freshness.md §4.2.1, owner fork F1). The
// defect it closes: every `orb:*` blob was per-ORIGIN, so view state, tag filters and composer PROSE
// survived an identity change that no event could ever invalidate — the reload-resistant half of the
// reported repro, and the reason deleting localStorage by hand was the only cure.
//
// The store doubles here are hand-rolled rather than real zustand mints: what is under test is the KEY
// SCHEME and the three bind arms (no-op / adopt / switch), and a real `persist` would add a rehydrate
// pipeline that hides which of those arms actually ran.

import type { DurableLocalPersistApi, DurableLocalStorage } from "@orb/client/state";
import { __resetDurableLocal, activeDurableLocalUserId, bindDurableLocalToUser, durableLocalKey, registerDurableLocalStore } from "@orb/client/state";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { afterEach, describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const ALICE = castId<UserId>("usr_alice");
const BOB = castId<UserId>("usr_bob");

interface StoreDouble {
  readonly api: DurableLocalPersistApi;
  readonly map: Map<string, unknown>;
  readonly keys: string[];
  rehydrates: number;
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
        rehydrate: (): void => {
          double.rehydrates += 1;
        },
        getOptions: (): { readonly storage?: DurableLocalStorage } => ({ storage }),
      },
    },
    map,
    keys: [],
    rehydrates: 0,
  };
  return double;
}

afterEach(() => {
  __resetDurableLocal();
});

describe("durableLocalKey", () => {
  test("legacy (un-namespaced) before any identity is bound, user-scoped after", () => {
    expect(durableLocalKey("orb:", "shell")).toBe("orb:shell");
    registerDurableLocalStore({ prefix: "orb:", name: "shell", api: storeDouble(new Map()).api });
    bindDurableLocalToUser(ALICE);
    expect(durableLocalKey("orb:", "shell")).toBe(`orb:u/${ALICE}/shell`);
    expect(durableLocalKey("orb-draft:", "character")).toBe(`orb-draft:u/${ALICE}/character`);
    expect(activeDurableLocalUserId()).toBe(ALICE);
  });
});

describe("bindDurableLocalToUser — the three arms", () => {
  // ADOPT: the once-per-browser migration. The blob must MOVE (a copy would leave the leaked bytes behind
  // for the next identity), and nothing rehydrates — the in-memory state already came from that blob.
  test("legacy → first user ADOPTS the blob onto the user key and DELETES the original", () => {
    const map = new Map<string, unknown>([["orb:character-library", { state: { tagFilter: ["tag_x"] }, version: 1 }]]);
    const store = storeDouble(map);
    registerDurableLocalStore({ prefix: "orb:", name: "character-library", api: store.api });

    bindDurableLocalToUser(ALICE);

    expect(map.get(`orb:u/${ALICE}/character-library`)).toEqual({ state: { tagFilter: ["tag_x"] }, version: 1 });
    expect(map.has("orb:character-library")).toBe(false);
    expect(store.keys).toEqual([`orb:u/${ALICE}/character-library`]);
    expect(store.rehydrates).toBe(0);
  });

  // SWITCH: the identity boundary. Nothing is adopted (that would hand Alice's state to Bob) and the store
  // MUST rehydrate — otherwise the in-memory state is still the previous identity's, just writing to a new key.
  test("user → a DIFFERENT user re-keys and REHYDRATES, and never adopts", () => {
    const map = new Map<string, unknown>([["orb:shell", { state: { activeSection: "corpus" }, version: 2 }]]);
    const store = storeDouble(map);
    registerDurableLocalStore({ prefix: "orb:", name: "shell", api: store.api });

    bindDurableLocalToUser(ALICE);
    bindDurableLocalToUser(BOB);

    expect(store.keys).toEqual([`orb:u/${ALICE}/shell`, `orb:u/${BOB}/shell`]);
    expect(store.rehydrates).toBe(1); // the switch only
    // Alice's adopted blob stays hers; Bob's namespace is empty, so Bob boots on defaults.
    expect(map.get(`orb:u/${ALICE}/shell`)).toBeDefined();
    expect(map.has(`orb:u/${BOB}/shell`)).toBe(false);
  });

  test("re-binding the SAME user is a no-op — no re-key, no rehydrate, no flash", () => {
    const store = storeDouble(new Map());
    registerDurableLocalStore({ prefix: "orb:", name: "tag-library", api: store.api });

    bindDurableLocalToUser(ALICE);
    bindDurableLocalToUser(ALICE);

    expect(store.keys).toEqual([`orb:u/${ALICE}/tag-library`]);
    expect(store.rehydrates).toBe(0);
  });

  // THE D2 CLAIM, stated as an assertion: two identities on one browser cannot read each other's blobs.
  test("two users on ONE storage never read each other's state", () => {
    const map = new Map<string, unknown>();
    const store = storeDouble(map);
    registerDurableLocalStore({ prefix: "orb:", name: "composer-draft", api: store.api });

    bindDurableLocalToUser(ALICE);
    map.set(durableLocalKey("orb:", "composer-draft"), { state: { drafts: { room: "alice's unsent line" } }, version: 1 });
    bindDurableLocalToUser(BOB);

    expect(map.get(durableLocalKey("orb:", "composer-draft"))).toBeUndefined();
    expect(map.get(`orb:u/${ALICE}/composer-draft`)).toEqual({ state: { drafts: { room: "alice's unsent line" } }, version: 1 });
  });

  test("every registered store is re-keyed, not just the first", () => {
    const map = new Map<string, unknown>();
    const shell = storeDouble(map);
    const drafts = storeDouble(map);
    registerDurableLocalStore({ prefix: "orb:", name: "shell", api: shell.api });
    registerDurableLocalStore({ prefix: "orb-draft:", name: "character", api: drafts.api });

    bindDurableLocalToUser(ALICE);

    expect(shell.keys).toEqual([`orb:u/${ALICE}/shell`]);
    expect(drafts.keys).toEqual([`orb-draft:u/${ALICE}/character`]);
  });

  // zustand's `persist` EARLY-RETURNS without assigning `api.persist` when the resolved storage is falsy
  // (verified in the installed middleware source) — a browser that refuses storage, or a node lane. Such a
  // store persists nothing, so the rebind must skip it rather than crash the boot on a missing property.
  test("a storage-less store (no `api.persist`) is skipped, not thrown on", () => {
    registerDurableLocalStore({ prefix: "orb:", name: "storage-less", api: {} });
    expect(() => bindDurableLocalToUser(ALICE)).not.toThrow();
    expect(activeDurableLocalUserId()).toBe(ALICE);
  });

  test("adoption with NO legacy blob writes nothing (a fresh browser is not a migration)", () => {
    const map = new Map<string, unknown>();
    const store = storeDouble(map);
    registerDurableLocalStore({ prefix: "orb:", name: "recent-models", api: store.api });

    bindDurableLocalToUser(ALICE);

    expect([...map.keys()]).toEqual([]);
    expect(store.keys).toEqual([`orb:u/${ALICE}/recent-models`]);
  });
});
