// @subject packages/server/src/domain/character/persistence/queries.ts
// @subject packages/server/src/domain/character/verbs/get-snapshot.ts
// @subject packages/server/src/domain/character/verbs/restore.ts
import "@orb/testkit/node/composed-real.ts";
import { createCharacterSchema } from "@orb/contracts/character";
import { auditLogs, characterSnapshots, characters } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import type { ServerTestHarness } from "@orb/testkit/node/server.ts";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

async function captured(harness: ServerTestHarness): Promise<{
  readonly owner: Awaited<ReturnType<ServerTestHarness["principalFor"]>>;
  readonly card: Awaited<ReturnType<ServerTestHarness["services"]["character"]["create"]>>;
  readonly snapshot: Awaited<ReturnType<ServerTestHarness["services"]["character"]["snapshot"]>>;
}> {
  const owner = await harness.principalFor((await harness.actor()).id);
  const card = await harness.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ name: "History source", handle: "history-source", description: "Original prose." }),
  });
  const snapshot = await harness.services.character.snapshot({ principal: owner, characterId: card.id });
  return { owner, card, snapshot };
}

test("owned malformed scalar history refuses compare and restore before the live row, history or audit moves", async ({ harness }) => {
  const { owner, card, snapshot } = await captured(harness);
  const original = await harness.services.character.getSnapshot({ principal: owner, characterId: card.id, snapshotId: snapshot.id });
  await harness.db
    .update(characterSnapshots)
    .set({ content: sql`${JSON.stringify({ ...original.content, name: false })}` })
    .where(eq(characterSnapshots.id, snapshot.id));
  await expect(harness.services.character.getSnapshot({ principal: owner, characterId: card.id, snapshotId: snapshot.id })).rejects.toBeInstanceOf(z.ZodError);
  await expect(harness.services.character.restore({ principal: owner, characterId: card.id, snapshotId: snapshot.id })).rejects.toBeInstanceOf(z.ZodError);
  expect(await harness.db.select({ name: characters.name, description: characters.description }).from(characters).where(eq(characters.id, card.id))).toEqual([
    { name: card.name, description: card.description },
  ]);
  expect(await harness.services.character.listSnapshots({ principal: owner, characterId: card.id })).toHaveLength(1);
  expect(
    await harness.db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(and(eq(auditLogs.actorUserId, owner.userId), eq(auditLogs.action, "character.restore"))),
  ).toEqual([]);
});

test("another real owner never decodes malformed JSON from a foreign character's history", async ({ harness }) => {
  const { card, snapshot } = await captured(harness);
  const foreign = await harness.principalFor((await harness.actor()).id);
  await harness.db
    .update(characterSnapshots)
    .set({ content: sql`${"{"}` })
    .where(eq(characterSnapshots.id, snapshot.id));
  await expect(harness.services.character.getSnapshot({ principal: foreign, characterId: card.id, snapshotId: snapshot.id })).rejects.toBeInstanceOf(
    DomainNotFoundError,
  );
  await expect(harness.services.character.restore({ principal: foreign, characterId: card.id, snapshotId: snapshot.id })).rejects.toBeInstanceOf(
    DomainNotFoundError,
  );
  expect(await harness.db.select({ id: characterSnapshots.id }).from(characterSnapshots).where(eq(characterSnapshots.characterId, card.id))).toEqual([
    { id: snapshot.id },
  ]);
});

test("declared legacy structured-field heals remain observable without rewriting the opaque stored snapshot", async ({ harness }) => {
  const { owner, card, snapshot } = await captured(harness);
  const original = await harness.services.character.getSnapshot({ principal: owner, characterId: card.id, snapshotId: snapshot.id });
  const bytes = JSON.stringify({
    ...original.content,
    greetings: false,
    depthPrompt: false,
    source: false,
    refinery: { score: 7, analysis: false },
    creationDate: undefined,
  });
  await harness.db
    .update(characterSnapshots)
    .set({ content: sql`${bytes}` })
    .where(eq(characterSnapshots.id, snapshot.id));
  const projected = await harness.services.character.getSnapshot({ principal: owner, characterId: card.id, snapshotId: snapshot.id });
  expect(projected.content).toMatchObject({
    name: card.name,
    greetings: [],
    depthPrompt: null,
    source: null,
    creationDate: null,
    refinery: { score: 7, analysis: null },
  });
  expect(
    await harness.db
      .select({ raw: sql<string>`${characterSnapshots.content}` })
      .from(characterSnapshots)
      .where(eq(characterSnapshots.id, snapshot.id)),
  ).toEqual([{ raw: bytes }]);
  const restored = await harness.services.character.restore({ principal: owner, characterId: card.id, snapshotId: snapshot.id });
  expect(restored).toMatchObject({ name: card.name, greetings: [], depthPrompt: null, source: null, refinery: { score: 7, analysis: null } });
  expect(await harness.services.character.listSnapshots({ principal: owner, characterId: card.id })).toHaveLength(2);
});

test("historical scalar text is typed rather than retroactively capped by today's write limits", async ({ harness }) => {
  const { owner, card, snapshot } = await captured(harness);
  const original = await harness.services.character.getSnapshot({ principal: owner, characterId: card.id, snapshotId: snapshot.id });
  const historicalName = "Historical name ".repeat(40);
  await harness.db
    .update(characterSnapshots)
    .set({ content: sql`${JSON.stringify({ ...original.content, name: historicalName })}` })
    .where(eq(characterSnapshots.id, snapshot.id));
  expect((await harness.services.character.getSnapshot({ principal: owner, characterId: card.id, snapshotId: snapshot.id })).content.name).toBe(historicalName);
});
