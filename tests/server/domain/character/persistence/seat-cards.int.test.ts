import { createLoadSeatCards } from "@orb/server/domain/character";
import { seedCharacter } from "../../../../support/factories/character.ts";
import { seedUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("light decorations preserve carried policy and reject foreign card ids without loading prose", async ({ db }) => {
  const owner = (await seedUser(db)).id;
  const other = (await seedUser(db)).id;
  const owned = await seedCharacter(db, { ownerId: owner, name: "Owned", description: "Large prose".repeat(5000), trustHtml: true, interactiveHtml: false });
  const foreign = await seedCharacter(db, { ownerId: other, name: "Foreign" });
  const rows = await createLoadSeatCards(db)(owner, [owned.id, foreign.id]);
  expect(rows).toEqual([
    {
      id: owned.id,
      name: "Owned",
      avatarAssetId: null,
      trustHtml: true,
      interactiveHtml: false,
      forbidExternalMedia: null,
      themeOverride: null,
      backgroundOverride: null,
    },
  ]);
  expect(JSON.stringify(rows).length).toBeLessThan(1000);
});
