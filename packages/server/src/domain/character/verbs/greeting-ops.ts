// Resolve the caller's prompt material and live funding on every greeting, after the verb's ownership gate.

import { DEFAULT_GUIDED_ACTIONS, SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import { resolveSideGenSampling } from "@orb/inference";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { GreetingCompletionDeps, GreetingTemplateDeps } from "../contract/greeting-ops.ts";
import type { CharacterContext } from "../contract/service.ts";

export function createGreetingTemplate(deps: GreetingTemplateDeps): CharacterContext["resolveGreetingTemplate"] {
  return async ({ caller, kind }) => {
    const defaultPresetId = await deps.readDefaultPresetId(caller);
    const fallback = DEFAULT_GUIDED_ACTIONS[kind].prompt;
    if (defaultPresetId === null) {
      return { template: fallback, prose: {} };
    }
    const config = await deps.readPresetConfig(caller.userId, castId<PresetId>(defaultPresetId));
    if (config === null) {
      return { template: fallback, prose: {} };
    }
    return { template: config.guidedActions?.[kind].prompt ?? fallback, prose: config.prose };
  };
}

export function createGreetingCompletion(deps: GreetingCompletionDeps): CharacterContext["generateGreetingText"] {
  return async ({ caller, prompt }) => {
    const presetParams = await deps.resolveUtilityPresetParams(caller.userId);
    const posture = resolveSideGenSampling(SIDE_GEN_POSTURES.greeting_studio, presetParams);
    const rc = await deps.roleClientsFor(caller.userId);
    const res = await rc.summarize([{ systemPrompt: prompt, userPrompt: "" }], posture);
    const item = res.items[0];
    return { text: (item?.text ?? "").trim(), costUsd: item?.usage.costUsd ?? null };
  };
}
