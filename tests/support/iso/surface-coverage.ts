import { z } from "zod";

/** Observed means rendered evidence only; visited means the named operation or surface traversal completed. */
const SURFACE_WITNESS_DISPOSITIONS = ["visited", "observed", "failed", "excluded", "unvisited", "not-applicable"] as const;
const SURFACE_COVERAGE_DISPOSITIONS = [...SURFACE_WITNESS_DISPOSITIONS, "skipped"] as const;

/** Skipped records an available but unexecuted case; excluded records an explicit policy boundary. Neither establishes exercised coverage. */
export type SurfaceCoverageDisposition = (typeof SURFACE_COVERAGE_DISPOSITIONS)[number];
/** Every disposition except `skipped`, which carries a {@link SurfaceSkipReason} instead of free text alone. */
export type SurfaceWitnessDisposition = (typeof SURFACE_WITNESS_DISPOSITIONS)[number];

/** The closed list of reasons a walk may leave an available subject unexercised. A skip outside it fails the walk. */
export const SURFACE_SKIP_REASONS = ["disabled", "not-activated", "sibling-sample", "traversal-bound", "hidden-here", "no-subject", "another-case"] as const;
export type SurfaceSkipReason = (typeof SURFACE_SKIP_REASONS)[number];

/** The report legend: what each skip reason claims, so a reader can judge whether it is a coverage gap. */
export const SURFACE_SKIP_REASON_MEANINGS = {
  disabled: "Production renders the subject disabled; nothing could run.",
  "not-activated": "Read, not run: the generic walk never activates a command or submits a form; only an outcome journey does.",
  "sibling-sample": "A sibling of the same list was walked in its place.",
  "traversal-bound": "Beyond the walk's explicit depth or count bound.",
  "hidden-here": "Hidden in this layout, such as a responsive arm; never counted as witnessed.",
  "no-subject": "The dataset has no subject that could drive it.",
  "another-case": "Another native case owns this subject.",
} as const satisfies Readonly<Record<SurfaceSkipReason, string>>;

const subjectSchema = z.strictObject({ id: z.string().min(1), kind: z.string().min(1) });
const witnessSchema = subjectSchema.extend({
  disposition: z.enum(SURFACE_WITNESS_DISPOSITIONS),
  reason: z.string().min(1).optional(),
});
const skipSchema = subjectSchema.extend({
  disposition: z.literal("skipped"),
  skip: z.enum(SURFACE_SKIP_REASONS),
  reason: z.string().min(1),
});
const observationSchema = z.discriminatedUnion("disposition", [witnessSchema, skipSchema]);

/** Native attachment vocabulary describes evidence and omissions, without replacing the runner's result. */
export const surfaceCoverageInventorySchema = z.strictObject({
  name: z.string().min(1),
  expected: z.array(subjectSchema).readonly(),
  observations: z.array(observationSchema).readonly(),
});
export type SurfaceCoverageInventory = z.output<typeof surfaceCoverageInventorySchema>;
type Subject = z.output<typeof subjectSchema>;
export type SurfaceCoverageObservation = z.output<typeof observationSchema>;
export type SurfaceSkippedObservation = z.output<typeof skipSchema>;

/** Preserve subject identity even when either component contains a delimiter. */
export function surfaceCoverageKey(subject: Subject): string {
  return JSON.stringify([subject.kind, subject.id]);
}

export const SURFACE_INVENTORY_ATTACHMENT = "surface-inventory";

/** A skipped observation whose reason is missing or outside {@link SURFACE_SKIP_REASONS}. */
export interface SurfaceUnlistedSkip {
  readonly id: string;
  readonly kind: string;
  readonly issue: string;
}

/** One inventory's verdict. Each list must be empty for the walk to pass. */
export interface SurfaceInventoryAudit {
  readonly name: string;
  /** Expected subjects whose last observation is missing or `unvisited`. */
  readonly missing: readonly Subject[];
  readonly unlistedSkips: readonly SurfaceUnlistedSkip[];
  /** Schema failures other than an unlisted skip; the inventory cannot be judged. */
  readonly malformed: readonly string[];
  /** Subjects whose last observation is a listed skip, in first-expected order. Reported, never a failure. */
  readonly skipped: readonly SurfaceSkippedObservation[];
}

const skippedRowSchema = z.looseObject({ id: z.string(), kind: z.string(), disposition: z.literal("skipped") });
const rawObservationsSchema = z.looseObject({ observations: z.array(z.looseObject({})) });

/** The last observation of a subject supersedes earlier ones: a journey settles what the generic walk only read. */
function effectiveObservations(inventory: SurfaceCoverageInventory): Map<string, SurfaceCoverageObservation> {
  return new Map(inventory.observations.map((observation) => [surfaceCoverageKey(observation), observation]));
}

/**
 * Judge one published inventory, from the walk's own value or a retained JSON attachment.
 *
 * @remarks An unlisted skip is reported by subject rather than as a bare schema failure, so the walk report can name
 * the exact leaf that broke the rule.
 */
export function auditSurfaceInventory(input: unknown): SurfaceInventoryAudit {
  const parsed = surfaceCoverageInventorySchema.safeParse(input);
  if (parsed.success) {
    const effective = effectiveObservations(parsed.data);
    const missing = parsed.data.expected.filter((subject) => {
      const observation = effective.get(surfaceCoverageKey(subject));
      return observation === undefined || observation.disposition === "unvisited";
    });
    const skipped = [...effective.values()].filter((observation): observation is SurfaceSkippedObservation => observation.disposition === "skipped");
    return { name: parsed.data.name, missing, unlistedSkips: [], malformed: [], skipped };
  }
  const rows = rawObservationsSchema.safeParse(input);
  const unlistedSkips: SurfaceUnlistedSkip[] = [];
  const malformed: string[] = [];
  for (const issue of parsed.error.issues) {
    const [field, index] = issue.path;
    const row = field === "observations" && typeof index === "number" && rows.success ? skippedRowSchema.safeParse(rows.data.observations[index]) : null;
    if (row?.success === true) {
      unlistedSkips.push({ id: row.data.id, kind: row.data.kind, issue: `${issue.path.slice(2).join(".") || "observation"}: ${issue.message}` });
    } else {
      malformed.push(`${issue.path.join(".") || "inventory"}: ${issue.message}`);
    }
  }
  const name = z.looseObject({ name: z.string() }).safeParse(input);
  return { name: name.success ? name.data.name : "unnamed inventory", missing: [], unlistedSkips, malformed, skipped: [] };
}
