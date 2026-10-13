import { IMAGERY_NEGATIVE_SLOT_ID } from "@orb/contracts/imagery";
import { resolveProseText } from "@orb/contracts/prose";
import { resolveImageryCaption, resolveImageryTemplate } from "@orb/contracts/settings";
import type { ImageryInstructionDeps, ImageryInstructionOps } from "../contract/generation-ops.ts";

export function createImageryInstructions(deps: ImageryInstructionDeps): ImageryInstructionOps {
  return {
    resolvePromptTemplate: async (runAs, mode) => resolveImageryTemplate((await deps.loadUserSettings(runAs.userId)).imagery, mode),
    resolveCaptionInstruction: async (runAs, mode) => resolveImageryCaption((await deps.loadUserSettings(runAs.userId)).imagery, mode),
    resolveNegativeBase: async (runAs) => resolveProseText(IMAGERY_NEGATIVE_SLOT_ID, (await deps.loadUserSettings(runAs.userId)).prose),
  };
}
