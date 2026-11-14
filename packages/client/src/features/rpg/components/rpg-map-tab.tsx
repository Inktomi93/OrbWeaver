// The MAP tab body (RV-7): the one phase-locked tab's planned-feature state. The strip keeps the tab
// focusable and openable (`aria-disabled` is never set), so this body says plainly what is planned
// instead of rendering a blank panel. It names no timing and no unlock: the map program is parked.

import { EmptyState } from "@orb/ui/empty-state";
import { Icon, MapIcon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { Kicker } from "./rpg-kicker.tsx";

/** The Map lock's one sentence: the tab's `title` reason and this body's heading. */
export const RPG_MAP_PLANNED = "Maps are planned";

/** The locked Map viewport: what is planned, stated plainly. */
export function RpgMapTab(): ReactElement {
  return (
    <Stack gap="section" data-slot="rpg-map-tab">
      <Kicker>Map</Kicker>
      {/* No action: the map program is parked, so no verb here moves it forward. */}
      <EmptyState
        action={null}
        description="A map of the places the story has named and where you are among them. It is not built yet."
        icon={<Icon icon={MapIcon} size="lg" />}
        title={RPG_MAP_PLANNED}
      />
    </Stack>
  );
}
