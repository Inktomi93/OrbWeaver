// verb: loadCardText — the embeddings indexer's UN-PRINCIPAL card-text re-reader (D20: no owner gate). Load-
// bearing: it reads canon by id ALONE (returns a card NOT owned by any "caller" — there is no principal), it
// returns the SAME card-text projection the indexer embeds (substrate/embed-text), a missing id is null (not a
// throw — the source was deleted between emit and handler), and a synthetic group bucket is null (never
// embedded).

import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createCharacterService } from "@orb/server/domain/character";
import { describe, expect, test } from "vitest";
import { buildCardEmbedText } from "../../../../../packages/server/src/domain/character/substrate/embed-text.ts";
import { freshDb } from "../../../../support/db.ts";
import { makeHarness, principal, seedRawCharacter, seedUser } from "../_support.ts";

describe("loadCardText", () => {
  test("un-principal by-id read: returns the card-text projection (no owner scope)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const created = await svc.create({
      principal: principal(owner),
      input: {
        handle: "bryn",
        name: "Bryn",
        description: "a lighthouse keeper",
        personality: "stoic",
      },
    });

    // No principal is passed — the indexer re-reads by id alone (D20).
    const text = await svc.loadCardText(created.id);

    expect(text).not.toBeNull();
    expect(text).toContain("Name: Bryn");
    expect(text).toContain("Description: a lighthouse keeper");
    expect(text).toContain("Personality: stoic");
    // It is exactly the projection the indexer embeds (one home — no second builder).
    expect(text).toBe(
      buildCardEmbedText({
        name: "Bryn",
        description: "a lighthouse keeper",
        personality: "stoic",
        scenario: null,
        greetings: [],
      }),
    );
  });

  test("a missing id is null (deleted between emit and handler) — never throws", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    await seedUser(db, { handle: "owner" });
    expect(await svc.loadCardText(castId<CharacterId>("character_ghost"))).toBeNull();
  });

  test("a synthetic group bucket is null (never embedded)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const syntheticId = await seedRawCharacter(db, {
      id: "character_group",
      ownerId: owner,
      handle: "__group__chat1",
      name: "Group Bucket",
      synthetic: true,
    });
    expect(await svc.loadCardText(syntheticId)).toBeNull();
  });
});
