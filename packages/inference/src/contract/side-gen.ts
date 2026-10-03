// The side-generation sampling vocabulary: what the fold in `funnel/resolve-side-gen.ts` reads and returns.

import type { RolePresetParams } from "@orb/contracts/preset";

/** A role's preset params, a task posture, or the folded result: only the fields a non-chat role takes from a
 *  preset (`ROLE_PRESET_FIELDS`). Each optional; absent means the next source or the runner default stands. */
export type SideGenSampling = RolePresetParams;
