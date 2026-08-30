// substrate/fact-scope — "does this user OWN the row a chat-less fact names?" (the plugin fan-out gate AND
// the owner-global rule gate share this ONE answer). Pins: a chat-scoped fact is fail-closed (never this
// module's business), a genuine owner passes, a stranger and a forged/absent id both fail-closed to false.

import type { CharacterId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { ownsFactSubject } from "../../../../../packages/server/src/domain/automation/substrate/fact-scope.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedAsset, seedCharacter } from "../../chat/_support.ts";
import { ruleFixture, seedUser } from "../_support.ts";

describe("ownsFactSubject", () => {
  test("a CHAT-scoped fact (chatId not null) is fail-closed — this module never answers for it", async () => {
    const fixture = await ruleFixture();
    const fact = {
      bus: "chat" as const,
      type: "character.updated" as never,
      chatId: fixture.chatId as ChatId,
      character: { id: "character_x", contentChanged: true },
    };
    await expect(ownsFactSubject(fixture.db, fact, fixture.host)).resolves.toBe(false);
  });

  test("the genuine owner of the named character row passes", async () => {
    const fixture = await ruleFixture();
    const characterId = await seedCharacter(fixture.db, fixture.host, "villain");
    const fact = { bus: "domain" as const, type: "character.updated" as const, chatId: null, character: { id: characterId, contentChanged: true } };
    await expect(ownsFactSubject(fixture.db, fact, fixture.host)).resolves.toBe(true);
  });

  test("a STRANGER to the same row fails-closed — cross-owner reach is exactly what the header warns about", async () => {
    const fixture = await ruleFixture();
    const stranger = await seedUser(fixture.db, "user_stranger");
    const characterId = await seedCharacter(fixture.db, fixture.host, "villain");
    const fact = { bus: "domain" as const, type: "character.updated" as const, chatId: null, character: { id: characterId, contentChanged: true } };
    await expect(ownsFactSubject(fixture.db, fact, stranger)).resolves.toBe(false);
  });

  test("a forged/absent id (no such row) fails-closed to false", async () => {
    const fixture = await ruleFixture();
    const fact = {
      bus: "domain" as const,
      type: "character.updated" as const,
      chatId: null,
      character: { id: castId<CharacterId>("character_ghost"), contentChanged: true },
    };
    await expect(ownsFactSubject(fixture.db, fact, fixture.host)).resolves.toBe(false);
  });

  test("a fact naming NO subject at all fails-closed — 'I could not identify a subject' is not ownership", async () => {
    const fixture = await ruleFixture();
    const fact = { bus: "domain" as const, type: "world-info.updated" as never, chatId: null };
    await expect(ownsFactSubject(fixture.db, fact, fixture.host)).resolves.toBe(false);
  });

  test("the asset arm works the same way as the character arm", async () => {
    const fixture = await ruleFixture();
    const assetId = await seedAsset(fixture.db, fixture.host, "x");
    const fact = { bus: "domain" as const, type: "asset.created" as const, chatId: null, assetId };
    await expect(ownsFactSubject(fixture.db, fact, fixture.host)).resolves.toBe(true);
    const stranger = await seedUser(fixture.db, "user_stranger2");
    await expect(ownsFactSubject(fixture.db, fact, stranger)).resolves.toBe(false);
  });
});
