// The MAP tab body (RV-7) — the ONE phase-locked tab's COMING-SOON presentation, per the mock (`map.html`).
// The strip marks the tab `aria-disabled` with its reason on `title` (PHASE law: a locked tab teaches the
// roadmap, an omitted tab teaches nothing) — but `aria-disabled` deliberately keeps it focusable AND
// clickable, so the viewport still opens. It used to render nothing: a lock glyph and then a blank panel,
// which reads as breakage rather than as a promise. This is the honest empty state for a feature that does
// not exist yet: what unlocks, what it grows out of (the waystone in the band above — the map arc's seed),
// and when.

import { Icon, MapIcon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { Kicker } from "./rpg-kicker.tsx";

/** The locked Map viewport — the promise, stated. */
export function RpgMapTab(): ReactElement {
  return (
    <Stack gap="section" data-slot="rpg-map-tab">
      <Kicker>Map</Kicker>
      <Stack gap="block" align="center" className="rounded-base border border-border border-dashed bg-card px-block py-section text-center">
        <Icon icon={MapIcon} size="lg" className="text-muted-foreground" aria-hidden={true} />
        <Text voice="label">Maps unlock with the map arc</Text>
        <Text voice="gloss">
          The waystone above is the seed — when the arc lands, it opens into the region map here: the places the story has named, where you are, and the fog it
          hasn't cleared. Until then it keeps the sky.
        </Text>
        {/* NO TICKET-ID CHIP (side-eye 2026-08-06 P3). "arrives with MA-3" was the only line here written
            for the people who write the roadmap rather than the people who play: the prose above already
            says what unlocks it and what it grows out of, and an internal arc id adds a fact a player
            cannot use, cannot look up, and cannot act on. */}
      </Stack>
    </Stack>
  );
}
