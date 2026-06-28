// seeder: createDefaultCharacterSeeder — the idempotent default-card pack. Exercised over the REAL character
// service (real create + findByHandle + the handle_conflict translation) with an IN-MEMORY latch standing in
// for the settings seam (the compose wiring of the real settings latch is proven in the compose slice test).
// Covers: all 5 cards seeded on a fresh user; the persisted latch makes a re-run a no-op (deletion-respect);
// per-card handle_conflict tolerance resolves a pre-existing handle instead of failing; welcomeAssistantId is
// stamped to the Assistant's id; ensureSeeded never throws on a create failure (and leaves the latch unset so
// the next touch retries).

import type { Principal } from "@orb/contracts/identity";
import type { CharacterId, UserId } from "@orb/kit/ids";
import type { CharacterDetail, CharacterService } from "@orb/server/domain/character";
import {
  createCharacterService,
  createDefaultCharacterSeeder,
  DEFAULT_CHARACTER_CARDS,
  WELCOME_ASSISTANT_HANDLE,
} from "@orb/server/domain/character";
import { describe, expect, test } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { makeHarness, principal, seedRawCharacter, seedUser } from "../_support.ts";

const ALL_HANDLES = DEFAULT_CHARACTER_CARDS.map((c) => c.handle);

interface MarkCall {
  readonly userId: UserId;
  readonly welcomeAssistantId: CharacterId | null;
}

/** An in-memory stand-in for the settings latch (isSeeded/markSeeded), keyed by `principal.userId`. */
function fakeLatch(): {
  readonly isSeeded: (p: Principal) => Promise<boolean>;
  readonly markSeeded: (p: Principal, id: CharacterId | null) => Promise<void>;
  readonly marks: MarkCall[];
} {
  const seeded = new Set<UserId>();
  const marks: MarkCall[] = [];
  return {
    marks,
    isSeeded: (p): Promise<boolean> => Promise.resolve(seeded.has(p.userId)),
    markSeeded: (p, welcomeAssistantId): Promise<void> => {
      seeded.add(p.userId);
      marks.push({ userId: p.userId, welcomeAssistantId });
      return Promise.resolve();
    },
  };
}

describe("createDefaultCharacterSeeder", () => {
  test("seeds all 5 cards on a fresh user + marks the latch once", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const latch = fakeLatch();
    const seeder = createDefaultCharacterSeeder({ characters: svc, ...latch });
    const owner = await seedUser(db, { handle: "owner" });
    const actor = principal(owner);

    await seeder.ensureSeeded(actor);

    const list = await svc.list({ principal: actor });
    expect(list.map((c) => c.handle).sort()).toEqual([...ALL_HANDLES].sort());
    expect(latch.marks).toHaveLength(1);
  });

  test("welcomeAssistantId is stamped to the seeded Assistant's id", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const latch = fakeLatch();
    const seeder = createDefaultCharacterSeeder({ characters: svc, ...latch });
    const owner = await seedUser(db, { handle: "owner" });
    const actor = principal(owner);

    await seeder.ensureSeeded(actor);

    const assistant = await svc.findByHandle({ ownerId: owner, handle: WELCOME_ASSISTANT_HANDLE });
    expect(assistant).not.toBeNull();
    expect(latch.marks[0]?.welcomeAssistantId).toBe(assistant?.characterId);
  });

  test("the persisted latch makes a re-run a no-op (deletion-respect) — even on a fresh seeder instance", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const latch = fakeLatch();
    const owner = await seedUser(db, { handle: "owner" });
    const actor = principal(owner);

    // First seeder seeds the pack + sets the latch.
    await createDefaultCharacterSeeder({ characters: svc, ...latch }).ensureSeeded(actor);
    // A NEW seeder (fresh in-process memo) sharing the SAME persisted latch must NOT re-seed.
    await createDefaultCharacterSeeder({ characters: svc, ...latch }).ensureSeeded(actor);

    const list = await svc.list({ principal: actor });
    expect(list).toHaveLength(ALL_HANDLES.length); // no duplicates
    expect(latch.marks).toHaveLength(1); // the second run short-circuited on the latch
  });

  test("handle_conflict tolerance — a pre-existing handle resolves instead of failing", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const latch = fakeLatch();
    const seeder = createDefaultCharacterSeeder({ characters: svc, ...latch });
    const owner = await seedUser(db, { handle: "owner" });
    const actor = principal(owner);
    // A previous partial run already created the Assistant handle (latch NOT set — it crashed before marking).
    const existingAssistantId = await seedRawCharacter(db, {
      id: "character_existing_assistant",
      ownerId: owner,
      handle: WELCOME_ASSISTANT_HANDLE,
    });

    await seeder.ensureSeeded(actor);

    // No duplicate Assistant — the rerun resolved the existing row; the other 4 cards were created.
    const list = await svc.list({ principal: actor });
    expect(list).toHaveLength(ALL_HANDLES.length);
    expect(list.filter((c) => c.handle === WELCOME_ASSISTANT_HANDLE)).toHaveLength(1);
    // The latch lands with the EXISTING Assistant id (resolved via findByHandle), not a fresh one.
    expect(latch.marks[0]?.welcomeAssistantId).toBe(existingAssistantId);
  });

  test("ensureSeeded never throws on a create failure + leaves the latch unset (retry next touch)", async () => {
    const latch = fakeLatch();
    // A characters double whose create always fails with a NON-conflict error (the real-failure path).
    const failing: Pick<CharacterService, "create" | "findByHandle"> = {
      create: (): Promise<CharacterDetail> => Promise.reject(new Error("db is on fire")),
      findByHandle: (): Promise<null> => Promise.resolve(null),
    };
    const seeder = createDefaultCharacterSeeder({ characters: failing, ...latch });
    const actor = principal("usr_fresh" as UserId);

    await expect(seeder.ensureSeeded(actor)).resolves.toBeUndefined();
    expect(latch.marks).toHaveLength(0); // latch NOT set — the next touch retries
  });
});
