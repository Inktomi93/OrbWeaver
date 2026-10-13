import { SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import { resolveSideGenSampling } from "@orb/inference";
import type { CaptionImageDeps } from "../contract/generation-ops.ts";
import type { ImageryContext } from "../contract/service.ts";

export function createCaptionImage(deps: CaptionImageDeps): ImageryContext["captionImage"] {
  return async ({ runAs, instruction, bytes }) => {
    const posture = resolveSideGenSampling(SIDE_GEN_POSTURES.caption, await deps.resolveUtilityPresetParams(runAs.userId));
    const rc = await deps.roleClientsFor(runAs.userId);
    const res = await rc.summarize([{ systemPrompt: instruction, userPrompt: "Describe the attached image.", images: [bytes] }], posture);
    const item = res.items[0];
    return { text: (item?.text ?? "").trim(), costUsd: item?.usage.costUsd ?? null };
  };
}
