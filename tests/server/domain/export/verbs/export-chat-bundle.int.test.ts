// verb: exportChatBundle (R6) — the ORB-NATIVE chat bundle against a real db. The ST jsonl sibling
// (`export-chat.int.test.ts`) pins the interchange projection; this pins the FIDELITY projection: the planes
// jsonl structurally cannot carry, and the ID → POSITION index the rpg campaign re-links through.
//
// Load-bearing pins:
//   • the same D29 HOST gate the jsonl arm runs (a member, a non-member and a missing chat all collapse to
//     null) — a second export door must not be a second authority.
//   • `chat_tags` is the D30 per-TAGGER overlay: only the CALLER's labels ride, never a co-member's.
//   • the rpg planes come out as POSITIONS (`messages[i].variants[j]`), derived off the same ordered canon
//     the file serializes — and a snapshot anchored to a variant this chat does not contain must NOT be
//     emitted with a fabricated index.

import { rpgGameConfigSchema } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { chatInjections, chatParticipants, chats, chatTags, messages, messageVariants, personas, rpgGames, rpgSnapshots, tags } from "@orb/db";
import type { ChatId, ChatParticipantId, Handle, MessageId, MessageVariantId, PersonaId, RpgGameId, RpgSnapshotId, TagId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createExportRpgGame } from "@orb/server/domain/rpg";
import type { PortableChat } from "@orb/server/kit/serde/chat-bundle";
import { parseChatBundleFile } from "@orb/server/kit/serde/chat-bundle";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { createExportChatBundle } from "../../../../../packages/server/src/domain/export/verbs/export-chat-bundle.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedCharacter, seedUser } from "../_support.ts";

const FROZEN_AT = 1_750_000_000_000;
const CHAT_ID = castId<ChatId>("chat_bundle");

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

/** The verb over a harness ctx whose rpg read is the REAL one (a fake would prove nothing about the index). */
function verb(): ReturnType<typeof createExportChatBundle> {
  const { ctx } = makeHarness(db);
  return createExportChatBundle({ ...ctx, exportRpgGame: createExportRpgGame({ db }) });
}

function must(result: { readonly bytes: Uint8Array } | null): PortableChat {
  if (result === null) {
    throw new Error("the bundle did not export");
  }
  const parsed = parseChatBundleFile(result.bytes);
  if (!parsed.ok) {
    throw new Error(`the exported bundle did not parse: ${parsed.reason}`);
  }
  return parsed.value;
}

/** A room hosted by `host`, seated with one character, with one assistant turn carrying two swipes. */
async function seedRoom(
  host: UserId,
): Promise<{ characterId: Awaited<ReturnType<typeof seedCharacter>>; messageId: MessageId; variantIds: MessageVariantId[] }> {
  const characterId = await seedCharacter(db, { ownerId: host, handle: castId("aria"), name: "Aria" });
  await db.insert(chats).values({
    id: CHAT_ID,
    title: "A Long Road",
    star: true,
    archived: true,
    compactSummary: "the first leg",
    compactedAtSeq: 2,
    metadata: { roomOverrides: { scenario: "the frontier" } },
    variableValues: { mood: "grim" },
    runtimeVariables: { mood: "STALE-DERIVED" },
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  });
  await db.insert(chatParticipants).values([
    { id: castId<ChatParticipantId>("chat_participant_h"), chatId: CHAT_ID, kind: "human", userId: host, role: "host", joinSeq: 0, joinedAt: FROZEN_AT },
    {
      id: castId<ChatParticipantId>("chat_participant_c"),
      chatId: CHAT_ID,
      kind: "character",
      characterId,
      role: "member",
      joinSeq: 1,
      joinedAt: FROZEN_AT,
    },
  ]);
  const messageId = castId<MessageId>("message_bundle_1");
  await db.insert(messages).values({ id: messageId, chatId: CHAT_ID, seq: 1, role: "assistant", characterId, createdAt: FROZEN_AT });
  const variantIds = [castId<MessageVariantId>("variant_bundle_0"), castId<MessageVariantId>("variant_bundle_1")];
  await db
    .insert(messageVariants)
    .values(variantIds.map((id, i) => ({ id, messageId, idx: i, content: `take ${i}`, tokensIn: 10 + i, tokensOut: i + 1, createdAt: FROZEN_AT })));
  await db.update(messages).set({ selectedVariantId: variantIds[1] }).where(eq(messages.id, messageId));
  await db.insert(chatInjections).values({
    id: castId("chat_injection_b"),
    chatId: CHAT_ID,
    position: "in_chat",
    depth: 4,
    role: "system",
    content: "Stay wry.",
    order: 1,
    createdAt: FROZEN_AT,
  });
  return { characterId, messageId, variantIds };
}

describe("exportChatBundle — the host gate is the jsonl arm's, restated", () => {
  test("a member, a non-member and a missing chat all collapse to null; the present host exports", async () => {
    const host = await seedUser(db, { handle: castId<Handle>("host") });
    const member = await seedUser(db, { handle: castId<Handle>("member") });
    await seedRoom(host);
    await db.insert(chatParticipants).values({
      id: castId<ChatParticipantId>("chat_participant_m"),
      chatId: CHAT_ID,
      kind: "human",
      userId: member,
      role: "member",
      joinSeq: 2,
      joinedAt: FROZEN_AT,
    });
    const exportBundle = verb();

    expect(await exportBundle({ principal: principal(member), chatId: CHAT_ID })).toBeNull();
    expect(await exportBundle({ principal: principal(host), chatId: castId<ChatId>("chat_missing") })).toBeNull();
    expect(await exportBundle({ principal: principal(host), chatId: CHAT_ID })).not.toBeNull();
  });
});

