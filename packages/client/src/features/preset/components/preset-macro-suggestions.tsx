// The completion catalog every PROMPT-TEXT field of the preset editor offers — the builtins PLUS the macros
// this preset itself declares (`PromptConfig.userMacros`, owner ruling #20's preset half). A section body and
// a guided template are exactly where a user macro is meant to be CALLED, so a popover that knew only the
// builtins was advertising half the vocabulary the turn resolves.
//
// A RENDER PROP over `form.Subscribe`, not a hook: the catalog depends on form STATE, and TanStack's
// subscription is what keeps the re-render to the fields that use it (a macro added on the Macros tab shows
// up in the section bodies without re-rendering the editor). The array TanStack hands back is identity-stable
// until the list changes, which is what makes `macroCatalog`'s memo — and behind it `<MacroTextarea>`'s
// identity-keyed fuzzy index — pay off instead of rebuilding on every keystroke.

import type { UserMacroSpec } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import type { MacroSuggestion } from "@orb/ui/macro-textarea";
import type { ReactElement } from "react";
import { usePluginMacroPlanes } from "#data";
import type { AppFormInstance } from "#forms/editor";
import { macroCatalog } from "#lib";
import type { PresetEditorValues } from "../lib/preset-editor-values.ts";

export interface PresetMacroSuggestionsProps {
  readonly form: AppFormInstance<PresetEditorValues>;
  /** The preset being edited: the source ref of the macros this form declares. */
  readonly presetId: PresetId;
  readonly children: (suggestions: readonly MacroSuggestion[]) => ReactElement;
}

/** Subscribes to this preset's `userMacros` and hands the composed catalog to its child field. */
export function PresetMacroSuggestions({ form, presetId, children }: PresetMacroSuggestionsProps): ReactElement {
  const pluginPlanes = usePluginMacroPlanes();
  return (
    <form.Subscribe selector={(state): readonly UserMacroSpec[] => state.values.userMacros}>
      {(userMacros): ReactElement =>
        children(macroCatalog({ source: { kind: "preset", id: presetId }, current: true, defs: userMacros }, pluginPlanes).suggestions)
      }
    </form.Subscribe>
  );
}
