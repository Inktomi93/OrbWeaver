// Imagery owns its capability and warning projection; execution retains the runtime's funding semantics.

import type { Resolved } from "@orb/inference";
import { generationOf } from "@orb/inference";
import type { ImageProviderDeps, ImageProviderOps } from "../contract/generation-ops.ts";
import type { ImageryWarning } from "../contract/results.ts";

const IMAGERY_WARNING_CODES = new Set<string>(["image_edit_dropped"]);

function isImageryWarningCode(code: string): code is ImageryWarning["code"] {
  return IMAGERY_WARNING_CODES.has(code);
}

export function createImageProviderOps(deps: ImageProviderDeps): ImageProviderOps {
  return {
    resolveGenerateImage: async (runAs, actor): ReturnType<ImageProviderOps["resolveGenerateImage"]> => {
      const { resolved } = await deps.resolve({ task: "generateImage", principal: runAs, ...(actor !== undefined ? { actor } : {}) });
      return { connection: resolved as Resolved<"generateImage">, capability: generationOf(resolved) };
    },
    generateImage: async (req): ReturnType<ImageProviderOps["generateImage"]> => {
      const result = await deps.generateImage(req);
      return {
        images: result.images,
        model: result.model,
        usage: result.usage,
        warnings: result.warnings.flatMap((w) => (isImageryWarningCode(w.code) ? [{ code: w.code, detail: w.message }] : [])),
      };
    },
  };
}
