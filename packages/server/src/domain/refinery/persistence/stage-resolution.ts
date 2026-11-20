// domain/refinery/persistence/stage-resolution — resolve ONE stage's payload ARM: fixed (the typed
// contracts) or custom (the OWNED schema row, lifted + projected + embedded per call — the D126 per-call
// discipline; a deleted schema is a leak-free NOT_FOUND). Shared by the stage ENGINE and `preflight`
// (which must resolve the SAME arm the next run would) — homed beside the schema-row read because a verb may not
// import a sibling verb (`domain-no-cross-verb`). The fixed wire grammar stays in `substrate/stage-resolution.ts`.

import type { RefinerySessionView, RefineryStage } from "@orb/contracts/refinery";
import { refineryCustomStageConfigSchema } from "@orb/contracts/refinery";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { jsonObjectSchema } from "@orb/kit/json";
import { liftJsonSchema, projectJsonSchema } from "@orb/kit/json-schema";
import type { StageResolution } from "../contract/prompts.ts";
import type { RefineryContext } from "../contract/service.ts";
import { customShapeTextOf } from "../substrate/refine-prompt.ts";
import { loadOwnedSchemaRow } from "./queries.ts";

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
  // WIRE-CLOSURE IS ENFORCED HERE, NOT IN THE STORED BLOB. A stored custom schema is OPEN by
  // construction (the transpiler mints objects without `additionalProperties`, and the lift subset accepts an
  // absent one). `projectJsonSchema` is the ONE home of the `additionalProperties:false` pin, so a raw send of
  // `row.schema` would ship an OPEN object tree on the hosted wire — this projection is what closes it. That
  // safety rides an UNENFORCED convention (every send-site re-projects); a type brand on `ResponseFormat.schema`
  // would make it a compile-time invariant, but that type is loose `Record<string,unknown>` threaded tree-wide
  // (chat/rpg/every provider wire arm), so it is filed as a finding rather than forced. Keep the projection.
  const lifted = liftJsonSchema(row.schema);
  const projected = projectJsonSchema(lifted);
  return {
    kind: "custom",
    runConfig: { kind: "custom", schemaId: row.id, schemaVersion: row.version, schema: row.schema },
    // The lifted schema strips to declared keys, and a model reply is JSON, so the pipe only states the column type.
    payloadSchema: lifted.pipe(jsonObjectSchema),
    responseFormat: { name: row.name, schema: projected },
    shapeText: customShapeTextOf(projected),
    instruction: row.description,
  };
}
