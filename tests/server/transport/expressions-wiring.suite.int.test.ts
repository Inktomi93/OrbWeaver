// E2 compose-wiring proof for domain/expressions — the leaf is unit-tested with fake character gates; this
// exercises the WHOLE graph through the real tRPC router + the composition-root `ExpressionsContext` (the
// two REAL character gates built at compose): an owner CRUD roundtrip, and the 01 §6 membership exception —
// a present member of a chat rostering a character sees that character's sprite set, a non-member does not
// (the `assertCharacterVisible` member arm, wired at compose). The cross-tenant sweep proves the owner-gate
// leak-free collapse; this proves the POSITIVE paths the sweep can't (owner sees, member sees).

import { assets, characterSprites } from "@orb/db";
import type { AssetId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { expect, OTHER_USER_ID, OWNER_USER_ID, test } from "../../support/fixtures";
import { seedChat, seedParticipant } from "../domain/chat/_support";

/** Insert a `sprite` asset owned by `ownerId` with a WIRE-VALID minted id (the `set` schema is strict
 *  `typeIdSchema`). No CAS bytes needed for the binding-visibility paths. */
async function seedSpriteAsset(db: Parameters<typeof seedChat>[0], ownerId: string, hash: string): Promise<AssetId> {
  const assetId = mintTypeId(ID_PREFIX.asset);
  await db.insert(assets).values({ id: assetId, ownerId: castId(ownerId), kind: "sprite", mime: "image/png", size: 1, hash });
  return assetId;
}

describe("expressions wiring — the E2 compose graft (router + character gates)", () => {
  test("an owner sets, lists, and removes a sprite through the router", async ({ db, ownerCaller }) => {
    const character = await ownerCaller.character.create({ input: { handle: "muse", name: "Muse", description: "d" } });
    const assetId = await seedSpriteAsset(db, OWNER_USER_ID, "wire-joy-hash");

    const set = await ownerCaller.expressions.set({ characterId: character.id, label: "Joy", assetId });
    expect(set).toEqual({ characterId: character.id, label: "joy", asset: { kind: "asset", id: assetId }, hash: "wire-joy-hash" }); // label normalized; hash resolved

    const listed = await ownerCaller.expressions.list({ characterId: character.id });
    expect(listed).toEqual([{ characterId: character.id, label: "joy", asset: { kind: "asset", id: assetId }, hash: "wire-joy-hash" }]);

    await ownerCaller.expressions.remove({ characterId: character.id, label: "joy" });
    expect(await ownerCaller.expressions.list({ characterId: character.id })).toEqual([]);
  }, 20_000); // the first test in the file pays the one-time app-graph cold-start (~5s, like the sweep suite)

  test("a chat member sees a roster character's sprites; a non-member sees an empty list (01 §6)", async ({ db, ownerCaller, otherCaller }) => {
    const character = await ownerCaller.character.create({ input: { handle: "star", name: "Star", description: "d" } });
    const assetId = await seedSpriteAsset(db, OWNER_USER_ID, "wire-calm-hash");
    await ownerCaller.expressions.set({ characterId: character.id, label: "calm", assetId });

    // No shared chat yet — the stranger's visibility gate denies → an empty list (never a foreign leak / 404).
    expect(await otherCaller.expressions.list({ characterId: character.id })).toEqual([]);

    // Seed a chat hosting the owner + the other user as a present member, rostering the owner's character.
    const chatId = await seedChat(db, "expr", { title: "Expr Room" });
    await seedParticipant(db, { chatId, key: "expr_host", userId: OWNER_USER_ID, role: "host" });
    await seedParticipant(db, { chatId, key: "expr_member", userId: OTHER_USER_ID, role: "member" });
    await seedParticipant(db, { chatId, key: "expr_char", characterId: character.id, role: "member" });

    // Now the member sees the roster character's public sprite set (the membership exception) — WITH the
    // resolved CAS hash (the stage renders blobUrl(hash) straight off this view; the P0 was that the stage
    // resolved sprite hashes through resolveChatBlobRefs, which only covers message_assets and returned []).
    expect(await otherCaller.expressions.list({ characterId: character.id })).toEqual([
      { characterId: character.id, label: "calm", asset: { kind: "asset", id: assetId }, hash: "wire-calm-hash" },
    ]);
  });

  test("a LEFT roster character stops resolving for the member (leftSeq discipline, 01 §6)", async ({ db, ownerCaller, otherCaller }) => {
    const character = await ownerCaller.character.create({ input: { handle: "ghost", name: "Ghost", description: "d" } });
    const assetId = await seedSpriteAsset(db, OWNER_USER_ID, "wire-ghost-hash");
    await ownerCaller.expressions.set({ characterId: character.id, label: "wistful", assetId });

    // A chat where the OTHER user is a present member, but the owner's character has LEFT the roster
    // (leftSeq set). The visibility gate requires the roster-character seat be present (isNull(leftSeq)) —
    // a left character is no longer a chat-visible face, so the member's list collapses to empty (leak-free).
    const chatId = await seedChat(db, "ghost", { title: "Ghost Room" });
    await seedParticipant(db, { chatId, key: "ghost_host", userId: OWNER_USER_ID, role: "host" });
    await seedParticipant(db, { chatId, key: "ghost_member", userId: OTHER_USER_ID, role: "member" });
    await seedParticipant(db, { chatId, key: "ghost_char", characterId: character.id, role: "member", leftSeq: 5 });

    expect(await otherCaller.expressions.list({ characterId: character.id })).toEqual([]);
    // The OWNER still sees its own character's sprites regardless of any roster state.
    expect(await ownerCaller.expressions.list({ characterId: character.id })).toEqual([
      { characterId: character.id, label: "wistful", asset: { kind: "asset", id: assetId }, hash: "wire-ghost-hash" },
    ]);
  });

  test("character.remove reaps the freed sprite assets (the compose reap fold-in)", async ({ db, ownerCaller }) => {
    const character = await ownerCaller.character.create({ input: { handle: "gone", name: "Gone", description: "d" } });
    const assetId = await seedSpriteAsset(db, OWNER_USER_ID, "wire-reap-hash");
    await ownerCaller.expressions.set({ characterId: character.id, label: "sad", assetId });

    await ownerCaller.character.remove({ characterId: character.id });

    // The binding rows are gone (cascade + explicit reap), and the now-orphan sprite asset was reaped.
    const remainingBindings = await db.select().from(characterSprites);
    expect(remainingBindings).toEqual([]);
    const remainingAsset = await db.select().from(assets).where(eq(assets.id, assetId));
    expect(remainingAsset).toEqual([]);
  });
});
