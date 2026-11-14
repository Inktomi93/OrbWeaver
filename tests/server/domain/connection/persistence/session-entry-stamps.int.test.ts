// @subject packages/server/src/domain/connection/persistence/session-entries.ts
// The session entry a subscription turn seeds is stamped with the injected clock at the turn.
import { sessionEntries } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { eq } from "drizzle-orm";
import { coreSdkRoom } from "../../chat/engine/core-sdk-fixture.ts";

const STEP_MS = 60_000;

test("a subscription turn's new session entry carries the clock at the turn", async () => {
  await using fixture = await coreSdkRoom({ text: "A seeded reply.", failed: false, cost: 0 });
  const { h } = fixture;
  h.root.clock.advance(STEP_MS);
  const at = h.root.clock.now();

  await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId });

  expect(await h.root.db.select({ createdAt: sessionEntries.createdAt }).from(sessionEntries).where(eq(sessionEntries.chatId, h.chatId))).toEqual([
    { createdAt: at },
  ]);
});
