import { labelsCorpusMode } from "@orb/client/features/tag";
import { CtClientProviders } from "@orb/testkit/browser";
import { Container, Stack } from "@orb/ui/layout";
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
