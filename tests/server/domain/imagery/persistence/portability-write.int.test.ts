import { assets, imageryGenerations, imageryImportCalls } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { bumpStatsCanonVersion } from "@orb/server/domain/stats";
import { eq } from "drizzle-orm";
import { writeImportedImageryCall } from "../../../../../packages/server/src/domain/imagery/persistence/portability-write.ts";
import { seedAsset } from "../../../../support/factories/asset.ts";
import { makeImageryCall } from "../../../../support/factories/imagery-call.ts";
import { seedUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("one foreign sibling refuses the entire execution, then complete owned retries restore only missing outputs", async ({ db }) => {
  const owner = await seedUser(db);
  const other = await seedUser(db);
  const call = makeImageryCall();
  const [first, second] = call.images;
  if (first === undefined || second === undefined) {
    throw new Error("two outputs required");
  }
  await seedAsset(db, { id: first.assetId, ownerId: owner.id, kind: "generated" });
  await seedAsset(db, { id: second.assetId, ownerId: other.id, kind: "generated" });
  const ctx = { db, newCallId: () => mintTypeId(ID_PREFIX.imageryCall), newGenerationId: () => mintTypeId(ID_PREFIX.imageryGeneration), bumpStatsCanonVersion };
  expect(await writeImportedImageryCall(ctx, owner.id, call)).toMatchObject({ admitted: false, created: false });
  expect(await db.select().from(imageryImportCalls)).toEqual([]);
  expect(await db.select().from(imageryGenerations)).toEqual([]);
  await db.update(assets).set({ ownerId: owner.id }).where(eq(assets.id, second.assetId));
  expect(await writeImportedImageryCall(ctx, owner.id, { ...call, images: [first] })).toMatchObject({ admitted: true, created: true });
  const retained = await db.select().from(imageryGenerations);
  expect(await writeImportedImageryCall(ctx, owner.id, call)).toMatchObject({ admitted: true, created: true });
  const complete = await db.select().from(imageryGenerations);
  expect(complete).toHaveLength(2);
  expect(complete.find((row) => row.id === retained[0]?.id)).toEqual(retained[0]);
  expect(new Set(complete.map((row) => row.callId)).size).toBe(1);
  expect(await writeImportedImageryCall(ctx, owner.id, call)).toMatchObject({ admitted: true, created: false });
  expect(await db.select().from(imageryGenerations)).toEqual(complete);
  expect(await db.select().from(imageryImportCalls)).toHaveLength(1);
});
