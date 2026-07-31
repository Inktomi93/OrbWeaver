// The takeover's STATE-FRESHNESS indicator (Context-Panel-Program §4.5 — the 2026-07-27 owner ruling:
// the reliable-mode one-beat lag is ACCEPTED as long as an indicator surfaces it — visibility doctrine
// applied to freshness; nothing silently pretends the tracker is live when it isn't). A pure, calm hint —
// TEXT is the datum (the tracker-kit a11y model: the animated pulse is aria-hidden, the accessible content
// is the label), never a banner.
//
// The freshness posture is driven by the game's `extractionMode` (the delivery-model knob, on the member
// `RpgGameView`), and it keys on ONE fact: does this beat's state need ANOTHER model call after the reply
// commits?
//   • reliable + cheap: yes — a dedicated post-commit round (structured / tool) generates this beat's state
//     AFTER the character turn commits, so for ~1-3s the panel still shows the PREVIOUS beat. Idle ⇒ "As of
//     last beat"; a live turn opens that window ⇒ the transient "Updating…".
//     (`cheap` claimed "Live" until R1 — that was true only of D108's inline-tools shape, which D109 replaced
//     with a dedicated round. Same lag as reliable, so the same honest label.)
//   • folded: no — the character turn co-emitted its own state, so by the time the reply exists the state is
//     already in hand and the flush is a DB write ⇒ a minimal "Live" affordance (never a fake lag label —
//     the owner ruling's explicit floor).
// `pending` is the post-commit-round transient (the caller derives it from the chat turn phase); it is ignored
// on the folded path, where there is no extraction window to wait on.

import type { RpgExtractionMode } from "@orb/contracts/rpg";
import { Badge } from "@orb/ui/badge";
import { Clock, History, Icon } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

export interface RpgFreshnessIndicatorProps {
  readonly extractionMode: RpgExtractionMode;
  /** The post-commit state-round window is open (a character turn is live) — the panel is about to change.
   *  Ignored on the folded path. */
  readonly pending: boolean;
}

/** Does this mode's state land WITH the turn (no post-commit model call)? A mapped Record over the closed mode
 *  axis, so a new delivery mode cannot inherit another's freshness claim by accident. */
const LIVE_AT_COMMIT: Readonly<Record<RpgExtractionMode, boolean>> = { reliable: false, cheap: false, folded: true };

/** The calm freshness hint — one soft pill whose label IS the accessible datum. */
export function RpgFreshnessIndicator({ extractionMode, pending }: RpgFreshnessIndicatorProps): ReactElement {
  if (LIVE_AT_COMMIT[extractionMode]) {
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
  if (pending) {
    // The window between the turn committing and the state round landing — this beat's state is being
    // written by a second model call. The pulse is decorative (aria-hidden); the label is the datum.
    return (
      <Badge
        tone="soft"
        size="sm"
        data-slot="rpg-freshness"
        title="A dedicated extraction pass is writing this beat's state — the panel will refresh when it lands."
      >
        {/* Icon is decorative by default (no `label` ⇒ aria-hidden); the pulse is purely visual. */}
        <Icon icon={History} size="xs" className="animate-pulse" />
        <Text as="span" size="micro" weight="medium">
          Updating…
        </Text>
      </Badge>
    );
  }
  // Reliable, idle — the panel reflects the last completed beat (the accepted one-beat lag, surfaced).
  return (
    <Badge
      tone="soft"
      size="sm"
      data-slot="rpg-freshness"
      title="Trackers update one beat behind — a dedicated pass records each beat's state after the turn commits."
    >
      <Icon icon={History} size="xs" />
      <Text as="span" size="micro" weight="medium">
        As of last beat
      </Text>
    </Badge>
  );
}
