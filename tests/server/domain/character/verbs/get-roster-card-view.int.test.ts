import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { CharacterNotFoundError, createCharacterService } from "@orb/server/domain/character";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedRawCharacter, seedUser } from "../_support.ts";

describe("getRosterCardView", () => {
  test("returns full view for owner even when visibility is limited", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const svc = createCharacterService(harness.ctx);
    const ownerId = await seedUser(db);
    const charId = await seedRawCharacter(db, { ownerId });
    const p = principal(ownerId);

    harness.setChatMemberCardVisibility("name-avatar");

    const view = await svc.getRosterCardView({
      principal: p,
      chatId: castId<ChatId>("c1"),
      characterId: charId,
    });

    expect(view.id).toBe(charId);
    expect(view.systemPrompt).toBeDefined(); // Owner gets full view
  });

  test("returns clamped view for non-owner member", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const svc = createCharacterService(harness.ctx);
    const ownerId = await seedUser(db, { handle: "owner" });
    const memberId = await seedUser(db, { handle: "member" });
    const charId = await seedRawCharacter(db, { ownerId });
    const p = principal(memberId);

    // Visibility: sheet (name, description, etc, but no creatorNotes or systemPrompt)
    harness.setChatMemberCardVisibility("sheet");

    const view = await svc.getRosterCardView({
      principal: p,
      chatId: castId<ChatId>("c1"),
      characterId: charId,
    });

    expect(view.id).toBe(charId);
    expect(view.description).toBeDefined();
    expect(view.creatorNotes).toBeUndefined(); // Filtered out by 'sheet' level
    expect(view.systemPrompt).toBeUndefined(); // Filtered out by 'sheet' level
  });

  test("throws when character not found", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const svc = createCharacterService(harness.ctx);
    const memberId = await seedUser(db);
    const p = principal(memberId);

    await expect(
      svc.getRosterCardView({
        principal: p,
        chatId: castId<ChatId>("c1"),
        characterId: castId("no"),
      }),
    ).rejects.toThrow(CharacterNotFoundError);
  });
});
