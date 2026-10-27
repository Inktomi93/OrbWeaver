import { AppShell } from "@orb/client/features/app-shell";
import { selectAnalyticsCharacterFromList, setCorpusMode } from "@orb/client/state";
import type { CharacterId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { useState } from "react";

/** The production Insights drill opens through the existing mode and leaderboard-selection actions. */
export function InsightsIdentityShellStory({ characterId }: { readonly characterId: CharacterId }): ReactElement {
  useState(() => {
    setCorpusMode("insights");
    selectAnalyticsCharacterFromList(characterId);
    return true;
  });
  return (
    <CtClientProviders>
      <AppShell />
    </CtClientProviders>
  );
}
