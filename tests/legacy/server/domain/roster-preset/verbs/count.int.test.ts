// verb: count — the owner-scoped library census, answered without full-list enrichment.
// @subject packages/server/src/domain/roster-preset/verbs/count.ts

import { rosterPresets } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { seedUser } from "@orb/testkit/node/factories/user.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createRosterPresetService } from "#server/domain/roster-preset/index.ts";
import { principal } from "../../../../db/schema/_support.ts";
import { makeHarness } from "../_support.ts";

test("census counts only owned library rows without entering full-list enrichment", async ({ db }) => {
  const owner = (await seedUser(db)).id;
  const other = (await seedUser(db)).id;
  const service = createRosterPresetService(makeHarness(db).ctx);
  for (const [index, ownerId] of [owner, other, other].entries()) {
    await db.insert(rosterPresets).values({ id: mintTypeId(ID_PREFIX.rosterPreset), ownerId, name: `Roster ${index}` });
  }
  expect(await service.count({ principal: await principal({ db }, owner) })).toBe(1);
  expect(await service.count({ principal: await principal({ db }, other) })).toBe(2);
});