describe("exportChatBundle — the fidelity planes", () => {
  test("carries the room blob, the variable picks, the injection LIST, the seats by handle, and the swipe economics", async () => {
    const host = await seedUser(db, { handle: castId<Handle>("host") });
    await seedRoom(host);

    const bundle = must(await verb()({ principal: principal(host), chatId: CHAT_ID }));

    expect(bundle.title).toBe("A Long Road");
    expect(bundle.star).toBe(true);
    expect(bundle.archived).toBe(true);
    expect(bundle.compactSummary).toBe("the first leg");
    expect(bundle.compactedAtSeq).toBe(2);
    expect(bundle.metadata).toEqual({ roomOverrides: { scenario: "the frontier" } });
    expect(bundle.variableValues).toEqual({ mood: "grim" });
    expect(bundle.characterHandles).toEqual(["aria"]);
    expect(bundle.injections).toEqual([{ position: "in_chat", depth: 4, role: "system", content: "Stay wry.", order: 1, createdAt: FROZEN_AT }]);
    // The SELECTED variant is the pointer's, not "the last one" by luck.
    expect(bundle.messages[0]?.selectedIdx).toBe(1);
    expect(bundle.messages[0]?.speakerHandle).toBe("aria");
    // `tokensIn` has no ST spelling at all — its presence IS the fidelity claim.
    expect(bundle.messages[0]?.variants.map((v) => v.tokensIn)).toEqual([10, 11]);
    // The DERIVED runtime cache does not ride (it re-folds from the carried per-variant deltas).
    expect(Object.keys(bundle)).not.toContain("runtimeVariables");
  });

  test("D30: only the CALLER's chat-tag overlay rides — a co-member's identical label stays theirs", async () => {
    const host = await seedUser(db, { handle: castId<Handle>("host") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    await seedRoom(host);
    await db.insert(tags).values([
      { id: castId<TagId>("tag_mine"), ownerId: host, name: "campaign" },
      { id: castId<TagId>("tag_theirs"), ownerId: other, name: "theirs-only" },
    ]);
    await db.insert(chatTags).values([
      { chatId: CHAT_ID, tagId: castId<TagId>("tag_mine"), ownerId: host, createdAt: FROZEN_AT },
      { chatId: CHAT_ID, tagId: castId<TagId>("tag_theirs"), ownerId: other, createdAt: FROZEN_AT },
    ]);

    const bundle = must(await verb()({ principal: principal(host), chatId: CHAT_ID }));
    expect(bundle.tagNames).toEqual(["campaign"]);
  });

  test("the anchor persona rides by NAME (ids are not preserved across a box)", async () => {
    const host = await seedUser(db, { handle: castId<Handle>("host") });
    await seedRoom(host);
    const personaId = castId<PersonaId>("persona_anchor");
    await db.insert(personas).values({ id: personaId, ownerId: host, name: "My Persona", description: "d" });
    await db.update(chats).set({ anchorPersonaId: personaId }).where(eq(chats.id, CHAT_ID));

    const bundle = must(await verb()({ principal: principal(host), chatId: CHAT_ID }));
    expect(bundle.anchorPersonaName).toBe("My Persona");
  });

  test("the rpg campaign's variant anchor becomes a POSITION derived off the same ordered canon", async () => {
    const host = await seedUser(db, { handle: castId<Handle>("host") });
    const { messageId, variantIds } = await seedRoom(host);
    const gameId = castId<RpgGameId>("rpg_game_bundle");
    await db.insert(rpgGames).values({
      id: gameId,
      chatId: CHAT_ID,
      mode: "lite",
      status: "active",
      sessionNumber: 3,
      config: rpgGameConfigSchema.parse({}),
      createdAt: FROZEN_AT,
      updatedAt: FROZEN_AT,
    });
    // Anchored to the SECOND swipe — a projection that assumed variant 0 would pass a one-swipe fixture.
    await db.insert(rpgSnapshots).values({
      id: castId<RpgSnapshotId>("rpg_snapshot_bundle"),
      gameId,
      messageId,
      variantId: variantIds[1] as MessageVariantId,
      location: "the broken bridge",
      committed: 1,
      createdAt: FROZEN_AT,
    });

    const bundle = must(await verb()({ principal: principal(host), chatId: CHAT_ID }));
    expect(bundle.rpg?.sessionNumber).toBe(3);
    expect(bundle.rpg?.snapshots[0]).toMatchObject({ messageIndex: 0, variantIdx: 1 });
    expect(bundle.rpg?.snapshots[0]?.state.location).toBe("the broken bridge");
  });

  test("a chat with no game exports `rpg: null` — the common case is not a special case", async () => {
    const host = await seedUser(db, { handle: castId<Handle>("host") });
    await seedRoom(host);
    expect(must(await verb()({ principal: principal(host), chatId: CHAT_ID })).rpg).toBeNull();
  });
});
