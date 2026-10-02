// @orb/contracts/preset/portability — the preset import result exposed by transport.
// Export bytes and import execution remain domain-internal; this extends the canonical delivery outcome.
import type { PresetId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import type { z } from "zod";
import type { PortableImportOutcome } from "#portability";
import { portableImportOutcomeSchema } from "#portability";

/** ok:false + error for a malformed upload; created:false when merged into an existing preset. */
export interface PresetImportOutcome extends Pick<PortableImportOutcome, "ok" | "created" | "error"> {
  /** The written row. Present on successful imports, optional for delivery-core compatibility. */
  readonly presetId?: PresetId;
}
export const presetImportOutcomeSchema = portableImportOutcomeSchema
  .omit({ notes: true })
  .extend({ presetId: typeIdSchema(ID_PREFIX.preset).exactOptional() }) satisfies z.ZodType<PresetImportOutcome>;
