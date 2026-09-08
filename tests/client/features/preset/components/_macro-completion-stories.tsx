// CT story module for the USER-MACRO COMPLETION union (a CT only mounts from a NON-test module,
// Spine-Testing §7). Three REAL preset surfaces, all bound to ONE `PromptConfig` whose `userMacros` holds a
// single macro — the point being that the plane rides the form instance, so every prompt-text field in the
// editor can offer it: the section body (Prompt view), the guided template (Actions view), and the macro
// editor itself (Macros tab, where a macro completes its siblings).
//
// The macro is deliberately named so no builtin is a fuzzy match for its prefix — a popover row proving the
// plane landed must not be satisfiable by the builtin catalog alone.

import type { AppFormInstance, AutosaveSession } from "@orb/client/forms/editor";
import { createAutosaveEntityForm } from "@orb/client/forms/editor";
import type { PromptConfig, PromptSection, UserMacroSpec } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Toaster, ToastProvider } from "@orb/ui/toast";
import type { ReactElement } from "react";
import { ActionsView } from "../../../../../packages/client/src/features/preset/components/actions-view.tsx";
import { PresetStructureTabs } from "../../../../../packages/client/src/features/preset/components/preset-structure-tabs.tsx";
import { UserMacrosTab } from "../../../../../packages/client/src/features/preset/components/user-macros-tab.tsx";

const STORY_PRESET = castId<PresetId>("preset_macrounionsy");

const SCENE_TONE: UserMacroSpec = {
  name: "sceneTone",
  description: "This game's tonal register.",
  args: [],
  body: "hushed",
  inputs: [],
  strict: false,
};

const SECTIONS: PromptSection[] = [{ type: "literal", id: "sec_a", name: "Alpha", role: "system", content: "", enabled: true }];

const SERVER_VALUES: PromptConfig = { ...DEFAULT_PROMPT_CONFIG, sections: SECTIONS, userMacros: [SCENE_TONE] };

const StoryForm = createAutosaveEntityForm<PromptConfig>({ defaultValues: DEFAULT_PROMPT_CONFIG });

const noSave = (): Promise<void> => Promise.resolve();

/** One mount of the boundary over the shared fixture — every story differs only in the body it renders. */
function MacroPlaneStory({ children }: { readonly children: (form: AppFormInstance<PromptConfig>) => ReactElement }): ReactElement {
  return (
    <ToastProvider>
      <StoryForm entityId={STORY_PRESET} save={noSave} serverValues={SERVER_VALUES}>
        {(session: AutosaveSession<PromptConfig>): ReactElement => children(session.form as AppFormInstance<PromptConfig>)}
      </StoryForm>
      <Toaster />
    </ToastProvider>
  );
}

/** The Prompt view — drill into the literal section and its BODY is a prompt-text field. */
export function SectionBodyCompletionStory(): ReactElement {
  return <MacroPlaneStory>{(form): ReactElement => <PresetStructureTabs form={form} presetId={STORY_PRESET} tab="prompt" />}</MacroPlaneStory>;
}

/** The Actions view — a guided template's editor is the same kind of field, one view over. */
export function TemplateCompletionStory(): ReactElement {
  return (
    <MacroPlaneStory>
      {(form): ReactElement => (
        <ActionsView
          form={form}
          onSelectSection={(): void => {
            /* the cross-link's target lives in the Prompt view; this story only mounts Actions */
          }}
        />
      )}
    </MacroPlaneStory>
  );
}

/** The Macros tab — the editor dialog's template body, where the plane being edited IS the plane offered. */
export function UserMacroBodyCompletionStory(): ReactElement {
  return <MacroPlaneStory>{(form): ReactElement => <UserMacrosTab form={form} presetId={STORY_PRESET} />}</MacroPlaneStory>;
}
