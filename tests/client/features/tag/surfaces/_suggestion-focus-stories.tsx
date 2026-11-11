import { labelsCorpusMode } from "@orb/client/features/tag";
import { CtClientProviders, CtUserBus } from "@orb/testkit/browser";
import type { ReactElement } from "react";

export function SuggestionFocusStory(): ReactElement {
  return (
    <CtClientProviders>
      <CtUserBus>{labelsCorpusMode.content()}</CtUserBus>
    </CtClientProviders>
  );
}
