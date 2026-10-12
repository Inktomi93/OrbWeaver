import { regexScripts } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createRegexService } from "@orb/server/domain/regex";
import { principal } from "@orb/testkit/node/factories/principal.ts";
import { seedUser } from "@orb/testkit/node/factories/user.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { behavior, makeHarness } from "../../_support.ts";

test("census counts only owned library rows without entering full-list enrichment", async ({ db }) => {
  const owner = (await seedUser(db)).id;
  const other = (await seedUser(db)).id;
  const service = createRegexService(makeHarness(db).ctx);
  for (const [index, ownerId] of [owner, other, other].entries()) {
    await db.insert(regexScripts).values({ id: mintTypeId(ID_PREFIX.regexScript), ownerId, name: `Script ${index}`, behavior: behavior() });
  }
  expect(await service.countScripts({ principal: principal(owner) })).toBe(1);
  expect(await service.countScripts({ principal: principal(other) })).toBe(2);
});
