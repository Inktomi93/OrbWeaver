// createPersistedStore: the hook-shaped persisted store factory. Node-testable via the returned
// handle's getState/setState (a zustand hook IS its own store api). Covers the round-trip, the
// partialize-only persist, the TOTAL migrate fallback on a version/shape mismatch, and the
// storage-key uniqueness throw. Persistence mechanics use an injected in-memory storage (no
// localStorage in node).

import type { PersistedStoreOptions } from "@orb/client/state";
import { createPersistedStore } from "@orb/client/state";
import { describe } from "vitest";
import type { StateStorage } from "zustand/middleware";
import { expect, test } from "../../support/fixtures";

const DUPLICATE_NAME_RE = /duplicate store name/u;

interface ProbeState {
  count: number;
  label: string;
  /** A transient field partialize must EXCLUDE from persistence. */
  transient: string;
}
type Persisted = Pick<ProbeState, "count" | "label">;

function memoryStorage(seed?: Record<string, string>): {
  readonly storage: StateStorage;
  readonly map: Map<string, string>;
} {
  const map = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    storage: {
      getItem: (name): string | null => map.get(name) ?? null,
      setItem: (name, value): void => {
        map.set(name, value);
      },
      removeItem: (name): void => {
        map.delete(name);
      },
    },
    map,
  };
}

const INITIAL: ProbeState = { count: 0, label: "init", transient: "t" };
const DEFAULT: ProbeState = { count: 0, label: "default", transient: "t" };

function opts(storage: StateStorage): PersistedStoreOptions<ProbeState, Persisted> {
  return {
    version: 1,
    migrate: (): ProbeState => DEFAULT,
    partialize: (s: ProbeState): Persisted => ({ count: s.count, label: s.label }),
    storage,
  };
}

describe("createPersistedStore", () => {
  test("mint + set/read round-trip via the returned handle", () => {
    const { storage } = memoryStorage();
    const store = createPersistedStore<ProbeState, Persisted>("t-roundtrip", (): ProbeState => INITIAL, opts(storage));
    expect(store.getState().count).toBe(0);
    store.setState({ count: 5 }, false, "test/inc");
    expect(store.getState().count).toBe(5);
  });

  test("persists ONLY the partialized keys with a version stamp (transient excluded)", () => {
    const { storage, map } = memoryStorage();
    const store = createPersistedStore<ProbeState, Persisted>("t-partialize", (): ProbeState => INITIAL, opts(storage));
    store.setState({ count: 3, transient: "should-not-persist" }, false, "test/set");

    const raw = map.get("orb:t-partialize");
    expect(raw).toBeDefined();
    const persisted = JSON.parse(raw ?? "{}") as { state: object; version: number };
    expect(Object.keys(persisted.state).sort()).toEqual(["count", "label"]);
    expect(persisted.version).toBe(1);
  });

  test("migrate is TOTAL: a version/shape mismatch hydrates to the migrated default, never throws", () => {
    const { storage } = memoryStorage({
      "orb:t-migrate": JSON.stringify({ state: { legacy: ["?"] }, version: 0 }),
    });
    const store = createPersistedStore<ProbeState, Persisted>("t-migrate", (): ProbeState => INITIAL, opts(storage));
    // Rehydration ran migrate synchronously at creation (sync storage) → the default shape, not a throw.
    expect(store.getState().label).toBe("default");
  });

  test("a duplicate store name throws at creation (the storage-key uniqueness registry)", () => {
    const { storage } = memoryStorage();
    createPersistedStore<ProbeState, Persisted>("t-dup", (): ProbeState => INITIAL, opts(storage));
    expect(() => createPersistedStore<ProbeState, Persisted>("t-dup", (): ProbeState => INITIAL, opts(storage))).toThrow(DUPLICATE_NAME_RE);
  });
});
