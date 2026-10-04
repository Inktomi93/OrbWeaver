// The Extensions section's CONTENT pane — the selected `ui.page` surface inside the PAGE-SCALE SHELL.
//
// THE BAND IS NOT DECORATION. §9 names a full page the biggest impersonation canvas in this design: a page can
// draw a convincing fake settings screen entirely out of house primitives, because house primitives are exactly
// what it is made of. So every page renders inside `PluginSurfaceShell scale="page"`, whose pinned band carries
// the plugin's name, its glyph and an "Extension" kicker with NO opt-out — and the CT floor pins its presence on
// every page rather than on one.
//
// THE STATES, all designed, none generic (§11): NO PAGES AT ALL (this pane mirrors the LIST's teaching empty,
// from the SAME `useExtensionsEmpty` reason, #924), WAITING (a counted landing whose one action opens the first
// waiting plugin's review), NOTHING SELECTED (a switcher with rows and no pick), GONE (the selected page's plugin
// was disabled or removed while it was open — the drill is ephemeral and never self-heals by writing, D138 rule
// 2), a waiting plugin's REVIEW, and the page itself. A scripted-tier page mounts its client guest inside the
// same labelled shell, where D268 requires distinct booting, confirmed-empty, content, and failed-with-Retry
// states. While the reads are unsettled the reason is `null` and this pane draws NOTHING rather than an empty it
// cannot justify.
//
// THE REVIEW OPENS IN PLACE, FOR ONE PLUGIN. It is that plugin's own Plugins-screen row, so the approval on
// screen names and acts on exactly the plugin the person picked; the old door to the shared Settings list landed
// on whichever plugin's "Approve all" happened to be first.
//
// Every arm but a page carries the standard content inset: the section declares none, because a page owns its
// whole region and its shell paints the region's edges.

