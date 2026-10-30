import { z } from "zod";

/** Surface walkthrough data preparation is explicit; owner mode never denotes an augmented synthetic corpus. */
export const SURFACE_DATA_MODES = ["synthetic", "owner"] as const;
export type SurfaceDataMode = (typeof SURFACE_DATA_MODES)[number];

const PROVIDER_EVENTS = ["request", "held", "aborted", "cancelled", "disposed", "scripted-embedding"] as const;
const PROVIDER_REQUESTS = ["GET /v1/models", "POST /v1/chat/completions", "POST /v1/embeddings"] as const;
const providerEvidenceSchema = z.strictObject({
  requestId: z.number().int().positive(),
  event: z.enum(PROVIDER_EVENTS),
  request: z.enum(PROVIDER_REQUESTS),
  structuredSchema: z.string().min(1).optional(),
});
export type SurfaceProviderEvidence = z.output<typeof providerEvidenceSchema>;

/** Parse metadata-only physical request evidence shared by native and Node controls. */
export function parseSurfaceProviderEvidence(text: string): readonly SurfaceProviderEvidence[] {
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => providerEvidenceSchema.parse(JSON.parse(line)));
}
