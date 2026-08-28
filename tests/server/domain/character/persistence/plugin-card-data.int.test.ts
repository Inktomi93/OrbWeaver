// persistence/plugin-card-data — the D148 per-card plugin-state read/merge. The three security walls this file
// proves by BREAKING them, red-first: OWNER-SCOPE (a foreign character writes nothing / reads not-found),
// SLUG-ISOLATION (plugin A touches only `plugin_A`; B's field stays byte-identical; A reads only A's), and
// METADATA-NOT-CONTENT (the merge never bumps `contentHash`). Internal files imported by RELATIVE path.

import { characters } from "@orb/db";
import type { CharacterHandle, CharacterId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { insertCharacter } from "../../../../../packages/server/src/domain/character/persistence/card.ts";
import { readPluginCardData, writePluginCardData } from "../../../../../packages/server/src/domain/character/persistence/plugin-card-data.ts";
import { bumpStatsCanonVersion } from "../../../../../packages/server/src/domain/stats/write/apply-delta.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedUser } from "../_support.ts";

const SLUG_A = "scraper-alpha";
const SLUG_B = "scraper-beta";

function makeRow(ownerId: UserId, id: string, handle: string, extensions?: Record<string, unknown>): typeof characters.$inferInsert {
  return {
    id: castId<CharacterId>(id),
    handle: castId<CharacterHandle>(handle),
    ownerId,
    name: "X",
    contentHash: "content-hash-original",
    createdAt: 1,
    ...(extensions !== undefined ? { extensions } : {}),
  };
}

async function extensionsOf(db: Awaited<ReturnType<typeof freshDb>>, id: CharacterId): Promise<Record<string, unknown> | null> {
  const rows = await db.select({ extensions: characters.extensions }).from(characters).where(eq(characters.id, id));
  return rows[0]?.extensions ?? null;
}

describe("persistence/plugin-card-data", () => {
  test("write + read round-trip this plugin's own blob under plugin_<slug> (portable residual-extensions key)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const id = castId<CharacterId>("character_1");
    await insertCharacter(db, makeRow(owner, "character_1", "a"), bumpStatsCanonVersion);

    const target = { characterId: id, ownerId: owner, slug: SLUG_A };
    expect(await writePluginCardData(db, target, { hp: 10, note: "ok" })).toBe(true);
    expect(await readPluginCardData(db, target)).toEqual({ found: true, data: { hp: 10, note: "ok" } });

    // The value lands under the RESERVED `plugin_<slug>` key inside the residual extensions bag — the exact home
    // D148's portability + inertness walls guarantee (import→store→export→re-import unchanged; the serde tier's
    // own test proves the passthrough — this proves the key we write is the key that home expects).
    expect(await extensionsOf(db, id)).toEqual({ "plugin_scraper-alpha": { hp: 10, note: "ok" } });
  });

  test("OWNER-SCOPE — a FOREIGN character writes nothing and reads not-found (leak-free; foreign ≡ absent)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const id = castId<CharacterId>("character_1");
    await insertCharacter(db, makeRow(owner, "character_1", "a", { "plugin_scraper-alpha": { secret: "owner's" } }), bumpStatsCanonVersion);

    // OTHER does not own the character: the write affects 0 rows (→ the caller raises the leak-free NOT_FOUND)…
    expect(await writePluginCardData(db, { characterId: id, ownerId: other, slug: SLUG_A }, { hax: true })).toBe(false);
    // …and left the owner's real value byte-identical (no cross-owner overwrite).
    expect(await extensionsOf(db, id)).toEqual({ "plugin_scraper-alpha": { secret: "owner's" } });
    // …and the read as OTHER is `found:false` — indistinguishable from an absent character (no existence oracle).
    expect(await readPluginCardData(db, { characterId: id, ownerId: other, slug: SLUG_A })).toEqual({ found: false });
    // A genuinely absent id is ALSO `found:false` — the same leak-free collapse.
    expect(await readPluginCardData(db, { characterId: castId<CharacterId>("character_absent"), ownerId: owner, slug: SLUG_A })).toEqual({ found: false });
  });

  test("SLUG-ISOLATION — plugin A's write touches ONLY plugin_A; plugin B's field stays byte-identical", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const id = castId<CharacterId>("character_1");
    // Two sibling plugin keys + a NON-plugin residual vendor key already on the card.
    await insertCharacter(
      db,
      makeRow(owner, "character_1", "a", { "plugin_scraper-alpha": { a: 1 }, "plugin_scraper-beta": { b: 2 }, vendorKeep: { depth: 3 } }),
      bumpStatsCanonVersion,
    );

    // A writes its own key — a whole-blob replace of plugin_A only.
    expect(await writePluginCardData(db, { characterId: id, ownerId: owner, slug: SLUG_A }, { a: 999, extra: "x" })).toBe(true);

    const ext = await extensionsOf(db, id);
    // plugin_B is BYTE-IDENTICAL (A can neither read nor overwrite it — it can never spell B's slug), and the
    // non-plugin residual `vendorKeep` key is untouched (the merge targets exactly one JSON path).
    expect(ext).toEqual({ "plugin_scraper-alpha": { a: 999, extra: "x" }, "plugin_scraper-beta": { b: 2 }, vendorKeep: { depth: 3 } });

    // A's read returns ONLY A's blob; B's read returns ONLY B's — neither plugin sees the other's field.
    expect(await readPluginCardData(db, { characterId: id, ownerId: owner, slug: SLUG_A })).toEqual({ found: true, data: { a: 999, extra: "x" } });
    expect(await readPluginCardData(db, { characterId: id, ownerId: owner, slug: SLUG_B })).toEqual({ found: true, data: { b: 2 } });
  });

  test("METADATA-NOT-CONTENT — a card-state write does NOT bump contentHash (no re-embed; D148 clause d)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const id = castId<CharacterId>("character_1");
    await insertCharacter(db, makeRow(owner, "character_1", "a"), bumpStatsCanonVersion);

    await writePluginCardData(db, { characterId: id, ownerId: owner, slug: SLUG_A }, { anything: "here" });

    const rows = await db.select({ contentHash: characters.contentHash }).from(characters).where(eq(characters.id, id));
    // The write is metadata, not card content: `contentHash` is UNCHANGED, so the indexer's content-hash oracle
    // sees no change and never re-embeds the character (the file holds no bus/emit op at all — structural).
    expect(rows[0]?.contentHash).toBe("content-hash-original");
  });

  test("an OWNED character with no state for this plugin reads null (found, but empty) — distinct from not-found", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const id = castId<CharacterId>("character_1");
    // A NULL extensions column (the common case for an app-authored card) — the write must coalesce it, and a
    // read before any write is `found:true, data:null`.
    await insertCharacter(db, makeRow(owner, "character_1", "a"), bumpStatsCanonVersion);

    expect(await readPluginCardData(db, { characterId: id, ownerId: owner, slug: SLUG_A })).toEqual({ found: true, data: null });
    // …and a first write coalesces NULL → {} and lands the key.
    expect(await writePluginCardData(db, { characterId: id, ownerId: owner, slug: SLUG_A }, { first: true })).toBe(true);
    expect(await readPluginCardData(db, { characterId: id, ownerId: owner, slug: SLUG_A })).toEqual({ found: true, data: { first: true } });
  });

  test("a NON-object stored under plugin_<slug> (only reachable via a hostile import) reads back as null, never off-contract", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const id = castId<CharacterId>("character_1");
    // A plugin's own setCardData always stores an object; a hostile IMPORTED card could set the key to a scalar.
    // The read reports it as null rather than handing the plugin a non-Record where the contract promises one.
    await insertCharacter(db, makeRow(owner, "character_1", "a", { "plugin_scraper-alpha": "not-an-object" }), bumpStatsCanonVersion);
    expect(await readPluginCardData(db, { characterId: id, ownerId: owner, slug: SLUG_A })).toEqual({ found: true, data: null });
  });
});
