// The PACK's ROW/CELL family — the two lenses over one item list, split out of the tab (the component-size
// cap; the tab keeps the composition, these keep the anatomy). The GRID cell is the OSRS glanceable pack; the
// LIST row is the same item read in full AND, for a host, the RV-5 editor: name, quantity, location and
// description are click-to-edit in place, with a confirmed drop. `PackEdit` is the one callback set both
// lenses take (absent = the read-only member arm - PERMISSION-omit, never a disabled twin).

import type { RpgInventoryItem } from "@orb/contracts/rpg";
import { Button } from "@orb/ui/button";
import { Icon, Trash2 } from "@orb/ui/icons";
import { Grid, Row, Stack } from "@orb/ui/layout";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { ConfirmDialog, TrackerValue } from "#components";
import { ITEM_ICON_CHOICES, resolveItemIcon } from "../lib/glyphs";

/** The quest-bound tell - the model-written item `type` naming the quest taxonomy (DESIGN.md 12.2). */
const QUEST_TYPE_RE = /quest/i;

/** The #37c icon-picker popover body — the curated `ITEM_ICON_CHOICES` grid; picking writes the name. */
function ItemIconPicker({ itemName, onPick }: { readonly itemName: string; readonly onPick: (icon: string) => void }): ReactElement {
  return (
    <Row gap="field" className="max-w-control-col flex-wrap">
      {Object.entries(ITEM_ICON_CHOICES).map(([name, glyph]) => (
        <Button key={name} intent="ghost" size="sm" className="!size-8 !p-0" title={`${itemName}: use the ${name} icon`} onClick={(): void => onPick(name)}>
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
          <Button intent="ghost" size="sm" className="!h-auto !p-0" aria-label={`${item.name} icon`} title="Pick an icon">
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

/** One GRID pack cell — glyph · corner qty · quest ember · the #37a location micro line. */
function PackCell({ item, onPickIcon }: { readonly item: RpgInventoryItem; readonly onPickIcon?: (icon: string) => void }): ReactElement {
  const questBound = QUEST_TYPE_RE.test(item.type);
  return (
    <Stack
      gap="field"
      align="center"
      className="relative aspect-square justify-center rounded-card border border-border bg-card px-field py-field text-center"
      data-slot="rpg-pack-cell"
      title={item.description === "" ? item.name : `${item.name} — ${item.description}`}
    >
      {item.quantity > 1 ? (
        <Text as="span" size="micro" tone="muted" className="absolute right-field top-field tabular-nums">
          {item.quantity}
        </Text>
      ) : null}
      {questBound ? (
        // The ember quest-bound dot (§3 voice: primary = the game's pulse); the `type` text on
        // title carries the datum (never color-alone).
        <Text as="span" aria-hidden={true} className="absolute left-field top-field text-primary" size="micro" title="quest item">
          ●
        </Text>
      ) : null}
      <ItemGlyph item={item} {...(onPickIcon === undefined ? {} : { onPickIcon })} />
      {/* #37a — the item LOCATION (where it's kept/stashed), display-only; empty = nothing. */}
      {item.location === "" ? null : (
        <Text as="span" size="micro" tone="muted" className="max-w-full truncate">
          {item.location}
        </Text>
      )}
      {/* The mock's 5/6-up density carries the NAME on title/hover; the visually-hidden text
          keeps it the accessible datum (the tracker-kit a11y model — glyphs stay decoration). */}
      <Text as="span" size="micro" className="sr-only">
        {item.name}
      </Text>
    </Stack>
  );
}

/** The host's per-item write callbacks (absent ⇒ the read-only member arm — PERMISSION-omit). */
export interface PackEdit {
  readonly onPickIcon: (itemId: string, icon: string) => void;
  readonly onPatchItem: (itemId: string, patch: Partial<RpgInventoryItem>) => void;
  readonly onRemoveItem: (itemId: string) => void;
  readonly onAddItem: (name: string) => void;
}

/** A row's NAME — the host's rename field, else the plain label. */
function ItemName({ item, edit }: { readonly item: RpgInventoryItem; readonly edit?: PackEdit }): ReactElement {
  if (edit === undefined) {
    return (
      <Text as="span" size="label" weight="semibold" className="truncate">
        {item.name}
      </Text>
    );
  }
  return (
    <TrackerValue
      ariaLabel={`${item.name} name`}
      display={item.name}
      onEdit={(next): void => {
        const trimmed = next.trim();
        // Tier-2 refusal (§12.3): the item schema requires a name — a blank one never sends.
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
      <Text as="span" size="micro" tone="muted" className="shrink-0 tabular-nums">
        ×{item.quantity}
      </Text>
    ) : null;
  }
  return (
    <Row gap="field" align="baseline" className="shrink-0">
      <Text as="span" size="micro" tone="muted" aria-hidden={true}>
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
            // Tier-1 clamp (§12.3): the schema floor is 1 — dropping the item is the delete affordance.
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
      <Text as="span" size="micro" tone="muted" className="truncate">
        {value}
      </Text>
    );
  }
  return (
    <TrackerValue
      ariaLabel={`${item.name} ${field}`}
      display={value}
      placeholder={placeholder}
      tone="muted"
      size="micro"
      onEdit={(next): void => edit.onPatchItem(item.id, { [field]: next.trim() })}
      className="min-w-0 flex-1"
    />
  );
}

/** One LIST row (#37b) — glyph · name · ×qty · location · description. For a host this row IS the editor
 *  (RV-5): every datum is click-to-edit in place and the row carries a confirmed delete. */
function PackListRow({ item, edit }: { readonly item: RpgInventoryItem; readonly edit?: PackEdit }): ReactElement {
  return (
    <Row gap="field" align="center" className="rounded-card border border-border bg-card px-block py-row" data-slot="rpg-pack-row">
      <ItemGlyph item={item} {...(edit === undefined ? {} : { onPickIcon: (icon: string): void => edit.onPickIcon(item.id, icon) })} />
      <Stack gap="field" className="min-w-0 flex-1">
        <Row gap="field" align="baseline" className="min-w-0">
          <ItemName item={item} {...(edit === undefined ? {} : { edit })} />
          <ItemQuantity item={item} {...(edit === undefined ? {} : { edit })} />
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
            <Button intent="ghost" size="sm" className="!size-5 !p-0 shrink-0" title={`Drop item: ${item.name}`}>
              <Icon icon={Trash2} size="xs" />
            </Button>
          }
        />
      )}
    </Row>
  );
}

/** The pack body — the OSRS grid (+ the one ghost socket) or the #37b list view (the host's EDIT lens). */
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
          <PackCell key={item.id} item={item} {...(edit === undefined ? {} : { onPickIcon: (icon: string): void => edit.onPickIcon(item.id, icon) })} />
        ))}
        {/* ONE dashed ghost socket — the pack's growth affordance (never a fake capacity grid). */}
        <Stack
          aria-hidden={true}
          gap="field"
          align="center"
          className="aspect-square justify-center rounded-card border border-dashed border-border px-field py-field"
          data-slot="rpg-pack-ghost"
        />
      </Grid>
    );
  }
  return (
    <Stack gap="field">
      {items.map((item) => (
        <PackListRow key={item.id} item={item} {...(edit === undefined ? {} : { edit })} />
      ))}
    </Stack>
  );
}
