// CT story module for the section-inspector ⋯ actions menu (north-star §2/§6.2 + D78 §10 CT-4). A CT only
// mounts from a NON-test module (Spine-Testing §7). This composes the REAL cross-region shape: a publisher
// owns a real AUTOSAVE preset form through the session BOUNDARY, publishes it to THE FORM BRIDGE + drives
// the selection store; the sibling `PresetSectionInspector` reads both. The Delete lives in the header ⋯
// menu, ConfirmDialog-wired (the recoverable undo-toast retired at §6.2), and Duplicate/Move sit beside it.
// Every structural array op persists through the BOUNDARY's store driver (D78 §3) — ZERO call-site flush.
// A `<output>` mirrors the live form's section ids AND the last-saved count so the CT asserts the mutation
// AND its persistence.

import type { AppFormInstance, AutosaveSession } from "@orb/client/forms";
import { createAutosaveEntityBoundary } from "@orb/client/forms";
import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Toaster, ToastProvider } from "@orb/ui/toast";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { PresetSectionInspector } from "../../../../../packages/client/src/features/preset/components/preset-section-inspector";
import { clearAssemblyForm, publishAssemblyForm } from "../../../../../packages/client/src/features/preset/lib/preset-editor-bridge";
import { clearPresetSection, selectPreset, selectPresetSection } from "../../../../../packages/client/src/state";

const STORY_PRESET = castId<PresetId>("preset_delundostoryy");

// `sec_del` sits in the MIDDLE (index 1 of 3): a middle target is the only fixture that distinguishes a
// duplicate/insert-at-index from an append-to-end (identical for the tail).
const SECTIONS: PromptSection[] = [
  { type: "literal", id: "sec_a", name: "Alpha", role: "system", content: "a", enabled: true },
  { type: "literal", id: "sec_del", name: "DeleteMe", role: "system", content: "d", enabled: true },
  { type: "literal", id: "sec_z", name: "Zeta", role: "system", content: "z", enabled: true },
];

const StoryForm = createAutosaveEntityBoundary<PromptConfig>({ defaultValues: DEFAULT_PROMPT_CONFIG });

/** Publishes the boundary session's form to the bridge, selects preset + the `sec_del` section, and mirrors
 *  the live section-id order + the last-saved section count for the CT to assert against. */
function DeleteUndoBody({ session, savedCount }: { readonly session: AutosaveSession<PromptConfig>; readonly savedCount: number }): ReactElement {
  const form = session.form as AppFormInstance<PromptConfig>;
  useEffect(() => {
    publishAssemblyForm({ presetId: STORY_PRESET, form });
    selectPreset(STORY_PRESET);
    selectPresetSection("sec_del");
    return (): void => clearAssemblyForm();
  }, [form]);
  return (
    <form.Subscribe selector={(state): readonly PromptSection[] => state.values.sections}>
      {(sections): ReactElement => <output>{`ids=${sections.map((s) => s.id).join(",")} savedCount=${savedCount}`}</output>}
    </form.Subscribe>
  );
}

/** The cross-sibling story: publisher (CONTENT) + inspector (CONTEXT), wrapped in the toast provider (the
 *  ConfirmDialog + any toast render inside it). `onDismiss` is the bare selection-clear. The boundary's store
 *  driver persists the delete/duplicate/move — the CT reads `savedCount` off the save spy. */
export function DeleteUndoStory(): ReactElement {
  const [savedCount, setSavedCount] = useState(-1);
  const save = (values: PromptConfig): Promise<void> => {
    setSavedCount(values.sections.length);
    return Promise.resolve();
  };
  return (
    <ToastProvider>
      <StoryForm entityId={STORY_PRESET} serverValues={{ ...DEFAULT_PROMPT_CONFIG, sections: [...SECTIONS] }} save={save}>
        {(session): ReactElement => <DeleteUndoBody session={session} savedCount={savedCount} />}
      </StoryForm>
      <PresetSectionInspector onDismiss={clearPresetSection} />
      <Toaster />
    </ToastProvider>
  );
}
