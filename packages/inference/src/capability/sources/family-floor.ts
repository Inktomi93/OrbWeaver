// The ADD-ONLY tier (§6.2): applied AFTER declared/measured/advertised/curated with OR semantics — it adds,
// never subtracts. Today's `synthesizeToolAxes` (`resolve-model-capability.ts:250-263`): OpenRouter's catalog
// omits `structured_outputs` for Claude, and a Claude NEWER than every curated row must not read as LESS
// capable than the family, so a recognised Claude id gets tools + structured + image input OR-ed in. A data
// row cannot express "add, never subtract", which is why this stays code, keyed by `families.ts`.

import type { GenerationCapability } from "@orb/contracts/inference";
import type { ModelFamily } from "../families.ts";

interface FamilyFloor {
  readonly parallelTools: boolean;
  readonly structured: boolean;
  readonly imageInput: boolean;
}

/** Keyed by `ModelFamily` so a new family is a `tsc` error here. Only anthropic carries a floor: every
 *  curated Claude row declares all three (the derivation `CLAUDE_CAPABILITY_FLOOR` used to make), and
 *  capability does not regress across Claude versions. */
const FAMILY_FLOORS: Record<ModelFamily, FamilyFloor | null> = {
  anthropic: { parallelTools: true, structured: true, imageInput: true },
  openai: null,
  google: null,
  meta: null,
  deepseek: null,
  qwen: null,
  mistral: null,
  xai: null,
  other: null,
};

export function applyFamilyFloor(family: ModelFamily, capability: GenerationCapability): GenerationCapability {
  const floor = FAMILY_FLOORS[family];
  if (floor === null) {
    return capability;
  }
  return {
    ...capability,
    input: floor.imageInput && !capability.input.includes("image") ? [...capability.input, "image"] : capability.input,
    tools: capability.tools ?? (floor.parallelTools ? { parallel: true } : undefined),
    output: { ...capability.output, structured: capability.output.structured === true || floor.structured },
  };
}
