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
import { EmptyState } from "@orb/ui/empty-state";
import { Field } from "@orb/ui/field";
import { Icon, Images } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { MediaTileGrid, MediaTileGridSkeleton } from "@orb/ui/media-tile-grid";
import { MessageMedia } from "@orb/ui/message-media";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { gridLoading, gridTiles, heroCoverKey, resolveString, tileCoverKey } from "../lib/plugin-surface-bindings.ts";

/**
 * The MEDIA-FORWARD TILE GRID (§4.5b failure 1) — through the sealed `@orb/ui` `MediaTileGrid` composite, which
 * is where the shape lives so the whole app benefits and no feature re-authors browse tiles.
 *
 * Covers ride the SAME owner-scoped `assetId` resolve every `image` node does (a tile cannot name a foreign
 * blob), an empty grid renders the plugin's own teaching line rather than nothing at all, and the grid is
 * interactive only when EVERY tile names an action — a grid where some tiles respond and others do not is a
 * control that lies about itself.
 *
 * THE THREE STATES ARE ORDERED HERE (#799): loading → empty → tiles. `loading` outranks both because a grid
 * mid-fetch is neither of them — showing last query's tiles claims results it no longer has, and showing the
 * teaching empty claims a verdict the wire has not returned. The skeleton is SHAPE- AND ASPECT-MATCHED to the
 * grid it replaces, so the swap reserves the same boxes and the page does not jump.
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
  if (gridLoading(node, state)) {
    // The LOADING third of the three-states law, finally spellable: the shelf composite's own skeleton, at
    // the grid's own aspect, so the reserved boxes match the tiles that are about to land.
    return <MediaTileGridSkeleton aspect={node.aspect ?? "portrait"} />;
  }
  if (tiles.length === 0) {
    // The HOUSE empty state, not one grey sentence above a void (stickler 2026-08-29 F4): the browse genre's
    // empty is load-bearing — it is the whole pre-search page — and the section's own empties one file over
    // already speak this pattern. The plugin's `empty` line stays the copy; only its frame is promoted.
    // @orb-waive empty-state-has-action(EmptyState): the plugin GRID's empty state (card-atlas-hub-polish, stickler 2026-08-29 F4): the renderer STRUCTURALLY cannot mint an action here, because a CTA would need a plugin actionId and inventing one the plugin never declared is the impersonation wall the closed vocabulary exists to hold. The copy is the plugin's own teaching line, and its next step is the searchBar the SAME surface renders above it. Ends the day the vocabulary grows a plugin-authored empty-action arm (e.g. grid.emptyAction).
    return <EmptyState icon={<Icon icon={Images} size="lg" />} measure="default" title={node.empty ?? "Nothing here yet."} titleAs="p" />;
  }
  const items = tiles.map((tile) => {
    // Declared id OR bundle path (#820) — `tileCoverKey` picks whichever arm the tile carries, and the url map
    // is keyed by both spellings, so a bundle cover resolves exactly like an id and an unshipped path is a miss.
    const coverKey = tileCoverKey(tile);
    return {
      id: tile.id,
      title: resolveString(tile.title, state),
      ...(tile.subtitle === undefined ? {} : { subtitle: resolveString(tile.subtitle, state) }),
      ...(tile.badge === undefined ? {} : { badge: resolveString(tile.badge, state) }),
      ...(coverKey === undefined ? {} : { imageUrl: imageUrls.get(coverKey) }),
      ...(tile.alt === undefined ? {} : { alt: tile.alt }),
      // Tag chips (hub v1.2) — deduped here because the chip is keyed by its text (untrusted state may repeat).
      ...(tile.tags === undefined || tile.tags.length === 0 ? {} : { tags: [...new Set(tile.tags)] }),
    };
  });
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
 * The DETAIL stage is the one that differs by construction: hero above a READING-WIDTH column — the renderer
 * caps the stage's whole column at the house `--reading-measure` token (a plugin never spells a width), which
 * is exactly what the purged surface's drawer-crammed preview did not have. One cap, three fixes: the blurb
 * stops running ~150 chars/line, the keyValue rows stop putting label and value at opposite ends of a
 * near-900px scan gap, and the hero cannot balloon past the column it crowns (stickler 2026-08-29 F2).
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
  // ALL hero arms collapse through `heroCoverKey` (#798/#820): the declared id, the `assetFrom` binding
  // resolved against published state (format-gated in contracts), or the bundle path. The key then rides the
  // SAME owner-scoped `imageUrls` map every declared cover does — a foreign id or an unshipped path has no
  // url and the hero renders nothing.
  const heroKey = stage.hero === undefined ? undefined : heroCoverKey(stage.hero, state);
  const heroUrl = heroKey === undefined ? undefined : imageUrls.get(heroKey);
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
    // The cap stays on the WIDE `--reading-measure` after the #1145 split, deliberately: this is a mixed
    // COLUMN, and the header above states its second job — bounding the keyValue rows' label→value scan
    // gap — which a prose measure would over-tighten. The blurb inside it is therefore capped by a column
    // rather than by its own measure, and reads wider than the law's band; closing that means giving the
    // renderer's text node its own `--reading-measure-prose`, which is a plugin-surface change, not a
    // token one. The slot names the stage for the styles tier and the CT pin.
    <Stack className="max-w-(--reading-measure)" data-slot="plugin-detail-stage" gap="block">
      {stage.hero === undefined || heroUrl === undefined ? null : (
        // `max-h-96` (the house big-art cap — the gallery lightbox's own number): an uncapped portrait
        // cover at column width fills the whole viewport and shoves the decision cluster below the fold,
        // which is the exact failure the detail stage exists to prevent. `object-contain` (the primitive's
        // default) keeps the ratio; the hero reads as a cover, not a wall.
        <MessageMedia alt={stage.hero.alt ?? ""} className="max-h-96" media="image" src={{ kind: "asset", url: heroUrl }} />
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
          {/* "Filters" — the house neutral name for a narrowing-control group's own disclosure, never
              minted here: docs/design/vocabulary-map.md's "A group of controls that NARROW a list…" row
              names this exact fallback as one of its landed carriers, beside the Characters pane's group
              and the chats pane's phone Filters row (#1735, side-eye 2026-09-05). */}
          <CollapsibleTrigger size="control">{node.filtersLabel ?? "Filters"}</CollapsibleTrigger>
          <CollapsiblePanel>
            <Stack gap="field">{renderChildren(filters, depth)}</Stack>
          </CollapsiblePanel>
        </Collapsible>
      )}
    </Stack>
  );
}
