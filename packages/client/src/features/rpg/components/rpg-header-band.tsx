// The HUD's BAND body — resolves the takeover panel state and renders the scene banner + pool orbs. It is
// mounted by the rpg band claim (`rpg-hud-band.tsx`), in the HEAD slot of the shell's context bracket on a
// game chat (#860): pre-HUD this rode the shell's chrome band through a contributor slot rpg did not own;
// now it is the one slot a contributor may take, and the bracket around it is the shell's. Homed as its own
// component because it calls a hook (`useRpgContextState`) and must therefore BE a component
// (rules-of-hooks). `null` from the hook (a race where the pointer cleared mid-render) collapses to nothing.

import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { EyeOff, Icon } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { isLiveTurnPhase, revealContextPanel, useTurnPhase } from "#state";
import { useRpgContextState } from "../hooks/use-rpg-context-state.ts";
import { RpgTakeoverHeader } from "./rpg-takeover-header.tsx";

export interface RpgHeaderBandProps {
  readonly chatId: ChatId;
}

/** The band's HOST-ONLY veiled count ("the cues row"): the crown-gold standing
 *  indicator over the SAME `rpg.revealHidden` read the Status Veiled ledger tails (one cache entry, two
 *  lenses), and the DOORWAY to Status → Veiled (`revealContextPanel`). Renders NOTHING at zero standing
 *  lies (the honest empty plane) — and never mounts for a member (the caller gates on `isHost`;
 *  PERMISSION-omit, so member DOM carries zero veiled traces).
 *
 *  DELIBERATELY UNGATED (no `enabled`): the cue is a STANDING indicator, so it must be current the moment the
 *  panel is looked at — and a collapsed panel stays mounted (inert/off-screen), so an `enabled: panelOpen`
 *  gate would only trade a correct count for a fetch-on-open flash. The cost is bounded instead at the
 *  invalidation seam: the read is a derivation over the stored assistant bodies, so it refetches on a BODY
 *  WRITE only (`data/invalidation.ts` — `messageCommitted` + the edit/swipe family, never the `turnCompleted`
 *  that trails the same commit), and it shares ONE cache entry with the Status → Veiled ledger. */
function RpgVeiledCue({ chatId }: { readonly chatId: ChatId }): ReactElement | null {
  const trpc = useTRPC();
  const revealQuery = useQuery(trpc.rpg.revealHidden.queryOptions({ chatId }));
  const count = revealQuery.data?.standingLies.reduce((n, group) => n + group.lies.length, 0) ?? 0;
  if (count === 0) {
    return null;
  }
  return (
    <Button
      type="button"
      intent="ghost"
      size="inline"
      data-slot="rpg-veiled-cue"
      title={`${count} veiled ${count === 1 ? "truth" : "truths"} in play — host only. Opens Status → Veiled.`}
      onClick={(): void => revealContextPanel("rpg.status")}
      className="px-field font-medium text-accolade hover:text-accolade"
    >
      <Icon icon={EyeOff} size="xs" />
      {/* text-inherit so the button's crown-gold wins — the kicker voices carry their own muted colour, and
          a muted cue inside a highlight button is the one thing this cue must not read as.
          `interactiveKicker`, NOT `kicker` (#1216 class, #1632 item 3): this text IS the button's whole
          visible label beside the icon, and `kicker` rides `--text-micro` (10.5px), under the 11px
          functional floor for interactive copy. Same tracked register, readable 13px step. */}
      <Text as="span" voice="interactiveKicker" className="text-inherit">
        {count} veiled
      </Text>
    </Button>
  );
}

/** Resolve the panel state and render the scene banner + orbs into the header band. The freshness transient
 *  rides the CHAT turn phase (`#state`, the shared composition tier — NOT `features/chat`): a live turn is the
 *  post-commit extraction window where this beat's state is still being written, so the indicator pulses. */
export function RpgHeaderBand({ chatId }: RpgHeaderBandProps): ReactElement | null {
  const state = useRpgContextState(chatId);
  const turnLive = isLiveTurnPhase(useTurnPhase(chatId));
  if (state === null) {
    return null;
  }
  // Level moved OFF the band (Sheet's identity line owns it — one number, three zoom
  // levels; the band carries the waystone + orbs + coin, its text lines the datum).
  return (
    <RpgTakeoverHeader
      roomTitle={state.roomTitle}
      // #878 F7 — at a large type scale the satellite row is the TAB BODY's, not the band's.
      satellitesInBody={state.satellitesInBody}
      ambient={state.tracker.ambient}
      actors={state.tracker.actors}
      trackerOrbs={state.tracker.trackerOrbs}
      viewerUserId={state.viewerUserId}
      trackersReadOnly={state.tracker.trackersReadOnly}
      delivery={state.game.effectiveDelivery}
      dateMode={state.game.publicConfig.dateMode}
      freshnessPending={turnLive || state.trackerRefreshing}
      // The host-only veiled count on the cues row — PERMISSION-omit for a member.
      veiledCue={state.isHost ? <RpgVeiledCue chatId={chatId} /> : null}
    />
  );
}
