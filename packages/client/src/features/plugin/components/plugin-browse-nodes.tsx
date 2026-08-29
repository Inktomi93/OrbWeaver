// The three BROWSE-GENRE node renderers (plugin-ui-plane #679 U5, §4.5b) — `grid`, `masterDetail`,
// `searchBar` — split out of `plugin-surface-renderer.tsx`, which owns the walk, the caps and the leaves.
//
// THE SPLIT IS A DEPENDENCY DECISION, not a line-count one. Each component here takes the CONCRETE values it
// needs plus a `renderNode`/`renderChildren` callback for the recursion, rather than the renderer's own context
// object: that keeps the renderer as the single owner of the walk (depth guard included), gives this module NO
// import back into it — so there is no cycle to unpick later — and means neither file has to export a shared
// context TYPE out of a component module (which is exactly what `no-inline-types` refuses in a feature).
//
// The genre these three encode is a MINED FAILURE LIST, not a wish list: the repo's own purged hub browser
// rendered a visual medium as management rows, gave its decision surface the least design, stacked its controls
// at equal weight, and lost browse context on every switch. Each renderer below is one of those, closed.

import type { PluginGridNode, PluginMasterDetailNode, PluginSearchBarNode, PluginSurfaceNode } from "@orb/contracts/plugin";
import { Button } from "@orb/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { MediaTileGrid } from "@orb/ui/media-tile-grid";
import { MessageMedia } from "@orb/ui/message-media";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { gridTiles, heroAssetId, resolveString } from "../lib/plugin-surface-bindings.ts";

/**
 * The MEDIA-FORWARD TILE GRID (§4.5b failure 1) — through the sealed `@orb/ui` `MediaTileGrid` composite, which
 * is where the shape lives so the whole app benefits and no feature re-authors browse tiles.
 *
 * Covers ride the SAME owner-scoped `assetId` resolve every `image` node does (a tile cannot name a foreign
 * blob), an empty grid renders the plugin's own teaching line rather than nothing at all, and the grid is
 * interactive only when EVERY tile names an action — a grid where some tiles respond and others do not is a
 * control that lies about itself.
 */
export function SurfaceGrid({
  node,
  state,
  imageUrls,
  submit,
}: {
  readonly node: PluginGridNode;
  readonly state: Record<string, unknown>;
  readonly imageUrls: ReadonlyMap<string, string>;
  readonly submit: (actionId: string, extra?: Record<string, string>) => void;
}): ReactElement {
  // BOTH ARMS collapse through the shared `gridTiles` seam (#774 ARM C): declared tiles verbatim, or the
  // `tilesFrom` binding resolved against published state (validated + clamped in contracts — untrusted state
  // never reaches this map unjudged). Everything below is arm-blind.
  const tiles = gridTiles(node, state);
  if (tiles.length === 0) {
    return (
      <Text prose={true} voice="gloss">
        {node.empty ?? "Nothing here yet."}
      </Text>
    );
  }
  const items = tiles.map((tile) => ({
    id: tile.id,
    title: resolveString(tile.title, state),
    ...(tile.subtitle === undefined ? {} : { subtitle: resolveString(tile.subtitle, state) }),
    ...(tile.badge === undefined ? {} : { badge: resolveString(tile.badge, state) }),
    ...(tile.assetId === undefined ? {} : { imageUrl: imageUrls.get(tile.assetId) }),
    ...(tile.alt === undefined ? {} : { alt: tile.alt }),
  }));
  // The bound arm's ONE `tileAction` covers every tile; the declared arm is interactive only when EVERY tile
  // names an action — a grid where some tiles respond and others do not is a control that lies about itself.
  const allActionable = node.tileAction !== undefined || tiles.every((tile) => tile.actionId !== undefined);
  // ONE `onActivate` for the grid, dispatching to the CLICKED tile's action. The round-trip carries the
  // tile id in `values.tile` — a tile is not a form field a person edits, so it rides as an extra rather than
  // living in the draft bag.
  const activate = (id: string): void => {
    const tile = tiles.find((candidate) => candidate.id === id);
    if (tile === undefined) {
      return;
    }
    const actionId = node.tileAction ?? tile.actionId;
    if (actionId !== undefined) {
      submit(actionId, { tile: tile.id });
    }
  };
  return <MediaTileGrid aspect={node.aspect ?? "portrait"} items={items} {...(allActionable ? { onActivate: activate } : {})} />;
}

