// The preset editor AUTOSAVE form (§13.4 · D66 A4 · north-star §7). Binds the nested `PromptConfig`
// directly, so the form's value shape IS `PromptConfig` (no flat mapper); the mount seed is
// `seedConfig(server)` and on submit the surface runs `mergeOnSubmit(edited, server)`. `save` closes over
// the live tRPC client at the call site (preset-editor-surface.tsx) — unreachable at module scope.
//
// NO draft crash-mirror: on autosave the server row IS the mirror (a confirmed patch lands within the
// debounce), and the preset form carries no validators, so there is no long-invalid window a mirror would
// guard — the character-card precedent (obligation-5).
//
// WIDENED back to the full AppFormInstance: the editor threads `form` into the rack / inspector / body /
// structure-tab children (several outside this slice) typed against `AppFormInstance<PromptConfig>`, and
// the autosave factory omits `reset` from its return TYPE only. Widening once here keeps the autosave
// conversion from rippling a type change into every consumer. Reset-to-starter never calls `form.reset`
// (the autosave isDirty loop) — the surface remounts on a nonce to reseed from the freshly-written row.

import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { AppFormInstance, AutosaveEntityFormArgs, AutosaveSaveState } from "#forms";
import { createAutosaveEntityForm } from "#forms";

const useAutosavePresetForm = createAutosaveEntityForm<PromptConfig>({
  defaultValues: DEFAULT_PROMPT_CONFIG,
});

export function usePresetForm(args: AutosaveEntityFormArgs<PromptConfig>): {
  form: AppFormInstance<PromptConfig>;
  mountKey: string;
  saveState: AutosaveSaveState;
  retrySave: () => void;
} {
  const { form, mountKey, saveState, retrySave } = useAutosavePresetForm(args);
  return { form: form as AppFormInstance<PromptConfig>, mountKey, saveState, retrySave };
}
