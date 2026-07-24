// The draft-store factory: injected storage (no localStorage in node), partialize-to-drafts-only,
// the TOTAL crash-proof migrate, the duplicate-name registry throw, the CRUD surface, and the #11
// freshness gate — the ENVELOPE (`{ values, schemaVersion, baselineHash }`) plus the read-time
// validate + schema-version + baseline-hash checks that discard a stale/unverifiable draft.

import { createEntityDraftStore } from "@orb/client/state";
import { describe } from "vitest";
import { z } from "zod";
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

  test("persists ONLY the drafts key (partialize) with a version stamp; entries are envelopes", () => {
    const { storage, map } = memoryStorage();
    const store = createEntityDraftStore<CardDraft>({ name: "t-partialize", storage });
    store.setDraft("a", { name: "Kira" });

    const raw = map.get("orb-draft:t-partialize");
    expect(raw).toBeDefined();
    const persisted = JSON.parse(raw ?? "{}") as { state: { drafts: Record<string, { values: object; schemaVersion: number }> }; version: number };
    expect(Object.keys(persisted.state)).toEqual(["drafts"]);
    expect(persisted.version).toBe(1);
    // The per-entity slot is the #11 envelope, not the bare values.
    expect(persisted.state.drafts["a"]).toEqual({ values: { name: "Kira" }, schemaVersion: 0 });
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

  test("a bare-values (pre-envelope) persisted draft is DISCARDED on boot — it can't prove freshness", () => {
    // The old on-disk shape: `drafts[id]` held the values DIRECTLY, no envelope. It is unverifiable
    // (no schemaVersion, no baselineHash), so the crash-survival cache must drop it rather than resurrect it.
    const { storage } = memoryStorage({
      "orb-draft:t-legacy-bare": JSON.stringify({ state: { drafts: { a: { name: "stale", description: "old" } } }, version: 1 }),
    });
    const store = createEntityDraftStore<CardDraft>({ name: "t-legacy-bare", storage });
    expect(store.hasDraft("a")).toBe(false);
    expect(store.readDraft("a")).toBeUndefined();
  });

  test("a duplicate store name throws at creation (the storage-key uniqueness registry)", () => {
    const { storage } = memoryStorage();
    createEntityDraftStore<CardDraft>({ name: "t-dup", storage });
    expect(() => createEntityDraftStore<CardDraft>({ name: "t-dup", storage })).toThrow(DUPLICATE_NAME_RE);
  });

  // ── #11 freshness gate ───────────────────────────────────────────────────────────────────────────
  const cardSchema = z.object({ name: z.string(), description: z.string() });
  const validate = (v: unknown): CardDraft | undefined => {
    const r = cardSchema.safeParse(v);
    return r.success ? r.data : undefined;
  };

  test("readDraft(id, baselineHash) returns the draft only when the stamped baseline MATCHES", () => {
    const { storage } = memoryStorage();
    const store = createEntityDraftStore<CardDraft>({ name: "t-baseline", storage, validate, schemaVersion: 1 });

    store.setDraft("a", { name: "Kira", description: "ranger" }, "server-hash-A");
    // Matching baseline → the draft survives.
    expect(store.readDraft("a", "server-hash-A")).toEqual({ name: "Kira", description: "ranger" });
    // Re-write (server unchanged) then read against a DIFFERENT baseline → discarded (server moved on).
    store.setDraft("a", { name: "Kira", description: "ranger" }, "server-hash-A");
    expect(store.readDraft("a", "server-hash-B")).toBeUndefined();
    // ...and the dead slot was cleared by that read.
    expect(store.hasDraft("a")).toBe(false);
  });

  test("readDraft discards a draft that fails the model validator (unparseable shape)", () => {
    const { storage } = memoryStorage();
    // A store whose validator wants a `CardDraft`, seeded with an envelope carrying a shape that fails it.
    const store = createEntityDraftStore<CardDraft>({ name: "t-validate", storage, validate, schemaVersion: 1 });
    // FABRICATION-OK: a deliberately INVALID shape — the test exists to prove the validator rejects it.
    store.setDraft("a", { name: "only-name" } as Partial<CardDraft>, "h");
    // `description` missing → cardSchema rejects → discarded.
    expect(store.readDraft("a", "h")).toBeUndefined();
    expect(store.hasDraft("a")).toBe(false);
  });

  test("readDraft discards a draft written under an older schemaVersion", () => {
    const { storage, map } = memoryStorage();
    // Hand-plant an envelope stamped schemaVersion 1; the store now expects 2.
    map.set(
      "orb-draft:t-schema",
      JSON.stringify({ state: { drafts: { a: { values: { name: "Kira", description: "r" }, schemaVersion: 1, baselineHash: "h" } } }, version: 1 }),
    );
    const store = createEntityDraftStore<CardDraft>({ name: "t-schema", storage, validate, schemaVersion: 2 });
    expect(store.readDraft("a", "h")).toBeUndefined();
  });
});
