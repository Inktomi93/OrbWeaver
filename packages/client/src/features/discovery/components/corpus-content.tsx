// Corpus CONTENT owns the reading inset and dispatches the retained Explore artifact snapshot.

import { Container, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { corpusDestinationIdentity } from "#lib";
import { useSelectedCorpusDestination } from "#state";
import { CorpusArtifactSurface } from "../surfaces/corpus-artifact-surface.tsx";
import { CorpusHomeSurface } from "../surfaces/corpus-home-surface.tsx";

export function CorpusContent(): ReactElement {
  const destination = useSelectedCorpusDestination();
  return (
    <Container className="block-full min-block-0">
      <Stack className="relative overflow-y-auto overscroll-contain py-section block-full min-block-0" data-slot="corpus-content">
        {destination === null ? <CorpusHomeSurface /> : <CorpusArtifactSurface key={corpusDestinationIdentity(destination)} destination={destination} />}
      </Stack>
    </Container>
  );
}
