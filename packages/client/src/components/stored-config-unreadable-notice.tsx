// THE STANDING STATE "this row's stored config could not be read, so nothing here can be saved" (#1716) —
// one component, both surfaces (the preset editor and the settings pane), because the two used to look
// identical to a user and were identically silent.
//
// WHAT IT REPLACES: a form seeded with SCHEMA DEFAULTS that looked like the user's own settings/preset,
// an autosave chip reading "Saved", and — only once they typed — a generic "couldn't save" carrying a
// Retry that could never succeed. The server refusal was correct and completely invisible.
//
// IT IS NOT AN ALERT AND IT CARRIES NO RETRY. `role="status"` (polite): this is a standing property of the
// stored row, true on arrival and unchanged by anything on screen, so it must not interrupt a screen-reader
// user mid-sentence the way a failed write does. And a retry is the one affordance that would be a lie —
// the bytes are what they are, so the only verbs are the REPAIR DOORS the surface passes in as `doors`
// (`preset.resetToDefault` / import; `settings.resetUserConfig`, #1771).
//
// THE DOORS ARE THE CALLER'S, deliberately: they are per-surface verbs with per-surface confirms, and the
// copy already knows whether replacing the blob is the FIRST door or a destructive last resort
// (`resetIsPrimary` — a `version-from-future` blob is INTACT data an older build cannot represent, and
// resetting it destroys what the newer build stored).

import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import type { UnreadableConfigCopy } from "#lib";

export interface StoredConfigUnreadableNoticeProps {
  /** The words for this surface × this failure cause (`#lib`'s `PRESET_`/`SETTINGS_UNREADABLE_COPY`). */
  readonly copy: UnreadableConfigCopy;
  /** The surface's repair affordances, rendered under the guidance. Omitted where the surface has none. */
  readonly doors?: ReactNode;
}

/** The unreadable-stored-config band. Rendered above the body it applies to, once per surface. */
export function StoredConfigUnreadableNotice({ copy, doors }: StoredConfigUnreadableNoticeProps): ReactElement {
  return (
    <Stack aria-live="polite" data-slot="stored-config-unreadable" gap="tight" role="status">
      {/* `voice="label"` and not `gloss`: this is the sentence that says why the screen below is not your
          data, which the aggregate save footer's own #1099 F25 finding already ruled must not be rendered
          at the bottom of the type ramp. */}
      <Text className="text-destructive" voice="label">
        {copy.headline}
      </Text>
      <Text prose={true} voice="reading">
        {copy.guidance}
      </Text>
      {doors}
    </Stack>
  );
}
