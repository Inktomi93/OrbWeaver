// The Extensions section's LIST pane — the PAGE SWITCHER (plugin-ui-plane #679 U5, §4.5b): one house row per
// registered `ui.page` surface across the caller's granted-and-enabled plugins.
//
// ONE RAIL ENTRY FOR THE PLATFORM, never one per plugin (§4.5b): rail bloat plus the largest impersonation
// surface in the design. The switcher is where the per-plugin fan happens, and every row is PLUGIN-LABELLED —
// the plugin's name is the row's own subtitle, so a person picking a page already knows whose it is before the
// page paints its band.
//
// THE EMPTY STATE IS THE ADVERTISEMENT, argued in `extensions-copy.ts`: a section a person only ever sees full
// teaches nothing about the platform, so the zero-page state is a teaching empty with the action that leads to
// installing one, not a hidden rail entry.
//
// …AND WHICH EMPTY IT IS, IS A FACT ABOUT THE ASKER (#924). `useExtensionsEmpty` resolves the reason and this
// pane draws it; the CONTENT pane draws the SAME reason from the SAME hook, so the two panes cannot tell a
// person two different things about one account. Until the reads settle the reason is `null` and this pane
// shows the list skeleton — stating "you have none" about an account nobody has read yet is the defect in
// miniature.

import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Blocks, Icon } from "@orb/ui/icons";
import { Container, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import type { ReactElement } from "react";
import { useRef } from "react";
import { LibrarySurfaceShell } from "#components";
import { SkeletonRows } from "#data";
import { testId, useFocusOnMount } from "#lib";
import { openConfigTo, selectPluginPageFromList, usePluginPageKey } from "#state";
import { ExtensionsAwaitingConsent } from "../components/extensions-awaiting-consent.tsx";
import { useExtensionsEmpty } from "../hooks/use-extensions-empty.ts";
import { usePluginPages } from "../hooks/use-plugin-pages.ts";
import { EXTENSIONS_EMPTY_COPY } from "../lib/extensions-copy.ts";

/** The rows, or the teaching empty. Split from the shell so the boundary wraps a component that reads. */
function ExtensionsPageList(): ReactElement {
  const pages = usePluginPages();
  const empty = useExtensionsEmpty();
  const active = usePluginPageKey();
  if (pages.length === 0) {
    if (empty.reason === null) {
      return <SkeletonRows count={2} shape="line" />;
    }
    // THE AWAITING ARM IS NOT EMPTY (#1699): it has N installed plugins in it, and rendering them as one
    // anonymous CTA was the finding. The block names them; the other three arms are genuinely empty and keep
    // the teaching `EmptyState` verbatim. Both panes render the SAME block, so the mirror law holds for the
    // identity half too.
    if (empty.reason === "awaiting-consent") {
      return <ExtensionsAwaitingConsent plugins={empty.awaitingPlugins} />;
    }
    const copy = EXTENSIONS_EMPTY_COPY[empty.reason];
    return (
      <EmptyState
        action={
          <Button intent="secondary" onClick={(): void => openConfigTo("plugins", copy.sub)} size="sm">
            {copy.action}
          </Button>
        }
        description={copy.description(empty.erroredCount)}
        icon={<Icon icon={Blocks} size="md" />}
        title={copy.title}
        titleAs="h2"
      />
    );
  }
  return (
    <Stack gap="tight">
      {pages.map((page) => (
        <ListRow
          clickable={true}
          key={page.key}
          leading={<Icon icon={Blocks} size="sm" />}
          onClick={(): void => selectPluginPageFromList(page.key)}
          selected={page.key === active}
          title={page.title}
          // Two plugins may legitimately register a page with the same title ("Browse"), and a list of
          // identically-named rows is unusable by voice and ambiguous by eye. The plugin name IS the
          // disambiguator: the subtitle carries it for the eye and `titleQualifier` renders it into the
          // accessible name — EXCEPT when the page is titled exactly like its plugin (side-eye 2026-08-29
          // P3-7: "Card Atlas" over a "Card Atlas" subtitle, the qualifier doubling the SR name). A
          // qualifier that repeats the title disambiguates nothing; the attribution the pair exists for is
          // already the title itself. Spread, not `undefined` props: exactOptionalPropertyTypes.
          {...(page.pluginName === page.title ? {} : { subtitle: page.pluginName, titleQualifier: page.pluginName })}
        />
      ))}
    </Stack>
  );
}

/** The LIST pane surface. */
export function ExtensionsSwitcherSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  return (
    <Container className="min-h-0 outline-none" data-testid={testId("extensionsSwitcher")} ref={surfaceRef} tabIndex={-1}>
      <LibrarySurfaceShell errorLabel="your extension pages" loadingLabel="Loading extension pages…">
        <ExtensionsPageList />
      </LibrarySurfaceShell>
    </Container>
  );
}
