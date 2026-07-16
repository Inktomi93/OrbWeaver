// The draft-store factory: injected storage (no localStorage in node), partialize-to-drafts-only,
// the TOTAL crash-proof migrate, the duplicate-name registry throw, and the CRUD surface.

import { createEntityDraftStore } from "@orb/client/state";
import { describe } from "vitest";
import type { StateStorage } from "zustand/middleware";
import { expect, test } from "../../support/fixtures";

const DUPLICATE_NAME_RE = /duplicate store name/u;

interface CardDraft {
  name: string;
  description: string;
}

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

describe("createEntityDraftStore", () => {
  test("set/read/has/clear round-trip; setField merges into the id's draft", () => {
    const { storage } = memoryStorage();
    const store = createEntityDraftStore<CardDraft>({ name: "t-roundtrip", storage });

    expect(store.hasDraft("a")).toBe(false);
    store.setDraft("a", { name: "Kira" });
    store.setField("a", "description", "a ranger");
    expect(store.readDraft("a")).toEqual({ name: "Kira", description: "a ranger" });
    expect(store.hasDraft("a")).toBe(true);

    store.clearDraft("a");
    expect(store.readDraft("a")).toBeUndefined();
  });

  test("persists ONLY the drafts key (partialize) with a version stamp", () => {
    const { storage, map } = memoryStorage();
    const store = createEntityDraftStore<CardDraft>({ name: "t-partialize", storage });
    store.setDraft("a", { name: "Kira" });

    const raw = map.get("orb-draft:t-partialize");
    expect(raw).toBeDefined();
    const persisted = JSON.parse(raw ?? "{}") as { state: object; version: number };
    expect(Object.keys(persisted.state)).toEqual(["drafts"]);
    expect(persisted.version).toBe(1);
  });

  test("migrate is TOTAL: garbage/legacy persisted shapes degrade to empty, never throw", () => {
    const { storage } = memoryStorage({
      // version 0 + a shape that never existed — the crash-survival cache must boot anyway.
      "orb-draft:t-migrate": JSON.stringify({ state: { legacy: ["?"] }, version: 0 }),
    });
    const store = createEntityDraftStore<CardDraft>({ name: "t-migrate", storage });
    expect(store.hasDraft("a")).toBe(false);
    store.setDraft("a", { name: "ok" });
    expect(store.readDraft("a")).toEqual({ name: "ok" });
  });

  test("a duplicate store name throws at creation (the storage-key uniqueness registry)", () => {
    const { storage } = memoryStorage();
    createEntityDraftStore<CardDraft>({ name: "t-dup", storage });
    expect(() => createEntityDraftStore<CardDraft>({ name: "t-dup", storage })).toThrow(DUPLICATE_NAME_RE);
  });
});
