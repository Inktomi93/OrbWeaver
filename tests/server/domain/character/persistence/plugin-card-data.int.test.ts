// Storage is the subject: a plugin's per-card state lives under its reserved `plugin_<slug>` key in the card's residual
// extensions. The write and read are owner-scoped (a foreign card is indistinguishable from an absent one), each slug
// touches only its own key, and a state write is metadata that never changes the card's content hash.
// @subject packages/server/src/domain/character/persistence/plugin-card-data.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { pluginCardStateKey } from "@orb/contracts/plugin";
import { characters } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import type { CharacterId } from "@orb/kit/ids";
import { mintTypeId } from "@orb/kit/ids";
import { readPluginCardData, writePluginCardData } from "@orb/server/domain/character";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";

const ALPHA = "scraper-alpha";
const BETA = "scraper-beta";

async function card(
  harness: ServerTestHarness,
  extensions?: Record<string, unknown>,
): Promise<{ readonly owner: Awaited<ReturnType<ServerTestHarness["principalFor"]>>; readonly id: CharacterId }> {
  const owner = await harness.principalFor((await harness.actor()).id);
  const view = await harness.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ handle: "card-state", name: "Card", description: "", ...(extensions === undefined ? {} : { extensions }) }),
  });
  return { owner, id: view.id };
}

async function stored(
  harness: ServerTestHarness,
  id: CharacterId,
): Promise<{ readonly extensions: Record<string, unknown> | null; readonly contentHash: string }> {
  const [row] = await harness.db
    .select({ extensions: characters.extensions, contentHash: characters.contentHash })
    .from(characters)
    .where(eq(characters.id, id));
  if (row === undefined) {
    throw new Error("the created card left no row");
  }
  return row;
}

test("a plugin's blob round-trips under its reserved plugin key and never changes the card content hash", async ({ harness }) => {
  const { owner, id } = await card(harness);
  const handle = databaseHandle(harness.db);
  const target = { characterId: id, ownerId: owner.userId, slug: ALPHA };
  const born = await stored(harness, id);

  // An owned card with no state for this plugin reads as found-but-empty, which is not the not-found answer.
  expect(await readPluginCardData(handle, target)).toEqual({ found: true, data: null });
  expect(await writePluginCardData(handle, target, { hp: 10, note: "ok" })).toBe(true);
  expect(await readPluginCardData(handle, target)).toEqual({ found: true, data: { hp: 10, note: "ok" } });

  const after = await stored(harness, id);
  expect(after.extensions).toEqual({ [pluginCardStateKey(ALPHA)]: { hp: 10, note: "ok" } });
  expect(after.contentHash).toBe(born.contentHash);
});

test("a foreign card writes nothing and reads exactly like an absent one", async ({ harness }) => {
  const { owner, id } = await card(harness, { [pluginCardStateKey(ALPHA)]: { secret: "owner's" } });
  const stranger = await harness.principalFor((await harness.actor()).id);
  const handle = databaseHandle(harness.db);

  expect(await writePluginCardData(handle, { characterId: id, ownerId: stranger.userId, slug: ALPHA }, { hax: true })).toBe(false);
  expect(await readPluginCardData(handle, { characterId: id, ownerId: stranger.userId, slug: ALPHA })).toEqual({ found: false });
  expect(await readPluginCardData(handle, { characterId: mintTypeId("character"), ownerId: owner.userId, slug: ALPHA })).toEqual({ found: false });
  expect((await stored(harness, id)).extensions).toEqual({ [pluginCardStateKey(ALPHA)]: { secret: "owner's" } });

  // Control: the owner reads the same card, so the refusals above were the owner scope and not a missing row.
  expect(await readPluginCardData(handle, { characterId: id, ownerId: owner.userId, slug: ALPHA })).toEqual({ found: true, data: { secret: "owner's" } });
});

test("one plugin's write replaces only its own key and leaves a sibling plugin and vendor keys byte-identical", async ({ harness }) => {
  const seeded = {
    [pluginCardStateKey(ALPHA)]: { a: 1 },
    [pluginCardStateKey(BETA)]: { b: 2 },
    vendorKeep: { depth: 3 },
  };
  const { owner, id } = await card(harness, seeded);
  const handle = databaseHandle(harness.db);

  expect(await writePluginCardData(handle, { characterId: id, ownerId: owner.userId, slug: ALPHA }, { a: 999, extra: "x" })).toBe(true);

  expect((await stored(harness, id)).extensions).toEqual({ ...seeded, [pluginCardStateKey(ALPHA)]: { a: 999, extra: "x" } });
  expect(await readPluginCardData(handle, { characterId: id, ownerId: owner.userId, slug: ALPHA })).toEqual({ found: true, data: { a: 999, extra: "x" } });
  expect(await readPluginCardData(handle, { characterId: id, ownerId: owner.userId, slug: BETA })).toEqual({ found: true, data: { b: 2 } });
});

test("a non-object stored under a plugin key reads as empty state, never off-contract", async ({ harness }) => {
  const { owner, id } = await card(harness, { [pluginCardStateKey(ALPHA)]: "not-an-object" });
  expect(await readPluginCardData(databaseHandle(harness.db), { characterId: id, ownerId: owner.userId, slug: ALPHA })).toEqual({ found: true, data: null });
});
