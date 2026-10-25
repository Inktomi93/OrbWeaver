// The transcript row's three layout boxes — the root on its track, the body that holds the identity gutter beside the
// column, and the content column — shared by the settled row and the streaming ghost, which must lay out identically
// or a live turn reflows as it settles.

import type { MessageRole } from "@orb/kit/message-role";
import { Row, Stack } from "@orb/ui/layout";
import type { ComponentProps, ReactElement } from "react";
import { Track } from "../lib/chat-track.tsx";
import type { RowSkin } from "../lib/message-row-variants.ts";
import { rowAlignFor } from "../lib/row-placement.ts";

/** The row's root on the skin's track. `hoverGroup` makes it the `group` its action cluster reveals on. */
export function MessageRowRoot({
  skin,
  messageRole,
  hoverGroup,
  ...props
}: ComponentProps<typeof Stack> & { readonly skin: RowSkin; readonly messageRole: MessageRole; readonly hoverGroup: boolean }): ReactElement {
  return (
    <Track
      of={Stack}
      track={skin.track}
      {...props}
      container={true}
      gap="row"
      align={rowAlignFor(skin, messageRole)}
      className={hoverGroup ? "group" : undefined}
    />
  );
}

// `min-inline-0 max-inline-full`: a wide child (a code line) may not widen the row past its track. The body spans the
// track at every placement: a body that hugged its content made a bubble's phone cap a share of the bubble itself, and
// sat a centred skin's short rows in narrow, sliding columns. At a phone width only the gap tightens; the chip keeps the
// reader's own size and is never hidden (owner ruling, as Moonlit Echoes keeps its 40px avatar on a phone).
const ROW_BODY = "inline-full min-inline-0 max-inline-full @max-cq-28:gap-field";

/** The row body (#1728 arm B): a flex line for an `anchored` skin, the three `gutterCentred` rails for a centred one.
 *  Tracks on the same element rather than a swapped one, because swapping the element at a width step would remount
 *  the row and drop mid-edit state. */
export function MessageRowBody({ skin, ...props }: ComponentProps<typeof Row> & { readonly skin: RowSkin }): ReactElement {
  return (
    <Row
      {...props}
      align="start"
      gap="row"
      data-slot="message-row-body"
      tracks={skin.columnPlacement === "gutterCentred" ? "gutterCentred" : undefined}
      className={ROW_BODY}
    />
  );
}

// The centred skins' column is ONE width for every row: the reading measure, less the two identity rails where the row
// is too narrow for it. It is placed in the centred rail explicitly at every width, because a row with no chip (system,
// avatars off, document) would otherwise auto-place into the content-sized gutter track.
const CENTRED_COLUMN = "col-start-2 min-inline-0 flex-1 @cq-56:inline-(--centred-column-width)";
const ANCHORED_COLUMN = "min-inline-0 flex-1";
// A train's column hugs its widest pill, so the speaker row above it and the pager under it share the train's edges;
// the phone cap (nine tenths, owner ruling) sits on the column for the same reason. A mirrored train packs to the
// trailing edge, beside its own chip.
const TRAIN_COLUMN = "min-inline-0 max-inline-full @max-cq-28:max-inline-9/10";
const MIRRORED_TRAIN_COLUMN = "min-inline-0 max-inline-full ms-auto @max-cq-28:max-inline-9/10";

/** The content column for this skin's placement. A MIRRORED row packs its content to the column's trailing edge, so a
 *  phone-capped bubble sits flush against its chip and the cap's gap falls on the far side. */
export function MessageContentColumn({
  skin,
  mirrored,
  ...props
}: ComponentProps<typeof Stack> & { readonly skin: RowSkin; readonly mirrored: boolean }): ReactElement {
  const align = mirrored ? "end" : undefined;
  if (skin.columnPlacement === "gutterCentred") {
    return <Stack {...props} gap="row" data-slot="message-content-column" align={align} className={CENTRED_COLUMN} />;
  }
  if (skin.bubbleLayout !== "trains") {
    return <Stack {...props} gap="row" data-slot="message-content-column" align={align} className={ANCHORED_COLUMN} />;
  }
  return <Stack {...props} gap="row" data-slot="message-content-column" align={align} className={mirrored ? MIRRORED_TRAIN_COLUMN : TRAIN_COLUMN} />;
}
