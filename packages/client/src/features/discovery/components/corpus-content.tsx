// The Corpus CONTENT body — nothing selected shows the corpus overview; a selected character shows its
// dossier. Reads its OWN selection from #state so the section definition composing it stays a pure data
// object.

import type { ReactElement } from "react";
import { clearCorpusSelection, useSelectedCorpusCharacterId } from "#state";
import { CorpusDossierSurface } from "../surfaces/corpus-dossier-surface.tsx";
import { CorpusHomeSurface } from "../surfaces/corpus-home-surface.tsx";

export function CorpusContent(): ReactElement {
  const selectedCorpusCharacterId = useSelectedCorpusCharacterId();
  if (selectedCorpusCharacterId === null) {
    return <CorpusHomeSurface />;
  }
  return <CorpusDossierSurface characterId={selectedCorpusCharacterId} onBack={clearCorpusSelection} />;
}
