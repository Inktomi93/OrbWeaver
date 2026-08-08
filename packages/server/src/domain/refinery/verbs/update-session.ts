// verb: updateSession — the session-config patch (the D62 Setup surface's write; collapses the study's
// `renameSession` — one patch verb, the `updateCharacterSchema` precedent). Every present member is
// RE-PARSED through its contracts schema here (the internal-boundary posture, security pass §3.A — the
// tRPC wire parse does not cover a future internal caller). `null` clears the two nullable text fields.

import {
  refineryGuidanceSchema,
  refinerySelectionSchema,
  refinerySessionNameSchema,
  refinerySessionStatusSchema,
  refineryStageConfigSchema,
} from "@orb/contracts/refinery";
import { refinerySessions } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import { eq } from "drizzle-orm";
import type { RefineryContext } from "../context.ts";
import type { UpdateSessionPatch } from "../contract/params.ts";
import type { RefineryService } from "../contract/service.ts";
import { loadOwnedSessionRow, sessionViewOf } from "../persistence/queries.ts";

export function createUpdateSession(ctx: RefineryContext): RefineryService["updateSession"] {
  return async ({ principal, sessionId, patch }) => {
    const ownerId = principal.userId;
    const row = await loadOwnedSessionRow(ctx.db, ownerId, sessionId);
    if (row === undefined) {
      throw new DomainNotFoundError("refinery session", sessionId);
    }
    await ctx.db
      .update(refinerySessions)
      .set({ ...parsePatch(patch), updatedAt: ctx.now() })
      .where(eq(refinerySessions.id, sessionId));
    const updated = await loadOwnedSessionRow(ctx.db, ownerId, sessionId);
    if (updated === undefined) {
      throw new DomainNotFoundError("refinery session", sessionId);
    }
    return sessionViewOf(updated);
  };
}

/** The per-member re-parse (header): each present member through its contracts schema; `null` clears. */
function parsePatch(patch: UpdateSessionPatch): Partial<typeof refinerySessions.$inferInsert> {
  const set: Partial<typeof refinerySessions.$inferInsert> = {};
  if (patch.name !== undefined) {
    set.name = patch.name === null ? null : refinerySessionNameSchema.parse(patch.name);
  }
  if (patch.guidance !== undefined) {
    set.guidance = patch.guidance === null ? null : refineryGuidanceSchema.parse(patch.guidance);
  }
  if (patch.selection !== undefined) {
    set.selection = refinerySelectionSchema.parse(patch.selection);
  }
  if (patch.stageConfig !== undefined) {
    set.stageConfig = refineryStageConfigSchema.parse(patch.stageConfig);
  }
  if (patch.status !== undefined) {
    set.status = refinerySessionStatusSchema.parse(patch.status);
  }
  return set;
}
