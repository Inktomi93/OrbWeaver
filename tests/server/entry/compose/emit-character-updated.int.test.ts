// entry/compose/emit-character-updated — the MULTI-HUMAN bridge (task #17): character.updated → a `chatUpdated`
// chat-bus event on every chat where that character is CURRENTLY seated. THE load-bearing property: the fan
// reaches ONLY chats where the character is a PRESENT character seat (`kind='character'`, `leftSeq IS NULL`) —
// so a co-member's open room refetches on another human's card edit — and NEVER a chat the character has LEFT
// (departed history carries its own D28 snapshot identity) nor a chat it was never in nor a chat holding a
// DIFFERENT character. Runs the REAL junction read over a seeded roster; the emit is a capturing spy (the
// durable-first bus is its own tested seam — this pins the enumeration + the emitted event shape).

import type { ChatBusEvent } from "@orb/contracts/chat";
import { createCharacterUpdatedChatFan } from "@orb/server/entry/compose";
import { describe } from "vitest";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures";
import { seedCharacter, seedChat, seedParticipant, seedUser } from "../../domain/chat/_support.ts";

describe("emit-character-updated — seated-chat fan + departed/non-seat isolation", () => {
  test("fans `chatUpdated` to every PRESENT-seat chat, never a departed / non-seat / other-character chat", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "cu_owner");
    const edited = await seedCharacter(db, owner, "edited");
    const other = await seedCharacter(db, owner, "other");

    // `edited` is a present seat in A + B; DEPARTED (leftSeq stamped) in C; never seated in D (where `other` sits).
    const chatA = await seedChat(db, "cu_a");
    const chatB = await seedChat(db, "cu_b");
    const chatC = await seedChat(db, "cu_c");
    const chatD = await seedChat(db, "cu_d");
    await seedParticipant(db, { chatId: chatA, key: "a_edited", characterId: edited });
    await seedParticipant(db, { chatId: chatB, key: "b_edited", characterId: edited });
    await seedParticipant(db, { chatId: chatC, key: "c_edited", characterId: edited, leftSeq: 7 });
    await seedParticipant(db, { chatId: chatD, key: "d_other", characterId: other });

    const captured: ChatBusEvent[] = [];
    const fan = createCharacterUpdatedChatFan(db, (event) => {
      captured.push(event);
      return Promise.resolve();
    });

    await fan(edited);

    // ONLY the present-seat chats (A + B), each as a `chatUpdated` carrying that chatId. Order-insensitive.
    expect(new Set(captured.map((e) => JSON.stringify(e)))).toEqual(
      new Set([JSON.stringify({ type: "chatUpdated", chatId: chatA }), JSON.stringify({ type: "chatUpdated", chatId: chatB })]),
    );
  });

  test("a character seated in NO present chat fans nothing", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "cu_none_owner");
    const lonely = await seedCharacter(db, owner, "lonely");

    const captured: ChatBusEvent[] = [];
    const fan = createCharacterUpdatedChatFan(db, (event) => {
      captured.push(event);
      return Promise.resolve();
    });

    await fan(lonely);

    expect(captured).toEqual([]);
  });
});
