// persistence/reveal — the HOST-REVEAL body read (parity-plus §3.6). .int: real libSQL, real FK enforcement
// over messages/message_variants. Pins the query owns: the chat's assistant transcript on the SELECTED-VARIANT
// lineage, chronological, prompt-hidden slots excluded, chat-scoped (a foreign chat never joins). The read
// returns raw bodies; the PURE `buildRevealView` (substrate/reveal, its own unit test) tokenizes them — here we
// drive that fold through the real read to cover the coordinator-named `<lie>`/`<ofilter>` extraction +
// standing-lie grouping END-TO-END against the real transcript.

import type { Db } from "@orb/db";
import { messages } from "@orb/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { listSelectedAssistantBodies } from "../../../../../packages/server/src/domain/rpg/persistence/reveal.ts";
import { buildRevealView } from "../../../../../packages/server/src/domain/rpg/substrate/reveal.ts";
import { freshDb } from "../../../../support/db.ts";
import { addVariant, expect, seedChat, seedMessage, test } from "../_support.ts";

const LIE = (character: string, truth: string): string => `<lie character="${character}" type="motive" truth="${truth}" reason="greed" />`;
const OFILTER = '<ofilter event="a spy watches from the roof" reason="the player is indoors" />';

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("listSelectedAssistantBodies — the host-reveal transcript read", () => {
  test("returns the selected-variant assistant bodies chronologically (seq asc)", async () => {
    const chatId = await seedChat(db, "reveal");
    await seedMessage(db, chatId, 1, { role: "assistant", content: `Mari smiles. ${LIE("Mari", "she wants the crown")}` });
    await seedMessage(db, chatId, 2, { role: "assistant", content: `The room is quiet. ${OFILTER}` });
    const rows = await listSelectedAssistantBodies(db, chatId);
    expect(rows.map((r) => r.seq)).toEqual([1, 2]);
    expect(rows[0]?.content).toContain("<lie");
    expect(rows[1]?.content).toContain("<ofilter");
  });

  test("USER and prompt-HIDDEN assistant rows are excluded (not the visible transcript)", async () => {
    const chatId = await seedChat(db, "excl");
    await seedMessage(db, chatId, 1, { role: "user", content: `a user line ${LIE("Nobody", "irrelevant")}` });
    await seedMessage(db, chatId, 2, { role: "assistant", content: `visible ${LIE("Mari", "the truth")}` });
    await seedMessage(db, chatId, 3, { role: "assistant", excludedFromPrompt: true, content: `hidden slot ${LIE("Zandik", "excluded")}` });
    const rows = await listSelectedAssistantBodies(db, chatId);
    expect(rows.map((r) => r.seq)).toEqual([2]);
    expect(rows[0]?.content).toContain("the truth");
  });

  test("the read follows the SELECTED variant — a swipe changes the revealed body (lineage-consistent)", async () => {
    const chatId = await seedChat(db, "swipe");
    const { messageId } = await seedMessage(db, chatId, 1, { role: "assistant", content: `variant 0 ${LIE("Mari", "lie A")}` });
    const variantB = await addVariant(db, messageId, 1, `variant 1 ${LIE("Mari", "lie B")}`);
    // Selected = variant 0 → reveals lie A.
    expect((await listSelectedAssistantBodies(db, chatId))[0]?.content).toContain("lie A");
    // Swipe to variant 1 → the read follows the selected pointer, reveals lie B.
    await db.update(messages).set({ selectedVariantId: variantB }).where(eq(messages.id, messageId));
    expect((await listSelectedAssistantBodies(db, chatId))[0]?.content).toContain("lie B");
  });

  test("is CHAT-SCOPED — a foreign chat's rows never join (the cross-tenant belt)", async () => {
    const mine = await seedChat(db, "mine");
    const other = await seedChat(db, "other");
    await seedMessage(db, mine, 1, { role: "assistant", content: `mine ${LIE("Mari", "my secret")}` });
    await seedMessage(db, other, 1, { role: "assistant", content: `other ${LIE("Zandik", "other secret")}` });
    const rows = await listSelectedAssistantBodies(db, mine);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain("other secret");
  });

  test("END-TO-END through buildRevealView: the real transcript yields the parsed spans + standing-lie grouping (most-recent-wins per truth)", async () => {
    const chatId = await seedChat(db, "e2e");
    // Mari lies about the same truth in two beats (later wins the anchor) + a second distinct lie; an ofilter is
    // NOT a standing lie; a plain beat contributes nothing.
    await seedMessage(db, chatId, 1, { role: "assistant", content: LIE("Mari", "she wants the crown") });
    await seedMessage(db, chatId, 2, { role: "assistant", content: "nothing hidden here" });
    await seedMessage(db, chatId, 3, { role: "assistant", content: `${OFILTER} ${LIE("Mari", "she wants the crown")} ${LIE("Mari", "she is a spy")}` });

    const view = buildRevealView(await listSelectedAssistantBodies(db, chatId));
    // Only the two lie-bearing beats appear as reveal messages (seq 2 has no hidden spans).
    expect(view.messages).toHaveLength(2);
    const mari = view.standingLies.find((g) => g.character === "Mari");
    expect(mari?.lies).toHaveLength(2); // two distinct truths, deduped
    // most-recent-wins: the "crown" lie's anchor is the LATER beat (seq 3's message), not seq 1's.
    const crown = mari?.lies.find((l) => l.truth === "she wants the crown");
    expect(crown?.messageId).toBe(`message_${chatId}_3`);
  });
});
