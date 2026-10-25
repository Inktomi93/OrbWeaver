// The PACK's ROW/CELL family — the two lenses over one item list, split out of the tab (the component-size
// cap; the tab keeps the composition, these keep the anatomy). The GRID cell is the compact multi-column
// lens; the LIST row is the same item read in full AND, for a host, the editor: name, quantity,
// location and description are click-to-edit in place, with a confirmed drop. `PackEdit` is the one callback
// set both lenses take (absent = the read-only member arm - PERMISSION-omit, never a disabled twin) — and
// `PackEdit` plus the per-datum field components it drives live one file over in `rpg-pack-fields.tsx`
// (the component-size cap again): this module owns the two ANATOMIES, that one owns what a single datum
// looks like under each permission arm.
//
// THE TILE IS THE ITEM'S OWN CARD (an owner call) — glyph · name (wrapped, a model writes it) · ×N · where
// it's kept — so no datum is an unlabelled corner digit or a hover-only name, and for a host it is the trigger for `PackTileEditor`: the SAME click-to-edit field set the list row composes, in a
// popover, through the SAME `PackEdit` write path (one authoring vocabulary, one lock stamp, two lenses).
//
// RENDER THEM (an owner ruling): `description` + `location` are model-written on every item (the extraction
// guidance asks for both by name) and both READ as text in BOTH lenses — a hover string is not a reader
// (invisible on touch, not a datum to a screen reader, uncopyable). EMPTY IS OMITTED, never a blank labelled row: an item the story hasn't described keeps its
// one-line tile, and the host's editor lens is where a placeholder invites filling it in.

import type { RpgInventoryItem } from "@orb/contracts/rpg";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Icon, Trash2 } from "@orb/ui/icons";
import { Grid, Row, Stack } from "@orb/ui/layout";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { ConfirmDialog, Tip } from "#components";
import { ITEM_ICON_CHOICES, resolveItemIcon } from "../lib/glyphs.ts";
import type { PackEdit } from "./rpg-pack-fields.tsx";
import { ItemLockPin, ItemName, ItemProseLine, ItemQuantity } from "./rpg-pack-fields.tsx";

/** The quest-bound tell - the model-written item `type` naming the quest taxonomy. */
const QUEST_TYPE_RE = /quest/i;

/** The icon-picker popover body — the curated `ITEM_ICON_CHOICES` grid; picking writes the name.
 *
 *  THE COARSE GAP IS THE TOUCH FLOOR (an owner ruling). A `size="glyph-lg"` Button is FLOORLESS — its coarse
 *  hit area rides an OVERFLOWING `::after`, not its own box — so on a wrapped grid the pseudo is clipped by the
 *  gap it shares with the next cell and the effective hit box falls under the floor. `gap-block` makes the
 *  coarse pitch exactly the touch target, and the FINE picker is untouched (still `gap-field`). The cost is
 *  one fewer column and a taller popover at coarse. */
function ItemIconPicker({ itemName, onPick }: { readonly itemName: string; readonly onPick: (icon: string) => void }): ReactElement {
  return (
    <Row gap="field" touchFloor="gap" className="flex-wrap max-inline-(--width-control-col)">
      {Object.entries(ITEM_ICON_CHOICES).map(([name, glyph]) => (
        <Tip key={name} text={`${itemName}: use the ${name} icon`}>
          <Button
            aria-label={`${itemName}: use the ${name} icon`}
            intent="ghost"
            // eslint-disable-next-line orb/no-floorless-control-in-wrap -- touchFloor="gap" supplies the measured touch-target pitch without changing the fine picker; ends when this geometry or floorless size changes.
            size="glyph-lg"
            onClick={(): void => onPick(name)}
          >
            <Icon icon={glyph} size="sm" />
          </Button>
        </Tip>
      ))}
    </Row>
  );
}

/** The item GLYPH — a plain decoration for a viewer; for the HOST a popover trigger opening the #37c
 *  icon picker (the NAME text stays the datum either way). */
function ItemGlyph({ item, onPickIcon }: { readonly item: RpgInventoryItem; readonly onPickIcon?: (icon: string) => void }): ReactElement {
  const glyph = <Icon icon={resolveItemIcon(item.icon, item.name, item.type)} size="md" tone="muted" />;
  if (onPickIcon === undefined) {
    return glyph;
  }
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button intent="ghost" size="inline" aria-label={`Pick an icon for ${item.name}`}>
            {glyph}
          </Button>
        }
      />
      <PopoverPopup>
        <ItemIconPicker itemName={item.name} onPick={onPickIcon} />
      </PopoverPopup>
    </Popover>
  );
}

