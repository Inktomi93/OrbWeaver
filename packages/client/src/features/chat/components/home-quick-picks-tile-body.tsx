// The "Start a chat" HOME tile body — CHAT-owned even though the faces are characters (owner decision
// H6): the tile's data and its intent are "start a chat", and this is the chat landing's former quick-pick
// block MOVED, not forked. `trpc.character.list` is a cache-first cross-feature read — §12 row 2's
// sanctioned channel, not an import of the character feature.
//
// It suspends; home mounts every tile body inside its own `QueryBoundary`.

import { blobUrl } from "@orb/contracts/assets";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, Users } from "@orb/ui/icons";
import { Grid, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useStartChat, useTRPC } from "#data";
import { setActiveSection } from "#state";

/** How many faces this shelf shows. NOT exported any more (#102): the tile's first-boot reservation is no
 *  longer this number — the body is a fixed-cell GRID that tiles two per shelf-width row, so the row count
 *  the skeleton reserves is derived from the shape, not from the limit, and lives beside the tile. */
const QUICK_PICKS_LIMIT = 6;

export function HomeQuickPicksTileBody(): ReactElement {
  const trpc = useTRPC();
  // Creating the room is chat intent; moving the rail to chats is what makes it VISIBLE.
  const { startChat } = useStartChat();
  const startChatWith = (characterId: CharacterId): void => {
    setActiveSection("chats");
    void startChat({ characterIds: [characterId] });
  };
  const { data: page } = useSuspenseQuery(trpc.character.list.queryOptions({ limit: QUICK_PICKS_LIMIT }));
  const quickPicks = page.items.slice(0, QUICK_PICKS_LIMIT);

  if (quickPicks.length === 0) {
    return (
      <EmptyState
        action={
          <Button intent="secondary" onClick={(): void => setActiveSection("characters")} size="sm">
            <Icon icon={Users} size="sm" />
            Create your first character
          </Button>
        }
        description="Every character is a thread waiting to be woven."
        icon={<Icon icon={Users} size="lg" />}
        title="No characters yet"
      />
    );
  }

  return (
    // THE FACE SHELF (2026-08-16, #102): fixed-size cells, variable COUNT. `cols="cellFixed"` is
    // `auto-fill` at a fixed 8.5rem track, NOT the `1fr` auto-fit every other grid arm uses — measured on
    // the mockup pass, a fr-based shelf grew 250px portraits at a 2000px viewport and read as a gallery
    // instead of a shelf you reach into. A wider monitor gets MORE faces at the same size, which is the
    // whole point of a shelf.
    //
    // `role="list"` needs `listitem` CHILDREN or the cells are generic to AT and the list announces empty.
    <Grid aria-label="Character quick-picks" cols="cellFixed" gap="row" role="list">
      {quickPicks.map((character) => {
        // The SAME honest ladder the character library row uses (character-card.tsx): the distilled pitch →
        // the visible tag line → the handle. Never invented copy — a name-only cell read as an unfinished
        // shelf, and the summary this tile already reads carries all three. The SECOND line is content
        // debt, not a layout bug: on a corpus with no pitches and no visible tags it falls through to the
        // handle and every caption is a slug (tracked as #119 — do not invent pitch copy here).
        const tagLine = character.tags
          .filter((tag) => !tag.isHiddenOnCard)
          .map((tag) => tag.name)
          .join(" · ");
        return (
          // `role="listitem"` rides a layout-primitive WRAPPER, never the Button: an interactive element
          // assigned a non-interactive role is a lie to AT (and eslint's own
          // `no-interactive-element-to-noninteractive-role`). Same shape the recents list uses.
          <Stack key={character.id} role="listitem">
            <Button
              className="flex-col items-stretch gap-tight text-left"
              intent="ghost"
              onClick={(): void => startChatWith(castId<CharacterId>(character.id))}
              size="media"
            >
              <Avatar
                fallbackDelay={0}
                hueSeed={character.id}
                shape="rounded"
                size="fill"
                {...(character.avatarHash === null ? {} : { src: blobUrl(character.avatarHash) })}
              >
                {initialsFor(character.name)}
              </Avatar>
              {/* `block truncate`, NOT `line-clamp-1` (measured on the 2000px stage receipt): the Button
                  base is `whitespace-nowrap`, and a nowrap line inside a `-webkit-box` clamp overflows
                  its cell with no ellipsis at all — "Calamity, Doomblade of the Ninth Epoch" ran straight
                  over the neighbouring face. An inline span cannot truncate either, hence `block`. */}
              <Text as="span" className="block truncate text-foreground" voice="label">
                {character.name}
              </Text>
              {/* `prose`, NOT the bare gloss (side-eye 2026-08-16 F15). Six of the seven interactive text
                  nodes below the readable floor on this page were these captions: 10.5px, inside a button,
                  carrying a whole pitch sentence. `prose` is the sanctioned LENGTH modifier — it lifts the
                  step to `label` and relaxes the leading and changes nothing else, so the caption is still
                  unmistakably the gloss voice, just legible at sentence length. (The CONTENT problem, a
                  corpus where this falls through to a slug, stays #119; this is the floor axis.) */}
              <Text as="span" className="block truncate" prose={true} voice="gloss">
                {character.elevatorPitch ?? (tagLine === "" ? character.handle : tagLine)}
              </Text>
            </Button>
          </Stack>
        );
      })}
    </Grid>
  );
}
