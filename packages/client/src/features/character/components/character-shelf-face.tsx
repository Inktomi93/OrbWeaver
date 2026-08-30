// The Characters landing's FACE — one character as a portrait you press (#864).
//
// It is the chats HOME quick-picks shelf cell's anatomy (`features/chat/components/home-quick-picks-tile-body.tsx`),
// rebuilt here rather than imported: `client-features-no-cross` seals a feature's components from another
// feature, and the two cells are the same PATTERN with different jobs — that one starts a chat, this one
// opens somebody in the editor beside the list. Every ruling that cell paid for is carried across
// deliberately, and each is restated where it applies:
//   · the NAME is the button's `aria-label` and the caption rides `aria-describedby`, because adjacent
//     inline nodes concatenate with no separator and AT read the two as one run-on string;
//   · the name and the pitch both RESERVE two lines (`lines={2}`), so cells in one row end at one baseline
//     instead of a ragged edge;
//   · the pitch is `prose`, which lifts a sentence-length gloss to a legible step inside a button;
//   · a cell with nothing to say in a slot renders NOTHING there (#119 — no line beats an invented one).
//
// WHAT IS NEW HERE, and why the cell is not just the other one moved: the shelf supplies BOTH caption slots
// itself (`stamp` mono, `caption` prose) instead of deriving them, because the three shelves say different
// things about the same person — "chatted 3h ago · 4 chats" on Recently chatted, nothing on Starred,
// "Added Aug 29" on Just added. Deriving inside the cell would mean the cell knowing which shelf it is in.
//
// D44 — the portrait goes through the `Avatar` media primitive and NOTHING is drawn over the art except the
// starred MARK, which is a glyph rather than prose. The mark rides `<Layer>` (one grid cell, both children
// in flow) rather than an absolute pair, so the art still sizes the cell.

import { blobUrl } from "@orb/contracts/assets";
import type { CharacterId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { Icon, Star } from "@orb/ui/icons";
import { Layer, Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

export interface CharacterShelfFaceProps {
  readonly id: CharacterId;
  readonly name: string;
  /** CAS key — null falls back to the hue-seeded initials blob (the `Avatar` primitive's own fallback). */
  readonly avatarHash: string | null;
  readonly starred: boolean;
  /** The mono stamp line ("chatted 3h ago · 4 chats" / "Added Aug 29"); null renders no line at all. */
  readonly stamp: string | null;
  /** The prose gloss under the stamp (the elevator pitch); null renders no line at all. */
  readonly caption: string | null;
  /** The caption element's id — minted ONCE per shelf and suffixed by this face's id, never a hook in a map. */
  readonly captionId: string;
  readonly onOpen: (id: CharacterId) => void;
}

export function CharacterShelfFace({ id, name, avatarHash, starred, stamp, caption, captionId, onOpen }: CharacterShelfFaceProps): ReactElement {
  return (
    // `role="listitem"` rides a layout-primitive WRAPPER, never the Button — an interactive element assigned
    // a non-interactive role is a lie to AT (and eslint's `no-interactive-element-to-noninteractive-role`).
    <Stack role="listitem">
      <Button
        // STARRED IS PART OF THE NAME, not a silent decoration (the `invisible-is-the-finding` rule): the
        // mark is the only thing on the cell that says it, and on Recently chatted — where the shelf's own
        // eyebrow does not — a sighted reader gets a fact a screen-reader user would not.
        aria-label={starred ? `${name}, starred` : name}
        className="flex-col items-stretch gap-tight text-left"
        intent="ghost"
        onClick={(): void => onOpen(id)}
        size="media"
        {...(caption === null ? {} : { "aria-describedby": captionId })}
      >
        <Layer>
          <Avatar fallbackDelay={0} hueSeed={id} shape="rounded" size="fillPortrait" {...(avatarHash === null ? {} : { src: blobUrl(avatarHash) })}>
            {initialsFor(name)}
          </Avatar>
          {starred ? (
            // `relative` IS LOAD-BEARING, not decoration (measured on the stage, 2026-08-30): `Layer` puts
            // both children in one grid cell and relies on DOM order for paint order — which holds for two
            // BLOCK clusters (its documented use) and NOT here. CSS paints in-flow block descendants
            // (phase 4) before atomic inline content (phase 7), so the portrait `<img>` covered a mark that
            // `getComputedStyle` reported as present, correctly boxed and correctly gold. `relative`
            // promotes the mark to the positioned phase (8) and takes it OUT of nothing — `Layer`'s ruling
            // against an absolute pair is about FLOW, and a relative child stays in it.
            <Row align="start" className="relative" justify="end" padding="field">
              {/* Decorative — the fact is in the button's accessible name above, so a `label` here would
                  announce it twice (and be swallowed by the `aria-label` anyway). */}
              <Icon className="text-warning" fill="solid" icon={Star} size="sm" />
            </Row>
          ) : null}
        </Layer>
        <Text as="span" className="text-foreground" lines={2} voice="promoted">
          {name}
        </Text>
        {stamp === null ? null : (
          // `lines={2}` IS THE WRAP, not a clamp for its own sake (measured at 1280 with the list collapsed):
          // the Button base is `whitespace-nowrap`, so a stamp wider than the 8.5rem track spilled past its
          // cell and six of them ran together into one continuous mono strip across the shelf. The variant
          // carries the `whitespace-normal` the clamp needs inside that base, which is the same reason the
          // name and the pitch above use it.
          <Text as="span" lines={2} voice="datumMono">
            {stamp}
          </Text>
        )}
        {caption === null ? null : (
          <Text as="span" id={captionId} lines={2} prose={true} voice="gloss">
            {caption}
          </Text>
        )}
      </Button>
    </Stack>
  );
}
