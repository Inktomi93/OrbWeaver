// The rpg HUD BAND — the Waystone composite in the CONTEXT pane's HEAD slot on an engaged game chat (HUD-1
// §3.1/§4/§7, re-shaped by the context bracket #860, owner-ruled 2026-08-30). This file was `rpg-hud.tsx`,
// which owned the pane's WHOLE vertical composition — band → game rail → viewport → ground → admin rail —
// because nobody else did (the F6 defects were unfixable while the band was the shell's, the strips the
// shell's, the bodies the feature's). That column is the SHELL's now (`app-shell/components/context-bracket.tsx`),
// rendered for every tabs pane in every room; the rails and their cells moved with it
// (`context-rail.tsx`, ex-`rpg-hud-rail.tsx`), and what rpg still owns is exactly the one slot a contributor
// may take: the head band. "One slot, three contents — never a second head" is structural, not a convention.
//
// What survives here, unchanged in mechanism:
//   · THE RESERVATION (#149): `rpg.getTrackerView` is a suspending read behind this band's own boundary,
//     and a `null` fallback made the band a bare rule until the tracker landed and then grew ~120-192px,
//     shoving the rail and every tab body down (side-eye-tracker 2026-08-17: a `nonVirtualizedCls` of 0.1143
//     on room open; `[cls] shift 0.1056 … OVER BUDGET` at a coarse pointer). The box is DATA-dependent (how
//     many trackers, orbs and cast chips this game carries), so it cannot be a static token: the height this
//     device MEASURED last time the band settled (the home-tile box-memory mechanism — localStorage, read
//     synchronously, so it is already in the first commit), then a first-ever-open ESTIMATE at the top of the
//     measured range. The estimate deliberately over-reserves: a too-tall reservation SHRINKS when the read
//     lands, and #129-R1 ruled a shrink beats a push.
//   · THE INSTRUMENT TIER (§7.4; UI-Density-Law §3.1 names this exact surface): read-mostly, glanceable,
//     many data per cm². It wraps the BAND here and each game tab BODY at `rpg-context-section.tsx` — never
//     the rails, which are the shell's and must render identically in every room (the ruling's whole point).
//   · The band is DECORATION over the same reads the tab bodies own: on error it collapses to nothing (its
//     own boundary, `renderError → null`) so a failed read is the ONE announced surface in the body.
//   · IT CARRIES NO SELECTION ECHO and NO EMBER EDGE: the kicker on the rail names the selection (the #102
//     re-rule, 2026-08-17), and the 2px content↔context binding is painted by shell.css on the bracket root
//     — the shell's, in every room, taken off a floating pane (north-star N4/P4).
//
// The chat id comes from `#state`'s active-chat pointer, not from a claimant's `S`: the region `band` arm
// deliberately receives nothing, so a claimant's domain state comes from its own hooks (§3.2). The claim
// only holds for a committed game chat, so the pointer is present whenever this renders.

import { Stack, Surface } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import { useActiveChatId } from "#state";
import { RpgHeaderBand } from "./rpg-header-band.tsx";

/** The box-memory key for the HUD's waystone band (#149) — one band, one remembered height per device. */
const RPG_HUD_BAND_BOX = "rpg.hud.band";
/** The FIRST-EVER-open estimate, in CSS px: the top of the band's MEASURED range (side-eye-tracker
 *  2026-08-17 put the async growth at ~120-192px). Deliberately the top, not the middle — an over-tall
 *  reservation shrinks when the read lands, and #129-R1 ruled a shrink beats a push. From the second open
 *  on, this device's own measurement replaces it — since #885 both arms ride `QueryBoundary.reserveKey`
 *  (the `null` fallback reserves the box empty; the settled band is re-measured every commit). */
const RPG_HUD_BAND_FIRST_OPEN_PX = 192;

export function RpgHudBand(): ReactElement | null {
  const chatId = useActiveChatId();
  if (chatId === null) {
    return null;
  }
  return (
    <Surface tier="instrument">
      <Stack data-slot="rpg-hud-band" gap="row">
        <QueryBoundary fallback={null} renderError={(): null => null} reserveBlock={RPG_HUD_BAND_FIRST_OPEN_PX} reserveKey={RPG_HUD_BAND_BOX}>
          <RpgHeaderBand chatId={chatId} />
        </QueryBoundary>
      </Stack>
    </Surface>
  );
}
