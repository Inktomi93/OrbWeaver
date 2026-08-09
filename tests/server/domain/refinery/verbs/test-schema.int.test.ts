// .int tests for `testSchema` — the DRILL contract: the typed-per-schema payload comes back for preview
// rendering, and NOTHING persists (no run row, no signal stamp, no session).

import { refineryRuns } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeRefineryHarness, principal, seedOwnedCharacter, seedUser, validScoreSchema } from "../_support.ts";

test("drills the draft against an owned card and persists NOTHING; the ownership belt runs first", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_tsch_a" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "tsch-card-a");
  const p = principal(owner);

  // Ownership FIRST (the existence-oracle ordering): an absent character refuses before any model call.
  await expect(
    h.svc.testSchema({ principal: p, schema: validScoreSchema(), stage: "score", characterId: castId<CharacterId>("character_gone") }),
  ).rejects.toThrow(DomainNotFoundError);
  expect(h.summarizeCalls).toHaveLength(0);

  h.queueReply(JSON.stringify({ overallScore: 9, vibe: "COZY" }));
  const payload = await h.svc.testSchema({ principal: p, schema: validScoreSchema(), stage: "score", characterId });
  expect(payload).toEqual({ overallScore: 9, vibe: "COZY" });
  // A DRILL: no run row appended, no signal stamped.
  expect(await db.select().from(refineryRuns)).toHaveLength(0);
  const detail = await h.character.get({ principal: p, characterId });
  expect(detail.refinery?.score ?? null).toBeNull();
});
