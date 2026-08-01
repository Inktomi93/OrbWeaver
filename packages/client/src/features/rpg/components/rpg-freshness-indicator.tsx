// The takeover's STATE-FRESHNESS indicator (Context-Panel-Program §4.5 — the 2026-07-27 owner ruling:
// a post-commit round's one-beat lag is ACCEPTED as long as an indicator surfaces it — visibility doctrine
// applied to freshness; nothing silently pretends the tracker is live when it isn't). A pure, calm hint —
// TEXT is the datum (the tracker-kit a11y model: the animated pulse is aria-hidden, the accessible content
// is the label), never a banner.
//
// EFF-3 CLOSES D112 (4)'s KNOWN GAP. This surface used to key on the game's `extractionMode` — the KNOB — and
// so it claimed "Live" for every `folded` game, including the ones that cannot fold (a wire that goes mute when
// tools ride it — the local-engine fold guard; a wire with no terminal channel at all). Those rooms were running
// the post-commit round a beat behind while the pill said the state was current. It now reads
// `RpgGameView.effectiveDelivery` — what the room's connection ACTUALLY does with the knob, derived server-side
// off the same capability resolve the gather gates its pre-commit mount on. The three honest arms:
//   • folded     — the character turn co-emitted its own state, so by the time the reply exists the state is in
//     hand and the flush is a DB write ⇒ a minimal "Live" affordance (never a fake lag label — the owner
//     ruling's explicit floor). `pending` is ignored here: there is no extraction window to wait on.
//   • tool-round — a dedicated post-commit model call writes this beat's state AFTER the character turn commits,
//     so for ~1-3s the panel still shows the PREVIOUS beat. Idle ⇒ "As of last beat"; a live turn opens that
//     window ⇒ the transient "Updating…". `fallbackReason` decides only the TITLE: a host who picked the
//     two-call arm gets the plain explanation, a folded game that was downgraded gets told WHY.
//   • none       — the connection has no model write path at all, so no vehicle runs and neither label is true.
//     This renders NOTHING: the band's Read-only pill is the honest word there, and a freshness claim beside it
//     would be the same class of lie this file exists to kill.
//
// RESIDUAL (documented, not hidden): the `no-terminal-channel` arm — a fold that was eligible and failed at
// runtime (an unbuildable mount, a hook miss) — is only knowable after a turn completes and is not persisted, so
// a room in that state still reads "Live" here while its `rpg.extraction.path` WARN carries the truth. Surfacing
// a guess would trade one lie for another; closing it needs a durable last-turn-delivery source.

import type { RpgDeliveryPath, RpgEffectiveDelivery, RpgFoldFallbackReason } from "@orb/contracts/rpg";
import { Badge } from "@orb/ui/badge";
import { Clock, History, Icon } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

export interface RpgFreshnessIndicatorProps {
  /** What the room's delivery knob RESOLVES to (never the bare knob — that is the lie EFF-3 removed). */
  readonly delivery: RpgEffectiveDelivery;
  /** The post-commit state-round window is open (a character turn is live) — the panel is about to change.
   *  Ignored on the folded path. */
  readonly pending: boolean;
}

/** Does this path land its state WITH the turn (no post-commit model call)? A mapped Record over the closed
 *  delivery axis, so a new path member cannot inherit another's freshness claim by accident. */
const LIVE_AT_COMMIT: Readonly<Record<RpgDeliveryPath, boolean>> = { folded: true, "tool-round": false, none: false };

/** WHY this room is rounding, in host words — keyed over the total fallback vocabulary so a new cause cannot
 *  ship without its explanation. `null` = the host asked for the two-call arm; nothing was downgraded. */
const ROUNDING_REASON: Readonly<Record<RpgFoldFallbackReason, string>> = {
  "local-engine-fold-guard": "This room's model goes silent when it's asked to record state inside the reply, so a second pass does it after the turn instead.",
  "no-terminal-channel": "This room's model can't record state inside the reply, so a second pass does it after the turn instead.",
};
const HOST_CHOSE_ROUNDING = "A dedicated pass records each beat's state after the turn commits — the delivery model you picked.";

/** The calm freshness hint — one soft pill whose label IS the accessible datum. `null` when nothing delivers
 *  state at all (the Read-only pill speaks for that room; two contradictory pills is the lie, not the fix). */
export function RpgFreshnessIndicator({ delivery, pending }: RpgFreshnessIndicatorProps): ReactElement | null {
  if (delivery.path === "none") {
    return null;
  }
  if (LIVE_AT_COMMIT[delivery.path]) {
    // Current-beat fresh at commit — a minimal honest "Live" affordance (never a fake lag label).
    return (
      <Badge tone="soft" intent="success" size="sm" data-slot="rpg-freshness" title="The reply records its own state — the panel is current with this beat.">
        <Icon icon={Clock} size="xs" />
        <Text as="span" size="micro" weight="medium">
          Live
        </Text>
      </Badge>
    );
  }
  const why = delivery.fallbackReason === null ? HOST_CHOSE_ROUNDING : ROUNDING_REASON[delivery.fallbackReason];
  if (pending) {
    // The window between the turn committing and the state round landing — this beat's state is being
    // written by a second model call. The pulse is decorative (aria-hidden); the label is the datum.
    return (
      <Badge tone="soft" size="sm" data-slot="rpg-freshness" title={`Writing this beat's state now — the panel refreshes when it lands. ${why}`}>
        {/* Icon is decorative by default (no `label` ⇒ aria-hidden); the pulse is purely visual. */}
        <Icon icon={History} size="xs" className="animate-pulse" />
        <Text as="span" size="micro" weight="medium">
          Updating…
        </Text>
      </Badge>
    );
  }
  // A post-commit round, idle — the panel reflects the last completed beat (the accepted one-beat lag, surfaced).
  return (
    <Badge tone="soft" size="sm" data-slot="rpg-freshness" title={`Trackers update one beat behind. ${why}`}>
      <Icon icon={History} size="xs" />
      <Text as="span" size="micro" weight="medium">
        As of last beat
      </Text>
    </Badge>
  );
}
