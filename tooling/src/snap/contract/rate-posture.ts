// One immutable host/browser posture per Snap run. The contract is a leaf shared by the fact envelope,
// arm contexts, and the sampler; only the sampler reads the host or browser.
import { z } from "zod";
import type { BrowserAccelerationEvidence } from "../../_shared/browser-acceleration.ts";

export const snapRatePostureIdSchema = z
  .string()
  .regex(/^sha256:[a-f0-9]{64}$/u)
  .brand<"SnapRatePostureId">();
type SnapRatePostureId = z.infer<typeof snapRatePostureIdSchema>;

export interface SnapRatePosture {
  readonly id: SnapRatePostureId;
  readonly acceleration: BrowserAccelerationEvidence;
  readonly accelerationError: string | null;
  /** The run's ONE box reading. `planted` rides ALONG (#1666): it is the provenance of THIS number, and
   *  dropping it here would silently un-stamp snap's own RESULT line while every other receipt in the
   *  fleet still said `(planted)` — an under-claim, which is the dangerous direction for an honesty mark. */
  //  `| undefined` is REQUIRED, not noise: under `exactOptionalPropertyTypes` a `?:` field means "absent",
  //  while zod's `.optional()` output is `boolean | undefined` — the schema below is declared
  //  `z.ZodType<SnapRatePosture>`, so the two must agree exactly (TS2375).
  readonly load: { readonly loadavg1: number; readonly cpuCount: number; readonly planted?: boolean | undefined };
}

const accelerationSchema = z.object({
  backend: z.string(),
  posture: z.enum(["hardware", "software", "unknown"]),
  gpuCompositing: z.string(),
  rasterization: z.string(),
  webgl: z.string(),
  webgpu: z.string(),
});

export const snapRatePostureSchema: z.ZodType<SnapRatePosture> = z.object({
  id: snapRatePostureIdSchema,
  acceleration: accelerationSchema,
  accelerationError: z.string().nullable(),
  load: z.object({ loadavg1: z.number(), cpuCount: z.number().int().positive(), planted: z.boolean().optional() }),
});