// The tile's own skin, shared by the read-only arm and the host's Button arm so the two lenses are
// pixel-identical at rest (PERMISSION differs in what a CLICK does, never in what the pack looks like).
// A left-aligned card: the grid track (layout/variants `cols="cell"`) gives it
// the width the item's own words need, and the card is only as tall as those words.
//
// DELIBERATE COMPOSED SKIN, not an intent (the TEACHING_ACTION_BUTTON precedent,
// `chat/surfaces/new-chat-picker-surface.tsx`): `border border-border bg-card` is a CARD tile, not a button
// reading as "outline" or "ghost" — no intent arm owns "a bordered filled card that happens to be
// clickable", and the member arm (`edit === undefined`) below is not even a `Button` (a plain `Row`), so the
// skin cannot be an intent by construction. Composed here, at the one call site both lenses share.
const TILE_CLASS = "relative inline-full min-inline-0 items-center gap-field rounded-control border border-border bg-card px-row py-field text-start";

/** The tile's INK — the glyph · the name (wrapped) · ×N · the PINNED tell · where it's kept. Shared by both
 *  arms. `pinned` is the per-item pin's grid half: the tile is itself a Button (the editor's trigger), so it
 *  cannot nest the Release control — it states the fact in TEXT (never colour or a hover string alone: the
 *  tracker-kit a11y model says the text is the datum) and the editor one tap in carries the gesture. */
function PackCellInk({ item, pinned = false }: { readonly item: RpgInventoryItem; readonly pinned?: boolean }): ReactElement {
  return (
    <>
      {QUEST_TYPE_RE.test(item.type) ? (
        // The accent quest-bound dot (primary voice = the game's pulse); the `type` text on the tile
        // title carries the datum (never color-alone).
        <Text as="span" voice="gloss" aria-hidden={true} className="absolute inset-e-field inset-bs-field" tone="accent">
          ●
        </Text>
      ) : null}
      <Icon icon={resolveItemIcon(item.icon, item.name, item.type)} size="sm" tone="muted" className="shrink-0" />
      <Stack gap="field" className="flex-1 min-inline-0">
        <Row gap="field" align="baseline" className="min-inline-0">
          {/* The NAME is the datum and a model writes it: it WRAPS inside the tile rather than
              truncating away — the tile grows a line, the pack keeps its rhythm (the grid row stretches). */}
          {/* `label` — the tile's NAME, the same voice the LIST row's `ItemName` speaks; a tile whose name
              recedes to `gloss` like its ×N and location has no head to read first. */}
          <Text as="span" voice="label" className="flex-1 wrap-break-word min-inline-0">
            {item.name}
          </Text>
          {/* The ×N read, the list row's exact grammar — a stack of one renders nothing (no "×1" noise). */}
          {item.quantity > 1 ? (
            <Text as="span" voice="gloss" numeric={true} className="shrink-0">
              ×{item.quantity}
            </Text>
          ) : null}
          {/* The hand-pin TELL, so the host can see the story is held off this item; the tile editor one tap
              in explains the pin and carries its Release. */}
          {pinned ? (
            // `pr-block` keeps the word clear of the quest-bound dot, which is absolutely positioned in this
            // same top-right corner — abutting, the two read as one token ("Pinned●") instead of two facts.
            <Text as="span" voice="gloss" className="shrink-0 pe-block">
              Pinned
            </Text>
          ) : null}
        </Row>
        {/* #37a — WHERE it is kept, on the tile itself (the list lens is no longer the only place it reads).
            Model-authored free text with no length contract: it wraps; empty ⇒ nothing (the editor is where
            an unset location gets filled in, and it says so with a placeholder). */}
        {item.location === "" ? null : (
          <Text as="span" voice="gloss" className="wrap-break-word min-inline-0">
            {item.location}
          </Text>
        )}
        {/* WHAT IT IS, on the tile too (an owner ruling: "render them"). The tracker-kit a11y model says the
            TEXT is the datum, so it renders as text. Empty ⇒ nothing at all (never a blank labelled row) —
            the tile keeps its one-line density for the items the story hasn't described. */}
        {item.description === "" ? null : (
          <Text as="span" voice="gloss" className="wrap-break-word min-inline-0">
            {item.description}
          </Text>
        )}
      </Stack>
    </>
  );
}

/** One GRID pack cell. A MEMBER (no `edit`) gets the static tile; a HOST gets the same tile as the trigger
 *  for its item editor (the owner dogfood call — the grid was glanceable-only, so authoring meant switching
 *  lenses). PERMISSION-omit, never a disabled twin. */
function PackCell({ item, edit }: { readonly item: RpgInventoryItem; readonly edit?: PackEdit }): ReactElement {
  if (edit === undefined) {
    return (
      <Row gap="field" className={TILE_CLASS} data-slot="rpg-pack-cell">
        <PackCellInk item={item} />
      </Row>
    );
  }
  const pinned = edit.itemLocks(item.id).length > 0;
  return (
    <Popover modal={true}>
      {/* `modal` — this popover carries INPUT (the click-to-edit tile form); the rule + its receipt live on
      `Popover` in @orb/ui's popover.tsx. The ICON picker above is a one-tap commit grid and stays
      unfenced. */}
      <PopoverTrigger
        render={
          <Button
            intent="ghost"
            // The Button skin is a control (fixed height, nowrap, centered) — the tile is a card, so it takes
            // the `inline` arm (no control height, start-aligned, regular weight) and lets the item's words
            // wrap inside the tile's own padding.
            size="inline"
            className={`whitespace-normal ${TILE_CLASS}`}
            aria-label={`Edit ${item.name}`}
            data-slot="rpg-pack-cell"
          >
            <PackCellInk item={item} pinned={pinned} />
          </Button>
        }
      />
      <PopoverPopup>
        <PackTileEditor item={item} edit={edit} />
      </PopoverPopup>
    </Popover>
  );
}

