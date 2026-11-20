// Corpus CONTENT: the content pane, spanning it, over the overview or the retained Explore artifact snapshot.

import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";
import type { ContentPaneMeasure } from "#components";
import { ContentPane } from "#components";
import { corpusDestinationIdentity } from "#lib";
import { useSelectedCorpusDestination } from "#state";
import { CorpusArtifactSurface } from "../surfaces/corpus-artifact-surface.tsx";
import { CorpusHomeSurface } from "../surfaces/corpus-home-surface.tsx";

const CORPUS_MEASURE: ContentPaneMeasure = { full: "The overview is a dashboard; artifacts and dossiers set their own reading measures." };

export function CorpusContent(): ReactElement {
  const destination = useSelectedCorpusDestination();
  return (
    <Container className="min-block-0" height="fill">
      <ContentPane data-slot="corpus-content" measure={CORPUS_MEASURE}>
        {destination === null ? <CorpusHomeSurface /> : <CorpusArtifactSurface key={corpusDestinationIdentity(destination)} destination={destination} />}
      </ContentPane>
    </Container>
  );
}
