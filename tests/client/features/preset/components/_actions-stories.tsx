// CT story module for the ACTIONS view (preset-surface-redesign §6.1/§6.6). A CT only mounts from a
// NON-test module (Spine-Testing §7). The REAL view through the session BOUNDARY over a save spy, so the
// registry-derivation and the capability dispatch are exercised as composed, not as unit fragments.
//
// The fixture deliberately CUSTOMIZES one guided template and leaves everything else untouched: the
// Default/Customized chip's derivation ("empty IS the default") is only observable against both states.

import type { AppFormInstance, AutosaveSession } from "@orb/client/forms";
import { createAutosaveEntityForm } from "@orb/client/forms";
import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_GUIDED_ACTIONS, DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Toaster, ToastProvider } from "@orb/ui/toast";
import type { ReactElement } from "react";
import { useState } from "react";
import { ActionsView } from "../../../../../packages/client/src/features/preset/components/actions-view.tsx";

const STORY_PRESET = castId<PresetId>("preset_actionsstoryy");

const SERVER_VALUES: PromptConfig = {
  ...DEFAULT_PROMPT_CONFIG,
  guidedActions: {
    ...DEFAULT_GUIDED_ACTIONS,
    impersonate: { prompt: "Write {{user}}'s next line. {{input}}", role: "user", depth: 2 },
  },
};

const StoryForm = createAutosaveEntityForm<PromptConfig>({ defaultValues: DEFAULT_PROMPT_CONFIG });

function ActionsBody({ session, saved }: { readonly session: AutosaveSession<PromptConfig>; readonly saved: string }): ReactElement {
  const form = session.form as AppFormInstance<PromptConfig>;
  return (
    <>
      <output>{`saved=${saved}`}</output>
      <ActionsView
        form={form}
        onSelectSection={(): void => {
          /* the cross-link's target lives in the Prompt view; this story only mounts Actions */
        }}
      />
    </>
  );
}

export function ActionsStory(): ReactElement {
  const [saved, setSaved] = useState("—");
  const save = (values: PromptConfig): Promise<void> => {
    const impersonate = values.guidedActions?.impersonate;
    setSaved(`${impersonate?.role ?? "?"}@${String(impersonate?.depth ?? "tail")}`);
    return Promise.resolve();
  };
  return (
    <ToastProvider>
      <StoryForm entityId={STORY_PRESET} save={save} serverValues={SERVER_VALUES}>
        {(session): ReactElement => <ActionsBody saved={saved} session={session} />}
      </StoryForm>
      <Toaster />
    </ToastProvider>
  );
}
