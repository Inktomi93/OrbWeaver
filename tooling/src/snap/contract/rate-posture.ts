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
  readonly load: { readonly loadavg1: number; readonly cpuCount: number };
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
  load: z.object({ loadavg1: z.number(), cpuCount: z.number().int().positive() }),
});
