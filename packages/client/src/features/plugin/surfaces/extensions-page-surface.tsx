// The Extensions section's CONTENT pane — the selected `ui.page` surface inside the PAGE-SCALE SHELL
// (plugin-ui-plane #679 U5, §4.5b/§9).
//
// THE BAND IS NOT DECORATION. §9 names a full page the biggest impersonation canvas in this design: a page can
// draw a convincing fake settings screen entirely out of house primitives, because house primitives are exactly
// what it is made of. So every page renders inside `PluginSurfaceShell scale="page"`, whose pinned band carries
// the plugin's name, its glyph and an "Extension" kicker with NO opt-out — and the CT floor pins its presence on
// every page rather than on one.
//
// FOUR STATES, all designed, none generic (§11): NO PAGES AT ALL (this pane mirrors the LIST's teaching
// empty), NOTHING SELECTED (a switcher with rows and no pick), GONE (the selected page's plugin was disabled
// or removed while it was open — the drill is ephemeral and never self-heals by writing, D138 rule 2), and
// the page itself. A scripted-tier page with no `spec` renders the shell with an honest line rather than a
// blank body: its client guest lands at U4, and a blank page inside a labelled band reads as a broken plugin.
//
// THE ZERO-PAGES ARM MIRRORS THE LIST'S TEACHING EMPTY VERBATIM (side-eye 2026-08-29 P3-6): with no pages
// registered, "Pick an extension page / Choose a page on the left" told a first-timer to choose from a list
// that was itself saying "No extension pages yet" — two panes giving contradictory guidance about the same
// fact. The mirror reuses the SAME copy home AND the same `useExtensionsEmpty` reason (#924 — so the two
// panes can never drift on WHICH empty either), and the no-selection copy survives for the pages>0 arm —
// "pick one" and "there are none" are still different facts (the CT pins the distinction). While the reads
// are unsettled the reason is `null` and this pane draws NOTHING rather than an empty it cannot justify.
//
// EVERY non-page state carries an ACTION, and they are DIFFERENT actions, which is the whole reason the
// states exist separately: "there are none" and "that page is gone" send you to Plugins (install, or turn
// the lost plugin back on), while "nothing is picked" sends you back to the switcher's own affordance
// (nothing to fix).

import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Blocks, Icon } from "@orb/ui/icons";
import { Container, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useRef } from "react";
import { testId, useFocusOnMount } from "#lib";
import { clearPluginPage, openConfigTo, usePluginPageKey } from "#state";
import { ExtensionsAwaitingConsent } from "../components/extensions-awaiting-consent.tsx";
import { PluginFrame } from "../components/plugin-frame.tsx";
import { PluginSurfaceRenderer } from "../components/plugin-surface-renderer.tsx";
import { PluginSurfaceShell } from "../components/plugin-surface-shell.tsx";
import { useExtensionsEmpty } from "../hooks/use-extensions-empty.ts";
import { usePluginPages } from "../hooks/use-plugin-pages.ts";
import {
  EXTENSIONS_EMPTY_COPY,
  EXTENSIONS_GONE_BODY,
  EXTENSIONS_GONE_TITLE,
  EXTENSIONS_NO_SELECTION_BODY,
  EXTENSIONS_NO_SELECTION_TITLE,
  EXTENSIONS_OPEN_PLUGINS_ACTION,
} from "../lib/extensions-copy.ts";

