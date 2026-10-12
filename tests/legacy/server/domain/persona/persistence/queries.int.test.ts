// persistence — the owner-scoped reads + the parse-at-the-seam detailOf. Load-bearing: the ownership
// predicate lives in the WHERE (a non-owner read returns undefined, never another user's row); the avatar
// LEFT JOIN surfaces the hash; detailOf degrades a CORRUPT metadata blob to null instead of poisoning the
// view (the read-seam zod .catch); ensureCharacterOwned/ensurePersonaOwned throw the right typed error.
// Internal (non-front-door) files are imported by RELATIVE path — the package `./*` map only resolves a
// module's directory front door, not a flat file.

import { chats, personas } from "@orb/db";
import type { AssetId, CharacterId, ChatId, Handle, PersonaId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { FROZEN_AT_MS } from "@orb/testkit/iso/clock.ts";
import { freshDb } from "@orb/testkit/node/db.ts";
import { seedChat } from "@orb/testkit/node/factories/chat.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { PersonaCharacterNotFoundError, PersonaNotFoundError } from "#server/domain/persona/contract/errors.ts";
import {
  detailOf,
  ensureCharacterOwned,
  ensurePersonaOwned,
  loadOwnedPersonaWithAvatar,
  loadPersonasForOwners,
  loadPinnedPersonaView,
} from "#server/domain/persona/persistence/queries.ts";
import { seedAsset, seedCharacter, seedUser } from "../_support.ts";

interface PersonaSeed {
  id?: string;
  avatarAssetId?: AssetId | null;
}
type PersonaDb = Awaited<ReturnType<typeof freshDb>>;

/** A persona row whose metadata is a valid column value. */
function seedPersonaRow(
  db: PersonaDb,
  ownerId: UserId,
  overrides: PersonaSeed & { metadata?: typeof personas.$inferInsert.metadata } = {},
): Promise<PersonaId> {
  return insertPersonaRow(db, ownerId, overrides, overrides.metadata);
}

/** A persona row whose metadata is a corrupt blob written past drizzle's unchecked $type column. */
function seedForgedPersonaRow(db: PersonaDb, ownerId: UserId, overrides: PersonaSeed & { metadata: unknown }): Promise<PersonaId> {
  // @orb-waive no-loose-id-cast(overrides.metadata): forged input — the test's subject is the runtime refusal or heal of a value the static type forbids, and no typed door authors it; ends when a named forged-input seam exists.
  return insertPersonaRow(db, ownerId, overrides, overrides.metadata as never);
}

async function insertPersonaRow(db: PersonaDb, ownerId: UserId, overrides: PersonaSeed, metadata: typeof personas.$inferInsert.metadata): Promise<PersonaId> {
  const id = castId<PersonaId>(overrides.id ?? "persona_x");
  await db.insert(personas).values({
    id,
    ownerId,
    name: "P",
    description: "d",
    avatarAssetId: overrides.avatarAssetId ?? null,
    metadata,
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
  });
  return id;
}

describe("owner-scoped persona load", () => {
  test("loads an owned row with the avatar hash joined", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const avatar = await seedAsset(db, { ownerId: owner, hash: "h" });
    const id = await seedPersonaRow(db, owner, { avatarAssetId: avatar });
    const row = await loadOwnedPersonaWithAvatar(db, owner, id);
    expect(row?.persona.id).toBe(id);
    expect(row?.avatar?.hash).toBe("h");
  });

  test("a non-owner read returns undefined (the WHERE-clause owner predicate)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const id = await seedPersonaRow(db, owner);
    expect(await loadOwnedPersonaWithAvatar(db, other, id)).toBeUndefined();
  });
});

