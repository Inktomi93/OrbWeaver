import { useInvalidation, useOrbSocket, useUserBus } from "@orb/client/data";
import { labelsCorpusMode } from "@orb/client/features/tag";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";

function Suggestions(): ReactElement {
  const invalidation = useInvalidation();
  useOrbSocket();
  useUserBus({ invalidateUser: invalidation.invalidateUser, invalidateAllUserRoots: invalidation.invalidateAllUserRoots });
  return <>{labelsCorpusMode.content()}</>;
}

export function SuggestionFocusStory(): ReactElement {
  return (
    <CtClientProviders>
      <Suggestions />
    </CtClientProviders>
  );
}