/** The GRID tile's editor (owner dogfood): the SAME click-to-edit grammar the list row uses — name · ×qty ·
 *  location · description, plus the icon pick and the confirmed drop — in a popover anchored on the tile. No
 *  bespoke form and no second write path: it composes the very same field components the list row composes,
 *  so one authoring vocabulary serves both lenses. */
function PackTileEditor({ item, edit }: { readonly item: RpgInventoryItem; readonly edit: PackEdit }): ReactElement {
  return (
    <Stack gap="row" className="inline-(--width-control-col)" data-slot="rpg-pack-tile-editor">
      <Row gap="field" align="center" className="min-inline-0">
        <ItemGlyph item={item} onPickIcon={(icon: string): void => edit.onPickIcon(item.id, icon)} />
        <ItemName item={item} edit={edit} />
        <ItemQuantity item={item} edit={edit} />
        <ItemLockPin item={item} edit={edit} />
      </Row>
      <ItemProseLine item={item} value={item.location} field="location" placeholder="where it's kept…" edit={edit} />
      <ItemProseLine item={item} value={item.description} field="description" placeholder="what it is…" edit={edit} />
      <Row gap="field" justify="end">
        <ConfirmDialog
          title={`Drop "${item.name}"?`}
          description="The item leaves the pack for good. The chronicle keeps whatever already happened in the story."
          confirmLabel="Drop"
          onConfirm={(): void => edit.onRemoveItem(item.id)}
          trigger={
            <Button aria-label={`Drop item: ${item.name}`} intent="ghost" size="sm">
              <Icon icon={Trash2} size="xs" />
              Drop
            </Button>
          }
        />
      </Row>
    </Stack>
  );
}

/** One LIST row — glyph · name · ×qty · the hand pin · location · description. For a host this row IS
 *  the editor: every datum is click-to-edit in place and the row carries a confirmed delete. */
function PackListRow({ item, edit }: { readonly item: RpgInventoryItem; readonly edit?: PackEdit }): ReactElement {
  return (
    <Card tone="neutral">
      <Row gap="field" align="center" data-slot="rpg-pack-row">
        <ItemGlyph item={item} {...(edit === undefined ? {} : { onPickIcon: (icon: string): void => edit.onPickIcon(item.id, icon) })} />
        <Stack gap="field" className="flex-1 min-inline-0">
          <Row gap="field" align="baseline" className="min-inline-0">
            <ItemName item={item} {...(edit === undefined ? {} : { edit })} />
            <ItemQuantity item={item} {...(edit === undefined ? {} : { edit })} />
            {/* The LIST lens is the EDIT lens, and it is not a Button itself — so here the pin IS the Release,
              one tap, exactly as every other pinned datum in the panel offers it. */}
            {edit === undefined ? null : <ItemLockPin item={item} edit={edit} />}
          </Row>
          {/* WHERE it is kept — stored by the schema and asked of the model in the extraction guidance. */}
          <ItemProseLine item={item} value={item.location} field="location" placeholder="where it's kept…" {...(edit === undefined ? {} : { edit })} />
          <ItemProseLine item={item} value={item.description} field="description" placeholder="what it is…" {...(edit === undefined ? {} : { edit })} />
        </Stack>
        {edit === undefined ? null : (
          <ConfirmDialog
            title={`Drop "${item.name}"?`}
            description="The item leaves the pack for good. The chronicle keeps whatever already happened in the story."
            confirmLabel="Drop"
            onConfirm={(): void => edit.onRemoveItem(item.id)}
            trigger={
              <Button aria-label={`Drop item: ${item.name}`} intent="ghost" size="glyph-sm">
                <Icon icon={Trash2} size="xs" />
              </Button>
            }
          />
        )}
      </Row>
    </Card>
  );
}

/** The pack body — the OSRS grid or the list view (the host's EDIT lens).
 *
 *  NO GHOST SOCKET. An empty dashed cell has no word and nothing to click, and to a member who cannot author it
 *  reads as a pack mid-load. The host's growth affordance is the `AddRow` directly under this grid (one add home
 *  for both lenses). */
export function PackBody({
  view,
  items,
  edit,
}: {
  readonly view: "grid" | "list";
  readonly items: readonly RpgInventoryItem[];
  readonly edit?: PackEdit;
}): ReactElement {
  if (view === "grid") {
    return (
      <Grid cols="cell" gap="field">
        {items.map((item) => (
          <PackCell key={item.id} item={item} {...(edit === undefined ? {} : { edit })} />
        ))}
      </Grid>
    );
  }
  return (
    <Stack gap="field" rows="control">
      {items.map((item) => (
        <PackListRow key={item.id} item={item} {...(edit === undefined ? {} : { edit })} />
      ))}
    </Stack>
  );
}
