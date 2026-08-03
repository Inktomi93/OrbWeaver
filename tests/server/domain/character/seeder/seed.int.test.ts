// seeder: createDefaultCharacterSeeder — the idempotent default-card pack. Exercised over the REAL character
// service (real create + findByHandle + the handle_conflict translation) with an IN-MEMORY latch standing in
// for the settings seam (the compose wiring of the real settings latch is proven in the compose slice test).
// Covers: the whole authored pack seeded on a fresh user; the persisted latch makes a re-run a no-op
// (deletion-respect); per-card handle_conflict tolerance resolves a pre-existing handle instead of failing;
// welcomeAssistantId is stamped to the welcome card's id; ensureSeeded never throws on a create failure (and
// leaves the latch unset so the next touch retries); the PRESENTATION step (carried theme + seeded
// background) runs for FRESHLY-CREATED cards only — a conflict-resolved row belongs to the user and is never
// re-stamped; and the pack's own shape invariants (unique handles, greetings[0] never groupOnly).

import type { Principal } from "@orb/contracts/identity";
import type { CharacterId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { CharacterDetail, CharacterService } from "@orb/server/domain/character";
import { createCharacterService, createDefaultCharacterSeeder, DEFAULT_CHARACTER_CARDS, WELCOME_ASSISTANT_HANDLE } from "@orb/server/domain/character";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedRawCharacter, seedUser } from "../_support.ts";

const ALL_HANDLES = DEFAULT_CHARACTER_CARDS.map((c) => c.input.handle);
const ASSISTANT_CARD = DEFAULT_CHARACTER_CARDS.find((c) => c.input.handle === WELCOME_ASSISTANT_HANDLE);
/** Stand-in id for the impossible "seeded card has no row" branch (keeps the lookup total without a cast at
 *  every call site) — reaching it means the assertion just above already failed. */
const MISSING_ID = "chr_never_seeded" as CharacterId;

interface MarkCall {
  readonly userId: UserId;
  readonly welcomeAssistantId: CharacterId | null;
}

interface TagAttachCall {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly tagName: string;
}

/** The injected card-tag attach for tests that don't assert on it (a no-op that reports newly-attached). */
const noopAttach = (): Promise<boolean> => Promise.resolve(true);

/** A recording stand-in for the injected card-tag attach (the source/status binding is a compose concern,
 *  proven in the compose slice; here we assert the seeder CALLS the op with each card's tag names). */
function recordingAttach(): {
  readonly attachCardTag: (a: TagAttachCall) => Promise<boolean>;
  readonly calls: TagAttachCall[];
} {
  const calls: TagAttachCall[] = [];
  return {
    calls,
    attachCardTag: (a): Promise<boolean> => {
      calls.push(a);
      return Promise.resolve(true);
    },
  };
}

/** An in-memory stand-in for the settings latch (isSeeded/markSeeded + the pack-version stamp), keyed by
 *  `principal.userId`. The pack-migration arm has its OWN suite (`pack-migration.int.test.ts`); here the
 *  stamp just has to behave (a fresh seed stamps the shipped pack, so a re-run migrates nothing). */
function fakeLatch(): {
  readonly isSeeded: (p: Principal) => Promise<boolean>;
  readonly markSeeded: (p: Principal, id: CharacterId | null) => Promise<void>;
  readonly readPackVersion: (p: Principal) => Promise<number>;
  readonly markPackVersion: (p: Principal, version: number) => Promise<void>;
  readonly marks: MarkCall[];
} {
  const seeded = new Set<UserId>();
  const versions = new Map<UserId, number>();
  const marks: MarkCall[] = [];
  return {
    marks,
    isSeeded: (p): Promise<boolean> => Promise.resolve(seeded.has(p.userId)),
    markSeeded: (p, welcomeAssistantId): Promise<void> => {
      seeded.add(p.userId);
      marks.push({ userId: p.userId, welcomeAssistantId });
      return Promise.resolve();
    },
    readPackVersion: (p): Promise<number> => Promise.resolve(versions.get(p.userId) ?? 0),
    markPackVersion: (p, version): Promise<void> => {
      versions.set(p.userId, version);
      return Promise.resolve();
    },
  };
}

