// CT story module for the Variables/Regex Add-flow off-by-one (BUILD-SPEC §8; the P0 1a fix) AND the D78
// §10 CT-4 array-op persistence: structural `pushFieldValue`/`removeFieldValue` autosave through the
// BOUNDARY's store driver (D78 §3) with ZERO call-site flush — the story mounts the REAL tab through the
// session boundary over a real save spy and mirrors the last-saved array length + save count to `<output>`s
// so the CT can assert add AND remove PERSIST. A CT only mounts from a NON-test module (Spine-Testing §7).

import type { AppFormInstance } from "@orb/client/forms";
import { createAutosaveEntityForm } from "@orb/client/forms";
import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useState } from "react";
import { ParamsDeck } from "../../../../../packages/client/src/features/preset/components/params-deck.tsx";
import { UserMacrosTab } from "../../../../../packages/client/src/features/preset/components/user-macros-tab.tsx";
import { VariablesTab } from "../../../../../packages/client/src/features/preset/components/variables-tab.tsx";

const STORY_PRESET = castId<PresetId>("preset_addflowstoryy");

const StoryForm = createAutosaveEntityForm<PromptConfig>({ defaultValues: DEFAULT_PROMPT_CONFIG });

/** Mirror the last-saved array length + save count so the CT can prove the store driver persisted (CT-4). */
function usePersistenceSpy(read: (config: PromptConfig) => number): {
  save: (values: PromptConfig) => Promise<void>;
  saves: number;
  savedLen: number;
} {
  const [saves, setSaves] = useState(0);
  const [savedLen, setSavedLen] = useState(-1);
  // `save` closes over `read` DIRECTLY (never a ref-mirrored copy) — this function is recreated fresh
  // every render, same as `read` itself, so there is no stale-closure risk a ref would guard against
  // (react-hooks/refs bans mutating a ref during render).
  const save = (values: PromptConfig): Promise<void> => {
    setSaves((n) => n + 1);
    setSavedLen(read(values));
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

/** The deck's CONTEXT cluster with UNSET compaction config — proves the resolved defaults render (the mode
 *  Select shows the DEFAULT_COMPACTION_MODE placeholder, not a blank trigger; the threshold field carries the
 *  derived default as its blank-means-default placeholder). Item-4 first-paint clarity, re-homed with the
 *  fields themselves (redesign §3: Compaction moved whole into Params ▸ CONTEXT). No capability is passed —
 *  CONTEXT is OUR engine's behavior and renders without a model, which is exactly what this pins. */
export function CompactionTabDefaultsStory(): ReactElement {
  const serverValues: PromptConfig = { ...DEFAULT_PROMPT_CONFIG, params: { ...DEFAULT_PROMPT_CONFIG.params, compaction: undefined } };
  return (
    <StoryForm entityId={STORY_PRESET} serverValues={serverValues} save={(): Promise<void> => Promise.resolve()}>
      {(session): ReactElement => (
        <ParamsDeck capability={undefined} capabilityError={null} effective={undefined} form={session.form as AppFormInstance<PromptConfig>} />
      )}
    </StoryForm>
  );
}

/** The Compaction tab with an explicit non-default mode SET — proves the selected value renders (not the placeholder). */
export function CompactionTabSetStory(): ReactElement {
  const serverValues: PromptConfig = {
    ...DEFAULT_PROMPT_CONFIG,
    params: { ...DEFAULT_PROMPT_CONFIG.params, compaction: { mode: "auto", thresholdPct: 0.72 } },
  };
  return (
    <StoryForm entityId={STORY_PRESET} serverValues={serverValues} save={(): Promise<void> => Promise.resolve()}>
      {(session): ReactElement => (
        <ParamsDeck capability={undefined} capabilityError={null} effective={undefined} form={session.form as AppFormInstance<PromptConfig>} />
      )}
    </StoryForm>
  );
}

/** The Macros tab wired to a real, empty-userMacros AUTOSAVE boundary — drives the actual add/edit/remove
 *  path (WAVE MU) and asserts the store driver persisted via the mirrored save spy (no call-site flush). */
export function UserMacrosTabStory(): ReactElement {
  const { save, saves, savedLen } = usePersistenceSpy((c) => c.userMacros.length);
  return (
    <StoryForm entityId={STORY_PRESET} serverValues={{ ...DEFAULT_PROMPT_CONFIG, userMacros: [] }} save={save}>
      {(session): ReactElement => (
        <>
          <output>{`saves=${saves} savedLen=${savedLen}`}</output>
          <UserMacrosTab form={session.form as AppFormInstance<PromptConfig>} presetId={STORY_PRESET} />
        </>
      )}
    </StoryForm>
  );
}