describe("metadata read seam (detailOf)", () => {
  test("degrades a corrupt (non-object) metadata blob to null", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    // Write a deliberately invalid metadata blob past drizzle's unchecked $type column.
    const id = await seedForgedPersonaRow(db, owner, { metadata: "not-an-object" });
    const row = await loadOwnedPersonaWithAvatar(db, owner, id);
    if (row === undefined) {
      throw new Error("expected the seeded row to load");
    }
    expect(detailOf(row).metadata).toBeNull();
  });

  test("passes a valid metadata blob through typed", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const id = await seedPersonaRow(db, owner, { metadata: { descriptionPosition: "none" } });
    const row = await loadOwnedPersonaWithAvatar(db, owner, id);
    if (row === undefined) {
      throw new Error("expected the seeded row to load");
    }
    expect(detailOf(row).metadata?.descriptionPosition).toBe("none");
  });

  test("degrades malformed and wrong-prefix sourceCharacterId on both persona read paths", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const malformed = await seedForgedPersonaRow(db, owner, {
      id: "persona_bad_source",
      metadata: { sourceCharacterId: "character_not-a-typeid" },
    });
    const wrongPrefix = await seedForgedPersonaRow(db, owner, {
      id: "persona_wrong_source",
      metadata: { sourceCharacterId: mintTypeId(ID_PREFIX.chat) },
    });

    for (const id of [malformed, wrongPrefix]) {
      const row = await loadOwnedPersonaWithAvatar(db, owner, id);
      if (row === undefined) {
        throw new Error("expected the seeded row to load");
      }
      expect(detailOf(row).metadata).toBeNull();
    }

    const listed = await loadPersonasForOwners(db, [malformed, wrongPrefix], [owner]);
    expect(new Map(listed.map((persona) => [persona.id, persona.metadata]))).toEqual(
      new Map([
        [malformed, null],
        [wrongPrefix, null],
      ]),
    );
  });
});

// The room pin read takes a chat, never a persona id: scope rides `chats.anchorPersonaId`, so the only persona it
// can return is the one that room pinned, whoever owns it (ADR 0315).
describe("room pin read (loadPinnedPersonaView)", () => {
  test("returns only the chat's own pin: another room's pinned persona, another owner's included, never comes back", async () => {
    const db = await freshDb();
    const host = await seedUser(db, { handle: castId<Handle>("host") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const hostPersona = await seedPersonaRow(db, host, { id: "persona_host" });
    const strangerPersona = await seedPersonaRow(db, stranger, { id: "persona_stranger" });
    const hostRoom = (await seedChat(db, { anchorPersonaId: hostPersona })).id;
    const strangerRoom = (await seedChat(db, { anchorPersonaId: strangerPersona })).id;
    const unpinnedRoom = (await seedChat(db)).id;

    expect((await loadPinnedPersonaView(db, hostRoom))?.id).toBe(hostPersona);
    expect((await loadPinnedPersonaView(db, strangerRoom))?.id).toBe(strangerPersona);
    expect((await loadPinnedPersonaView(db, strangerRoom))?.ownerId).toBe(stranger);
    expect(await loadPinnedPersonaView(db, unpinnedRoom)).toBeUndefined();
    expect(await loadPinnedPersonaView(db, castId<ChatId>(mintTypeId(ID_PREFIX.chat)))).toBeUndefined();
  });

  test("reads the pin live: a re-pin moves the answer, and a cleared pin reads undefined", async () => {
    const db = await freshDb();
    const host = await seedUser(db, { handle: castId<Handle>("host") });
    const first = await seedPersonaRow(db, host, { id: "persona_first" });
    const second = await seedPersonaRow(db, host, { id: "persona_second" });
    const room = (await seedChat(db, { anchorPersonaId: first })).id;

    await db.update(chats).set({ anchorPersonaId: second }).where(eq(chats.id, room));
    expect((await loadPinnedPersonaView(db, room))?.id).toBe(second);

    await db.update(chats).set({ anchorPersonaId: null }).where(eq(chats.id, room));
    expect(await loadPinnedPersonaView(db, room)).toBeUndefined();
  });
});

describe("ownership gates", () => {
  test("ensurePersonaOwned throws for a foreign/missing persona, passes for the owner", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const id = await seedPersonaRow(db, owner);
    await expect(ensurePersonaOwned(db, other, id)).rejects.toThrow(PersonaNotFoundError);
    await expect(ensurePersonaOwned(db, owner, castId<PersonaId>("persona_ghost"))).rejects.toThrow(PersonaNotFoundError);
    await expect(ensurePersonaOwned(db, owner, id)).resolves.toBeUndefined();
  });

  test("ensureCharacterOwned throws for a foreign/missing character, passes for the owner", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const character = await seedCharacter(db, { ownerId: owner });
    await expect(ensureCharacterOwned(db, other, character)).rejects.toThrow(PersonaCharacterNotFoundError);
    await expect(ensureCharacterOwned(db, owner, castId<CharacterId>("character_ghost"))).rejects.toThrow(PersonaCharacterNotFoundError);
    await expect(ensureCharacterOwned(db, owner, character)).resolves.toBeUndefined();
  });
});