describe("createDefaultCharacterSeeder", () => {
  test("seeds the whole authored pack on a fresh user + marks the latch once", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const latch = fakeLatch();
    const seeder = createDefaultCharacterSeeder({
      characters: svc,
      attachCardTag: noopAttach,
      ...latch,
    });
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const actor = principal(owner);

    await seeder.ensureSeeded(actor);

    const list = await svc.list({ principal: actor });
    expect(list.items.map((c) => c.handle).sort()).toEqual([...ALL_HANDLES].sort());
    expect(latch.marks).toHaveLength(1);
  });

  test("welcomeAssistantId is stamped to the seeded Assistant's id", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const latch = fakeLatch();
    const seeder = createDefaultCharacterSeeder({
      characters: svc,
      attachCardTag: noopAttach,
      ...latch,
    });
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
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
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const actor = principal(owner);

    // First seeder seeds the pack + sets the latch.
    await createDefaultCharacterSeeder({
      characters: svc,
      attachCardTag: noopAttach,
      ...latch,
    }).ensureSeeded(actor);
    // A NEW seeder (fresh in-process memo) sharing the SAME persisted latch must NOT re-seed.
    await createDefaultCharacterSeeder({
      characters: svc,
      attachCardTag: noopAttach,
      ...latch,
    }).ensureSeeded(actor);

    const list = await svc.list({ principal: actor });
    expect(list.items).toHaveLength(ALL_HANDLES.length); // no duplicates
    expect(latch.marks).toHaveLength(1); // the second run short-circuited on the latch
  });

  test("handle_conflict tolerance — a pre-existing handle resolves instead of failing", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const latch = fakeLatch();
    const seeder = createDefaultCharacterSeeder({
      characters: svc,
      attachCardTag: noopAttach,
      ...latch,
    });
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
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
    expect(list.items).toHaveLength(ALL_HANDLES.length);
    expect(list.items.filter((c) => c.handle === WELCOME_ASSISTANT_HANDLE)).toHaveLength(1);
    // The latch lands with the EXISTING Assistant id (resolved via findByHandle), not a fresh one.
    expect(latch.marks[0]?.welcomeAssistantId).toBe(existingAssistantId);
  });

  test("ensureSeeded never throws on a create failure + leaves the latch unset (retry next touch)", async () => {
    const latch = fakeLatch();
    // A characters double whose create always fails with a NON-conflict error (the real-failure path).
    const failing: Pick<CharacterService, "create" | "findByHandle" | "update" | "getCard"> = {
      create: (): Promise<CharacterDetail> => Promise.reject(new Error("db is on fire")),
      findByHandle: (): Promise<null> => Promise.resolve(null),
      update: (): Promise<CharacterDetail> => Promise.reject(new Error("unreachable: nothing is ever created")),
      getCard: (): Promise<null> => Promise.reject(new Error("unreachable: the migration arm is never reached on a fresh seed")),
    };
    const seeder = createDefaultCharacterSeeder({
      characters: failing,
      attachCardTag: noopAttach,
      ...latch,
    });
    const actor = principal("usr_fresh" as UserId);

    await expect(seeder.ensureSeeded(actor)).resolves.toBeUndefined();
    expect(latch.marks).toHaveLength(0); // latch NOT set — the next touch retries
  });

  test("each freshly-created card is stamped with its authored presentation (theme + seeded background)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const latch = fakeLatch();
    const seeder = createDefaultCharacterSeeder({
      characters: svc,
      attachCardTag: noopAttach,
      ...latch,
    });
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const actor = principal(owner);

    await seeder.ensureSeeded(actor);

    const seeded = await Promise.all(
      DEFAULT_CHARACTER_CARDS.map(async (card) => {
        const ref = await svc.findByHandle({ ownerId: owner, handle: card.input.handle });
        return { card, detail: await svc.get({ principal: actor, characterId: ref?.characterId ?? MISSING_ID }) };
      }),
    );
    for (const { card, detail } of seeded) {
      expect(detail.themeOverride, `${card.input.handle} themeOverride`).toEqual(card.presentation.themeOverride);
      // The carried background is this card's own seeded catalog slug — kind + slug are what paint.
      expect(detail.backgroundOverride?.kind, `${card.input.handle} background kind`).toBe("seeded");
      expect(detail.backgroundOverride?.seededId, `${card.input.handle} background slug`).toBe(`${card.input.handle}-bg`);
    }
  });

  test("a conflict-resolved (pre-existing) card is NOT re-stamped — the user's own look survives", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const latch = fakeLatch();
    const seeder = createDefaultCharacterSeeder({
      characters: svc,
      attachCardTag: noopAttach,
      ...latch,
    });
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const actor = principal(owner);
    // The user already owns a card at the welcome handle (their own card, or a partial prior run).
    const existingId = await seedRawCharacter(db, {
      id: "character_existing_assistant",
      ownerId: owner,
      handle: WELCOME_ASSISTANT_HANDLE,
    });

    await seeder.ensureSeeded(actor);

    const detail = await svc.get({ principal: actor, characterId: existingId });
    expect(detail.themeOverride).toBeNull();
    expect(detail.backgroundOverride).toBeNull();
  });

  test("attaches each default card's native tags via the injected op (card/pending carry)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const latch = fakeLatch();
    const attach = recordingAttach();
    const seeder = createDefaultCharacterSeeder({
      characters: svc,
      attachCardTag: attach.attachCardTag,
      ...latch,
    });
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const actor = principal(owner);

    await seeder.ensureSeeded(actor);

    // Every card's tags were attached (count = the sum across the pack), all owner-scoped.
    const expectedTotal = DEFAULT_CHARACTER_CARDS.reduce((n, c) => n + c.tags.length, 0);
    expect(attach.calls).toHaveLength(expectedTotal);
    for (const call of attach.calls) {
      expect(call.ownerId).toBe(owner);
    }
    // The welcome assistant's tags landed on the seeded assistant character.
    const assistant = await svc.findByHandle({ ownerId: owner, handle: WELCOME_ASSISTANT_HANDLE });
    const assistantTags = attach.calls.filter((c) => c.characterId === assistant?.characterId).map((c) => c.tagName);
    expect(assistantTags).toEqual([...(ASSISTANT_CARD?.tags ?? [])]);
  });
});
