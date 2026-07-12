// biome-ignore-all lint/style/useNamingConvention: ST chat-JSONL wire field names (snake_case) are the format.
// biome-ignore-all lint/security/noSecrets: ST @-date tokens in the fixtures are not secrets.
// Unit test for domain/import/verbs/importChats (Option B; PD-77) — `import` performs NO db access: it maps
// each parsed ST chat → the canonical `BulkImportChatInput` and delegates the WRITE to the injected
// `bulkImportChats` op (a recording fake here). Asserts the ST→canonical MAPPING + the PD-78 backfill gate.
// The db-write correctness is pinned in the chat-domain mirror (`chat/persistence/import-write.int.test.ts`).

import type { CharacterId, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { parseChatJsonl } from "@orb/server/kit/serde/chat";
import { describe } from "vitest";
import type { CollectedChat } from "../../../../../packages/server/src/domain/import/contract/views.ts";
import { createImportChats } from "../../../../../packages/server/src/domain/import/verbs/import-chats.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeProfileHarness } from "../_support.ts";

const OWNER = castId<UserId>("user_owner");

/** A real_conversation chat (a greeting + a user turn) as one CollectedChat. `hashSalt` distinguishes files. */
function chatFile(
  fileName: string,
  over: { hashSalt?: string; note?: string } = {},
): CollectedChat {
  const meta = over.note !== undefined ? { note_prompt: over.note } : {};
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

describe("importChats (Option B mapping)", () => {
  test("maps ST → BulkImportChatInput and delegates to the injected op", async () => {
    const h = makeProfileHarness(OWNER);
    const character = castId<CharacterId>("character_aria");
    // Attribute the user's "Nate" turns to a persona the map already knows.
    const personaNate = castId<PersonaId>("persona_nate");
    h.profile.personaByUserName.set("nate", personaNate);
    const svc = createImportChats(h.ctx);

    const result = await svc({
      characterId: character,
      chats: [chatFile("Aria - 2025-07-18@12h00m00s.jsonl", { note: "stay in character" })],
    });

    expect(h.chatCalls).toHaveLength(1);
    const call = h.chatCalls[0];
    expect(call?.ownerId).toBe(OWNER);
    expect(call?.characterId).toBe(character);
    const chat = call?.chats[0];
    expect(chat?.title).toBe("Aria - 2025-07-18@12h00m00s");
    expect(chat?.isRealConversation).toBe(true);
    // esoterica 2 — updatedAt is the MAX message send_date, not the import clock.
    expect(chat?.updatedAt).toBe(Date.UTC(2025, 6, 18, 12, 0, 2));
    // SUPERSET round-trip — the ST note_prompt reaches the canonical author's-note field.
    expect(chat?.authorsNote).toBe("stay in character");
    // Persona attribution — the anchor + the user turn credit "Nate"'s persona; the assistant turn is null.
    expect(chat?.anchorPersonaId).toBe(personaNate);
    expect(chat?.messages).toHaveLength(2);
    expect(chat?.messages[0]?.role).toBe("assistant");
    expect(chat?.messages[0]?.personaId).toBeNull();
    expect(chat?.messages[1]?.role).toBe("user");
    expect(chat?.messages[1]?.personaId).toBe(personaNate);
    // Every message resolves a selected variant carrying the rendered `mes`.
    expect(chat?.messages[0]?.variants[chat.messages[0].selectedIdx]?.content).toBe(
      "Hello traveller.",
    );

    // PD-78 gate — a real_conversation chat enqueues exactly ONE backfill.
    expect(result.backfillEnqueued).toBe(true);
    expect(h.backfills).toEqual([{ ownerId: OWNER }]);
    expect(result.messagesImported).toBe(2);
  });

  test("no real_conversation → no backfill enqueue (the PD-78 gate stays closed)", async () => {
    const h = makeProfileHarness(OWNER);
    const svc = createImportChats(h.ctx);
    // A greeting-only chat (no user turn) — the parser buckets it non-real.
    const header = JSON.stringify({ user_name: "Nate", character_name: "Aria" });
    const line = JSON.stringify({ is_user: false, mes: "Hello." });
    const parsed = parseChatJsonl(`${header}\n${line}`, {
      fileName: "g.jsonl",
      charDirName: "Aria",
    });
    if (parsed === null) {
      throw new Error("fixture parse failed");
    }
    const result = await svc({
      characterId: castId<CharacterId>("character_aria"),
      chats: [{ parsed, importedFrom: "g.jsonl", importHash: "hash-g" }],
    });

    expect(h.chatCalls[0]?.chats[0]?.isRealConversation).toBe(false);
    expect(result.backfillEnqueued).toBe(false);
    expect(h.backfills).toEqual([]);
  });
});
