// The stream-delta vocabulary a chat backend may emit — ONE open-ended union the bus and the canon content
// blocks consume by `kind`. A wire declares which members it can emit (`WIRE_DEFS[w].deltas`); a runner
// never invents one. Inline reply images (§6.7) are the `image` member, not a feature.

import { z } from "zod";

export const DELTA_KINDS = ["text", "reasoning", "image", "audio", "tool-call", "citation", "usage"] as const;
export type DeltaKind = (typeof DELTA_KINDS)[number];
export const deltaKindSchema = z.enum(DELTA_KINDS) satisfies z.ZodType<DeltaKind>;
