// domain/assets/persistence/poses — the pose_library reads/writes (comfyui-control §4.12.2, C6c). The row
// carries NO ownerId (D20); every owner-scoped read JOINS `assets` and filters `assets.owner_id` in the WHERE
// (never a post-filter — the cross-tenant sweep asserts the scope is in the query). `tags` round-trips as a
// JSON string array.

import type { PoseLibrarySource, PoseOrientation } from "@orb/contracts/poses";
import type { Db } from "@orb/db";
import { assets, poseLibrary } from "@orb/db";
import type { AssetId, PoseLibraryId, UserId } from "@orb/kit/ids";
import { and, desc, eq } from "drizzle-orm";
import type { OwnedPose } from "../contract/results";

/** One skeleton to register (the asset is already stored; this pins its library entry). In-file only (the
 *  verb passes an object literal) — not a cross-boundary shape, so it stays unexported here. */
interface InsertPoseRowInput {
  readonly id: PoseLibraryId;
  readonly assetId: AssetId;
  readonly name: string;
  readonly category: string;
  readonly tags: readonly string[];
  readonly orientation: PoseOrientation;
  readonly now: number;
}

/** Insert a BYO pose_library row (source always "byo" here — the DWPose "extracted" path is deferred). */
export async function insertPoseLibraryRow(db: Db, input: InsertPoseRowInput): Promise<void> {
  await db.insert(poseLibrary).values({
    id: input.id,
    assetId: input.assetId,
    name: input.name,
    category: input.category,
    tags: JSON.stringify(input.tags),
    orientation: input.orientation,
    source: "byo",
    createdAt: input.now,
  });
}

function parseTags(raw: string): readonly string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

/** The caller's OWN pose-library entries (owner-scoped via the `assets` join), newest-first, optional category
 *  filter. The owner gate lives in the WHERE — a row whose asset another user owns can never surface. */
export async function selectOwnedPoses(db: Db, ownerId: UserId, category?: string): Promise<OwnedPose[]> {
  const where = category !== undefined ? and(eq(assets.ownerId, ownerId), eq(poseLibrary.category, category)) : eq(assets.ownerId, ownerId);
  const rows = await db
    .select({
      id: poseLibrary.id,
      assetId: poseLibrary.assetId,
      hash: assets.hash,
      name: poseLibrary.name,
      category: poseLibrary.category,
      tags: poseLibrary.tags,
      orientation: poseLibrary.orientation,
      source: poseLibrary.source,
      createdAt: poseLibrary.createdAt,
    })
    .from(poseLibrary)
    .innerJoin(assets, eq(poseLibrary.assetId, assets.id))
    .where(where)
    .orderBy(desc(poseLibrary.createdAt));
  return rows.map((row) => ({
    id: row.id,
    assetId: row.assetId,
    hash: row.hash,
    name: row.name,
    category: row.category,
    tags: parseTags(row.tags),
    orientation: row.orientation as PoseOrientation,
    source: row.source as PoseLibrarySource,
    createdAt: row.createdAt,
  }));
}
