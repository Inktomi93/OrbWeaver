import { z } from "zod";

/** Observed means rendered evidence only; visited means the named operation or surface traversal completed. */
const SURFACE_COVERAGE_DISPOSITIONS = ["visited", "observed", "failed", "skipped", "excluded", "unvisited", "not-applicable"] as const;

/** Skipped records an available but unexecuted case; excluded records an explicit policy boundary. Neither establishes exercised coverage. */
export type SurfaceCoverageDisposition = (typeof SURFACE_COVERAGE_DISPOSITIONS)[number];

const subjectSchema = z.strictObject({ id: z.string().min(1), kind: z.string().min(1) });
const observationSchema = subjectSchema.extend({
  disposition: z.enum(SURFACE_COVERAGE_DISPOSITIONS),
  reason: z.string().min(1).optional(),
});

/** Native attachment vocabulary describes evidence and omissions, without replacing the runner's result. */
export const surfaceCoverageInventorySchema = z.strictObject({
  name: z.string().min(1),
  expected: z.array(subjectSchema).readonly(),
  observations: z.array(observationSchema).readonly(),
});
export type SurfaceCoverageInventory = z.output<typeof surfaceCoverageInventorySchema>;

/** Preserve subject identity even when either component contains a delimiter. */
export function surfaceCoverageKey(subject: z.output<typeof subjectSchema>): string {
  return JSON.stringify([subject.kind, subject.id]);
}

export const SURFACE_INVENTORY_ATTACHMENT = "surface-inventory";
