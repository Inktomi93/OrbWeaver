import { insightsContextTabs, insightsCorpusMode } from "@orb/client/features/stats";
import { CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";

const PANE_WIDTH = 440;
const PANE_HEIGHT = 900;

/** The production Time tab or Insights dashboard, each in the bounded pane it scrolls inside. */
export function ApproximateDatesStory({ view }: { readonly view: "time" | "overview" }): ReactElement {
  const time = insightsContextTabs.find((tab) => tab.id === "time");
  if (time === undefined) {
    throw new Error("Insights has no Time contribution");
  }
  return (
    <CtClientProviders>
      <Container className="flex flex-col min-block-0" style={{ inlineSize: PANE_WIDTH, blockSize: PANE_HEIGHT }}>
        {view === "time" ? time.body({ mode: "insights" }) : insightsCorpusMode.content()}
      </Container>
    </CtClientProviders>
  );
}
