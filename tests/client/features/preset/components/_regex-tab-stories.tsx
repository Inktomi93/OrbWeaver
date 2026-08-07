// CT story module for the preset editor's REGEX tab (Spine-Testing §7 — a CT mounts ONLY from a non-test
// module). The tab is not on the feature's front door (the editor surface owns it), so it is imported by
// path, the `_actions-stories.tsx` precedent in this directory.
//
// TWO STORIES, one axis: `attachable`. It is the SAME fact the CONTEXT readout takes
// (`TransformsReadout.attachable`) — a preset that cannot hold attachments is the BUILT-IN DEFAULT, whose
// `ownerId` is null and whose attachment read `ensurePresetOwned` refuses by construction. The tab used to
// ask anyway and print a Retry that could never work, 400px from a readout answering "off" for the same
// eight stages.

import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { RegexTab } from "../../../../../packages/client/src/features/preset/components/regex-tab.tsx";
import { CtDataProviders } from "../../../../support/ct/ct-data-providers.tsx";

const STORY_PRESET = castId<PresetId>("preset_ct_regextabbbbbb");

/** An OWNED preset: the tab is the real picker over the owner's library. */
export function RegexTabAttachableStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 720 }}>
        <RegexTab attachable={true} presetId={STORY_PRESET} />
      </div>
    </CtDataProviders>
  );
}

/** The BUILT-IN DEFAULT: the preset every new user has selected. Nothing may be asked of the server here. */
export function RegexTabSystemDefaultStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 720 }}>
        <RegexTab attachable={false} presetId={STORY_PRESET} />
      </div>
    </CtDataProviders>
  );
}
