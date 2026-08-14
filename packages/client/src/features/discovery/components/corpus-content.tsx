// The Corpus CONTENT body — nothing selected shows the corpus overview; a selected character shows its
// dossier. Reads its OWN selection from #state so the section definition composing it stays a pure data
// object.
//
// THE REGION OWNS THE SCROLL AND THE INSET, once, for both surfaces — the Configuration precedent
// (`config-content-surface.tsx`, side-eye 2026-08-03 P1). Corpus shipped with neither: the shell's CONTENT
// region has no padding of its own, so every row rendered flush into the pane corner (measured: body text
// at x=363 against the list divider, the trailing `$0.00` column pinned to the viewport edge). A per-surface
// inset is the same defect waiting for the third surface, so it lives here and the surfaces carry none.

import { Container, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { clearCorpusSelection, useSelectedCorpusCharacterId } from "#state";
import { CorpusDossierSurface } from "../surfaces/corpus-dossier-surface.tsx";
import { CorpusHomeSurface } from "../surfaces/corpus-home-surface.tsx";

export function CorpusContent(): ReactElement {
  const selectedCorpusCharacterId = useSelectedCorpusCharacterId();
  return (
    <Container className="h-full min-h-0">
      <Stack className="relative h-full min-h-0 overflow-y-auto overscroll-contain" data-slot="corpus-content" padding="section">
        {selectedCorpusCharacterId === null ? (
          <CorpusHomeSurface />
        ) : (
          <CorpusDossierSurface characterId={selectedCorpusCharacterId} onBack={clearCorpusSelection} />
        )}
      </Stack>
    </Container>
  );
}
