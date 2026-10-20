// verb: countScripts — the owner-scoped library census, answered without full-list enrichment.
// @subject packages/server/src/domain/regex/verbs/scripts/count.ts

import { regexScripts } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { seedUser } from "@orb/testkit/node/factories/user.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createRegexService } from "#server/domain/regex/index.ts";
import { principal } from "../../../../../db/schema/_support.ts";
import { behavior, makeHarness } from "../../_support.ts";

test("census counts only owned library rows without entering full-list enrichment", async ({ db }) => {
  const owner = (await seedUser(db)).id;
  const other = (await seedUser(db)).id;
  const service = createRegexService(makeHarness(db).ctx);
  for (const [index, ownerId] of [owner, other, other].entries()) {
    await db.insert(regexScripts).values({ id: mintTypeId(ID_PREFIX.regexScript), ownerId, name: `Script ${index}`, behavior: behavior() });
  }
  expect(await service.countScripts({ principal: await principal({ db }, owner) })).toBe(1);
  expect(await service.countScripts({ principal: await principal({ db }, other) })).toBe(2);
});
