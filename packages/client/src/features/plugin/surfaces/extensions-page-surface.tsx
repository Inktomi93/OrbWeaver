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
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactElement, ReactNode, RefObject } from "react";
import { useRef } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, QueryUnavailableState, SkeletonRows, useTRPC } from "#data";
import { testId, useFocusOnMount } from "#lib";
import type { PluginPageKey } from "#state";
import { LIST_OFF_SCREEN_HINT, openConfigTo, pluginPageKey, selectPluginPageFromList, usePluginPageKey, useSectionListMode } from "#state";
import { ExtensionsPaneAnchor } from "../anchors/extensions-pane-anchor.tsx";
import { PluginFrame } from "../components/plugin-frame.tsx";
import { PluginRow } from "../components/plugin-row.tsx";
import { PluginScriptedSurface } from "../components/plugin-scripted-surface.tsx";
import { PluginSurfaceRenderer } from "../components/plugin-surface-renderer.tsx";
import { PluginSurfaceShell } from "../components/plugin-surface-shell.tsx";
import type { ExtensionsEmptyView } from "../hooks/use-extensions-empty.ts";
import { useExtensionsEmpty } from "../hooks/use-extensions-empty.ts";
import type { PluginPageView } from "../hooks/use-plugin-pages.ts";
import { pluginReviewKey, usePluginPages, useSuspensePluginPages } from "../hooks/use-plugin-pages.ts";
import {
  EXTENSIONS_EMPTY_COPY,
  EXTENSIONS_GONE_BODY,
  EXTENSIONS_GONE_TITLE,
  EXTENSIONS_NO_SELECTION_BODY,
  EXTENSIONS_NO_SELECTION_TITLE,
  EXTENSIONS_OPEN_PLUGINS_ACTION,
  EXTENSIONS_PAGE_LOADING_NAME,
  EXTENSIONS_REVIEW_PLUGINS_ACTION,
  PLUGIN_PAGE_READ_LABEL,
} from "../lib/extensions-copy.ts";

/** Open the review of the first waiting plugin — the top row of the LIST's waiting group. */
function reviewFirstWaiting(plugins: ExtensionsEmptyView["awaitingPlugins"]): void {
  const first = plugins[0];
  if (first !== undefined) {
    selectPluginPageFromList(pluginReviewKey(first.id));
  }
}

/** Every non-page arm's frame, with the standard content inset, inside {@link PaneFrame}. */
function InsetPane({
  children,
  paddingBlock,
  ready,
}: {
  readonly children: ReactNode;
  readonly paddingBlock?: "section";
  /** `data-ready` for an arm with no skeleton while its first read is out; absent for an arm that never waits. */
  readonly ready?: boolean;
}): ReactElement {
  return (
    <Stack
      scroll="y"
      height="fill"
      paddingBlock={paddingBlock}
      paddingInline="section"
      {...(ready === undefined ? {} : { "data-ready": ready ? "true" : "false" })}
    >
      <ExtensionsPaneAnchor>{children}</ExtensionsPaneAnchor>
    </Stack>
  );
}

/** The pane's ONE focus target, around every arm: the arms swap as the selection, the plugin list and the page read settle, and
 *  a focus target that swapped with them would drop the mount focus to the document body.
 *  NOT a `<Container>`: a page owns its whole CONTENT region and the page-scale shell paints the region's own edges (a pinned
 *  band + a scrolling body), so a reading-width clamp here would inset a full-page surface inside a gutter it did not ask for. */
function PaneFrame({ surfaceRef, children }: { readonly surfaceRef: RefObject<HTMLDivElement | null>; readonly children: ReactNode }): ReactElement {
  return (
    <Stack minHeight="shrinks" height="fill" focusTarget={true} data-testid={testId("extensionsContent")} ref={surfaceRef} tabIndex={-1}>
      {children}
    </Stack>
  );
}

/** One centred teaching empty with its single action. */
function CentredEmpty({ title, description, action }: { readonly title: string; readonly description: string; readonly action: ReactElement }): ReactElement {
  return (
    <Stack align="center" height="fill" justify="center">
      <EmptyState action={action} description={description} icon={<Icon icon={Blocks} size="md" />} measure="wide" title={title} titleAs="h2" />
    </Stack>
  );
}

