// @subject packages/server/src/domain/roster-preset/persistence/queries.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { createRosterPresetSchema } from "@orb/contracts/roster-preset";
import { rosterPresets } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import type { ServerTestHarness } from "@orb/testkit/node/server.ts";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

async function saved(harness: ServerTestHarness): Promise<{
  readonly owner: Awaited<ReturnType<ServerTestHarness["principalFor"]>>;
  readonly roster: Awaited<ReturnType<ServerTestHarness["services"]["rosterPreset"]["create"]>>;
}> {
  const owner = await harness.principalFor((await harness.actor()).id);
  const card = await harness.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ name: "Roster actor", handle: "roster-actor", description: "Authored card." }),
  });
  const roster = await harness.services.rosterPreset.create({
    principal: owner,
    input: createRosterPresetSchema.parse({
      name: "Game roster",
      game: { ruleset: "d20" },
      members: [{ kind: "character", characterId: card.id, position: 0 }],
    }),
  });
  return { owner, roster };
}

test("owned malformed game templates never masquerade as typed detail or picker values", async ({ harness }) => {
  const { owner, roster } = await saved(harness);
  await harness.db
    .update(rosterPresets)
    .set({ gameTemplate: sql`${"false"}` })
    .where(eq(rosterPresets.id, roster.id));
  await expect(harness.services.rosterPreset.get({ principal: owner, presetId: roster.id })).rejects.toBeInstanceOf(z.ZodError);
  await expect(harness.services.rosterPreset.list({ principal: owner })).rejects.toBeInstanceOf(z.ZodError);
});

test("a foreign unreadable template is refused before decoding and omitted from the other owner's picker", async ({ harness }) => {
  const { roster } = await saved(harness);
  const other = await harness.principalFor((await harness.actor()).id);
  await harness.db
    .update(rosterPresets)
    .set({ gameTemplate: sql`${"{"}` })
    .where(eq(rosterPresets.id, roster.id));
  await expect(harness.services.rosterPreset.get({ principal: other, presetId: roster.id })).rejects.toBeInstanceOf(DomainNotFoundError);
  expect(await harness.services.rosterPreset.list({ principal: other })).toEqual([]);
});

test("a genuine authored game template survives both maintained roster projections", async ({ harness }) => {
  const { owner, roster } = await saved(harness);
  expect((await harness.services.rosterPreset.get({ principal: owner, presetId: roster.id })).game).toEqual(roster.game);
  expect((await harness.services.rosterPreset.list({ principal: owner }))[0]?.game).toEqual({ ruleset: "d20" });
});
