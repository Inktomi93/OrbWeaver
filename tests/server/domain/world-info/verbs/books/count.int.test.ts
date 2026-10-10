import { worldBooks } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createWorldInfoService } from "@orb/server/domain/world-info";
import { principal } from "../../../../../support/factories/principal.ts";
import { seedUser } from "../../../../../support/factories/user.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { makeHarness } from "../../_support.ts";

test("census counts only owned library rows without entering full-list enrichment", async ({ db }) => {
  const owner = (await seedUser(db)).id;
  const other = (await seedUser(db)).id;
  const service = createWorldInfoService(makeHarness(db).ctx);
  for (const [index, ownerId] of [owner, other, other].entries()) {
    await db.insert(worldBooks).values({ id: mintTypeId(ID_PREFIX.worldBook), ownerId, name: `Book ${index}` });
  }
  expect(await service.countBooks({ principal: principal(owner) })).toBe(1);
  expect(await service.countBooks({ principal: principal(other) })).toBe(2);
});
