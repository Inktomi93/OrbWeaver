// The PACK's ROW/CELL family — the two lenses over one item list, split out of the tab (the component-size
// cap; the tab keeps the composition, these keep the anatomy). The GRID cell is the compact multi-column
// lens; the LIST row is the same item read in full AND, for a host, the RV-5 editor: name, quantity,
// location and description are click-to-edit in place, with a confirmed drop. `PackEdit` is the one callback
// set both lenses take (absent = the read-only member arm - PERMISSION-omit, never a disabled twin).
//
// OWNER DOGFOOD (2026-07-31) — the grid was a 3.5rem SQUARE holding a 20px glyph: the quantity was an
// unlabelled corner digit, the location truncated to "belt p…", the name reachable only on hover, and
// authoring meant switching to the list lens. The tile is now the item's own CARD — glyph · name (wrapped,
// a model writes it) · ×N · where it's kept — in a card SHORTER than the square it replaced, and for a host
// it is the trigger for `PackTileEditor`: the SAME click-to-edit field set the list row composes, in a
// popover, through the SAME `PackEdit` write path (one authoring vocabulary, one lock stamp, two lenses).
//
// INV-READ (owner ruling 2026-08-03, "render them"): `description` + `location` are model-written on every
// item (the extraction guidance asks for both by name) and both now READ as text in BOTH lenses. The list row
// already carried the pair; the grid tile carried only `location`, with `description` demoted to the hover
// `title` — and a hover string is not a reader (invisible on touch, not a datum to a screen reader,
// uncopyable). EMPTY IS OMITTED, never a blank labelled row: an item the story hasn't described keeps its
// one-line tile, and the host's editor lens is where a placeholder invites filling it in.

import type { RpgInventoryItem } from "@orb/contracts/rpg";
import { Button } from "@orb/ui/button";
import { Icon, Trash2 } from "@orb/ui/icons";
import { Grid, Row, Stack } from "@orb/ui/layout";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { ConfirmDialog, PICKER_GAP_AT_COARSE, TrackerValue } from "#components";
import { cn } from "#lib";
import { ITEM_ICON_CHOICES, resolveItemIcon } from "../lib/glyphs.ts";
import { RpgFieldLock } from "./rpg-field-lock.tsx";

/** The quest-bound tell - the model-written item `type` naming the quest taxonomy. */
const QUEST_TYPE_RE = /quest/i;

/** The #37c icon-picker popover body — the curated `ITEM_ICON_CHOICES` grid; picking writes the name.
 *
 *  THE COARSE GAP IS THE TOUCH FLOOR (owner ruling 2026-08-07, on side-eye's measured tables). A
 *  `size="glyph-lg"` Button is FLOORLESS — its 44px coarse hit area rides an OVERFLOWING `::after`, not its
 *  32px box — so on a wrapped grid the pseudo is clipped by the gap it shares with the next cell. MEASURED at
 *  430 coarse: box 32×32, `gap-field` 6, pitch 38 both axes, effective hit box **37×37**, 7px under the
 *  floor. (The `no-floorless-control-in-wrap` gate's stated harm — "aiming at one control commits its
 *  neighbour" — was measured FALSE here: all 21 cells hit themselves, because the 6px of pseudo overlap lands
 *  entirely inside the gap. The gate's arm was right; its inherited premise was not. The defect was the floor
 *  alone.) `gap-block` is 12px, which makes the pitch exactly 44 — the cause fixed with the token that
 *  already equals the answer, and the FINE picker is untouched (still `gap-field`, still 5 columns). Cost:
 *  the grid goes 5×5 → 4×6 at coarse, +68px of popover height. */
function ItemIconPicker({ itemName, onPick }: { readonly itemName: string; readonly onPick: (icon: string) => void }): ReactElement {
  return (
    <Row gap="field" className={cn("max-w-(--width-control-col) flex-wrap", PICKER_GAP_AT_COARSE) ?? ""}>
      {Object.entries(ITEM_ICON_CHOICES).map(([name, glyph]) => (
        <Button
          aria-label={`${itemName}: use the ${name} icon`}
          key={name}
          intent="ghost"
          // @orb-waive no-floorless-control-in-wrap(glyph-lg): owner ruling 2026-08-07: PICKER_GAP_AT_COARSE supplies the measured 44px pitch; the boxed-size alternative was declined.
          size="glyph-lg"
          title={`${itemName}: use the ${name} icon`}
          onClick={(): void => onPick(name)}
        >
          <Icon icon={glyph} size="sm" />
        </Button>
      ))}
    </Row>
  );
}

/** The item GLYPH — a plain decoration for a viewer; for the HOST a popover trigger opening the #37c
 *  icon picker (the NAME text stays the datum either way). */
