import { tape } from "@orb/testkit/node/chat/tape.ts";
import { freshCountedDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { scenario } from "../_scenario.ts";
import { seedMessage } from "../_support.ts";

describe("interactive read bounds", () => {
  test("an established-room commit does not reload the full selected transcript to decide first-turn status", async () => {
    const { db, queries } = await freshCountedDb();
    const chat = await scenario.chat(tape(), { db });
    const body = "x".repeat(2048);
    const reasoning = "y".repeat(2048);
    for (let seq = 1; seq <= 120; seq += 1) {
      const row = seq % 2 === 0 ? { role: "user" as const, authorUserId: chat.host, content: body } : { role: "assistant" as const, content: body, reasoning };
      await seedMessage(db, chat.chatId, seq, row);
    }
    queries.reset();

    const committed = await chat.turn.commitMessage({ principal: await chat.principal(), chatId: chat.chatId, content: "next" });

    const fullTranscriptReads = queries
      .statements()
      .filter((statement) => statement.includes('"message_variants"."content"') && statement.includes('"message_variants"."reasoning"'));
    expect(committed.messages[0]?.role).toBe("user");
    expect(fullTranscriptReads).toHaveLength(1);
  });
});
