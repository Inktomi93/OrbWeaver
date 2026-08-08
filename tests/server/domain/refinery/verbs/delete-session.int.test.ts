// .int tests for `deleteSession`: owner-belted, the run log cascades, canon untouched.

import { refineryRuns, refinerySessions } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeRefineryHarness, principal, scoreReply, seedOwnedCharacter, seedUser } from "../_support.ts";

test("deletes the owned session + its runs; the character survives; a stranger gets NOT_FOUND", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_ds_a" });
  const stranger = await seedUser(db, { id: "user_ds_b", handle: castId<Handle>("ds-stranger") });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "ds-card-a");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });
  h.queueReply(scoreReply());
  await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "score" });

  await expect(h.svc.deleteSession({ principal: principal(stranger), sessionId: session.id })).rejects.toBeInstanceOf(DomainNotFoundError);
  // Positive control before the delete (non-vacuity), then the cascade.
  expect(await db.select().from(refineryRuns).where(eq(refineryRuns.sessionId, session.id))).toHaveLength(1);
  await h.svc.deleteSession({ principal: principal(owner), sessionId: session.id });
  expect(await db.select().from(refinerySessions).where(eq(refinerySessions.id, session.id))).toHaveLength(0);
  expect(await db.select().from(refineryRuns).where(eq(refineryRuns.sessionId, session.id))).toHaveLength(0);
  // Canon untouched — the character still reads.
  const detail = await h.character.get({ principal: principal(owner), characterId });
  expect(detail.name).toBe("Aria the Archivist");
});
