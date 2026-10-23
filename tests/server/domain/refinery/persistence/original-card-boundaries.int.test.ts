// @subject packages/server/src/domain/refinery/persistence/queries.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { refinerySessions } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

async function session(harness: ServerTestHarness): Promise<{
  readonly owner: Awaited<ReturnType<ServerTestHarness["principalFor"]>>;
  readonly captured: Awaited<ReturnType<ServerTestHarness["services"]["refinery"]["startSession"]>>;
}> {
  const owner = await harness.principalFor((await harness.actor()).id);
  const card = await harness.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ name: "Session source", handle: "session-source", description: "A pinned original." }),
  });
  const captured = await harness.services.refinery.startSession({ principal: owner, characterId: card.id });
  return { owner, captured };
}

test("an owned original-card scalar is validated before the session view claims it is a character card", async ({ harness }) => {
  const { owner, captured } = await session(harness);
  await harness.db
    .update(refinerySessions)
    .set({ originalCard: sql`${JSON.stringify({ ...captured.originalCard, name: false })}` })
    .where(eq(refinerySessions.id, captured.id));
  await expect(harness.services.refinery.getSession({ principal: owner, sessionId: captured.id })).rejects.toBeInstanceOf(z.ZodError);
});

test("a foreign malformed original card is refused before any private decode", async ({ harness }) => {
  const { captured } = await session(harness);
  const other = await harness.principalFor((await harness.actor()).id);
  await harness.db
    .update(refinerySessions)
    .set({ originalCard: sql`${"{"}` })
    .where(eq(refinerySessions.id, captured.id));
  await expect(harness.services.refinery.getSession({ principal: other, sessionId: captured.id })).rejects.toBeInstanceOf(DomainNotFoundError);
});

test("legacy structured projection heals one signal field without losing its valid sibling or rewriting history", async ({ harness }) => {
  const { owner, captured } = await session(harness);
  const bytes = JSON.stringify({ ...captured.originalCard, greetings: false, refinery: { score: 7, analysis: false } });
  await harness.db
    .update(refinerySessions)
    .set({ originalCard: sql`${bytes}` })
    .where(eq(refinerySessions.id, captured.id));
  expect((await harness.services.refinery.getSession({ principal: owner, sessionId: captured.id })).originalCard).toMatchObject({
    name: captured.originalCard.name,
    greetings: [],
    refinery: { score: 7, analysis: null },
  });
  expect(
    await harness.db
      .select({ raw: sql<string>`${refinerySessions.originalCard}` })
      .from(refinerySessions)
      .where(eq(refinerySessions.id, captured.id)),
  ).toEqual([{ raw: bytes }]);
});
