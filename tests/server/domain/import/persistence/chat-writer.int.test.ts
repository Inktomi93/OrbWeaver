// biome-ignore-all lint/style/useNamingConvention: ST chat-JSONL wire field names (snake_case) are the format.
// Mirror int-test for domain/import/persistence/chat-writer (PD-77) — direct coverage of the writer's
// D26 slot⋈variant dance, roster rows, branch resolution, and importHash dedup (the verb int-test at
// verbs/import-chats.int.test.ts exercises the SAME behaviour through `createImportChats`; this one drives
// `writeImportedChats` directly, over a real db).

import { chatParticipants, chats, messages, messageVariants } from "@orb/db";
import type { ChatId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import type { CollectedChat } from "../../../../../packages/server/src/domain/import/contract/views.ts";
import { writeImportedChats } from "../../../../../packages/server/src/domain/import/persistence/chat-writer.ts";
import { parseChatJsonl } from "../../../../../packages/server/src/domain/import/substrate/chat.ts";
import { freshDb } from "../../../../support/db.ts";
import { seedCharacter, seedUser } from "../../../../support/factories/index.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeProfileHarness } from "../_support.ts";

/** A real_conversation chat (a greeting + a user turn) as one CollectedChat. `hashSalt` distinguishes files. */
function chatFile(
  fileName: string,
  over: { hashSalt?: string; parentRef?: string } = {},
): CollectedChat {
  const meta = over.parentRef !== undefined ? { main_chat: over.parentRef } : {};
  const h = JSON.stringify({
    user_name: "Nate",
    character_name: "Aria",
    create_date: "2025-07-18@12h00m00s",
    chat_metadata: meta,
  });
  const lines = [
    h,
    JSON.stringify({ is_user: false, mes: "Hello traveller.", send_date: "2025-07-18@12h00m01s" }),
    JSON.stringify({ is_user: true, mes: "Hi Aria!", send_date: "2025-07-18@12h00m02s" }),
  ].join("\n");
  const parsed = parseChatJsonl(lines, { fileName, charDirName: "Aria" });
  if (parsed === null) {
    throw new Error("fixture parse failed");
  }
  return { parsed, importedFrom: fileName, importHash: `hash-${fileName}-${over.hashSalt ?? ""}` };
}

describe("persistence/chat-writer", () => {
  test("writes the D26 slot⋈variant pool + the founding roster", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const character = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const h = makeProfileHarness(db, owner.id);

    const counts = await writeImportedChats(h.profile, {
      ownerId: owner.id,
      characterId: character.id,
      chats: [chatFile("Aria - 2025-07-18@12h00m00s.jsonl")],
    });

    expect(counts.chatsImported).toBe(1);
    expect(counts.messagesImported).toBe(2);
    expect(counts.variantsImported).toBe(2);
    expect(counts.realConversationWritten).toBe(true);

    const chatRows = await db.select().from(chats);
    expect(chatRows).toHaveLength(1);
    // esoterica 2 — updatedAt is the MAX message send_date, not the import clock.
    expect(chatRows[0]?.updatedAt).toBe(Date.UTC(2025, 6, 18, 12, 0, 2));

    const roster = await db
      .select()
      .from(chatParticipants)
      .where(eq(chatParticipants.chatId, chatRows[0]?.id ?? castId<ChatId>("chat_x")));
    expect(roster.map((r) => r.kind).sort()).toEqual(["character", "human"]);
    expect(roster.find((r) => r.kind === "human")?.role).toBe("host");

    const slots = await db.select().from(messages);
    const variants = await db.select().from(messageVariants);
    expect(slots).toHaveLength(2);
    expect(variants).toHaveLength(2);
    for (const s of slots) {
      expect(s.selectedVariantId).not.toBeNull();
    }
    const contents = variants.map((v) => v.content).sort();
    expect(contents).toEqual(["Hello traveller.", "Hi Aria!"]);
  });

  test("dup-skip by importHash — a byte-identical re-import writes nothing", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const character = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const h = makeProfileHarness(db, owner.id);
    const file = chatFile("Aria - 2025-07-18@12h00m00s.jsonl");

    await writeImportedChats(h.profile, {
      ownerId: owner.id,
      characterId: character.id,
      chats: [file],
    });
    const again = await writeImportedChats(h.profile, {
      ownerId: owner.id,
      characterId: character.id,
      chats: [file],
    });

    expect(again.chatsImported).toBe(0);
    expect(again.chatsSkipped).toBe(1);
    expect(await db.select().from(chats)).toHaveLength(1);
  });

  test("branch resolution — a child links parentChatId to the parent by source filename", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const character = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const h = makeProfileHarness(db, owner.id);

    const parentName = "Aria - 2025-07-18@12h00m00s.jsonl";
    const counts = await writeImportedChats(h.profile, {
      ownerId: owner.id,
      characterId: character.id,
      chats: [
        chatFile(parentName, { hashSalt: "p" }),
        chatFile("Aria - 2025-07-18@13h00m00s - Branch #1.jsonl", {
          hashSalt: "c",
          parentRef: parentName,
        }),
      ],
    });
    expect(counts.branchesLinked).toBe(1);

    const rows = await db
      .select({ id: chats.id, importedFrom: chats.importedFrom, parentChatId: chats.parentChatId })
      .from(chats);
    const parent = rows.find((r) => r.importedFrom === parentName);
    const child = rows.find((r) => r.importedFrom?.includes("Branch #1"));
    expect(child?.parentChatId).toBe(parent?.id);
    expect(parent?.parentChatId).toBeNull();
  });
});
