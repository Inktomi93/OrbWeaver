// The takeover HEADER-BAND host (Context-Panel-Program §4.2/§4.5/§4.11 #3) — resolves the takeover panel
// state and renders the scene banner + pool orbs into the `.shell-panel-header` BAND slot ABOVE both strips
// (the W3c header-contributor seam: a `ContextTabDef.header` supplied by the rpg contributor, gated on the
// same game-ness `when` as the game tabs). Homed as its own component because it calls a hook
// (`useRpgContextState`) and must therefore BE a component (rules-of-hooks) — the contribution `lib/` module
// stays a components-free data file (useComponentExportOnlyModules). `null` from the hook (a race where the
// pointer cleared mid-render) collapses to nothing, letting the band fall back to the neutral default.

import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { EyeOff, Icon } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { isLiveTurnPhase, revealContextPanel, useTurnPhase } from "#state";
import { useRpgContextState } from "../hooks/use-rpg-context-state";
import { RpgTakeoverHeader } from "./rpg-takeover-header";

export interface RpgHeaderBandProps {
  readonly chatId: ChatId;
}

/** The band's HOST-ONLY veiled count (panel-redesign §2 "the cues row" / §6 P3): the crown-gold standing
 *  indicator over the SAME `rpg.revealHidden` read the Status Veiled ledger tails (one cache entry, two
 *  lenses), and the DOORWAY to Status → Veiled (`revealContextPanel`). Renders NOTHING at zero standing
 *  lies (the honest empty plane) — and never mounts for a member (the caller gates on `isHost`;
 *  PERMISSION-omit, so member DOM carries zero veiled traces). */
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
      size="sm"
      data-slot="rpg-veiled-cue"
      title={`${count} veiled ${count === 1 ? "truth" : "truths"} in play — host only. Opens Status → Veiled.`}
      onClick={(): void => revealContextPanel("rpg.status")}
      className="!h-auto min-h-0 gap-field !px-field !py-0 text-highlight hover:text-highlight"
    >
      <Icon icon={EyeOff} size="xs" />
      <Text as="span" size="micro" weight="medium" transform="caps" className="tracking-micro">
        {count} veiled
      </Text>
    </Button>
  );
}

/** Resolve the panel state and render the scene banner + orbs into the header band. The freshness transient
 *  rides the CHAT turn phase (`#state`, the shared composition tier — NOT `features/chat`): a live turn is the
 *  reliable-mode extraction window where this beat's state is still being written, so the indicator pulses. */
export function RpgHeaderBand({ chatId }: RpgHeaderBandProps): ReactElement | null {
  const state = useRpgContextState(chatId);
  const turnLive = isLiveTurnPhase(useTurnPhase(chatId));
  if (state === null) {
    return null;
  }
  // Level moved OFF the band (panel-redesign: Sheet's identity line owns it — one number, three zoom
  // levels; the band carries the waystone + orbs + coin, its text lines the datum).
  return (
    <RpgTakeoverHeader
      ambient={state.tracker.ambient}
      actors={state.tracker.actors}
      poolOrbs={state.tracker.poolOrbs}
      viewerUserId={state.viewerUserId}
      trackersReadOnly={state.tracker.trackersReadOnly}
      extractionMode={state.game.extractionMode}
      dateMode={state.game.publicConfig.dateMode}
      freshnessPending={turnLive}
      // The host-only veiled count on the cues row (§2/§6 P3) — PERMISSION-omit for a member.
      veiledCue={state.isHost ? <RpgVeiledCue chatId={chatId} /> : null}
    />
  );
}
