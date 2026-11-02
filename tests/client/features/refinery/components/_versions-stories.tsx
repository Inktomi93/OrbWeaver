import type { CharacterId, RefinerySessionId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { VersionsTab } from "#client/features/refinery/components/context-tabs.tsx";

/** The refinery Versions tab over one card's snapshot walk. */
export function VersionsTabStory({ characterId, sessionId }: { readonly characterId: CharacterId; readonly sessionId: RefinerySessionId }): ReactElement {
  return (
    <CtClientProviders>
      <VersionsTab liveDescription="" state={{ characterId, sessionId }} />
    </CtClientProviders>
  );
}
