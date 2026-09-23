// One game-tab body wrapper — resolves the takeover panel state (suspending on
// the rpg reads) and renders the tab's content. The scene banner rides the HUD's OWN band above the rails
// (`rpg-hud.tsx` → `RpgHeaderBand`).
//
// THE ORBS ARE THE ONE EXCEPTION, AND ONLY AT A LARGE TYPE SCALE (#878 F7, owner-ruled 2026-08-30). This
// header used to say the orbs are never here; at `satellitesInBody` they are. MEASURED at the `reading`
// preset, 1280×800: band 299 + rails 256 of a 740px pane left the viewport 184px (24.9%), and the satellite
// row is the part of that band which is a GLANCE rather than the artifact's identity — so it moves into
// this scroll region and travels with the content instead of standing permanently over it. The Waystone
// stays in the band. ONE derivation decides the home (`RpgPanelState.satellitesInBody`), so the row can
// never render twice or vanish.
//
// SO AT THAT SCALE THE ORBS ARE GAME-TAB-SCOPED, NOT MERELY "RELOCATED" (#899 N7, stated because the
// post-fix drive found the header understated it). At `defaults`/`maximal`/`compact` the row lives in the
// BAND, which is persistent chrome: the orbs follow you onto every tab, meta tabs included. At `reading`
// they live HERE, so they follow you across the GAME tabs (Status · Inventory · Scene · Quests · Journal ·
// Map — every one is `gameTab`-wrapped) and are ABSENT on a meta tab: measured on `This chat` at reading,
// `orbsInDom: 0`. The reviewer's judgment, recorded: it does not read as a hole (the rail folds 3+3 and the
// tab's own content starts immediately under it, so nothing looks missing) — the cost is behavioural, not
// visual. It is the same trade the coarse-pointer drop already makes, and the reading it protects is what
// the pane is for. (`STATUS-tab-scoped` would be the wrong word for it: every game tab carries them, not
// just the first.)
// Homed as its own component module because it calls a hook
// (`useRpgContextState`) and must therefore BE a component (rules-of-hooks) — the contribution `lib/` module
// stays a components-free data file (useComponentExportOnlyModules). Takes the active chat id (the
// contributor's `when` already gated game-ness cache-first); the hook re-reads getChat + the rpg views
// self-contained. `null` from the hook (a race where the pointer cleared mid-render) collapses to an honest
// one-liner.

import type { ChatId } from "@orb/kit/ids";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import type { RpgPanelState } from "../hooks/use-rpg-context-state.ts";
import { useRpgContextState } from "../hooks/use-rpg-context-state.ts";
import { RpgSatelliteRow } from "./rpg-satellite-row.tsx";

export interface RpgGameTabBodyProps {
  readonly chatId: ChatId;
  readonly render: (state: RpgPanelState) => ReactNode;
}

/** Resolve the panel state and render the tab's content (the header band is a separate seam, W3c) — with
 *  the satellite row above it in the arm that owns it (see the header). */
export function RpgGameTabBody({ chatId, render }: RpgGameTabBodyProps): ReactElement {
  const state = useRpgContextState(chatId);
  if (state === null) {
    return <Text>This chat is no longer a game.</Text>;
  }
  if (!state.satellitesInBody) {
    return <>{render(state)}</>;
  }
  return (
    <Stack gap="block">
      <RpgSatelliteRow trackerOrbs={state.tracker.trackerOrbs} actors={state.tracker.actors} viewerUserId={state.viewerUserId} />
      {render(state)}
    </Stack>
  );
}
