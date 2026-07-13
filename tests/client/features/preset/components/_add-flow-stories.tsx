// CT story module for the Variables/Regex Add-flow off-by-one (BUILD-SPEC §8; the P0 1a fix). A CT only
// mounts from a NON-test module (Spine-Testing §7). Each story builds a REAL preset form via the factory
// and renders the actual tab, so the Add→edit→Done flow exercises the real `onAdd` index capture: the bug
// was `setEditIndex(values.X.length)` read AFTER the synchronous push (= one PAST the new item) → the
// editor wrote a fresh object at an out-of-bounds index, leaving the pushed item unedited (a phantom row).

import { createSavedEntityForm } from "@orb/client/forms";
import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { RegexTab } from "../../../../../packages/client/src/features/preset/components/regex-tab";
import { VariablesTab } from "../../../../../packages/client/src/features/preset/components/variables-tab";

const STORY_PRESET = castId<PresetId>("preset_addflowstoryy");

const useStoryForm = createSavedEntityForm<PromptConfig>({
  defaultValues: DEFAULT_PROMPT_CONFIG,
  save: (values: PromptConfig): Promise<PromptConfig> => Promise.resolve(values),
});

/** The Variables tab wired to a real, empty-variables form — drives the actual add→edit→Done path. */
export function VariablesTabStory(): ReactElement {
  const { form } = useStoryForm({
    entityId: STORY_PRESET,
    serverValues: { ...DEFAULT_PROMPT_CONFIG, variables: [] },
  });
  return <VariablesTab form={form} />;
}

/** The Regex tab wired to a real, empty-scripts form — drives the actual add→edit→Done path. */
export function RegexTabStory(): ReactElement {
  const { form } = useStoryForm({
    entityId: STORY_PRESET,
    serverValues: { ...DEFAULT_PROMPT_CONFIG, regexScripts: [] },
  });
  return <RegexTab form={form} />;
}
