// Discovery (Corpus section) CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test
// module). Surfaces come through the feature front door, wrapped in the real client data layer
// (CtDataProviders — Query + real tRPC over the routeTrpc-stubbed network).

import {
  CorpusCompareTab,
  CorpusContent,
  CorpusContextHeader,
  CorpusDossierSurface,
  CorpusListHeader,
  CorpusListSurface,
} from "@orb/client/features/discovery";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { CtDataProviders } from "../../../support/ct/ct-data-providers.tsx";

/** The Corpus LIST navigator (omnibox + browse) over the real data layer. */
export function CorpusListSurfaceStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 640, width: 360 }}>
        <CorpusListSurface />
      </div>
    </CtDataProviders>
  );
}

/** The Corpus LIST chrome-band header (title + distilled count) over the real data layer. */
export function CorpusListHeaderStory(): ReactElement {
  return (
    <CtDataProviders>
      <CorpusListHeader />
    </CtDataProviders>
  );
}

/** The Corpus CONTEXT-panel band identity (title + distilled count) over the real data layer. */
export function CorpusContextHeaderStory(): ReactElement {
  return (
    <CtDataProviders>
      <CorpusContextHeader />
    </CtDataProviders>
  );
}

/** The Corpus CONTEXT "Compare" tab over the real data layer. */
export function CorpusCompareTabStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 640, width: 420 }}>
        <CorpusCompareTab />
      </div>
    </CtDataProviders>
  );
}

/** The Corpus CONTENT REGION — the host that owns the pane's scroll and its inset for both surfaces, and
 *  therefore the only honest mount for either a padding or a first-run assertion. Fixed size: the region
 *  fills its host in production, and a content-sized mount root agrees with any inset bug. */
export function CorpusContentStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 640, width: 720 }}>
        <CorpusContent />
      </div>
    </CtDataProviders>
  );
}

const DOSSIER_CHARACTER = castId<CharacterId>("char_aria");

/** The Corpus CONTENT dossier over the real data layer — the ASK panel's provenance badge lives here. */
export function CorpusDossierSurfaceStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 640, width: 480 }}>
        <CorpusDossierSurface characterId={DOSSIER_CHARACTER} onBack={(): void => undefined} />
      </div>
    </CtDataProviders>
  );
}
