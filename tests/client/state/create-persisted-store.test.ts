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

// The always-run rehydrate sanitize (found live 2026-07-25): a SAME-version persisted blob carrying a
// stale id — a pre-rollback `orb:shell` whose `activeSection` a shrunk section registry no longer knows —
// bricked the whole app at the registry lookup. Zustand fires `migrate` only on a version MISMATCH, so a
// version-matched poisoned blob flowed through untouched. The fix wires each store's TOTAL, crash-proof
// `migrate` as the `merge` seam (which runs on EVERY rehydrate). These tests reproduce the shell store's
// exact shape + the real captured poisoned blob to prove the seam self-heals it (#11 autosave doctrine: an
// invalid persisted state is DISCARDED, never trusted, never allowed to crash).
describe("createPersistedStore — same-version blob is sanitized on rehydrate (the merge seam)", () => {
  // A faithful stand-in for the shell store's shape: a known-id vocabulary + a per-id override map, with the
  // SAME crash-proof migrate discipline (unknown activeSection → default; override keys of unknown ids
  // dropped, valid siblings kept). The real section registry throws by design on an unknown id — here we
  // model "known ids" as the SECTIONS set so the sanitize is what's under test, not the registry throw.
  const sections = new Set(["chats", "characters", "corpus"]);
  const defaultSection = "chats";

  interface ShellLike {
    readonly activeSection: string;
    readonly panelOverrides: Record<string, { context: string }>;
  }

  /** Keep only known-id override entries whose `context` is a string (the shell `sanitizeOverrides` shape). */
  function sanitizeOverrides(v: unknown): Record<string, { context: string }> {
    if (v === null || typeof v !== "object") {
      return {};
    }
    const out: Record<string, { context: string }> = {};
    for (const [section, panels] of Object.entries(v as Record<string, unknown>)) {
      const ctx = (panels as { context?: unknown } | null)?.context;
      if (sections.has(section) && typeof ctx === "string") {
        out[section] = { context: ctx };
      }
    }
    return out;
  }

  function shellMigrate(persisted: unknown): ShellLike {
    if (persisted === null || typeof persisted !== "object") {
      return { activeSection: defaultSection, panelOverrides: {} };
    }
    const p = persisted as { activeSection?: unknown; panelOverrides?: unknown };
    const activeSection = typeof p.activeSection === "string" && sections.has(p.activeSection) ? p.activeSection : defaultSection;
    return { activeSection, panelOverrides: sanitizeOverrides(p.panelOverrides) };
  }

  function shellOpts(storage: StateStorage): PersistedStoreOptions<ShellLike, ShellLike> {
    return {
      version: 2,
      migrate: (persisted): ShellLike => shellMigrate(persisted),
      partialize: (s): ShellLike => s,
      storage,
    };
  }

  // The real blob captured from a browser that last visited in the pre-rollback era when `hubs` existed.
  const poisonedBlob = '{"state":{"activeSection":"hubs","panelOverrides":{"chats":{"context":"docked"},"hubs":{"context":"docked"}},"version":2}}';

  test("the exact poisoned orb:shell blob boots clean: no throw, heals to the default section, drops the stale override key, keeps the valid sibling", () => {
    const { storage } = memoryStorage({ "orb:shell-poison": poisonedBlob });
    // Rehydration runs synchronously at creation (sync storage). The bug: this threw / left activeSection
    // as the unknown "hubs". The fix: the merge seam sanitizes the same-version blob.
    const store = createPersistedStore<ShellLike, ShellLike>(
      "shell-poison",
      (): ShellLike => ({ activeSection: defaultSection, panelOverrides: {} }),
      shellOpts(storage),
    );
    const state = store.getState();
    expect(state.activeSection).toBe("chats"); // healed away from the unknown "hubs"
    expect(state.panelOverrides["chats"]).toEqual({ context: "docked" }); // valid sibling survives
    expect(state.panelOverrides["hubs"]).toBeUndefined(); // the stale-id key is DROPPED
  });

  test("a fully-valid same-version blob passes through unwiped (no over-eager sanitize)", () => {
    const valid = '{"state":{"activeSection":"corpus","panelOverrides":{"characters":{"context":"docked"}},"version":2}}';
    const { storage } = memoryStorage({ "orb:shell-valid": valid });
    const store = createPersistedStore<ShellLike, ShellLike>(
      "shell-valid",
      (): ShellLike => ({ activeSection: defaultSection, panelOverrides: {} }),
      shellOpts(storage),
    );
    const state = store.getState();
    expect(state.activeSection).toBe("corpus"); // a known non-default section is preserved
    expect(state.panelOverrides["characters"]).toEqual({ context: "docked" }); // valid override untouched
  });
});
