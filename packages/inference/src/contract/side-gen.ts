// The side-generation sampling vocabulary: what the fold in `funnel/resolve-side-gen.ts` reads and returns.

import type { RolePresetParams } from "@orb/contracts/preset";
import type { ResolvedReasoning } from "./resolve.ts";

/** A role's preset params, a task posture, or the folded result: only the fields a non-chat role takes from a
 *  preset (`ROLE_PRESET_FIELDS`). Each optional; absent means the next source or the runner default stands. */
export type SideGenSampling = RolePresetParams;

/** What a side-generation call sends for reasoning: the resolved reasoning, and the output cap that leaves room
 *  for it. `maxTokens` is the caller's visible budget when the call does not reason. */
export interface SideGenReasoning {
  readonly reasoning: ResolvedReasoning;
  readonly maxTokens: number | undefined;
}
