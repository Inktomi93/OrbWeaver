// domain/refinery/substrate/stage-resolution — the FIXED per-stage wire grammar and sampling posture the stage
// engine, `testSchema` and the score sweep share. The custom-schema arm reads its row in
// `persistence/stage-resolution.ts`.

import type { SideGenKind } from "@orb/contracts/preset";
import type { RefineryStage } from "@orb/contracts/refinery";
import { REFINERY_STAGE_PAYLOADS } from "@orb/contracts/refinery";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import { projectJsonSchema } from "@orb/kit/json-schema";

/** The wire grammar per FIXED stage — the SAME schemas the parse validates (D79's one-representation law).
 *  Module-const like distill's: the D126 shaping is the backend's request-build concern, not ours. Homed in
 *  the substrate because THREE callers need the identical grammar (the stage engine, `testSchema`, and the
 *  R4 library score sweep) and a second spelling of a response format is a second wire contract. */
export const REFINERY_RESPONSE_FORMATS: Record<RefineryStage, ResponseFormat> = {
  score: { name: "refinery_score", schema: projectJsonSchema(REFINERY_STAGE_PAYLOADS.score) },
  rewrite: { name: "refinery_rewrite", schema: projectJsonSchema(REFINERY_STAGE_PAYLOADS.rewrite) },
  analyze: { name: "refinery_analyze", schema: projectJsonSchema(REFINERY_STAGE_PAYLOADS.analyze) },
};

/** The side-gen posture each stage samples under; the owner's Utility-role preset params fold over it per call
 *  (D304). Shared with the sweep for the same reason as the formats above. */
export const REFINERY_POSTURE_BY_STAGE: Record<RefineryStage, SideGenKind> = {
  score: "refine_score",
  rewrite: "refine_rewrite",
  analyze: "refine_analyze",
};
