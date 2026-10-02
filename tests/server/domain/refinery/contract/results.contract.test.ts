import { applyAsCopyResultSchema, refinerySessionViewSchema } from "../../../../../packages/server/src/domain/refinery/contract/results.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeRefineryHarness, principal, seedOwnedCharacter, seedUser } from "../_support.ts";

test("a real born session round-trips its anchor and closes typed stage configuration", async ({ db }) => {
  const owner = await seedUser(db, { id: "contract-refinery-owner" });
  const harness = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(harness, owner, "contract-refinery-card");
  const session = await harness.svc.startSession({ principal: principal(owner), characterId });
  expect(refinerySessionViewSchema.parse(session)).toEqual(session);
  expect(
    refinerySessionViewSchema.safeParse({ ...session, stageConfig: { ...session.stageConfig, score: { ...session.stageConfig.score, privateStage: true } } })
      .success,
  ).toBe(false);
});

test("zero-write copy results preserve drop itemization without inventing a copied character", () => {
  const result = { applied: [], dropped: [{ field: "description", reason: "not_selected" }], character: null };
  expect(applyAsCopyResultSchema.parse(result)).toEqual(result);
  expect(applyAsCopyResultSchema.safeParse({ ...result, dropped: [{ ...result.dropped[0], privateDrop: "private" }] }).success).toBe(false);
  expect(applyAsCopyResultSchema.safeParse({ ...result, snapshotId: "not-a-copy-snapshot" }).success).toBe(false);
});
