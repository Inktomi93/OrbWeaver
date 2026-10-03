// The MAP tab body (RV-7): the one phase-locked tab's planned-feature state. The strip keeps the tab
// focusable and openable (`aria-disabled` is never set), so this body says plainly what is planned
// instead of rendering a blank panel. It names no timing and no unlock: the map program is parked.

import { Icon, MapIcon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { Kicker } from "./rpg-kicker.tsx";

/** The Map lock's one sentence: the tab's `title` reason and this body's heading. */
export const RPG_MAP_PLANNED = "Maps are planned";

/** The locked Map viewport: what is planned, stated plainly. */
export function RpgMapTab(): ReactElement {
  return (
    <Stack gap="section" data-slot="rpg-map-tab">
      <Kicker>Map</Kicker>
      <Stack gap="block" align="center" className="rounded-base border border-border border-dashed bg-card px-block py-section text-center">
        <Icon icon={MapIcon} size="lg" className="text-muted-foreground" aria-hidden={true} />
        <Text voice="label">{RPG_MAP_PLANNED}</Text>
        <Text voice="gloss">A map of the places the story has named and where you are among them. It is not built yet.</Text>
      </Stack>
    </Stack>
  );
}
