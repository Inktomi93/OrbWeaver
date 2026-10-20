// .int tests for `getSession`: the view round-trip + the leak-free ownership collapse.
// @subject packages/server/src/domain/refinery/verbs/get-session.ts

import { DomainNotFoundError } from "@orb/kit/errors";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { makeRefineryHarness, principal, seedOwnedCharacter, seedUser } from "../_support.ts";

test("returns the started session's view verbatim; a stranger gets NOT_FOUND", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_gs_a" });
  const stranger = await seedUser(db, { id: "user_gs_b", handle: castId<Handle>("gs-stranger") });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "gs-card-a");
  const started = await h.svc.startSession({ principal: await principal(db, owner), characterId });

  const got = await h.svc.getSession({ principal: await principal(db, owner), sessionId: started.id });
  expect(got).toEqual(started);
  await expect(h.svc.getSession({ principal: await principal(db, stranger), sessionId: started.id })).rejects.toBeInstanceOf(DomainNotFoundError);
});
