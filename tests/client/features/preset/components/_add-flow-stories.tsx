// CT story module for the Variables/Regex Add-flow off-by-one (BUILD-SPEC §8; the P0 1a fix) AND the D78
// §10 CT-4 array-op persistence: structural `pushFieldValue`/`removeFieldValue` autosave through the
// BOUNDARY's store driver (D78 §3) with ZERO call-site flush — the story mounts the REAL tab through the
// session boundary over a real save spy and mirrors the last-saved array length + save count to `<output>`s
// so the CT can assert add AND remove PERSIST. A CT only mounts from a NON-test module (Spine-Testing §7).

import type { AppFormInstance } from "@orb/client/forms";
import { createAutosaveEntityBoundary } from "@orb/client/forms";
import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { RegexTab } from "../../../../../packages/client/src/features/preset/components/regex-tab";
import { VariablesTab } from "../../../../../packages/client/src/features/preset/components/variables-tab";

const STORY_PRESET = "preset_addflowstoryy";

const StoryForm = createAutosaveEntityBoundary<PromptConfig>({ defaultValues: DEFAULT_PROMPT_CONFIG });

/** Mirror the last-saved array length + save count so the CT can prove the store driver persisted (CT-4). */
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

/** The Variables tab wired to a real, empty-variables AUTOSAVE boundary — drives the actual add/remove path
 *  and asserts the store driver persisted via the mirrored save spy (no call-site flush). */
export function VariablesTabStory(): ReactElement {
  const { save, saves, savedLen } = usePersistenceSpy((c) => c.variables.length);
  return (
    <StoryForm entityId={STORY_PRESET} serverValues={{ ...DEFAULT_PROMPT_CONFIG, variables: [] }} save={save}>
      {(session): ReactElement => (
        <>
          <output>{`saves=${saves} savedLen=${savedLen}`}</output>
          <VariablesTab form={session.form as AppFormInstance<PromptConfig>} />
        </>
      )}
    </StoryForm>
  );
}

/** The Regex tab wired to a real, empty-scripts AUTOSAVE boundary — drives the actual add/remove path. */
export function RegexTabStory(): ReactElement {
  const { save, saves, savedLen } = usePersistenceSpy((c) => c.regexScripts.length);
  return (
    <StoryForm entityId={STORY_PRESET} serverValues={{ ...DEFAULT_PROMPT_CONFIG, regexScripts: [] }} save={save}>
      {(session): ReactElement => (
        <>
          <output>{`saves=${saves} savedLen=${savedLen}`}</output>
          <RegexTab form={session.form as AppFormInstance<PromptConfig>} />
        </>
      )}
    </StoryForm>
  );
}
