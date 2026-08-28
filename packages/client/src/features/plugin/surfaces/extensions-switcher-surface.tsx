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

import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Blocks, Icon } from "@orb/ui/icons";
import { Container, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import type { ReactElement } from "react";
import { useRef } from "react";
import { LibrarySurfaceShell } from "#components";
import { testId, useFocusOnMount } from "#lib";
import { openSettingsTo, selectPluginPageFromList, usePluginPageKey } from "#state";
import { usePluginPages } from "../hooks/use-plugin-pages.ts";
import { EXTENSIONS_EMPTY_ACTION, EXTENSIONS_EMPTY_BODY, EXTENSIONS_EMPTY_TITLE } from "../lib/extensions-copy.ts";

/** The rows, or the teaching empty. Split from the shell so the boundary wraps a component that reads. */
function ExtensionsPageList(): ReactElement {
  const pages = usePluginPages();
  const active = usePluginPageKey();
  if (pages.length === 0) {
    return (
      <EmptyState
        action={
          <Button intent="secondary" onClick={(): void => openSettingsTo("plugins")} size="sm">
            {EXTENSIONS_EMPTY_ACTION}
          </Button>
        }
        description={EXTENSIONS_EMPTY_BODY}
        icon={<Icon icon={Blocks} size="md" />}
        title={EXTENSIONS_EMPTY_TITLE}
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
          subtitle={page.pluginName}
          title={page.title}
          // Two plugins may legitimately register a page with the same title ("Browse"), and a list of
          // identically-named rows is unusable by voice and ambiguous by eye. The plugin name IS the
          // disambiguator, and `titleQualifier` renders it into the accessible name as well as the label.
          titleQualifier={page.pluginName}
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