function NoPages({ empty }: { readonly empty: ExtensionsEmptyView }): ReactElement | null {
  if (empty.unread !== null) {
    return <QueryUnavailableState label="your plugins" onRetry={empty.unread.retry} paused={empty.unread.paused} />;
  }
  if (empty.reason === null) {
    return null;
  }
  if (empty.reason === "awaiting-consent") {
    const waiting = EXTENSIONS_EMPTY_COPY["awaiting-consent"];
    return (
      <CentredEmpty
        action={
          <Button variant="outline" onClick={(): void => reviewFirstWaiting(empty.awaitingPlugins)} size="sm">
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
        <Button variant="outline" onClick={(): void => openConfigTo("plugins", copy.sub)} size="sm">
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
      <Button variant="outline" onClick={(): void => reviewFirstWaiting(empty.awaitingPlugins)} size="sm">
        {EXTENSIONS_REVIEW_PLUGINS_ACTION}
      </Button>
    ) : (
      <Button variant="outline" onClick={(): void => openConfigTo("plugins")} size="sm">
        {EXTENSIONS_OPEN_PLUGINS_ACTION}
      </Button>
    );
  // The list is a docked column, a slide-over or collapsed, so the pick instruction names no side and a hidden list names its door back.
  const listOffScreen = useSectionListMode("extensions") === "collapsed";
  return (
    <CentredEmpty
      action={action}
      description={listOffScreen ? `${EXTENSIONS_NO_SELECTION_BODY}${LIST_OFF_SCREEN_HINT}` : EXTENSIONS_NO_SELECTION_BODY}
      title={EXTENSIONS_NO_SELECTION_TITLE}
    />
  );
}

function PageBody({ page }: { readonly page: PluginPageView }): ReactElement | null {
  if (page.tier === "scripted") {
    return <PluginScriptedSurface anchor="page" grants={page.grants} pluginId={page.pluginId} surfaceId={page.surfaceId} surfaceIds={page.scriptedIds} />;
  }
  if (page.spec === undefined) {
    return (
      <Text cap="prose" prose={true} voice="gloss">
        This page hasn't published anything to draw yet.
      </Text>
    );
  }
  return <PluginSurfaceRenderer anchor="page" pluginId={page.pluginId} spec={page.spec} surfaceId={page.surfaceId} />;
}

export function ExtensionsPageSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  // Arrival has one owner at a time: the switcher LIST while it is on screen (`ExtensionsSwitcherSurface`), this pane
  // when it is not (a drilled-in phone frame, a hand-collapsed list). This pane stays mounted across section visits and
  // re-runs its effects on every reveal, so an unconditional claim would take focus from the list on a return.
  useFocusOnMount(surfaceRef, useSectionListMode("extensions") === "collapsed");
  const trpc = useTRPC();
  const key = usePluginPageKey();
  const pages = usePluginPages();
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
      .query(trpc.plugin.listSurfaces.queryOptions())
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

  let body: ReactElement;
  if (reviewed !== undefined) {
    body = (
      <InsetPane paddingBlock="section">
        <PluginRow onApproved={(): void => openFirstPageOf(reviewed.id)} plugin={reviewed} />
      </InsetPane>
    );
  } else if (key === null) {
    body = <InsetPane ready={empty.settled}>{pages.length === 0 ? <NoPages empty={empty} /> : <NoSelection empty={empty} />}</InsetPane>;
  } else {
    body = (
      <QueryBoundary
        resetKeys={[key]}
        fallback={
          <InsetPane>
            <Stack gap="block" role="status">
              <Text voice="label">{EXTENSIONS_PAGE_LOADING_NAME}</Text>
              <SkeletonRows count={3} shape="line" />
            </Stack>
          </InsetPane>
        }
        renderError={(_error, retry): ReactElement => (
          <InsetPane>
            <QueryErrorState label={PLUGIN_PAGE_READ_LABEL} onRetry={retry} />
          </InsetPane>
        )}
      >
        <SelectedPage pageKey={key} />
      </QueryBoundary>
    );
  }
  return <PaneFrame surfaceRef={surfaceRef}>{body}</PaneFrame>;
}

/** The selected page, read through the pane's boundary: the page itself, or the gone state when nothing resolves the key. */
function SelectedPage({ pageKey }: { readonly pageKey: PluginPageKey }): ReactElement {
  const page = useSuspensePluginPages().find((candidate) => candidate.key === pageKey);
  if (page === undefined) {
    // The drill outlived what it named — the plugin was disabled or removed while it was open. The honest line,
    // not a blank pane, and NO write from a render: a dead reference never self-heals by pruning itself (D138
    // rule 2), it just stops resolving until the person picks again.
    return (
      <InsetPane>
        <CentredEmpty
          action={
            <Button variant="outline" onClick={(): void => openConfigTo("plugins")} size="sm">
              {EXTENSIONS_OPEN_PLUGINS_ACTION}
            </Button>
          }
          description={EXTENSIONS_GONE_BODY}
          title={EXTENSIONS_GONE_TITLE}
        />
      </InsetPane>
    );
  }
  return page.tier === "frame" ? (
    // U7 FRAME (#787) — the arbitrary-pixels arm at PAGE scale (§6.1/§9). `PluginFrame` draws its OWN
    // page-scale attribution shell, so an un-minted frame contributes no orphaned band.
    <PluginFrame anchor="page" pluginId={page.pluginId} pluginName={page.pluginName} scale="page" surfaceId={page.surfaceId} title={page.title} />
  ) : (
    <PluginSurfaceShell anchor="page" pluginId={page.pluginId} surfaceId={page.surfaceId} pluginName={page.pluginName} scale="page" title={page.title}>
      <PageBody page={page} />
    </PluginSurfaceShell>
  );
}
