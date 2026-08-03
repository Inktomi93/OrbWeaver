// The Configuration CONTENT — the selected member's own editor, MOUNTED in the pane (config-rail-spec.md
// §2 C-7: never a dialog; today a regex script is authored in a Dialog stacked on the settings modal).
// No selection ⇒ the designed welcome, never null.
//
// The host routes by KIND and renders whatever the owning contribution hands back — it never learns what a
// member IS. The registry is door-frozen and a selection can only be written by a rendered group, so
// `get(kind)` cannot miss.

import { Container, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useRef } from "react";
import { QueryBoundary, QueryErrorState } from "#data";
import type { CollectionContribution, ContributorRegistry } from "#lib";
import { useFocusOnMount } from "#lib";
import { useCollectionSelection } from "#state";
import { ConfigWelcome } from "../components/config-welcome";

export interface ConfigContentSurfaceProps {
  readonly collections: ContributorRegistry<CollectionContribution>;
}

export function ConfigContentSurface({ collections }: ConfigContentSurfaceProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  const selection = useCollectionSelection();
  return (
    // THE CONTENT PANE OWNS THE SCROLL, once, for every collection: the shell's own CONTENT region
    // (`.shell-content` / `.shell-region-fill`) is a bounded flex box with NO overflow, so a member editor
    // taller than the viewport — a 60-entry world book is ~3600px — would simply have its tail unreachable.
    // The retired World Info section carried this on its own surface; here it belongs to the host, or every
    // contribution has to remember it and the first one that forgets ships an amputated editor.
    <Container className="h-full min-h-0">
      {/* THE REGION PADS, NOT THE EDITORS (side-eye 2026-08-03 P1). Every mounted member editor rendered
          flush into the pane corner — the world-info `+ New entry` primary's right edge landed EXACTLY on
          the pane boundary (content.right 896 = button.right 896) — because the welcome carried its own
          `p-block` and the editors carried nothing. A per-editor inset is the same defect waiting for the
          fourth collection: the frame is the host's, so the inset is the host's. `section` is the mock's
          editor-pane inset (`workspace.html` `.mainbody{padding:20px 26px}`) on the token scale. */}
      <Stack className="h-full min-h-0 overflow-y-auto outline-none" data-slot="config-content" padding="section" ref={surfaceRef} tabIndex={-1}>
        {selection === null ? (
          <ConfigWelcome collections={collections} />
        ) : (
          <QueryBoundary
            fallback={<Text voice="gloss">Loading…</Text>}
            renderError={(_error, retry): ReactElement => <QueryErrorState label={collections.get(selection.kind).label.toLowerCase()} onRetry={retry} />}
          >
            {collections.get(selection.kind).detail({ memberId: selection.memberId })}
          </QueryBoundary>
        )}
      </Stack>
    </Container>
  );
}
