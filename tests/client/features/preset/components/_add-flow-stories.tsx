// CT story module for the Variables/Regex Add-flow off-by-one (BUILD-SPEC §8; the P0 1a fix) AND the §7
// AUTOSAVE array-trap: structural `pushFieldValue`/`removeFieldValue` do NOT fire the onChange listener, so
// the tab must flush explicitly — the story mounts the REAL tab over a real AUTOSAVE form and mirrors the
// last-saved array length + save count to `<output>`s so the CT can assert add AND remove PERSIST. A CT only
// mounts from a NON-test module (Spine-Testing §7).

import type { AppFormInstance } from "@orb/client/forms";
import { createAutosaveEntityForm } from "@orb/client/forms";
import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { RegexTab } from "../../../../../packages/client/src/features/preset/components/regex-tab";
import { VariablesTab } from "../../../../../packages/client/src/features/preset/components/variables-tab";

const STORY_PRESET = castId<PresetId>("preset_addflowstoryy");

const useAutosaveStoryForm = createAutosaveEntityForm<PromptConfig>({ defaultValues: DEFAULT_PROMPT_CONFIG });

/** Mirror the last-saved array length + save count so the CT can prove the flush persisted (§7 trap). */
function usePersistenceSpy(read: (config: PromptConfig) => number): {
  save: (values: PromptConfig) => Promise<void>;
  saves: number;
  savedLen: number;
} {
  const [saves, setSaves] = useState(0);
  const [savedLen, setSavedLen] = useState(-1);
  const readRef = useRef(read);
  readRef.current = read;
  const save = (values: PromptConfig): Promise<void> => {
    setSaves((n) => n + 1);
    setSavedLen(readRef.current(values));
    return Promise.resolve();
  };
  return { save, saves, savedLen };
}

/** The Variables tab wired to a real, empty-variables AUTOSAVE form — drives the actual add/remove path
 *  and asserts the flush persisted via the mirrored save spy. */
export function VariablesTabStory(): ReactElement {
  const { save, saves, savedLen } = usePersistenceSpy((c) => c.variables.length);
  const { form } = useAutosaveStoryForm({
    entityId: STORY_PRESET,
    serverValues: { ...DEFAULT_PROMPT_CONFIG, variables: [] },
    save,
  });
  return (
    <>
      <output>{`saves=${saves} savedLen=${savedLen}`}</output>
      <VariablesTab form={form as AppFormInstance<PromptConfig>} />
    </>
  );
}

/** The Regex tab wired to a real, empty-scripts AUTOSAVE form — drives the actual add/remove path. */
export function RegexTabStory(): ReactElement {
  const { save, saves, savedLen } = usePersistenceSpy((c) => c.regexScripts.length);
  const { form } = useAutosaveStoryForm({
    entityId: STORY_PRESET,
    serverValues: { ...DEFAULT_PROMPT_CONFIG, regexScripts: [] },
    save,
  });
  return (
    <>
      <output>{`saves=${saves} savedLen=${savedLen}`}</output>
      <RegexTab form={form as AppFormInstance<PromptConfig>} />
    </>
  );
}
