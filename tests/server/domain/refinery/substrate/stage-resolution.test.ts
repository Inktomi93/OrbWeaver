// domain/refinery/substrate/stage-resolution — pins resolveStageResolution directly (the verb suites
// exercise it indirectly through runStage/preflight): rewrite is fixed-or-manual by construction and never
// resolves custom, a session with no custom stageConfig resolves fixed, a valid custom schema resolves
// with the WIRE-CLOSURE projection (additionalProperties:false, per the header's un-enforced-convention
// warning), and a session pointing at a DELETED/foreign schema throws leak-free NOT_FOUND.

import { DomainNotFoundError } from "@orb/kit/errors";
import type { StageResolution } from "../../../../../packages/server/src/domain/refinery/contract/prompts.ts";
import { resolveStageResolution } from "../../../../../packages/server/src/domain/refinery/substrate/stage-resolution.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeRefineryHarness, principal, seedOwnedCharacter, seedUser, validScoreSchema } from "../_support.ts";

/** Narrow a `StageResolution` to one arm, THROWING (never `expect`-inside-an-`if`). */
function asKind<K extends StageResolution["kind"]>(resolution: StageResolution, kind: K): Extract<StageResolution, { kind: K }> {
  if (resolution.kind !== kind) {
    throw new Error(`expected the ${kind} resolution, got ${resolution.kind}`);
  }
  return resolution as Extract<StageResolution, { kind: K }>;
}

test("rewrite is fixed-or-manual by construction — it never resolves custom, even if stageConfig somehow named one", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_sr_rewrite" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "sr-rewrite");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });
  const resolution = await resolveStageResolution(h.ctx, { ownerId: owner, stage: "rewrite", session });
  expect(resolution).toEqual({ kind: "fixed" });
});

test("a session with no custom stageConfig for score/analyze resolves fixed", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_sr_fixed" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "sr-fixed");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });
  expect(await resolveStageResolution(h.ctx, { ownerId: owner, stage: "score", session })).toEqual({ kind: "fixed" });
  expect(await resolveStageResolution(h.ctx, { ownerId: owner, stage: "analyze", session })).toEqual({ kind: "fixed" });
});

test("a valid custom schema resolves `custom`, WIRE-CLOSED (additionalProperties:false) — never the raw open row", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_sr_custom" });
  const h = makeRefineryHarness(db);
  const p = principal(owner);
  const characterId = await seedOwnedCharacter(h, owner, "sr-custom");
  const row = await h.svc.createSchema({ principal: p, name: "vibe_scorer", description: "score the vibe", stage: "score", schema: validScoreSchema() });
  const session = await h.svc.startSession({ principal: p, characterId });
  const patched = await h.svc.updateSession({
    principal: p,
    sessionId: session.id,
    patch: { stageConfig: { ...session.stageConfig, score: { kind: "custom", schemaId: row.id } } },
  });

  const resolution = asKind(await resolveStageResolution(h.ctx, { ownerId: owner, stage: "score", session: patched }), "custom");
  expect(resolution.runConfig).toEqual({ kind: "custom", schemaId: row.id, schemaVersion: 1, schema: validScoreSchema() });
  expect(resolution.responseFormat.name).toBe(row.name);
  expect((resolution.responseFormat.schema as Record<string, unknown>)["additionalProperties"]).toBe(false);
});

test("a session pointing at a DELETED/foreign schema throws leak-free NOT_FOUND", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_sr_deleted" });
  const h = makeRefineryHarness(db);
  const p = principal(owner);
  const characterId = await seedOwnedCharacter(h, owner, "sr-deleted");
  const row = await h.svc.createSchema({ principal: p, name: "vibe_scorer", description: "score the vibe", stage: "score", schema: validScoreSchema() });
  const session = await h.svc.startSession({ principal: p, characterId });
  const patched = await h.svc.updateSession({
    principal: p,
    sessionId: session.id,
    patch: { stageConfig: { ...session.stageConfig, score: { kind: "custom", schemaId: row.id } } },
  });
  await h.svc.deleteSchema({ principal: p, schemaId: row.id });

  await expect(resolveStageResolution(h.ctx, { ownerId: owner, stage: "score", session: patched })).rejects.toThrow(DomainNotFoundError);
});
