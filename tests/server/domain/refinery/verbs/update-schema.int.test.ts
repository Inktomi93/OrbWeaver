// .int tests for `updateSchema`: version bumps on CONTENT change only (the P1-B provenance pin), the
// merged document re-runs the whole belt, and foreign ids collapse leak-free.

import { refinerySchemas } from "@orb/db";
import { DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import { SCHEMA_STALE_PATCH_REASON } from "@orb/server/domain/refinery";
import { eq } from "drizzle-orm";
import { freshDb, freshHeldDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeRefineryHarness, principal, seedUser, validScoreSchema } from "../_support.ts";

const SCORE_CORE_REFUSAL = /overallScore/u;
const REFINERY_SCHEMA_UPDATE = /update "refinery_schemas"/iu;

test("update bumps version on CONTENT change only; foreign owner collapses to NOT_FOUND", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_usch_a" });
  const other = await seedUser(db, { id: "user_usch_b" });
  const h = makeRefineryHarness(db);
  const created = await h.svc.createSchema({ principal: principal(owner), name: "vibe_scorer", description: "v1", stage: "score", schema: validScoreSchema() });

  // A description-only edit is prose, not provenance — no version bump.
  const prose = await h.svc.updateSchema({ principal: principal(owner), schemaId: created.id, patch: { description: "rate the VIBE" } });
  expect(prose.version).toBe(1);

  // A schema edit IS provenance — the pin bumps.
  const bumped = await h.svc.updateSchema({
    principal: principal(owner),
    schemaId: created.id,
    patch: { schema: { ...validScoreSchema(), properties: { ...(validScoreSchema()["properties"] as object), extra: { type: "string" } } } },
  });
  expect(bumped.version).toBe(2);

  // The merged document re-runs the belt — an update cannot smuggle a core-less schema past it.
  await expect(
    h.svc.updateSchema({ principal: principal(owner), schemaId: created.id, patch: { schema: { type: "object", properties: {}, required: [] } } }),
  ).rejects.toThrow(SCORE_CORE_REFUSAL);

  // Foreign owner — leak-free collapse.
  await expect(h.svc.updateSchema({ principal: principal(other), schemaId: created.id, patch: { description: "steal" } })).rejects.toThrow(DomainNotFoundError);

  // THREE ticks, all to the owner: create + the two landed patches. The belt refusal and the foreign
  // attempt announced nothing — the emit sits after the durable write.
  expect(h.userEvents).toEqual([
    { userId: owner, event: { type: "refineryChanged" } },
    { userId: owner, event: { type: "refineryChanged" } },
    { userId: owner, event: { type: "refineryChanged" } },
  ]);
});

test("two held renames to one folded name admit one update and type the loser", async () => {
  const { db, hold } = await freshHeldDb();
  const owner = await seedUser(db, { id: "user_usch_race" });
  const h = makeRefineryHarness(db);
  const a = await h.svc.createSchema({ principal: principal(owner), name: "SchemaA", description: "a", stage: "score", schema: validScoreSchema() });
  const b = await h.svc.createSchema({ principal: principal(owner), name: "SchemaB", description: "b", stage: "score", schema: validScoreSchema() });
  const updates = hold(REFINERY_SCHEMA_UPDATE, 2);
  const renames = [
    h.svc.updateSchema({ principal: principal(owner), schemaId: a.id, patch: { name: "SharedName" } }),
    h.svc.updateSchema({ principal: principal(owner), schemaId: b.id, patch: { name: "sharedname" } }),
  ];

  await updates.reached;
  updates.release();
  const settled = await Promise.allSettled(renames);

  expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const rejected = settled.find((result) => result.status === "rejected");
  expect(rejected?.reason).toBeInstanceOf(DomainOperationError);
  if (!(rejected?.reason instanceof DomainOperationError)) {
    throw new Error("expected the concurrent schema-name loser to be typed");
  }
  expect(rejected.reason.code).toBe("refinery_schema_name_taken");
  const rows = await h.svc.listSchemas({ principal: principal(owner) });
  expect(rows.filter((row) => row.name.toLowerCase() === "sharedname")).toHaveLength(1);
});

test("two CONCURRENT patches to DISJOINT fields cannot silently drop each other (#1445)", async () => {
  const { db, hold } = await freshHeldDb();
  const owner = await seedUser(db, { id: "user_usch_cas" });
  const h = makeRefineryHarness(db);
  const created = await h.svc.createSchema({ principal: principal(owner), name: "cas_scorer", description: "v1", stage: "score", schema: validScoreSchema() });
  const widened = { ...validScoreSchema(), properties: { ...(validScoreSchema()["properties"] as object), extra: { type: "string" } } };

  // Both patches READ the same pre-edit row, then both write the WHOLE merged document — the shape that
  // loses an edit. The hold keeps them together so this is a real interleaving, not a sequence.
  const updates = hold(REFINERY_SCHEMA_UPDATE, 2);
  const patches = [
    h.svc.updateSchema({ principal: principal(owner), schemaId: created.id, patch: { description: "rate the VIBE" } }),
    h.svc.updateSchema({ principal: principal(owner), schemaId: created.id, patch: { schema: widened } }),
  ];
  await updates.reached;
  updates.release();
  const settled = await Promise.allSettled(patches);

  // ONE writer lands. The other is TOLD (a typed, actionable refusal — their patch is intact and they
  // re-apply it), rather than being told success while its write is overwritten a millisecond later.
  expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const rejected = settled.find((result) => result.status === "rejected");
  expect(rejected?.reason).toBeInstanceOf(DomainOperationError);
  if (!(rejected?.reason instanceof DomainOperationError)) {
    throw new Error("expected the losing concurrent schema patch to be typed");
  }
  expect(rejected.reason.code).toBe(SCHEMA_STALE_PATCH_REASON);
  // …and the row is ONE writer's document end to end, never a mix of the winner's field with the loser's
  // stale copy of the other. (Which one won is the interleaving's business; that it is not a blend is ours.)
  const [row] = await db.select().from(refinerySchemas).where(eq(refinerySchemas.id, created.id));
  const proseWon = row?.description === "rate the VIBE";
  expect(row?.schema).toEqual(proseWon ? validScoreSchema() : widened);
  expect(row?.description).toBe(proseWon ? "rate the VIBE" : "v1");
});
