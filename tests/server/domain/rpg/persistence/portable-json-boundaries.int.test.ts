// @subject packages/server/src/domain/rpg/persistence/portability-write.ts
// @subject packages/server/src/domain/export/verbs/export-chat-bundle.ts
// @subject packages/server/src/domain/export/verbs/export-chat.ts

import { chats, rpgGames, rpgSheets, rpgSnapshots } from "@orb/db";
import { parseChatBundleFile } from "@orb/server/primitives/serde/chat-bundle";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { handoffActors } from "../../chat/substrate/handoff.fixtures.ts";

async function scene(harness: ServerTestHarness): Promise<{
  readonly actors: Awaited<ReturnType<typeof handoffActors>>;
  readonly game: typeof rpgGames.$inferSelect;
  readonly snapshot: typeof rpgSnapshots.$inferSelect;
}> {
  const actors = await handoffActors(harness);
  await harness.services.rpg.createGame({ principal: actors.host, chatId: actors.chat.id, mode: "lite" });
  expect(await harness.services.rpg.editSnapshot({ principal: actors.host, chatId: actors.chat.id, patch: { location: "Owned scene" } })).toEqual({ ok: true });
  const games = await harness.db.select().from(rpgGames).where(eq(rpgGames.chatId, actors.chat.id));
  const game = games[0];
  if (game === undefined) {
    throw new Error("the actual game creation did not persist its game");
  }
  const snapshots = await harness.db.select().from(rpgSnapshots).where(eq(rpgSnapshots.gameId, game.id));
  const snapshot = snapshots[0];
  if (snapshot === undefined) {
    throw new Error("the actual hand edit did not persist its snapshot");
  }
  return { actors, game, snapshot };
}

for (const field of ["actorState", "trackerValues", "quests"] as const) {
  test(`the admitted host cannot export malformed stored ${field} as canonical campaign bytes`, async ({ harness }) => {
    const { actors, snapshot } = await scene(harness);
    if (field === "actorState") {
      await harness.db
        .update(rpgSnapshots)
        .set({ actorState: sql`${"false"}` })
        .where(eq(rpgSnapshots.id, snapshot.id));
    } else if (field === "trackerValues") {
      await harness.db
        .update(rpgSnapshots)
        .set({ trackerValues: sql`${"false"}` })
        .where(eq(rpgSnapshots.id, snapshot.id));
    } else {
      await harness.db
        .update(rpgSnapshots)
        .set({ quests: sql`${"false"}` })
        .where(eq(rpgSnapshots.id, snapshot.id));
    }
    await expect(harness.app.exportService.exportChatBundle({ principal: actors.host, chatId: actors.chat.id })).rejects.toBeInstanceOf(z.ZodError);
    expect(await harness.db.select({ id: rpgSnapshots.id }).from(rpgSnapshots).where(eq(rpgSnapshots.gameId, snapshot.gameId))).toEqual([{ id: snapshot.id }]);
  });
}

test("an admitted export validates the real stored actor sheet before writing bundle bytes", async ({ harness }) => {
  const { actors, game } = await scene(harness);
  const card = actors.cards[0];
  if (card === undefined) {
    throw new Error("the real room omitted its actor");
  }
  await harness.services.rpg.patchSheet({
    principal: actors.host,
    chatId: actors.chat.id,
    actorRef: { kind: "character", characterId: card.id },
    patch: { className: "Keeper" },
  });
  const rows = await harness.db.select().from(rpgSheets).where(eq(rpgSheets.gameId, game.id));
  const sheet = rows[0];
  if (sheet === undefined) {
    throw new Error("the actual sheet edit did not land");
  }
  await harness.db
    .update(rpgSheets)
    .set({ sheet: sql`${JSON.stringify({ ...sheet.sheet, className: false })}` })
    .where(eq(rpgSheets.id, sheet.id));
  await expect(harness.app.exportService.exportChatBundle({ principal: actors.host, chatId: actors.chat.id })).rejects.toBeInstanceOf(z.ZodError);
});

test("an admitted export refuses a malformed stored game configuration", async ({ harness }) => {
  const { actors, game } = await scene(harness);
  await harness.db
    .update(rpgGames)
    .set({ config: sql`${JSON.stringify({ ...game.config, trackers: false })}` })
    .where(eq(rpgGames.id, game.id));
  await expect(harness.app.exportService.exportChatBundle({ principal: actors.host, chatId: actors.chat.id })).rejects.toBeInstanceOf(z.ZodError);
});

test("legal historical NULL snapshot planes export through the actual canonical bundle reader", async ({ harness }) => {
  const { actors, snapshot } = await scene(harness);
  await harness.db
    .update(rpgSnapshots)
    .set({ presentCharacters: null, recentEvents: null, actorState: null, trackerValues: null, quests: null })
    .where(eq(rpgSnapshots.id, snapshot.id));
  const exported = await harness.app.exportService.exportChatBundle({ principal: actors.host, chatId: actors.chat.id });
  if (exported === null) {
    throw new Error("the real host export refused its valid owned campaign");
  }
  const parsed = parseChatBundleFile(exported.bytes);
  if (!parsed.ok) {
    throw new Error(`the canonical bundle reader refused the real export: ${parsed.reason}`);
  }
  expect(parsed.value.rpg?.snapshots[0]?.state).toMatchObject({
    location: "Owned scene",
    presentCharacters: [],
    recentEvents: [],
    actorState: [],
    trackerValues: {},
    quests: [],
  });
});

test("both transcript export doors refuse a foreign malformed room before private JSON decoding", async ({ harness }) => {
  const { actors } = await scene(harness);
  await harness.db
    .update(chats)
    .set({ metadata: sql`${"{"}` })
    .where(eq(chats.id, actors.chat.id));
  const foreign = await harness.principalFor((await harness.actor({ role: "admin" })).id);
  await expect(harness.app.exportService.exportChatBundle({ principal: foreign, chatId: actors.chat.id })).resolves.toBeNull();
  await expect(harness.app.exportService.exportChat({ principal: foreign, chatId: actors.chat.id })).resolves.toBeNull();
  await expect(harness.app.exportService.exportChatBundle({ principal: actors.host, chatId: actors.chat.id })).rejects.toBeInstanceOf(SyntaxError);
});
