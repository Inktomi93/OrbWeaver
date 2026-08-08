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
import { mergeOnSubmit } from "../../../../../packages/client/src/features/preset/lib/preset-editor-model.ts";

const STORY_PRESET = castId<PresetId>("preset_actionsstoryy");

const SERVER_VALUES: PromptConfig = {
  ...DEFAULT_PROMPT_CONFIG,
  guidedActions: {
    ...DEFAULT_GUIDED_ACTIONS,
    impersonate: { prompt: "Write {{user}}'s next line. {{input}}", role: "user", depth: 2 },
  },
};

const StoryForm = createAutosaveEntityForm<PromptConfig>({ defaultValues: DEFAULT_PROMPT_CONFIG });

function ActionsBody({
  session,
  saved,
  savedFraming,
}: {
  readonly session: AutosaveSession<PromptConfig>;
  readonly saved: string;
  readonly savedFraming: string;
}): ReactElement {
  const form = session.form as AppFormInstance<PromptConfig>;
  return (
    <>
      {/* Both spies carry an accessible NAME: a second bare `<output>` turned every `locator("output")` in
          the CT into a strict-mode violation. Name them and each assertion says which half it reads. */}
      <output aria-label="saved delivery">{`saved=${saved}`}</output>
      {/* The framing rows write a RECORD (`prose[<slot id>]`), not a string field, so the save spy has to
          echo that half separately or an edit could "save" into nothing and still read green. */}
      <output aria-label="saved framing">{`framing=${savedFraming}`}</output>
      <ActionsView
        form={form}
        onSelectSection={(): void => {
          /* the cross-link's target lives in the Prompt view; this story only mounts Actions */
        }}
      />
    </>
  );
}

const FORKED_PRESET = castId<PresetId>("preset_actionsforkedxx");

/** The FORK-RETARGET seam, isolated (IA §2.6): the production `PresetForm` is keyed `entityId={presetId}`,
 *  and the built-in's copy-on-write retarget swaps that id mid-edit — remounting the entire keyed session.
 *  The story reproduces exactly that seam (same boundary, same keyed remount); the CT pins that the OPEN
 *  drill-in survives it. The trigger + the entity echo are test chrome around the REAL view. */
export function ActionsForkStory(): ReactElement {
  const [entity, setEntity] = useState<PresetId>(STORY_PRESET);
  return (
    <ToastProvider>
      <button onClick={(): void => setEntity(FORKED_PRESET)} type="button">
        simulate fork retarget
      </button>
      <output>{`entity=${entity}`}</output>
      <StoryForm entityId={entity} save={(): Promise<void> => Promise.resolve()} serverValues={SERVER_VALUES}>
        {(session): ReactElement => <ActionsBody saved="—" savedFraming="—" session={session} />}
      </StoryForm>
      <Toaster />
    </ToastProvider>
  );
}

export function ActionsStory(): ReactElement {
  const [saved, setSaved] = useState("—");
  const [savedFraming, setSavedFraming] = useState("—");
  const save = (values: PromptConfig): Promise<void> => {
    // THROUGH `mergeOnSubmit`, exactly as `use-preset-autosave` does before it hits the wire. The spy read
    // the RAW form values until 2026-08-07 and that made it lie about the two things this surface most needs
    // proven: the framing trim and the drop-the-blank both happen at SUBMIT, not at the keystroke, so a spy
    // reading pre-normalization bytes cannot see either.
    const persisted = mergeOnSubmit(values, SERVER_VALUES);
    const impersonate = persisted.guidedActions?.impersonate;
    setSaved(`${impersonate?.role ?? "?"}@${String(impersonate?.depth ?? "tail")}`);
    // The whole record, not just the text: a framing edit that forgot to stamp `baseVersion` would still
    // round-trip a string, and the staleness signal is the entire point of storing one. `|` delimits the text
    // so a CT can assert an exact edge (a trailing space is invisible in a substring match otherwise).
    const frame = persisted.prose["chat.injection.userNote"];
    setSavedFraming(frame === undefined ? "unset" : `|${frame.text}|@v${String(frame.baseVersion)}`);
    return Promise.resolve();
  };
  return (
    <ToastProvider>
      <StoryForm entityId={STORY_PRESET} save={save} serverValues={SERVER_VALUES}>
        {(session): ReactElement => <ActionsBody saved={saved} savedFraming={savedFraming} session={session} />}
      </StoryForm>
      <Toaster />
    </ToastProvider>
  );
}
