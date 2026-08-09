// domain/refinery/substrate/stage-resolution — resolve ONE stage's payload ARM: fixed (the typed
// contracts) or custom (the OWNED schema row, lifted + projected + embedded per call — the D126 per-call
// discipline; a deleted schema is a leak-free NOT_FOUND). Shared by the stage ENGINE and `preflight`
// (which must resolve the SAME arm the next run would) — homed here because a verb may not import a
// sibling verb (`domain-no-cross-verb`), and this is resolution substrate, not a verb.

import type { SideGenKind } from "@orb/contracts/preset";
import type { RefineryStage } from "@orb/contracts/refinery";
import { REFINERY_STAGE_PAYLOADS, refineryCustomStageConfigSchema } from "@orb/contracts/refinery";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { liftJsonSchema, projectJsonSchema } from "@orb/kit/json-schema";
import type { RefineryContext } from "../context.ts";
import type { StageResolution } from "../contract/prompts.ts";
import type { RefinerySessionView } from "../contract/results.ts";
import { loadOwnedSchemaRow } from "../persistence/queries.ts";
import { customShapeTextOf } from "./refine-prompt.ts";

// `StageResolution` is homed in `../contract/prompts.ts` (§7.4 — the one type home).

/** The wire grammar per FIXED stage — the SAME schemas the parse validates (D79's one-representation law).
 *  Module-const like distill's: the D126 shaping is the backend's request-build concern, not ours. Homed in
 *  the substrate because THREE callers need the identical grammar (the stage engine, `testSchema`, and the
 *  R4 library score sweep) and a second spelling of a response format is a second wire contract. */
export const REFINERY_RESPONSE_FORMATS: Record<RefineryStage, ResponseFormat> = {
  score: { name: "refinery_score", schema: projectJsonSchema(REFINERY_STAGE_PAYLOADS.score) },
  rewrite: { name: "refinery_rewrite", schema: projectJsonSchema(REFINERY_STAGE_PAYLOADS.rewrite) },
  analyze: { name: "refinery_analyze", schema: projectJsonSchema(REFINERY_STAGE_PAYLOADS.analyze) },
};

/** The side-gen posture each stage samples under — the ladder's floor rung (the owner's preset params are
 *  the second rung, resolved per call). Shared with the sweep for the same reason as the formats above. */
export const REFINERY_POSTURE_BY_STAGE: Record<RefineryStage, SideGenKind> = {
  score: "refine_score",
  rewrite: "refine_rewrite",
  analyze: "refine_analyze",
};

/** Resolve the stage's payload ARM (header). Rewrite is fixed-or-manual by construction and never
 *  resolves custom here. */
export async function resolveStageResolution(
  ctx: RefineryContext,
  args: { readonly ownerId: UserId; readonly stage: RefineryStage; readonly session: RefinerySessionView },
): Promise<StageResolution> {
  const { ownerId, stage, session } = args;
  const customizable = stage === "score" || stage === "analyze";
  const config = customizable ? session.stageConfig[stage] : null;
  const custom = config === null ? null : refineryCustomStageConfigSchema.safeParse(config);
  if (custom === null || !custom.success) {
    return { kind: "fixed" };
  }
  const row = await loadOwnedSchemaRow(ctx.db, ownerId, custom.data.schemaId);
  if (row === undefined) {
    // The session points at a deleted/foreign schema — leak-free NOT_FOUND; the Setup tab re-points it.
    throw new DomainNotFoundError("refinery schema", custom.data.schemaId);
  }
  const lifted = liftJsonSchema(row.schema);
  const projected = projectJsonSchema(lifted);
  return {
    kind: "custom",
    runConfig: { kind: "custom", schemaId: row.id, schemaVersion: row.version, schema: row.schema },
    payloadSchema: lifted,
    responseFormat: { name: row.name, schema: projected },
    shapeText: customShapeTextOf(projected),
    instruction: row.description,
  };
}
