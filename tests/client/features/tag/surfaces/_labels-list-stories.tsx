import { labelsCorpusMode } from "@orb/client/features/tag";
import { CtClientProviders, CtUserBus } from "@orb/testkit/browser";
import { Container, Row, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

/** The Labels finder through its corpus-mode contribution, in a viewport-high column that bounds the windowed list. */
export function LabelsListStory(): ReactElement {
  return (
    <CtClientProviders>
      <Stack className="h-screen">
        <Container className="h-full">{labelsCorpusMode.list()}</Container>
      </Stack>
    </CtClientProviders>
  );
}

/** The Labels finder beside its content, as the desktop corpus draws them, with the app root's user bus so a tag made or
 *  deleted elsewhere reaches both panes. */
export function LabelsPanesBusStory(): ReactElement {
  return (
    <CtClientProviders>
      <CtUserBus>
        <Row className="h-screen">
          <Container className="h-full" style={{ inlineSize: 420 }}>
            {labelsCorpusMode.list()}
          </Container>
          <Container className="h-full" style={{ flex: 1, minInlineSize: 0 }}>
            {labelsCorpusMode.content()}
          </Container>
        </Row>
      </CtUserBus>
    </CtClientProviders>
  );
}
