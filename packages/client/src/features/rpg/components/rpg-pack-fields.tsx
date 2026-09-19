// The PACK ITEM's CLICK-TO-EDIT FIELD SET — one authoring vocabulary, composed by BOTH pack lenses (the
// grid tile's popover editor and the list row), split out of `rpg-pack-rows.tsx` at the component-size cap.
// The seam is the honest one the family already had: this module owns what a single DATUM of an item looks
// like under each PERMISSION arm (`edit` present = the host's inline field; absent = the stored text, and an
// empty read-only value renders NOTHING rather than a blank labelled slot), while the lenses own the
// anatomy that arranges those data. `PackEdit` lives here because it is the write contract every field in
// this module closes over; `rpg-inventory-tab.tsx` builds it and hands it down.

import type { RpgInventoryItem } from "@orb/contracts/rpg";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { TrackerValue } from "#components";
import { RpgFieldLock } from "./rpg-field-lock.tsx";

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

/** A row's NAME — the host's rename field, else the plain label. */
export function ItemName({ item, edit }: { readonly item: RpgInventoryItem; readonly edit?: PackEdit }): ReactElement {
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
export function ItemQuantity({ item, edit }: { readonly item: RpgInventoryItem; readonly edit?: PackEdit }): ReactElement | null {
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
export function ItemProseLine({
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

/** THE ITEM'S HAND-PIN + its one-tap Release (#78) — rendered only where the item actually carries pins, and
 *  only for a host (the `PackEdit` arm; a member never mounts a control they cannot use). It names the ITEM,
 *  because a pack of eight otherwise offers eight buttons all called "Release" (the side-eye 08-01 rule), and
 *  it hands back every pin the item carries in one gesture. */
export function ItemLockPin({ item, edit }: { readonly item: RpgInventoryItem; readonly edit: PackEdit }): ReactElement | null {
  if (edit.itemLocks(item.id).length === 0) {
    return null;
  }
  return <RpgFieldLock field={item.name} onRelease={(): void => edit.onReleaseItem(item.id)} />;
}
