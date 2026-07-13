// The preset editor form — a button-gated editor binding the nested `PromptConfig` directly, so the
// form's value shape IS `PromptConfig` (no flat mapper). The mount seed is `seedConfig(server)`; on
// submit the surface runs `mergeOnSubmit(edited, server)`.

import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { createSavedEntityForm } from "#forms";

export const usePresetForm = createSavedEntityForm<PromptConfig>({
  defaultValues: DEFAULT_PROMPT_CONFIG,
});
