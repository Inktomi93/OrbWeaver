// config feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module).
//
// The story assembles the REAL door array (`tagCollection` + `regexCollection` + `worldInfoCollection`) into a real
// `config-collections` registry and mounts the three panes the shell would mount, so the CTs drive the
// production seam end to end: host frame → contribution rows → kinded selection → contribution editor →
// contribution context. Nothing here is a test double.
//
// The `reset groups` button is determinism, not product: the disclosure store is device-local
// (localStorage), and a CT that inherited another run's expanded set would assert the wrong first frame.

import type { CollectionContribution } from "@orb/client/lib";
import { createContributorRegistry } from "@orb/client/lib";
import { __resetCollectionGroupOpen, clearCollectionSelection } from "@orb/client/state";
import type { ReactElement } from "react";
import { ConfigContextBody, ConfigContextHeader } from "../../../../packages/client/src/features/config/components/config-context-body";
import { ConfigContentSurface } from "../../../../packages/client/src/features/config/surfaces/config-content-surface";
import { ConfigRosterSurface } from "../../../../packages/client/src/features/config/surfaces/config-roster-surface";
import { regexCollection } from "../../../../packages/client/src/features/regex";
import { tagCollection } from "../../../../packages/client/src/features/tag";
import { worldInfoCollection } from "../../../../packages/client/src/features/world-info";
import { CtDataProviders } from "../../../support/ct/ct-data-providers";

const collections = createContributorRegistry<CollectionContribution>("config-collections", [tagCollection, regexCollection, worldInfoCollection]);

/** The whole Configuration workspace: LIST roster · CONTENT · CONTEXT, over the real collections. */
export function ConfigWorkspaceStory(): ReactElement {
  return (
    <CtDataProviders>
      <button
        type="button"
        onClick={(): void => {
          __resetCollectionGroupOpen();
          clearCollectionSelection();
        }}
      >
        reset groups
      </button>
      <div style={{ display: "flex", height: 700, width: 1100 }}>
        <div style={{ overflow: "auto", width: 330 }}>
          <ConfigRosterSurface collections={collections} />
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>
          <ConfigContentSurface collections={collections} />
        </div>
        {/* The CONTEXT pane as the SHELL assembles it: the definition's `header` in the band, its `body`
            below. Mounting the body alone hid a defect only the PAIR shows — the band echoing the body's own
            empty-state title, so one pane stated one fact twice. `header` may decline (render nothing), which
            in production resolves to the shell's neutral band; the story keeps the slot so the pair is
            addressable either way. */}
        <div data-slot="ct-config-context-pane" style={{ overflow: "auto", width: 360 }}>
          <div data-slot="ct-config-context-band">
            <ConfigContextHeader collections={collections} />
          </div>
          <ConfigContextBody collections={collections} />
        </div>
      </div>
    </CtDataProviders>
  );
}
