// @orb/server/kit/side-gen-posture — the node-side SEAM MAPPER for a resolved side-gen sampling posture.
//
// The pure ladder + fold live in `@orb/kit/side-gen-posture` (isomorphic). This server-kit sibling owns the
// one impure-adjacent detail: the `summarize` role client's `SummarizeOptions` names the output cap
// `maxTokens`, while the ladder's vocabulary (and `userIntentSchema`'s) is `maxOutputTokens`. Every side-gen
// site that rides the summarize lane (arbitration, extraction, distillation, analysis, /autobg, greeting,
// caption) maps a resolved `SideGenSampling` through here so the field-name translation lives in ONE place
// and an absent knob is OMITTED (never emitted as `undefined` — the backend default stands).

import type { SummarizeOptions } from "@orb/contracts/role-clients";
import type { SideGenSampling } from "@orb/kit/side-gen-posture";

/** Map a resolved side-gen posture onto the summarize role's per-call options: `maxOutputTokens` → `maxTokens`,
 *  `temperature` passthrough. Absent knobs are omitted (an empty posture ⇒ `{}` ⇒ the backend default stands).
 *  `topP` has no summarize-options field today (the role's shape carries `minP`, not `topP`) — it is dropped
 *  at this seam (the no-op knob doctrine; add it here if `SummarizeOptions` grows a `topP`). */
export function toSummarizeOptions(posture: SideGenSampling): SummarizeOptions {
  return {
    ...(posture.temperature !== undefined ? { temperature: posture.temperature } : {}),
    ...(posture.maxOutputTokens !== undefined ? { maxTokens: posture.maxOutputTokens } : {}),
  };
}
