// The analytics-leaderboard anchor — the containment provider: wraps the Analytics LIST surface in a
// `<Container>` that owns `container-type`/`container-name`, so the surface adapts to this box wherever
// it's dropped. `h-full` gives the surface a bounded height to scroll its leaderboard rows inside.

import { Container } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";

export interface AnalyticsListAnchorProps {
  readonly children: ReactNode;
}

/** Provide the `analytics-leaderboard` container box the Analytics LIST surface consumes. */
export function AnalyticsListAnchor({ children }: AnalyticsListAnchorProps): ReactElement {
  return (
    <Container className="h-full" name="analytics-leaderboard">
      {children}
    </Container>
  );
}
