// Minimal liveness wire; operational identity remains gated by the physical-peer rule at the producer (D76).
import { versionIdentitySchema } from "@orb/kit/version-identity";
import { z } from "zod";

export const HEALTH_STATUSES = ["ok", "shutting_down", "credentials_key_mismatch"] as const;
const version = versionIdentitySchema.strict().optional();
export const healthResponseSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal(HEALTH_STATUSES[0]), harness: z.boolean(), version }),
  z.strictObject({ status: z.literal(HEALTH_STATUSES[1]), version }),
  z.strictObject({ status: z.literal(HEALTH_STATUSES[2]), version }),
]);
