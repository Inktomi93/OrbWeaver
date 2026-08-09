// .int tests for `preflight` (schema-renderer §8 — the output-budget readout): the resolved posture is
// re-run PER CALL (a preset-params change shows up on the next read — the D126 discipline), the input
// estimate measures the REAL assembled prompt, and the per-stage output arithmetic follows the design's
// mode factors. Advisory numbers — the pins here are about SEAMS (resolution freshness, monotonicity),
// never about blessing a magic constant.

import { SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { RefinerySessionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SideGenSampling } from "@orb/kit/side-gen-posture";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeRefineryHarness, principal, seedOwnedCharacter, seedUser } from "../_support.ts";

test("preflight resolves posture per call, measures the real prompt, and scales output with the rewrite mode", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_pf_a" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "pf-card-a");
  const p = principal(owner);
  const session = await h.svc.startSession({ principal: p, characterId });

  const result = await h.svc.preflight({ principal: p, sessionId: session.id });
  expect(result.contextTokens).toBe(8192);
  expect(result.stages.map((s) => s.stage)).toEqual(["score", "rewrite", "analyze"]);
  const rewrite = result.stages.find((s) => s.stage === "rewrite");
  // The floor posture (no preset params in the harness): the refine_rewrite catalog temperature.
  expect(rewrite?.temperature).toBe(0.7);
  // THE BUDGET IS THE READOUT'S SUBJECT, and it is payload-aware (substrate/output-budget): never below the
  // shipped floor, and never below this stage's own estimate. A readout that could print a ceiling SMALLER
  // than the estimate right beside it — which is what the static floor did, live, before the 503 — is the
  // defect this pin exists to keep out.
  expect(rewrite?.maxOutputTokens ?? 0).toBeGreaterThanOrEqual(SIDE_GEN_POSTURES.refine_rewrite.maxOutputTokens);
  expect(rewrite?.maxOutputTokens ?? 0).toBeGreaterThanOrEqual(rewrite?.outputEstimate ?? Number.POSITIVE_INFINITY);
  // The input estimate measures a REAL prompt — the card's own bytes make it nontrivial.
  expect(rewrite?.inputEstimate).toBeGreaterThan(50);
  expect(rewrite?.outputEstimate).toBeGreaterThan(0);
  // Every stage, not just the one sampled above: no stage may advertise a ceiling under its own estimate.
  for (const stage of result.stages) {
    expect(stage.maxOutputTokens ?? 0).toBeGreaterThanOrEqual(stage.outputEstimate);
  }

  // Mode arithmetic: expansive promises MORE output than balanced for the same selection.
  await h.svc.updateSession({
    principal: p,
    sessionId: session.id,
    patch: { stageConfig: { ...session.stageConfig, rewrite: { kind: "fixed", mode: "expansive" } } },
  });
  const expansive = await h.svc.preflight({ principal: p, sessionId: session.id });
  const expansiveRewrite = expansive.stages.find((s) => s.stage === "rewrite");
  expect(expansiveRewrite?.outputEstimate ?? 0).toBeGreaterThan(rewrite?.outputEstimate ?? Number.POSITIVE_INFINITY);
});

// THE OWNERSHIP BELT IS THE ONLY PIN THE CROSS-TENANT SWEEP CANNOT MAKE. `preflight` answers with numbers
// plus the deployment's summarizer model name and carries no free text, so the sweep's marker-based leak
// detector is toothless on it: a dropped `loadOwnedSessionRow` belt would RESOLVE for a stranger, handing
// them A's card token-mass and A's resolved model posture, and the sweep would read that as leak-free.
// This is that verb's real teeth — and the collapse is the leak-free NOT_FOUND (foreign and absent are one
// error), never a distinguishable refusal.
test("a foreign owner's preflight collapses to NOT_FOUND — no card mass, no posture, before any assembly", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_pf_c" });
  const stranger = await seedUser(db, { id: "user_pf_d" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "pf-card-c");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });
  await expect(h.svc.preflight({ principal: principal(stranger), sessionId: session.id })).rejects.toThrow(DomainNotFoundError);
  // An id that exists for NOBODY takes the identical path — so the refusal is not an existence oracle.
  await expect(h.svc.preflight({ principal: principal(stranger), sessionId: castId<RefinerySessionId>("refinery_session_gone") })).rejects.toThrow(
    DomainNotFoundError,
  );
});

test("a preset-params edit reaches the NEXT preflight read (resolved per call, never captured)", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_pf_b" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "pf-card-b");
  const p = principal(owner);
  const session = await h.svc.startSession({ principal: p, characterId });
  // The harness's resolver is swappable through the context object — simulate a preset edit between reads.
  const ctx = h.ctx as { resolveUserPresetParams: (userId: unknown) => Promise<SideGenSampling> };
  const before = await h.svc.preflight({ principal: p, sessionId: session.id });
  expect(before.stages.find((s) => s.stage === "score")?.maxOutputTokens ?? 0).toBeGreaterThanOrEqual(SIDE_GEN_POSTURES.refine_score.maxOutputTokens);
  ctx.resolveUserPresetParams = (): Promise<SideGenSampling> => Promise.resolve({ maxOutputTokens: 4096 });
  const after = await h.svc.preflight({ principal: p, sessionId: session.id });
  // THE LADDER IS UNCHANGED by the payload-aware floor: an explicit preset cap still wins OUTRIGHT, even
  // when it is lower than what the payload wants. Whether that overrun should then be confirmed or refused
  // is a POLICY question and deliberately not decided here (owner queue, live-e2e 2026-08-09).
  expect(after.stages.find((s) => s.stage === "score")?.maxOutputTokens).toBe(4096);
});