/**
 * The PAGE ARRANGEMENT (§4.5b failure 2). The active stage comes from the plugin's PUBLISHED STATE, so stage
 * navigation is an ordinary action round-trip and the position SURVIVES leaving the section and coming back —
 * the "browse session context evaporated" failure, closed by WHERE the state lives rather than by a
 * mount-lifetime trick. An `active` naming no stage falls back to the FIRST stage: a page that renders blank
 * because a plugin published a typo is the failure this fallback exists to prevent.
 *
 * The DETAIL stage is the one that differs by construction: hero above a READING-WIDTH column (the house
 * `prose` measure on the text primitives themselves — a plugin never spells a width), which is exactly what the
 * purged surface's drawer-crammed preview did not have.
 */
export function MasterDetail({
  node,
  depth,
  state,
  imageUrls,
  renderNode,
}: {
  readonly node: PluginMasterDetailNode;
  readonly depth: number;
  readonly state: Record<string, unknown>;
  readonly imageUrls: ReadonlyMap<string, string>;
  readonly renderNode: (node: PluginSurfaceNode, depth: number) => ReactNode;
}): ReactElement | null {
  const activeId = node.active === undefined ? undefined : resolveString(node.active, state);
  const stage = node.stages.find((candidate) => candidate.id === activeId) ?? node.stages[0];
  if (stage === undefined) {
    return null;
  }
  // BOTH hero arms collapse through `heroAssetId` (#798): the declared id, or the `assetFrom` binding resolved
  // against published state (format-gated in contracts). The resolved id then rides the SAME owner-scoped
  // `imageUrls` map every declared cover does — a foreign id has no url and the hero renders nothing.
  const heroId = stage.hero === undefined ? undefined : heroAssetId(stage.hero, state);
  const heroUrl = heroId === undefined ? undefined : imageUrls.get(heroId);
  const title = stage.title === undefined ? undefined : resolveString(stage.title, state);
  const body = renderNode(stage.body, depth + 1);
  if (stage.kind === "browse") {
    return (
      <Stack gap="block">
        {title === undefined ? null : <Text voice="kicker">{title}</Text>}
        {body}
      </Stack>
    );
  }
  return (
    <Stack gap="block">
      {stage.hero === undefined || heroUrl === undefined ? null : (
        <MessageMedia alt={stage.hero.alt ?? ""} media="image" src={{ kind: "asset", url: heroUrl }} />
      )}
      {title === undefined ? null : <Text voice="focal">{title}</Text>}
      {body}
    </Stack>
  );
}

/**
 * The PAGE's one prominent query slot (§4.5b failure 3) — the query is the surface's PRIMARY affordance and its
 * filters are a COLLAPSED disclosure beneath it, which is the hierarchy encoded structurally rather than asked
 * for at review. "At most one per spec" is enforced by the schema, so this renderer never has to reason about a
 * second one.
 */
export function SurfaceSearchBar({
  node,
  depth,
  values,
  setValue,
  submit,
  submitting,
  renderChildren,
}: {
  readonly node: PluginSearchBarNode;
  readonly depth: number;
  readonly values: Record<string, string>;
  readonly setValue: (name: string, value: string) => void;
  readonly submit: (actionId: string) => void;
  readonly submitting: boolean;
  readonly renderChildren: (children: readonly PluginSurfaceNode[], depth: number) => ReactNode;
}): ReactElement {
  const fire = (): void => {
    if (node.actionId !== undefined) {
      submit(node.actionId);
    }
  };
  const filters = node.filters ?? [];
  return (
    <Stack gap="field">
      <Row align="end" gap="field">
        <Field className="grow" label={node.label}>
          <Input
            onKeyDown={(event): void => {
              // Enter submits — a query box that only responds to a button is a search a keyboard user has to
              // reach for the mouse to run.
              if (event.key === "Enter") {
                event.preventDefault();
                fire();
              }
            }}
            onValueChange={(next: string): void => setValue(node.name, next)}
            placeholder={node.placeholder}
            value={values[node.name] ?? ""}
          />
        </Field>
        {node.actionId === undefined ? null : (
          <Button intent="secondary" loading={submitting} onClick={fire} size="sm">
            Search
          </Button>
        )}
      </Row>
      {filters.length === 0 ? null : (
        <Collapsible>
          <CollapsibleTrigger size="control">{node.filtersLabel ?? "Filters"}</CollapsibleTrigger>
          <CollapsiblePanel>
            <Stack gap="field">{renderChildren(filters, depth)}</Stack>
          </CollapsiblePanel>
        </Collapsible>
      )}
    </Stack>
  );
}
