// @subject tests/support/node/factories/rows.ts
// @subject tests/support/node/factories/chat.ts
// @subject tests/support/node/factories/message.ts
// Row builders stay FK-clean for persistence suites; root seeds return exactly what the production verbs wrote.

import { createCharacterSchema } from "@orb/contracts/character";
import { chats, closeDb, messages, messageVariants } from "@orb/db";
import { createIdSource } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { createSeededIds } from "../../iso/ids.ts";
import { seedCorpusActors } from "../corpus-actors.ts";
import { freshDb } from "../db.ts";
import { expect, test } from "../fixtures.ts";
import { createServerHarness } from "../server.ts";
import { makeUser, seedCharacterRows, seedChatRows, seedMessageRow, seedMessageRows, seedTranscriptRows } from "./rows.ts";

describe("rows — direct builders for persistence suites", () => {
  test("user defaults consume the injected production prefixless mint, not a prefixed fixture id", () => {
    const expected = createIdSource(createSeededIds().next);
    const source = createIdSource(createSeededIds().next);
    expect(makeUser({}, source).id).toBe(expected.userId());
    expect(makeUser({}, source).id).toBe(expected.userId());
  });

  test("seedMessageRow performs the D26 write on an empty database: slot, variant idx 0, then the selection pointer", async () => {
    const db = await freshDb();
    try {
      const seeded = await seedMessageRow(db, { content: "hello there" });
      const [slot] = await db.select().from(messages).where(eq(messages.id, seeded.id));
      expect(slot?.selectedVariantId).toBe(seeded.variantId);
      const [variant] = await db.select().from(messageVariants).where(eq(messageVariants.id, seeded.variantId));
      expect(variant).toMatchObject({ messageId: seeded.id, idx: 0, content: "hello there" });
      expect(await db.select().from(chats).where(eq(chats.id, seeded.chatId))).toHaveLength(1);
    } finally {
      closeDb(db);
    }
  });
});

describe("root seeds — production verbs and their canonical rows", () => {
  test("a started room seats its caller as host, stays a husk until the first commit, and returns the committed slot", async () => {
    await using root = await createServerHarness();
    // A committed line is funded through the host's chat binding.
    const { owner } = await seedCorpusActors(root);
    const card = await seedCharacterRows(root, {
      principal: owner,
      input: createCharacterSchema.parse({ handle: "seed-witness", name: "Witness", description: "" }),
    });
    const room = await seedChatRows(root, { principal: owner, characterIds: [card.row.id] });
    expect(room.row).toMatchObject({ id: room.view.chat.id, startedAt: null });
    expect(room.participants.map(({ kind, role, userId, characterId }) => ({ kind, role, userId, characterId }))).toEqual([
      { kind: "human", role: "host", userId: owner.userId, characterId: null },
      { kind: "character", role: "member", userId: null, characterId: card.row.id },
    ]);
    const committed = await seedMessageRows(root, { principal: owner, chatId: room.row.id, content: "The first committed line." });
    expect(committed.slot).toMatchObject({ chatId: room.row.id, role: "user", authorUserId: owner.userId, selectedVariantId: committed.variant.id });
    expect(committed.variant).toMatchObject({ messageId: committed.slot.id, content: "The first committed line." });
    const page = await root.services.chat.listMessages({ principal: owner, chatId: room.row.id });
    expect(page.messages.map(({ id, content }) => ({ id, content }))).toEqual([{ id: committed.slot.id, content: "The first committed line." }]);
    expect((await root.db.select().from(chats).where(eq(chats.id, room.row.id)).get())?.startedAt).not.toBeNull();
  });

  test("a transcript lands through the native import with seat attribution, input order and a refused duplicate", async () => {
    await using root = await createServerHarness();
    const owner = await root.principalFor(root.ownerId);
    const [aria, bryn] = await Promise.all(
      ["aria", "bryn"].map(
        async (handle) =>
          (await seedCharacterRows(root, { principal: owner, input: createCharacterSchema.parse({ handle, name: handle, description: "" }) })).row,
      ),
    );
    if (aria === undefined || bryn === undefined) {
      throw new Error("the transcript seats were not created");
    }
    const params = {
      ownerId: owner.userId,
      characterHandles: [aria.handle, bryn.handle],
      lines: [
        { role: "user", content: "Who keeps the ledger?" },
        { role: "assistant", content: "Aria keeps it." },
        { role: "assistant", speakerHandle: bryn.handle, content: "Bryn checks it." },
      ],
    } as const;
    const transcript = await seedTranscriptRows(root, params);
    expect(transcript.messages.map(({ slot, variant }) => [slot.role, slot.authorUserId, slot.characterId, variant.content])).toEqual([
      ["user", owner.userId, null, "Who keeps the ledger?"],
      ["assistant", null, aria.id, "Aria keeps it."],
      ["assistant", null, bryn.id, "Bryn checks it."],
    ]);
    expect(transcript.participants.filter(({ kind }) => kind === "character").map(({ characterId }) => characterId)).toEqual([aria.id, bryn.id]);
    const page = await root.services.chat.listMessages({ principal: owner, chatId: transcript.row.id });
    expect(page.messages.map(({ id }) => id)).toEqual(transcript.messages.map(({ slot }) => slot.id));
    await expect(seedTranscriptRows(root, params)).rejects.toThrow("an identical transcript was already imported");
  });
});
