// The rpg takeover's CONSOLIDATED read-error region (Context-Panel-Program §4.4; UI-Arch §4.3 rule 1). The
// takeover suspends on TWO seams — the header BAND (`RpgHeaderBand`) and the active game-tab BODY
// (`RpgGameTabBody`) — each behind its own boundary. A failed read used to surface as TWO fragmented,
// unannounced blocks ("Couldn't load this." + "Couldn't load status.") with bare retry links, while the panel's
// only live region still said "Loaded chat." — an SR user told the opposite of the truth. This is the ONE
// honest error surface: the BAND collapses to nothing on error (it is decoration) and the BODY renders THIS —
// plain scene-named copy, `role="alert"` so AT announces the real state, and a ≥44px Retry that actually
// refetches (the `QueryBoundary` reset handshake, threaded straight through `onRetry`).

import { Button } from "@orb/ui/button";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

export interface RpgErrorStateProps {
  /** Refetches the failed reads — pass `QueryBoundary`'s `renderError(error, retry)` retry straight through. */
  readonly onRetry: () => void;
}

/** The single announced error region the game-tab body renders when a takeover read fails. `role="alert"`
 *  makes AT speak the failure (the panel's other live region reports success); Retry meets the touch floor by
 *  construction (the `sm` control-height token = 2.75rem). */
export function RpgErrorState({ onRetry }: RpgErrorStateProps): ReactElement {
  return (
    <Row role="alert" align="center" justify="center" gap="block" padding="section">
      <Text tone="muted">Couldn't load the scene.</Text>
      <Button intent="secondary" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </Row>
  );
}
