// seeder: createDefaultCharacterSeeder — seeds ONE shipped card at a time, over the REAL character service (real
// create + findByHandle + the handle_conflict translation). Which cards an account receives is the user seed's
// ledger (tests/server/entry/boot/seed-user-content.int.test.ts). Covers: every card seeds; the welcome pointer
// lands on the welcome card; a pre-existing handle resolves instead of failing; a create failure rejects so the
// ledger records nothing; the PRESENTATION step runs for freshly-created cards only; a half-seeded card is
// finished on the retry (#1444); each card's native tags attach; and each card's lore lands as its primary
// world book, without a resumed seed ever replacing a primary book the user put in the seat.

import type { Principal } from "@orb/contracts/identity";
import type { ThemeBackground } from "@orb/contracts/theme";
import { canonicalBackgroundSource } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import { assets, characterBooks, worldEntries } from "@orb/db";
import type { AssetId, CharacterId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { CharacterDetail, CharacterService, DefaultCharacterSeeder } from "@orb/server/domain/character";
import { createCharacterService, createDefaultCharacterSeeder, DEFAULT_CHARACTER_CARDS, WELCOME_ASSISTANT_HANDLE } from "@orb/server/domain/character";
import { and, eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, realLorebookImport, seedAsset, seedRawCharacter, seedUser } from "../_support.ts";

/** The per-user plate resolver the composition root wires off `domain/settings`' scene-plate seeder. Faked
 *  here as a pure slug→asset mapping: this suite is about the CARD DRESSING, not the CAS, and the real op's
 *  own behaviour (lift the shipped bytes once, hand back a `kind:"asset"` ref) is pinned in
 *  `tests/server/domain/settings/seeder/backgrounds.int.test.ts`. The ref goes through the SAME canonicalizer
 *  the real one uses, so what lands here is the persisted shape. */
function fakePlateResolver(db: Db, ownerId: UserId): (principal: Principal, slug: string) => Promise<ThemeBackground> {
  return async (_principal, slug): Promise<ThemeBackground> => {
    // It really SEEDS an owned asset row: the card update path's own belt (`ensureBackgroundOverrideOwned`)
    // refuses a carried `assetId` the caller does not own, so a resolver handing back a bare ref would be
    // testing a shape the product cannot persist. IDEMPOTENT, like the CAS it stands in for — a plate asked
    // for twice (a resumed seed, a pack migration) resolves the same row rather than colliding on its PK.
    const id = `asset_plate_${slug.replaceAll("-", "_")}`;
    const existing = await db
      .select({ id: assets.id })
      .from(assets)
      .where(eq(assets.id, castId<AssetId>(id)))
      .limit(1);
    const assetId = existing[0]?.id ?? (await seedAsset(db, { id, ownerId, hash: `hash_plate_${slug}` }));
    return canonicalBackgroundSource({
      kind: "asset",
      assetId,
      assetHash: `hash_plate_${slug}`,
      mime: "image/jpeg",
      externalUrl: "",
      provenanceUrl: "",
    });
  };
}

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

/** A recorder for the injected welcome-pointer write, keyed by `principal.userId`. */
function fakeLatch(): {
  readonly markWelcomeAssistant: (p: Principal, id: CharacterId) => Promise<void>;
  readonly marks: MarkCall[];
} {
  const marks: MarkCall[] = [];
  return {
    marks,
    markWelcomeAssistant: (p, welcomeAssistantId): Promise<void> => {
      marks.push({ userId: p.userId, welcomeAssistantId });
      return Promise.resolve();
    },
  };
}

/** The entry titles of a character's PRIMARY book, read straight off the junction the lore import writes. */
async function primaryBookEntryTitles(db: Db, characterId: CharacterId): Promise<string[]> {
  const rows = await db
    .select({ title: worldEntries.title })
    .from(characterBooks)
    .innerJoin(worldEntries, eq(worldEntries.worldBookId, characterBooks.worldBookId))
    .where(and(eq(characterBooks.characterId, characterId), eq(characterBooks.role, "primary")));
  return rows.map((row) => row.title).toSorted();
}

/** Seed every shipped card, one call per handle — what the user seed does for a fresh account. */
async function seedAll(seeder: DefaultCharacterSeeder, actor: Principal): Promise<void> {
  for (const handle of ALL_HANDLES) {
    await seeder.seedCard(actor, handle);
  }
}

describe("createDefaultCharacterSeeder", () => {
  test("seeds the whole authored pack on a fresh user + points the welcome greeter once", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const latch = fakeLatch();
    const seeder = createDefaultCharacterSeeder({
      ...realLorebookImport(db),
      characters: svc,
      attachCardTag: noopAttach,
      ...latch,
    });
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const actor = principal(owner);

    await seedAll(seeder, actor);

    const list = await svc.list({ principal: actor });
    expect(list.items.map((c) => c.handle).sort()).toEqual(ALL_HANDLES.toSorted());
    expect(latch.marks).toHaveLength(1);
  });

  test("welcomeAssistantId is stamped to the seeded Assistant's id", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const latch = fakeLatch();
    const seeder = createDefaultCharacterSeeder({
      ...realLorebookImport(db),
      characters: svc,
      attachCardTag: noopAttach,
      ...latch,
    });
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const actor = principal(owner);

    await seedAll(seeder, actor);

    const assistant = await svc.findByHandle({ ownerId: owner, handle: WELCOME_ASSISTANT_HANDLE });
    expect(assistant).not.toBeNull();
    expect(latch.marks[0]?.welcomeAssistantId).toBe(assistant?.characterId);
  });

  test("handle_conflict tolerance — a pre-existing handle resolves instead of failing", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const latch = fakeLatch();
    const seeder = createDefaultCharacterSeeder({
      ...realLorebookImport(db),
      characters: svc,
      attachCardTag: noopAttach,
      ...latch,
    });
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const actor = principal(owner);
    // A previous partial run already created the Assistant handle.
    const existingAssistantId = await seedRawCharacter(db, {
      id: "character_existing_assistant",
      ownerId: owner,
      handle: WELCOME_ASSISTANT_HANDLE,
    });

    await seedAll(seeder, actor);

    // No duplicate Assistant — the rerun resolved the existing row; the other 4 cards were created.
    const list = await svc.list({ principal: actor });
    expect(list.items).toHaveLength(ALL_HANDLES.length);
    expect(list.items.filter((c) => c.handle === WELCOME_ASSISTANT_HANDLE)).toHaveLength(1);
    // The welcome pointer names the EXISTING Assistant (resolved via findByHandle), not a fresh one.
    expect(latch.marks[0]?.welcomeAssistantId).toBe(existingAssistantId);
  });

  test("a create failure rejects, so the user seed records nothing and retries on the next touch", async () => {
    const latch = fakeLatch();
    // A characters double whose create always fails with a NON-conflict error (the real-failure path).
    const failing: Pick<CharacterService, "create" | "findByHandle" | "update" | "getCard" | "get"> = {
      create: (): Promise<CharacterDetail> => Promise.reject(new Error("db is on fire")),
      findByHandle: (): Promise<null> => Promise.resolve(null),
      update: (): Promise<CharacterDetail> => Promise.reject(new Error("unreachable: nothing is ever created")),
      getCard: (): Promise<null> => Promise.reject(new Error("unreachable: a failed create reads nothing")),
      get: (): Promise<CharacterDetail> => Promise.reject(new Error("unreachable: nothing is ever created")),
    };
    const seeder = createDefaultCharacterSeeder({
      importLorebook: () => Promise.reject(new Error("unreachable: nothing is ever created")),
      hasPrimaryBook: () => Promise.reject(new Error("unreachable: nothing is ever created")),
      characters: failing,
      attachCardTag: noopAttach,
      ...latch,
    });
    const actor = principal("usr_fresh" as UserId);

    await expect(seeder.seedCard(actor, WELCOME_ASSISTANT_HANDLE)).rejects.toThrow("db is on fire");
    expect(latch.marks).toHaveLength(0);
  });

  test("each freshly-created card is stamped with its authored presentation (theme + its own scene plate)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const latch = fakeLatch();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const actor = principal(owner);
    const seeder = createDefaultCharacterSeeder({
      ...realLorebookImport(db),
      characters: svc,
      attachCardTag: noopAttach,
      resolveSeededBackground: fakePlateResolver(db, owner),
      ...latch,
    });

    await seedAll(seeder, actor);

    const seeded = await Promise.all(
      DEFAULT_CHARACTER_CARDS.map(async (card) => {
        const ref = await svc.findByHandle({ ownerId: owner, handle: card.input.handle });
        return { card, detail: await svc.get({ principal: actor, characterId: ref?.characterId ?? MISSING_ID }) };
      }),
    );
    for (const { card, detail } of seeded) {
      expect(detail.themeOverride, `${card.input.handle} themeOverride`).toEqual(card.presentation.themeOverride);
      // The carried background is this card's own scene plate, resolved into an OWNED asset for this user
      // (the `kind:"seeded"` catalog retired 2026-09-18) — kind + hash are what paint.
      expect(detail.backgroundOverride?.kind, `${card.input.handle} background kind`).toBe("asset");
      expect(detail.backgroundOverride?.assetHash, `${card.input.handle} background plate`).toBe(`hash_plate_${card.input.handle}-bg`);
    }
  });

  test("a conflict-resolved (pre-existing) card is NOT re-stamped — the user's own look survives", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const latch = fakeLatch();
    const seeder = createDefaultCharacterSeeder({
      ...realLorebookImport(db),
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

    await seedAll(seeder, actor);

    const detail = await svc.get({ principal: actor, characterId: existingId });
    expect(detail.themeOverride).toBeNull();
    expect(detail.backgroundOverride).toBeNull();
  });

  test("a card left HALF-SEEDED by a crashed run is finished on the retry, not abandoned (#1444)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const latch = fakeLatch();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const actor = principal(owner);
    // Run one: the Assistant's row is CREATED, then its presentation edit throws — the shape of a crash
    // between `create` and the dressing. The seed rejects, so the ledger never records the card.
    // A RUN COUNTER, not a `let flag = true` — biome narrows a literal-initialized boolean and calls the
    // read always-truthy, and a suppression would hide a real always-true condition later.
    const run = { index: 0 };
    const flaky: Pick<CharacterService, "create" | "findByHandle" | "update" | "getCard" | "get"> = {
      create: svc.create,
      findByHandle: svc.findByHandle,
      getCard: svc.getCard,
      get: svc.get,
      update: (params): ReturnType<CharacterService["update"]> => {
        if (run.index === 0 && Object.hasOwn(params.input, "themeOverride")) {
          return Promise.reject(new Error("the presentation write died mid-seed"));
        }
        return svc.update(params);
      },
    };
    const deps = { characters: flaky, attachCardTag: noopAttach, resolveSeededBackground: fakePlateResolver(db, owner), ...realLorebookImport(db), ...latch };

    await expect(createDefaultCharacterSeeder(deps).seedCard(actor, WELCOME_ASSISTANT_HANDLE)).rejects.toThrow("the presentation write died mid-seed");
    expect(latch.marks).toHaveLength(0);
    const half = await svc.findByHandle({ ownerId: owner, handle: WELCOME_ASSISTANT_HANDLE });
    expect((await svc.get({ principal: actor, characterId: half?.characterId ?? MISSING_ID })).themeOverride).toBeNull();

    // Run two: the row now resolves through handle_conflict (`created: false`). Gating the dressing on
    // `created` left this card permanently themeless while the pack latched around it — a card that exists,
    // is ours byte-for-byte, and never received half of what it was authored with.
    run.index = 1;
    await createDefaultCharacterSeeder(deps).seedCard(actor, WELCOME_ASSISTANT_HANDLE);

    const detail = await svc.get({ principal: actor, characterId: half?.characterId ?? MISSING_ID });
    expect(detail.themeOverride).toEqual(ASSISTANT_CARD?.presentation.themeOverride);
    expect(detail.backgroundOverride?.assetHash).toBe(`hash_plate_${WELCOME_ASSISTANT_HANDLE}-bg`);
    expect(latch.marks).toHaveLength(1);
  });

  test("attaches each default card's native tags via the injected op (card/pending carry)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const latch = fakeLatch();
    const attach = recordingAttach();
    const seeder = createDefaultCharacterSeeder({
      ...realLorebookImport(db),
      characters: svc,
      attachCardTag: attach.attachCardTag,
      ...latch,
    });
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const actor = principal(owner);

    await seedAll(seeder, actor);

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

  test("every seeded card lands its lore as its primary world book", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const seeder = createDefaultCharacterSeeder({ ...realLorebookImport(db), characters: svc, attachCardTag: noopAttach, ...fakeLatch() });
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    await seedAll(seeder, principal(owner));

    for (const card of DEFAULT_CHARACTER_CARDS) {
      const row = await svc.findByHandle({ ownerId: owner, handle: card.input.handle });
      const titles = await primaryBookEntryTitles(db, row?.characterId ?? MISSING_ID);
      expect(titles, `${card.input.handle} primary book`).toEqual(card.lore.entries.map((entry) => entry.title).toSorted());
    }
  });

  test("a resumed seed finishes missing lore, but never replaces a primary book the user put in the seat", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const lore = realLorebookImport(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const actor = principal(owner);
    // Run one crashes at the lore step for every card, so each row lands dressed but book-less.
    const run = { index: 0 };
    const crashing = {
      ...lore,
      importLorebook: (args: Parameters<typeof lore.importLorebook>[0]): ReturnType<typeof lore.importLorebook> =>
        run.index === 0 ? Promise.reject(new Error("the lore write died mid-seed")) : lore.importLorebook(args),
    };
    const seeder = createDefaultCharacterSeeder({ ...crashing, characters: svc, attachCardTag: noopAttach, ...fakeLatch() });
    const [kept, finished] = DEFAULT_CHARACTER_CARDS;
    if (kept === undefined || finished === undefined) {
      throw new Error("the pack ships fewer than two cards");
    }
    await expect(seeder.seedCard(actor, kept.input.handle)).rejects.toThrow("the lore write died mid-seed");
    await expect(seeder.seedCard(actor, finished.input.handle)).rejects.toThrow("the lore write died mid-seed");
    const keptId = (await svc.findByHandle({ ownerId: owner, handle: kept.input.handle }))?.characterId ?? MISSING_ID;
    const finishedId = (await svc.findByHandle({ ownerId: owner, handle: finished.input.handle }))?.characterId ?? MISSING_ID;
    // Between the runs the user gives the first card a primary book of their own.
    await lore.importLorebook({
      ownerId: owner,
      characterId: keptId,
      book: {
        name: "My notes",
        description: null,
        entries: [
          { title: "Mine", description: null, content: "What I wrote.", keys: ["mine"], enabled: true, priority: 0, ignoreBudget: false, metadata: null },
        ],
      },
    });

    run.index = 1;
    await seeder.seedCard(actor, kept.input.handle);
    await seeder.seedCard(actor, finished.input.handle);

    expect(await primaryBookEntryTitles(db, keptId)).toEqual(["Mine"]);
    expect(await primaryBookEntryTitles(db, finishedId)).toEqual(finished.lore.entries.map((entry) => entry.title).toSorted());
  });
});
