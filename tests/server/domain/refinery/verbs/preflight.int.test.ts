// .int tests for `preflight` (schema-renderer §8 — the output-budget readout): the resolved posture is
// re-run PER CALL (a preset-params change shows up on the next read — the D126 discipline), the input
// estimate measures the REAL assembled prompt, and the per-stage output arithmetic follows the design's
// mode factors. Advisory numbers — the pins here are about SEAMS (resolution freshness, monotonicity),
// never about blessing a magic constant.

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
  // The floor posture (no preset params in the harness): the refine_rewrite catalog values.
  expect(rewrite?.temperature).toBe(0.7);
  expect(rewrite?.maxOutputTokens).toBe(2048);
  // The input estimate measures a REAL prompt — the card's own bytes make it nontrivial.
  expect(rewrite?.inputEstimate).toBeGreaterThan(50);
  expect(rewrite?.outputEstimate).toBeGreaterThan(0);

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
  expect(before.stages.find((s) => s.stage === "score")?.maxOutputTokens).toBe(768);
  ctx.resolveUserPresetParams = (): Promise<SideGenSampling> => Promise.resolve({ maxOutputTokens: 4096 });
  const after = await h.svc.preflight({ principal: p, sessionId: session.id });
  expect(after.stages.find((s) => s.stage === "score")?.maxOutputTokens).toBe(4096);
});
