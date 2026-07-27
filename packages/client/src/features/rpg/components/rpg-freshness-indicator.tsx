// The takeover's STATE-FRESHNESS indicator (Context-Panel-Program §4.5 — the 2026-07-27 owner ruling:
// the reliable-mode one-beat lag is ACCEPTED as long as an indicator surfaces it — visibility doctrine
// applied to freshness; nothing silently pretends the tracker is live when it isn't). A pure, calm hint —
// TEXT is the datum (the tracker-kit a11y model: the animated pulse is aria-hidden, the accessible content
// is the label), never a banner.
//
// The freshness posture is driven by the game's `extractionMode` (the delivery-model knob, on the member
// `RpgGameView`):
//   • reliable (default): the dedicated extraction turn runs AFTER the character turn commits, so the panel
//     reflects the PREVIOUS completed beat by construction. Idle ⇒ "As of last beat"; a live turn opens the
//     window where THIS beat's state is being generated but not yet flushed ⇒ the transient "Updating…".
//   • cheap: inline tools fire during the character turn, so state is current-beat fresh at commit ⇒ a
//     minimal "Live" affordance (never a fake lag label — the owner ruling's explicit floor).
// `pending` is the reliable-mode transient (the caller derives it from the chat turn phase); it is ignored
// in cheap mode, where there is no extraction window to wait on.

import type { RpgExtractionMode } from "@orb/contracts/rpg";
import { Badge } from "@orb/ui/badge";
import { Clock, History, Icon } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

export interface RpgFreshnessIndicatorProps {
  readonly extractionMode: RpgExtractionMode;
  /** The reliable-mode extraction window is open (a character turn is live) — the panel is about to change.
   *  Ignored in cheap mode. */
  readonly pending: boolean;
}

/** The calm freshness hint — one soft pill whose label IS the accessible datum. */
export function RpgFreshnessIndicator({ extractionMode, pending }: RpgFreshnessIndicatorProps): ReactElement {
  if (extractionMode === "cheap") {
    // Current-beat fresh at commit — a minimal honest "Live" affordance (never a fake lag label).
    return (
      <Badge tone="soft" intent="success" size="sm" data-slot="rpg-freshness" title="Trackers update live during the turn — the panel is current.">
        <Icon icon={Clock} size="xs" />
        <Text as="span" size="micro" weight="medium">
          Live
        </Text>
      </Badge>
    );
  }
  if (pending) {
    // The window between the turn committing and the extraction flush landing — this beat's state is being
    // written. The pulse is decorative (aria-hidden); the label is the datum.
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
