// .int tests for `listRuns` — the CONTEXT ledger: oldest first, reachable only through an OWNED session
// (leak-free collapse), and a corrupt stored payload row is DROPPED from the view (the observable
// read-seam heal), never fabricated.

import { refineryRuns } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { Handle, ModelId, RefineryRunId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeRefineryHarness, principal, rewriteReply, scoreReply, seedOwnedCharacter, seedUser } from "../_support.ts";

test("the ledger reads oldest-first; a stranger gets NOT_FOUND; a corrupt row is dropped observably", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_lr_a" });
  const stranger = await seedUser(db, { id: "user_lr_b", handle: castId<Handle>("lr-stranger") });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "lr-card-a");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });

  h.queueReply(scoreReply());
  const score = await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "score" });
  h.advance(10);
  h.queueReply(rewriteReply());
  const rewrite = await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "rewrite" });
  // Plant a CORRUPT row (the read-seam's subject — the engine can't produce one): insert VALID, then
  // corrupt the stored payload as RAW COLUMN BYTES (no typed-value fabrication).
  await db.insert(refineryRuns).values({
    id: castId<RefineryRunId>("refinery_run_corrupt"),
    sessionId: session.id,
    stage: "score",
    payloadConfig: { kind: "fixed", mode: "full" },
    payload: score.payload,
    model: castId<ModelId>("vetted-model"),
    durationMs: 0,
  });
  await db.run(sql`UPDATE refinery_runs SET payload = '{"totally":"wrong"}' WHERE id = 'refinery_run_corrupt'`);

  const runs = await h.svc.listRuns({ principal: principal(owner), sessionId: session.id });
  expect(runs.map((r) => r.id)).toEqual([score.id, rewrite.id]);
  await expect(h.svc.listRuns({ principal: principal(stranger), sessionId: session.id })).rejects.toBeInstanceOf(DomainNotFoundError);
});