function ItemGlyph({ item, onPickIcon }: { readonly item: RpgInventoryItem; readonly onPickIcon?: (icon: string) => void }): ReactElement {
  const glyph = <Icon icon={resolveItemIcon(item.icon, item.name, item.type)} size="md" className="text-muted-foreground" />;
  if (onPickIcon === undefined) {
    return glyph;
  }
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button intent="ghost" size="inline" aria-label={`${item.name} icon`} title="Pick an icon">
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

/** The tile's hover/focus datum — the whole item in one line. Every part of it is ALSO rendered as text on
 *  the tile (INV-READ); this stays as the one-line read a pointer user gets without scanning the card, never
 *  as the only home of a datum. */
function tileTitle(item: RpgInventoryItem): string {
  const parts = [item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name];
  if (item.location !== "") {
    parts.push(item.location);
  }
  if (item.description !== "") {
    parts.push(item.description);
  }
  return parts.join(" — ");
}

// The tile's own skin, shared by the read-only arm and the host's Button arm so the two lenses are
// pixel-identical at rest (PERMISSION differs in what a CLICK does, never in what the pack looks like).
// A left-aligned card, not the old empty square: the grid track (layout/variants `cols="cell"`) gives it
// the width the item's own words need, and the card is only as tall as those words.
//
// DELIBERATE COMPOSED SKIN, not an intent (the TEACHING_ACTION_BUTTON precedent,
// `chat/surfaces/new-chat-picker-surface.tsx`): `border border-border bg-card` is a CARD tile, not a button
// reading as "outline" or "ghost" — no intent arm owns "a bordered filled card that happens to be
// clickable", and the member arm (`edit === undefined`) below is not even a `Button` (a plain `Row`), so the
// skin cannot be an intent by construction. Composed here, at the one call site both lenses share.
const TILE_CLASS = "relative w-full min-w-0 items-center gap-field rounded-control border border-border bg-card px-row py-field text-left";

/** The tile's INK — the glyph · the name (wrapped) · ×N · the PINNED tell · where it's kept. Shared by both
 *  arms. `pinned` is the #78 affordance's grid half: the tile is itself a Button (the editor's trigger), so it
 *  cannot nest the Release control — it states the fact in TEXT (never colour or a hover string alone: the
 *  tracker-kit a11y model says the text is the datum) and the editor one tap in carries the gesture. */
function PackCellInk({ item, pinned = false }: { readonly item: RpgInventoryItem; readonly pinned?: boolean }): ReactElement {
  return (
    <>
      {QUEST_TYPE_RE.test(item.type) ? (
        // The accent quest-bound dot (primary voice = the game's pulse); the `type` text on the tile
        // title carries the datum (never color-alone).
        <Text as="span" voice="gloss" aria-hidden={true} className="absolute top-field right-field text-primary" title="quest item">
          ●
        </Text>
      ) : null}
      <Icon icon={resolveItemIcon(item.icon, item.name, item.type)} size="sm" className="shrink-0 text-muted-foreground" />
      <Stack gap="field" className="min-w-0 flex-1">
        <Row gap="field" align="baseline" className="min-w-0">
          {/* The NAME is the datum and a model writes it: it WRAPS inside the tile rather than
              truncating away — the tile grows a line, the pack keeps its rhythm (the grid row stretches). */}
          {/* `label` — the tile's NAME, the same voice the LIST row's `ItemName` speaks; a tile whose name
              recedes to `gloss` like its ×N and location has no head to read first. */}
          <Text as="span" voice="label" className="min-w-0 flex-1 break-words">
            {item.name}
          </Text>
          {/* The ×N read, the list row's exact grammar — a stack of one renders nothing (no "×1" noise). */}
          {item.quantity > 1 ? (
            <Text as="span" voice="gloss" className="shrink-0 tabular-nums">
              ×{item.quantity}
            </Text>
          ) : null}
          {/* #78 — the hand-pin TELL. Without it the host had no way to know the story had been fenced off
              this item (the trap fired silently, and the pack simply stopped tracking). */}
          {pinned ? (
            // `pr-block` keeps the word clear of the quest-bound dot, which is absolutely positioned in this
            // same top-right corner — abutting, the two read as one token ("Pinned●") instead of two facts.
            <Text as="span" voice="gloss" className="shrink-0 pr-block" title={PINNED_TITLE}>
              Pinned
            </Text>
          ) : null}
        </Row>
        {/* #37a — WHERE it is kept, on the tile itself (the list lens is no longer the only place it reads).
            Model-authored free text with no length contract: it wraps; empty ⇒ nothing (the editor is where
            an unset location gets filled in, and it says so with a placeholder). */}
        {item.location === "" ? null : (
          <Text as="span" voice="gloss" className="min-w-0 break-words">
            {item.location}
          </Text>
        )}
        {/* INV-READ (owner ruling, 2026-08-03: "render them") — WHAT IT IS, on the tile too. It was reachable
            only through the hover `title` and the list lens, which is not a reader: a hover string is invisible
            on touch, unreadable by a screen reader as a datum, and uncopyable. The tracker-kit a11y model says
            the TEXT is the datum, so it renders as text. Empty ⇒ nothing at all (never a blank labelled row) —
            the tile keeps its one-line density for the items the story hasn't described. */}
        {item.description === "" ? null : (
          <Text as="span" voice="gloss" className="min-w-0 break-words">
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
      <Row gap="field" className={TILE_CLASS} data-slot="rpg-pack-cell" title={tileTitle(item)}>
        <PackCellInk item={item} />
      </Row>
    );
  }
  const pinned = edit.itemLocks(item.id).length > 0;
  return (
    <Popover modal={true}>
      {/* `modal` — this popover carries INPUT (the click-to-edit tile form); the rule + its receipt live on
      `Popover` in @orb/ui's popover.tsx (#2444). The ICON picker above is a one-tap commit grid and stays
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
            title={pinned ? `${tileTitle(item)} — ${PINNED_TITLE}` : tileTitle(item)}
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

/** The host's per-item write callbacks (absent ⇒ the read-only member arm — PERMISSION-omit). */
export interface PackEdit {
  readonly onPickIcon: (itemId: string, icon: string) => void;
  readonly onPatchItem: (itemId: string, patch: Partial<RpgInventoryItem>) => void;
  readonly onRemoveItem: (itemId: string) => void;
  readonly onAddItem: (name: string) => void;
  /** The hand pins THIS item carries (#78 — `…inventory.<id>.<field>`), in stored order; empty ⇒ the story
   *  still owns every field of it. The panel renders the tell from this list and hands the WHOLE list back on
   *  Release: a per-field residue would leave a pin no lens renders and no gesture can reach. */
  readonly itemLocks: (itemId: string) => readonly string[];
  /** Release every pin this item carries — "let the story write it again" (rides `editSnapshot`, the one lock
   *  author: an empty patch + `releaseLocks`). */
  readonly onReleaseItem: (itemId: string) => void;
}

/** The pinned tile's hover/title sentence — the grid tile states the FACT, and the tile's own editor (one tap,
 *  the same popover every other per-item gesture lives in) carries the Release. */
const PINNED_TITLE = "Pinned by hand — the story won't change this. Open the item to release it.";

/** A row's NAME — the host's rename field, else the plain label. */
function ItemName({ item, edit }: { readonly item: RpgInventoryItem; readonly edit?: PackEdit }): ReactElement {
  if (edit === undefined) {
    return (
      <Text as="span" voice="label" className="min-w-0 break-words">
        {item.name}
      </Text>
    );
  }
  return (
    <TrackerValue
      ariaLabel={`${item.name} name`}
      display={item.name}
      // A model names the items: no length contract, so the name WRAPS rather than truncating away the
      // datum (the TrackerValue `wrap` arm — the text IS the value).
      wrap={true}
      onEdit={(next): void => {
        const trimmed = next.trim();
        // Tier-2 refusal: the item schema requires a name — a blank one never sends.
        if (trimmed !== "") {
          edit.onPatchItem(item.id, { name: trimmed });
        }
      }}
      className="min-w-0 flex-1"
    />
  );
}

/** A row's QUANTITY — editable for the host; a read-only 1 renders nothing (no `×1` noise). */
function ItemQuantity({ item, edit }: { readonly item: RpgInventoryItem; readonly edit?: PackEdit }): ReactElement | null {
  if (edit === undefined) {
    return item.quantity > 1 ? (
      <Text as="span" voice="gloss" className="shrink-0 tabular-nums">
        ×{item.quantity}
      </Text>
    ) : null;
  }
  return (
    <Row gap="field" align="baseline" className="shrink-0">
      <Text as="span" voice="gloss" aria-hidden={true}>
        ×
      </Text>
      <TrackerValue
        ariaLabel={`${item.name} quantity`}
        display={String(item.quantity)}
        kind="numeric"
        size="micro"
        onEdit={(next): void => {
          const n = Number.parseInt(next, 10);
          if (!Number.isNaN(n)) {
            // Tier-1 clamp: the schema floor is 1 — dropping the item is the delete affordance.
            edit.onPatchItem(item.id, { quantity: Math.max(1, n) });
          }
        }}
        className="!w-avatar-md px-field text-right tabular-nums"
        restClassName="tabular-nums"
      />
    </Row>
  );
}

/** One of the row's two prose lines (location / description): the host's inline field, else the stored text
 *  (empty ⇒ nothing — a read-only viewer never sees an empty labelled slot). */
function ItemProseLine({
  item,
  value,
  field,
  placeholder,
  edit,
}: {
  readonly item: RpgInventoryItem;
  readonly value: string;
  readonly field: "location" | "description";
  readonly placeholder: string;
  readonly edit?: PackEdit;
}): ReactElement | null {
  if (edit === undefined) {
    return value === "" ? null : (
      <Text as="span" voice="gloss" className="min-w-0 break-words">
        {value}
      </Text>
    );
  }
  return (
    <TrackerValue
      ariaLabel={`${item.name} ${field}`}
      display={value}
      // Model-authored prose (where it's kept / what it is) — it wraps; a truncated location was the
      // owner-reported "…" line that hid the datum it existed to show.
      wrap={true}
      placeholder={placeholder}
      tone="muted"
      size="micro"
      onEdit={(next): void => edit.onPatchItem(item.id, { [field]: next.trim() })}
      className="min-w-0 flex-1"
    />
  );
}

/** The GRID tile's editor (owner dogfood): the SAME click-to-edit grammar the list row uses — name · ×qty ·
 *  location · description, plus the icon pick and the confirmed drop — in a popover anchored on the tile. No
 *  bespoke form and no second write path: it composes the very same field components the list row composes,
 *  so one authoring vocabulary serves both lenses. */
function PackTileEditor({ item, edit }: { readonly item: RpgInventoryItem; readonly edit: PackEdit }): ReactElement {
  return (
    <Stack gap="row" className="w-(--width-control-col)" data-slot="rpg-pack-tile-editor">
      <Row gap="field" align="center" className="min-w-0">
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
            <Button intent="ghost" size="sm" title={`Drop item: ${item.name}`}>
              <Icon icon={Trash2} size="xs" />
              Drop
            </Button>
          }
        />
      </Row>
    </Stack>
  );
}

/** THE ITEM'S HAND-PIN + its one-tap Release (#78) — rendered only where the item actually carries pins, and
 *  only for a host (the `PackEdit` arm; a member never mounts a control they cannot use). It names the ITEM,
 *  because a pack of eight otherwise offers eight buttons all called "Release" (the side-eye 08-01 rule), and
 *  it hands back every pin the item carries in one gesture. */
function ItemLockPin({ item, edit }: { readonly item: RpgInventoryItem; readonly edit: PackEdit }): ReactElement | null {
  if (edit.itemLocks(item.id).length === 0) {
    return null;
  }
  return <RpgFieldLock field={item.name} onRelease={(): void => edit.onReleaseItem(item.id)} />;
}

/** One LIST row (#37b) — glyph · name · ×qty · the hand pin · location · description. For a host this row IS
 *  the editor (RV-5): every datum is click-to-edit in place and the row carries a confirmed delete. */
function PackListRow({ item, edit }: { readonly item: RpgInventoryItem; readonly edit?: PackEdit }): ReactElement {
  return (
    <Row gap="field" align="center" className="rounded-base border border-border bg-card px-block py-row" data-slot="rpg-pack-row">
      <ItemGlyph item={item} {...(edit === undefined ? {} : { onPickIcon: (icon: string): void => edit.onPickIcon(item.id, icon) })} />
      <Stack gap="field" className="min-w-0 flex-1">
        <Row gap="field" align="baseline" className="min-w-0">
          <ItemName item={item} {...(edit === undefined ? {} : { edit })} />
          <ItemQuantity item={item} {...(edit === undefined ? {} : { edit })} />
          {/* The LIST lens is the EDIT lens, and it is not a Button itself — so here the pin IS the Release,
              one tap, exactly as every other pinned datum in the panel offers it. */}
          {edit === undefined ? null : <ItemLockPin item={item} edit={edit} />}
        </Row>
        {/* #37a/RV-5 — WHERE it is kept. Stored since day one, asked of the model in the extraction guidance,
            and until now unreachable from the product. */}
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
            <Button aria-label={`Drop item: ${item.name}`} intent="ghost" size="glyph-sm" title={`Drop item: ${item.name}`}>
              <Icon icon={Trash2} size="xs" />
            </Button>
          }
        />
      )}
    </Row>
  );
}

/** The pack body — the OSRS grid or the #37b list view (the host's EDIT lens).
 *
 *  NO GHOST SOCKET (side-eye 08-01). The grid used to end on one dashed `aria-hidden` cell called "the
 *  pack's growth affordance", which is what it was NOT: 150×28px of empty bordered box, no word in it,
 *  nothing to click, and — for the member who cannot author at all — a permanent empty slot suggesting the
 *  pack was mid-load. The host's real growth affordance is the `AddRow` directly under this grid (one add
 *  home for both lenses, RV-5); a second, mute one beside it was decoration wearing an affordance's clothes. */
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