export function ExtensionsPageSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  // A drill-down CONTENT pane manages focus on mount: on a phone this IS the pushed frame, and landing a
  // keyboard/AT user back at the document root after a page swap is the defect the rule exists to stop.
  useFocusOnMount(surfaceRef);
  const key = usePluginPageKey();
  const pages = usePluginPages();
  const empty = useExtensionsEmpty();
  const page = key === null ? undefined : pages.find((candidate) => candidate.key === key);

  if (key === null) {
    // ZERO PAGES: mirror the LIST's teaching empty rather than pointing at an empty list (file header).
    if (pages.length === 0) {
      if (empty.reason === null) {
        return <Container className="h-full outline-none" data-testid={testId("extensionsContent")} ref={surfaceRef} tabIndex={-1} />;
      }
      // #1699 — the mirror is of the WHOLE arm, identity included. A CONTENT pane that kept the anonymous CTA
      // beside a LIST that names its plugins would be the two-panes-two-stories defect this mirror exists to
      // close, one level down.
      if (empty.reason === "awaiting-consent") {
        return (
          <Container className="h-full outline-none" data-testid={testId("extensionsContent")} ref={surfaceRef} tabIndex={-1}>
            <ExtensionsAwaitingConsent plugins={empty.awaitingPlugins} />
          </Container>
        );
      }
      const copy = EXTENSIONS_EMPTY_COPY[empty.reason];
      return (
        <Container className="h-full outline-none" data-testid={testId("extensionsContent")} ref={surfaceRef} tabIndex={-1}>
          <Stack align="center" className="h-full" justify="center">
            <EmptyState
              action={
                <Button intent="secondary" onClick={(): void => openConfigTo("plugins", copy.sub)} size="sm">
                  {copy.action}
                </Button>
              }
              description={copy.description(empty.erroredCount)}
              icon={<Icon icon={Blocks} size="md" />}
              measure="wide"
              title={copy.title}
            />
          </Stack>
        </Container>
      );
    }
    return (
      <Container className="h-full outline-none" data-testid={testId("extensionsContent")} ref={surfaceRef} tabIndex={-1}>
        <Stack align="center" className="h-full" justify="center">
          <EmptyState
            action={
              // Nothing to repair here — the next step is the switcher beside this pane, and on a phone (where
              // the LIST is a screen of its own) `clearPluginPage` is exactly the back door that reveals it.
              <Button intent="secondary" onClick={clearPluginPage} size="sm">
                Browse extension pages
              </Button>
            }
            description={EXTENSIONS_NO_SELECTION_BODY}
            icon={<Icon icon={Blocks} size="md" />}
            measure="wide"
            title={EXTENSIONS_NO_SELECTION_TITLE}
          />
        </Stack>
      </Container>
    );
  }
  if (page === undefined) {
    // The drill outlived its page — the plugin was disabled or removed while it was open. The honest line, not
    // a blank pane, and NO write from a render: a dead reference never self-heals by pruning itself (D138 rule
    // 2), it just stops resolving until the person picks again.
    return (
      <Container className="h-full outline-none" data-testid={testId("extensionsContent")} ref={surfaceRef} tabIndex={-1}>
        <Stack align="center" className="h-full" justify="center">
          <EmptyState
            action={
              <Button intent="secondary" onClick={(): void => openConfigTo("plugins")} size="sm">
                {EXTENSIONS_OPEN_PLUGINS_ACTION}
              </Button>
            }
            description={EXTENSIONS_GONE_BODY}
            icon={<Icon icon={Blocks} size="md" />}
            measure="wide"
            title={EXTENSIONS_GONE_TITLE}
          />
        </Stack>
      </Container>
    );
  }
  return (
    // NOT a `<Container>`: a page owns its whole CONTENT region and the page-scale shell paints the region's own
    // edges (a pinned band + a scrolling body). A container's reading-width clamp here would inset a full-page
    // surface inside a gutter it did not ask for — the shell IS the containment for this arm.
    <Stack className="h-full min-h-0 outline-none" data-testid={testId("extensionsContent")} ref={surfaceRef} tabIndex={-1}>
      {page.tier === "frame" ? (
        // U7 FRAME (#787) — the arbitrary-pixels arm at PAGE scale (§6.1/§9). `PluginFrame` draws its OWN
        // page-scale shell (the pinned attribution band with no opt-out) exactly as it does at every other
        // anchor, so an un-minted frame contributes no orphaned band — the flank-law posture, chrome included.
        // `scale="page"` gives the biggest impersonation canvas in the design the same wall the vocabulary
        // pages wear.
        <PluginFrame pluginId={page.pluginId} pluginName={page.pluginName} scale="page" surfaceId={page.surfaceId} title={page.title} />
      ) : (
        <PluginSurfaceShell pluginName={page.pluginName} scale="page" title={page.title}>
          {page.spec === undefined ? (
            <Text prose={true} voice="gloss">
              This page hasn't published anything to draw yet.
            </Text>
          ) : (
            <PluginSurfaceRenderer anchor="page" pluginId={page.pluginId} spec={page.spec} surfaceId={page.surfaceId} />
          )}
        </PluginSurfaceShell>
      )}
    </Stack>
  );
}
