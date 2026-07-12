// The preset EDITOR form (W10 Panel A · UI-Primitives §13.4 — a many-field editor → `createSavedEntityForm`).
// A BUTTON-GATED editor that binds the nested `PromptConfig` DIRECTLY (TanStack Form nested-path binding —
// `name="params.temperature"`), so the form's value shape IS `PromptConfig`. There is NO flat
// `PresetFormValues` and NO mapper (both deleted — preset-form-mapper-elimination.md). The surface's Save
// calls `form.handleSubmit()` → the call-time `save` (the preset-editor-surface seam, closing over the
// live tRPC client + the preset id + the loaded server config for the merge-on-submit).
//
// The mount seed is `seedConfig(server)` (preset-editor-model.ts — every nested block present so each path
// binds); on submit the surface runs `mergeOnSubmit(edited, server)` so server-only fields survive and
// all-default blocks round-trip to unset.

import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { createSavedEntityForm } from "#forms";

export const usePresetForm = createSavedEntityForm<PromptConfig>({
  defaultValues: DEFAULT_PROMPT_CONFIG,
});
