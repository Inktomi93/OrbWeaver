// verb: importPoses — BYO OpenPose skeleton import (comfyui-control §4.12.2, C6c). Stores each skeleton as a
// `kind:"pose"` CAS asset (magic-verified at store) + pins a `pose_library` registry entry. Single and BATCH
// are the same verb (a single import = a one-item batch). HONEST-PARTIAL: a per-item decode/magic-sniff refusal
// drops THAT skeleton with a reported reason and the rest still land — never a whole-batch throw. Owner-scoped
// off `principal.userId`; the row carries no ownerId (ownership derives via `asset_id → assets.ownerId`, D20).
//
// Orientation is COMPUTED from the decoded dims (never user-supplied — orientation must follow the skeleton).
// name/category/tags are normalized (trim → NFKC → lowercase) — the kit's 13 categories seed the picker's
// suggestion list, NOT a whitelist. The DWPose photo→skeleton path (§4.12.2) is DEFERRED — this verb stores the
// uploaded bytes as-is (a ready skeleton map).

import { orientationForDimensions } from "@orb/contracts/poses";
import { DomainOperationError } from "@orb/kit/errors";
import type { AssetsContext } from "../context";
import type { ImportPoseItem, ImportPosesParams } from "../contract/params";
import type { OwnedPose } from "../contract/results";
import type { AssetsService } from "../contract/service";
import { insertPoseLibraryRow } from "../persistence/poses";
import { storeBlob } from "../persistence/queries";
import { normalizePoseTags, normalizePoseText } from "../substrate/pose-normalize";

/** 16 MiB — a generous cap for a skeleton PNG (they run tens–hundreds of KB); rejected before the CAS write. */
const POSE_MAX_BYTES = 16_777_216;

export function createImportPoses(ctx: AssetsContext): AssetsService["importPoses"] {
  async function importOne(principal: ImportPosesParams["principal"], item: ImportPoseItem): Promise<OwnedPose> {
    if (item.bytes.byteLength > POSE_MAX_BYTES) {
      throw new DomainOperationError("asset_too_large", `pose skeleton is ${item.bytes.byteLength} bytes, over the ${POSE_MAX_BYTES}-byte cap`);
    }
    // Decode FIRST (validates it's a real image + yields the dims) — sharp throws on non-image bytes.
    const info = await ctx.imageProbe(item.bytes);
    const orientation = orientationForDimensions(info.width, info.height);
    const stored = await storeBlob(ctx.db, ctx.cas, {
      ownerId: principal.userId,
      bytes: item.bytes,
      kind: "pose",
      mime: item.mime,
      candidateId: ctx.newAssetId(),
      now: ctx.now(),
      enforceMagic: true,
    });
    if (stored.created) {
      ctx.emit({ type: "asset.created", assetId: stored.assetId });
    }
    const id = ctx.newPoseLibraryId();
    const name = normalizePoseText(item.name, "untitled");
    const category = normalizePoseText(item.category, "uncategorized");
    const tags = normalizePoseTags(item.tags);
    const now = ctx.now();
    await insertPoseLibraryRow(ctx.db, { id, assetId: stored.assetId, name, category, tags, orientation, now });
    return { id, assetId: stored.assetId, hash: stored.hash, name, category, tags, orientation, source: "byo", createdAt: now };
  }

  return async ({ principal, items }: ImportPosesParams) => {
    const settled = await Promise.allSettled(items.map((item) => importOne(principal, item)));
    const imported: OwnedPose[] = [];
    const failures: { name: string; reason: string }[] = [];
    settled.forEach((result, i) => {
      if (result.status === "fulfilled") {
        imported.push(result.value);
      } else {
        const reason = result.reason;
        failures.push({ name: items[i]?.name ?? "", reason: reason instanceof Error ? reason.message : "failed to import pose" });
      }
    });
    return { imported, failures };
  };
}