import type { PluginId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Blocks, Icon } from "@orb/ui/icons";
import { Container, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactElement, ReactNode, RefObject } from "react";
import { useRef } from "react";
import { QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { testId, useFocusOnMount } from "#lib";
import { openConfigTo, pluginPageKey, selectPluginPageFromList, usePluginPageKey } from "#state";
import { PluginFrame } from "../components/plugin-frame.tsx";
import { PluginRow } from "../components/plugin-row.tsx";
import { PluginScriptedSurface } from "../components/plugin-scripted-surface.tsx";
import { PluginSurfaceRenderer } from "../components/plugin-surface-renderer.tsx";
import { PluginSurfaceShell } from "../components/plugin-surface-shell.tsx";
import type { ExtensionsEmptyView } from "../hooks/use-extensions-empty.ts";
import { useExtensionsEmpty } from "../hooks/use-extensions-empty.ts";
import type { PluginPageView } from "../hooks/use-plugin-pages.ts";
import { pluginReviewKey, usePluginPagesState } from "../hooks/use-plugin-pages.ts";
import {
  EXTENSIONS_EMPTY_COPY,
  EXTENSIONS_GONE_BODY,
  EXTENSIONS_GONE_TITLE,
  EXTENSIONS_NO_SELECTION_BODY,
  EXTENSIONS_NO_SELECTION_TITLE,
  EXTENSIONS_OPEN_PLUGINS_ACTION,
  EXTENSIONS_REVIEW_PLUGINS_ACTION,
} from "../lib/extensions-copy.ts";

/** Open the review of the first waiting plugin — the top row of the LIST's waiting group. */
function reviewFirstWaiting(plugins: ExtensionsEmptyView["awaitingPlugins"]): void {
  const first = plugins[0];
  if (first !== undefined) {
    selectPluginPageFromList(pluginReviewKey(first.id));
  }
}

/** Every non-page arm's frame: the pane's focus target, with the standard content inset. */
function InsetPane({ surfaceRef, children }: { readonly surfaceRef: RefObject<HTMLDivElement | null>; readonly children: ReactNode }): ReactElement {
  return (
    <Container
      className="relative h-full min-h-0 overflow-y-auto px-section outline-none"
      data-testid={testId("extensionsContent")}
      ref={surfaceRef}
      tabIndex={-1}
    >
      {children}
    </Container>
  );
}

/** One centred teaching empty with its single action. */
function CentredEmpty({ title, description, action }: { readonly title: string; readonly description: string; readonly action: ReactElement }): ReactElement {
  return (
    <Stack align="center" className="h-full" justify="center">
      <EmptyState action={action} description={description} icon={<Icon icon={Blocks} size="md" />} measure="wide" title={title} titleAs="h2" />
    </Stack>
  );
}

function NoPages({ empty }: { readonly empty: ExtensionsEmptyView }): ReactElement | null {
  if (empty.reason === null) {
    return null;
  }
  if (empty.reason === "awaiting-consent") {
    const waiting = EXTENSIONS_EMPTY_COPY["awaiting-consent"];
    return (
      <CentredEmpty
        action={
          <Button intent="secondary" onClick={(): void => reviewFirstWaiting(empty.awaitingPlugins)} size="sm">
            {waiting.action}
          </Button>
        }
        description={waiting.description()}
        title={waiting.title(empty.awaitingPlugins.length)}
      />
    );
  }
  const copy = EXTENSIONS_EMPTY_COPY[empty.reason];
  return (
    <CentredEmpty
      action={
        <Button intent="secondary" onClick={(): void => openConfigTo("plugins", copy.sub)} size="sm">
          {copy.action}
        </Button>
      }
      description={copy.description(empty.erroredCount)}
      title={copy.title()}
    />
  );
}

/** Pages exist and none is picked. The switcher beside this pane is the way to pick, so the action is the
 *  next act that is NOT already on screen: review what is still waiting, or manage plugins. */
function NoSelection({ empty }: { readonly empty: ExtensionsEmptyView }): ReactElement {
  const action =
    empty.awaitingPlugins.length > 0 ? (
      <Button intent="secondary" onClick={(): void => reviewFirstWaiting(empty.awaitingPlugins)} size="sm">
        {EXTENSIONS_REVIEW_PLUGINS_ACTION}
      </Button>
    ) : (
      <Button intent="secondary" onClick={(): void => openConfigTo("plugins")} size="sm">
        {EXTENSIONS_OPEN_PLUGINS_ACTION}
      </Button>
    );
  return <CentredEmpty action={action} description={EXTENSIONS_NO_SELECTION_BODY} title={EXTENSIONS_NO_SELECTION_TITLE} />;
}

function PageBody({ page }: { readonly page: PluginPageView }): ReactElement | null {
  if (page.tier === "scripted") {
    return <PluginScriptedSurface anchor="page" grants={page.grants} pluginId={page.pluginId} surfaceId={page.surfaceId} surfaceIds={page.scriptedIds} />;
  }
  if (page.spec === undefined) {
    return (
      <Text prose={true} voice="gloss">
        This page hasn't published anything to draw yet.
      </Text>
    );
  }
  return <PluginSurfaceRenderer anchor="page" pluginId={page.pluginId} spec={page.spec} surfaceId={page.surfaceId} />;
}

export function ExtensionsPageSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  // A drill-down CONTENT pane manages focus on mount: on a phone this IS the pushed frame, and landing a
  // keyboard/AT user back at the document root after a page swap is the defect the rule exists to stop.
  useFocusOnMount(surfaceRef);
  const trpc = useTRPC();
  const key = usePluginPageKey();
  const pageState = usePluginPagesState();
  const pages = pageState.pages;
  const empty = useExtensionsEmpty();
  // The reviewed plugin is resolved against the WHOLE list, not the waiting subset, so its row stays on screen
  // after approval and shows the outcome (on, or the error that stopped it).
  const { data: plugins } = useQuery(trpc.plugin.list.queryOptions());
  const reviewed = key === null ? undefined : plugins?.find((plugin) => pluginReviewKey(plugin.id) === key);
  const queryClient = useQueryClient();
  // An approval turns the plugin on, so the page it just added is what the person came for: read the catalog
  // fresh (the approval's own refetch may not have landed yet) and open that plugin's first page by title.
  const openFirstPageOf = (pluginId: PluginId): void => {
    queryClient
      .fetchQuery(trpc.plugin.listSurfaces.queryOptions())
      .then((surfaces) => {
        const first = surfaces
          .filter((surface) => surface.pluginId === pluginId && surface.anchor === "page")
          .toSorted((a, b) => a.title.localeCompare(b.title))[0];
        if (first !== undefined) {
          selectPluginPageFromList(pluginPageKey(pluginId, first.id));
        }
      })
      .catch((error: unknown) => globalThis.reportError(error));
  };
  const page = key === null ? undefined : pages.find((candidate) => candidate.key === key);

  if (reviewed !== undefined) {
    return (
      <Container
        className="relative h-full min-h-0 overflow-y-auto px-section py-section outline-none"
        data-testid={testId("extensionsContent")}
        ref={surfaceRef}
        tabIndex={-1}
      >
        <PluginRow onApproved={(): void => openFirstPageOf(reviewed.id)} plugin={reviewed} />
      </Container>
    );
  }
  if (key !== null && pageState.isPending) {
    return (
      <InsetPane surfaceRef={surfaceRef}>
        <Stack gap="block" role="status">
          <Text voice="label">Loading plugin page…</Text>
          <SkeletonRows count={3} shape="line" />
        </Stack>
      </InsetPane>
    );
  }
  if (key !== null && pageState.isError) {
    return (
      <InsetPane surfaceRef={surfaceRef}>
        <QueryErrorState label="this plugin page" onRetry={pageState.retry} />
      </InsetPane>
    );
  }
  if (key === null) {
    return <InsetPane surfaceRef={surfaceRef}>{pages.length === 0 ? <NoPages empty={empty} /> : <NoSelection empty={empty} />}</InsetPane>;
  }
  if (page === undefined) {
    // The drill outlived what it named — the plugin was disabled or removed while it was open. The honest line,
    // not a blank pane, and NO write from a render: a dead reference never self-heals by pruning itself (D138
    // rule 2), it just stops resolving until the person picks again.
    return (
      <InsetPane surfaceRef={surfaceRef}>
        <CentredEmpty
          action={
            <Button intent="secondary" onClick={(): void => openConfigTo("plugins")} size="sm">
              {EXTENSIONS_OPEN_PLUGINS_ACTION}
            </Button>
          }
          description={EXTENSIONS_GONE_BODY}
          title={EXTENSIONS_GONE_TITLE}
        />
      </InsetPane>
    );
  }
  const content =
    page.tier === "frame" ? (
      // U7 FRAME (#787) — the arbitrary-pixels arm at PAGE scale (§6.1/§9). `PluginFrame` draws its OWN
      // page-scale attribution shell, so an un-minted frame contributes no orphaned band.
      <PluginFrame pluginId={page.pluginId} pluginName={page.pluginName} scale="page" surfaceId={page.surfaceId} title={page.title} />
    ) : (
      <PluginSurfaceShell pluginName={page.pluginName} scale="page" title={page.title}>
        <PageBody page={page} />
      </PluginSurfaceShell>
    );
  return (
    // NOT a `<Container>`: a page owns its whole CONTENT region and the page-scale shell paints the region's own
    // edges (a pinned band + a scrolling body). A container's reading-width clamp here would inset a full-page
    // surface inside a gutter it did not ask for — the shell IS the containment for this arm.
    <Stack className="h-full min-h-0 outline-none" data-testid={testId("extensionsContent")} ref={surfaceRef} tabIndex={-1}>
      {content}
    </Stack>
  );
}
