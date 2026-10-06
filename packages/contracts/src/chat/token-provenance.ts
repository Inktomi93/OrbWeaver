// Dependency-leaf accounting vocabulary: provider schemas and usage contracts cannot import the
// message contract, which itself depends on those provider schemas.

import { z } from "zod";

export const TOKEN_PROVENANCES = ["measured", "estimated", "unrecorded"] as const;
export type TokenProvenance = (typeof TOKEN_PROVENANCES)[number];
export const tokenProvenanceSchema = z.enum(TOKEN_PROVENANCES) satisfies z.ZodType<TokenProvenance>;

/** One estimate makes a combined total approximate; measured wins only over absence. */
export function combineTokenProvenance(left: TokenProvenance, right: TokenProvenance): TokenProvenance {
  if (left === "estimated" || right === "estimated") {
    return "estimated";
  }
  return left === "measured" || right === "measured" ? "measured" : "unrecorded";
}
