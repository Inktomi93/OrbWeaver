// FaceStrip — the client-shared horizontal strip of clickable FACES (list-pane-projection §11.2, D12): a
// dense, scrolling row of character portraits pinned at a LIST pane's top, where tapping a face scopes the
// pane below it. Two features render this anatomy and change together (the character library's favorites
// strip and the chats pane's Arm B faces strip), which is the R2 bar for a tier-2 composite.
//
// NOT `@orb/ui/avatar-stack` — that primitive is display-only overlapping avatars with no per-item click.
// These are real `Avatar`-in-`Button` controls, each with its own accessible name and `aria-current`.
//
// The active ring is the EXISTING `Avatar ring="accent"` variant; the face button is `size="media"`
// (CONTENT-sized), which is the F2-safe size for a display-token child — every other button size pins a
// control height, so a 32px avatar inside one would paint outside its own hit box.
//
// Data-driven: an empty `items` renders NOTHING, never an empty shell (the strip is a shortcut, and a
// shortcut to nowhere is chrome).

import { blobUrl } from "@orb/contracts/assets";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

export interface FaceStripItem {
  readonly id: string;
  readonly name: string;
  /** CAS key — null falls back to the hue-seeded initials blob. */
  readonly avatarHash: string | null;
}

export interface FaceStripProps {
  readonly items: readonly FaceStripItem[];
  /** The face currently scoping the pane below (`aria-current` + the accent ring), or null. */
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  /** The strip's accessible name — it is a list of shortcuts, so it says which ones. */
  readonly label: string;
  /** Per-face verb for the accessible name, e.g. "Open" → "Open Azarael". @defaultValue "Open" */
  readonly verb?: string;
  /** Print each face's name under it. Off by default (the favorites strip is portraits only). */
  readonly caption?: boolean;
}

/** A scrolling row of clickable faces; renders nothing when there are none. */
export function FaceStrip({ items, selectedId, onSelect, label, verb = "Open", caption = false }: FaceStripProps): ReactElement | null {
  if (items.length === 0) {
    return null;
  }
  return (
    <Row aria-label={label} className="overflow-x-auto" gap="field" role="list">
      {items.map((item) => (
        <Button
          aria-current={selectedId === item.id ? "true" : undefined}
          aria-label={`${verb} ${item.name}`}
          className="shrink-0"
          intent="ghost"
          key={item.id}
          onClick={(): void => onSelect(item.id)}
          size="media"
        >
          <Stack align="center" gap="field">
            <Avatar
              hueSeed={item.id}
              ring={selectedId === item.id ? "accent" : "none"}
              shape="square"
              size="md"
              {...(item.avatarHash === null ? {} : { src: blobUrl(item.avatarHash) })}
            >
              {initialsFor(item.name)}
            </Avatar>
            {caption ? (
              // Capped on a display token (~6ch at micro) so a long name can't warp the strip's rhythm;
              // the FULL name stays the button's accessible name, so nothing is lost to the truncation.
              <Text className="w-avatar-lg truncate text-center" size="micro" tone="muted">
                {item.name}
              </Text>
            ) : null}
          </Stack>
        </Button>
      ))}
    </Row>
  );
}
