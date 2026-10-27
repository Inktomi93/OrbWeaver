import { insightsContextTabs, insightsCorpusMode } from "@orb/client/features/stats";
import { clearAnalyticsSelection, selectAnalyticsCharacterFromList } from "@orb/client/state";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import type { CharacterId } from "@orb/kit/ids";
import { CtAppearanceChannels, CtClientProviders } from "@orb/testkit/browser";
import { Container, Row } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useLayoutEffect } from "react";

function CostViews({
  characterId,
  view,
  width,
  height,
}: {
  readonly characterId: CharacterId | null;
  readonly view: "paired" | "content" | "models";
  readonly width: number;
  readonly height: number;
}): ReactElement {
  useLayoutEffect(() => {
    if (characterId === null) {
      clearAnalyticsSelection();
    } else {
      selectAnalyticsCharacterFromList(characterId);
    }
    return clearAnalyticsSelection;
  }, [characterId]);
  const models = insightsContextTabs.find((tab) => tab.id === "models");
  if (models === undefined) {
    throw new Error("Insights has no Models contribution");
  }
  return (
    <Row align="start" gap="section">
      {view === "models" ? null : (
        <Container data-slot="accounting-content-subject" className="flex flex-col min-block-0" style={{ inlineSize: width, blockSize: height }}>
          {insightsCorpusMode.content()}
        </Container>
      )}
      {view === "content" ? null : (
        <Container data-slot="accounting-models-subject" className="flex flex-col min-block-0" style={{ inlineSize: width, blockSize: height }}>
          {models.body({ mode: "insights" })}
        </Container>
      )}
    </Row>
  );
}

/** Isolate the actual independently scrolling cost contributions, not the surrounding Corpus shell. */
export function AccountingCoverageStory({
  appearance,
  ...views
}: {
  readonly appearance: Partial<AppearanceSettings>;
  readonly characterId: CharacterId | null;
  readonly view: "paired" | "content" | "models";
  readonly width: number;
  readonly height: number;
}): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={appearance}>
        <CostViews {...views} />
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}
