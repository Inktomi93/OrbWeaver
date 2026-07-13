// CT story module for the section-inspector recoverable delete (BUILD-SPEC §3.5; the P0 1b fix). A CT only
// mounts from a NON-test module (Spine-Testing §7). This composes the REAL cross-region shape: a publisher
// owns a real preset form and publishes it to THE FORM BRIDGE + drives the selection store; the sibling
// `PresetSectionInspector` reads both. Delete must offer an Undo toast whose action re-inserts the removed
// section at its original index. A `<output>` mirrors the live form's section ids so the CT can assert the
// deletion AND the restoration (the inspector itself falls to its EmptyState after dismiss).

import { createSavedEntityForm } from "@orb/client/forms";
import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Toaster, ToastProvider } from "@orb/ui/toast";
import type { ReactElement } from "react";
import { useEffect } from "react";
import { PresetSectionInspector } from "../../../../../packages/client/src/features/preset/components/preset-section-inspector";
import {
  clearAssemblyForm,
  publishAssemblyForm,
} from "../../../../../packages/client/src/features/preset/lib/preset-editor-bridge";
import {
  clearPresetSection,
  selectPreset,
  selectPresetSection,
} from "../../../../../packages/client/src/state";

const STORY_PRESET = castId<PresetId>("preset_delundostoryy");

const SECTIONS: PromptSection[] = [
  { type: "literal", id: "sec_a", name: "Alpha", role: "system", content: "a", enabled: true },
  {
    type: "marker",
    id: "sec_hist",
    name: "History",
    marker: "chat_history",
    role: "system",
    enabled: true,
  },
  { type: "literal", id: "sec_del", name: "DeleteMe", role: "system", content: "d", enabled: true },
];

const useStoryForm = createSavedEntityForm<PromptConfig>({
  defaultValues: DEFAULT_PROMPT_CONFIG,
  save: (values: PromptConfig): Promise<PromptConfig> => Promise.resolve(values),
});

/** Owns the real form: publishes it to the bridge, selects preset + the `sec_del` section, and mirrors the
 *  live section-id order for the CT to assert against. */
function DeleteUndoPublisher(): ReactElement {
  const { form } = useStoryForm({
    entityId: STORY_PRESET,
    serverValues: { ...DEFAULT_PROMPT_CONFIG, sections: [...SECTIONS] },
  });
  useEffect(() => {
    publishAssemblyForm({ presetId: STORY_PRESET, form });
    selectPreset(STORY_PRESET);
    selectPresetSection("sec_del");
    return (): void => clearAssemblyForm();
  }, [form]);
  return (
    <form.Subscribe selector={(state): readonly PromptSection[] => state.values.sections}>
      {(sections): ReactElement => <output>{`ids=${sections.map((s) => s.id).join(",")}`}</output>}
    </form.Subscribe>
  );
}

/** The cross-sibling story: publisher (CONTENT) + inspector (CONTEXT), wrapped in the toast provider so the
 *  Undo affordance renders. `onDismiss` is the bare selection-clear (the route adds the mobile-sheet close). */
export function DeleteUndoStory(): ReactElement {
  return (
    <ToastProvider>
      <DeleteUndoPublisher />
      <PresetSectionInspector onDismiss={clearPresetSection} />
      <Toaster />
    </ToastProvider>
  );
}
