// entity-form-base — the draft-store read/write vocabulary the two entity-form factories COMPOSE
// (create-autosave / create-saved). Headless: readDraftSeed/mirrorDraft are pure store delegations, so
// this pins the seed-read ↔ mirror-write round-trip + the undefined-store (ephemeral-panel) no-op that
// every draft-bearing editor leans on. `focusFirstInvalidField` (the DOM `[aria-invalid]` chokepoint)
// is DOM-bound and exercised live by the factories' onSubmitInvalid through the editor CTs.

import { mirrorDraft, readDraftSeed } from "@orb/client/forms";
import { createEntityDraftStore } from "@orb/client/state";
import { describe } from "vitest";
import type { StateStorage } from "zustand/middleware";
import { expect, test } from "../../support/fixtures";

interface Values {
  readonly text: string;
}

/** In-memory storage so the round-trip needs no localStorage (the store's test-injection seam). */
function memStorage(): StateStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key): string | null => map.get(key) ?? null,
    setItem: (key, value): void => {
      map.set(key, value);
    },
    removeItem: (key): void => {
      map.delete(key);
    },
  };
}

let seq = 0;
function freshStore(): ReturnType<typeof createEntityDraftStore<Values>> {
  seq += 1;
  return createEntityDraftStore<Values>({ name: `entity-form-base-test-${seq}`, storage: memStorage() });
}

describe("entity-form-base", () => {
  test("mirrorDraft writes the slot readDraftSeed reads back, keyed by entityId", () => {
    const store = freshStore();
    expect(readDraftSeed(store, "e1")).toBeUndefined();

    mirrorDraft(store, "e1", { text: "hello" });
    expect(readDraftSeed(store, "e1")).toEqual({ text: "hello" });

    // A second id is an independent slot — the keying is per-entity, not global.
    expect(readDraftSeed(store, "e2")).toBeUndefined();
  });

  test("both no-op safely when the draft store is undefined (the ephemeral-panel path)", () => {
    expect(readDraftSeed<Values>(undefined, "e1")).toBeUndefined();
    expect(() => {
      mirrorDraft<Values>(undefined, "e1", { text: "hello" });
    }).not.toThrow();
  });
});
