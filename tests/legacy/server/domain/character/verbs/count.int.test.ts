// verb: count — the owner-scoped census behind the library header.
// @subject packages/server/src/domain/character/verbs/count.ts

import { createCharacterService } from "@orb/server/domain/character";
import { seedCharacter } from "@orb/testkit/node/factories/character.ts";
import { principal } from "@orb/testkit/node/factories/principal.ts";
import { seedUser } from "@orb/testkit/node/factories/user.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { makeHarness } from "../_support.ts";

test("census applies archived and literal-search scope without exposing a foreign owner's match", async ({ db }) => {
  const owner = (await seedUser(db)).id;
  const other = (await seedUser(db)).id;
  await seedCharacter(db, { ownerId: owner, name: "A% literal", archived: false });
  await seedCharacter(db, { ownerId: owner, name: "Archived", archived: true });
  await seedCharacter(db, { ownerId: other, name: "Foreign %" });
  const service = createCharacterService(makeHarness(db).ctx);
  expect(await service.count({ principal: await principal({ db }, owner) })).toBe(2);
  expect(await service.count({ principal: await principal({ db }, owner), search: " % ", archived: false })).toBe(1);
  expect(await service.count({ principal: await principal({ db }, owner), archived: true })).toBe(1);
  expect(await service.count({ principal: await principal({ db }, owner), search: "no match" })).toBe(0);
});
