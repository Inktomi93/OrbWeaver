// CT story module for the preset editor's DELIVERY tab (the Transforms view's wire-shaping head). A CT only
// mounts from a NON-test module (Spine-Testing §7), and this module exports COMPONENTS ONLY — playwright-ct
// rewrites named imports into generated component consts, and a mixed component+constant import fails to
// parse.
//
// TWO STORIES, ONE AXIS: the PANE WIDTH. Side-eye 2026-08-22 P2-5 is a range property — the two selects here
// dock into `--width-control-col`, a FIXED 200px track (UIP-404), which does not grow with the pane, so a
// label that overflows it overflows at EVERY width above the `@max-md` fold. The narrow arm is the docked
// pane the finding was measured at (568px) and the wide arm is the both-panels-hidden pane (1224px); a pin
// that took only one of them would be the point measurement that let this through the first time.
//
// The tab is not on the feature's front door (the editor surface owns it), so it is imported by path — the
// `_regex-tab-stories.tsx` precedent in this directory.

import type { AppFormInstance } from "@orb/client/forms/editor";
import { createAutosaveEntityForm } from "@orb/client/forms/editor";
import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { PresetStructureTabs } from "../../../../../packages/client/src/features/preset/components/preset-structure-tabs.tsx";

const STORY_PRESET = castId<PresetId>("preset_ct_deliveryyyy");
const StoryForm = createAutosaveEntityForm<PromptConfig>({ defaultValues: DEFAULT_PROMPT_CONFIG });

/** `content` is the LONGEST names-behavior option and the one the finding measured truncating. Seeded as a
 *  stored value so the trigger renders the picked label rather than its placeholder. */
const SEEDED: PromptConfig = { ...DEFAULT_PROMPT_CONFIG, namesBehavior: "content" };

function Harness({ width }: { readonly width: number }): ReactElement {
  return (
    <div style={{ width }}>
      <StoryForm entityId={STORY_PRESET} serverValues={SEEDED} save={async (): Promise<void> => undefined}>
        {(session): ReactElement => <PresetStructureTabs form={session.form as AppFormInstance<PromptConfig>} presetId={STORY_PRESET} tab="delivery" />}
      </StoryForm>
    </div>
  );
}

/** The DOCKED pane — both shell panels open (the arm the finding was measured at). */
export function DeliveryTabNarrowStory(): ReactElement {
  return <Harness width={568} />;
}

/** The both-panels-hidden pane. The control column is FIXED, so the extra 656px goes to the gutter and the
 *  trigger is no wider here than it is above — which is exactly why this arm has to be pinned too. */
export function DeliveryTabWideStory(): ReactElement {
  return <Harness width={1224} />;
}
