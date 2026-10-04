// .int tests for `decideRewrite` — the review's Keep/Discard sheet persists per session, keyed by rewrite run,
// so re-entering the workbench (a fresh `getSession`) reopens the same decisions and the same kept count.

import { DomainNotFoundError } from "@orb/kit/errors";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeRefineryHarness, principal, rewriteReply, scoreReply, seedOwnedCharacter, seedUser } from "../_support.ts";

test("decisions survive re-entry, per rewrite run, and a later run's sheet never touches an earlier one", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_dr_a" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "dr-card-a");
  const p = principal(owner);
  const session = await h.svc.startSession({ principal: p, characterId });
  h.queueReply(rewriteReply());
  const first = await h.svc.runStage({ principal: p, sessionId: session.id, stage: "rewrite" });

  await h.svc.decideRewrite({ principal: p, sessionId: session.id, rewriteRunId: first.id, decisions: [true, null] });
  await h.svc.decideRewrite({ principal: p, sessionId: session.id, rewriteRunId: first.id, decisions: [true, false] });

  // Re-entry is a fresh read of the session.
  const reentered = await h.svc.getSession({ principal: p, sessionId: session.id });
  expect(reentered.rewriteDecisions).toEqual({ [first.id]: [true, false] });

  h.queueReply(rewriteReply());
  h.advance(10);
  const second = await h.svc.runStage({ principal: p, sessionId: session.id, stage: "rewrite" });
  await h.svc.decideRewrite({ principal: p, sessionId: session.id, rewriteRunId: second.id, decisions: [false, true] });
  const both = await h.svc.getSession({ principal: p, sessionId: session.id });
  expect(both.rewriteDecisions).toEqual({ [first.id]: [true, false], [second.id]: [false, true] });
});

test("a sheet for a non-rewrite run or another session's run is NOT_FOUND, and a foreign session collapses the same", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_dr_b" });
  const stranger = await seedUser(db, { id: "user_dr_c" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "dr-card-b");
  const p = principal(owner);
  const session = await h.svc.startSession({ principal: p, characterId });
  h.queueReply(scoreReply());
  const score = await h.svc.runStage({ principal: p, sessionId: session.id, stage: "score" });
  h.queueReply(rewriteReply());
  const rewrite = await h.svc.runStage({ principal: p, sessionId: session.id, stage: "rewrite" });

  await expect(h.svc.decideRewrite({ principal: p, sessionId: session.id, rewriteRunId: score.id, decisions: [true] })).rejects.toBeInstanceOf(
    DomainNotFoundError,
  );
  await expect(
    h.svc.decideRewrite({ principal: p, sessionId: session.id, rewriteRunId: mintTypeId(ID_PREFIX.refineryRun), decisions: [true] }),
  ).rejects.toBeInstanceOf(DomainNotFoundError);
  await expect(
    h.svc.decideRewrite({ principal: principal(stranger), sessionId: session.id, rewriteRunId: rewrite.id, decisions: [true] }),
  ).rejects.toBeInstanceOf(DomainNotFoundError);
  // A real rewrite run of ANOTHER session the same owner holds — the sheet may only describe this session's runs.
  const other = await h.svc.startSession({ principal: p, characterId });
  h.queueReply(rewriteReply());
  const otherRewrite = await h.svc.runStage({ principal: p, sessionId: other.id, stage: "rewrite" });
  await expect(h.svc.decideRewrite({ principal: p, sessionId: session.id, rewriteRunId: otherRewrite.id, decisions: [true] })).rejects.toBeInstanceOf(
    DomainNotFoundError,
  );
  expect((await h.svc.getSession({ principal: p, sessionId: session.id })).rewriteDecisions).toEqual({});
});
