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
import { useId } from "react";
import { useStartChat, useTRPC } from "#data";
import { setActiveSection } from "#state";

/** How many faces this shelf shows. NOT exported any more (#102): the tile's first-boot reservation is no
 *  longer this number — the body is a fixed-cell GRID that tiles two per shelf-width row, so the row count
 *  the skeleton reserves is derived from the shape, not from the limit, and lives beside the tile. */
const QUICK_PICKS_LIMIT = 6;

export function HomeQuickPicksTileBody(): ReactElement {
  const trpc = useTRPC();
  /** The per-render id SCOPE for the cells' caption elements (each cell suffixes its own character id) —
   *  one hook at the top of the component, never one per row inside the map. */
  const captionScope = useId();
  // ONE NAVIGATION, AFTER THE ROOM EXISTS (side-eye rail sweep P2-7). This handler used to move the rail
  // to chats BEFORE awaiting `startChat`, and that early move is what dropped focus on `<body>`: home
  // unmounted with the pressed cell inside it, the chats section painted its LANDING surface, and the room
  // then swapped IN PLACE when the mutation landed — a swap whose guarded `useFocusOnMount` declines by
  // design, because `activeElement` is already `<body>` and that is indistinguishable from a cold load. A
  // keyboard user pressing Enter on a face was left with no focus at all, while Resume and the chat rows
  // (which navigate ONCE, synchronously, with their control still mounted) land in the room title.
  // `useStartChat` already calls `setActiveSection("chats")` after the row exists, so the section change
  // now happens with the cell still focused: `SectionContent`'s layout effect moves focus to the content
  // anchor, and the room surface's own mount hook takes it from there.
  const { startChat } = useStartChat();
  const startChatWith = (characterId: CharacterId): void => {
    // @orb-waive caught-failure-ownership(startChat): useStartChat's mutation carries
    // errorToast: "Couldn't start the chat." — the toast is the surface. Ends if useStartChat drops errorToast.
    startChat({ characterIds: [characterId] }).catch(() => undefined); // useStartChat's errorToast owns failure.
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
        // The ladder is pitch → visible tag line → NOTHING (#119): the handle/slug is row IDENTITY, not
        // caption copy, so a card with neither reads with one line instead of a lowercase slug. The name
        // above already identifies the cell; an absent second line beats an invented one.
        //
        // TRUTH-REPAIR (2026-08-30, #864/#865): the reason this note used to give — "`CharacterSummary`
        // carries no third honest fallback (no creator/kind field to fall back to)" — is FALSE since #865
        // put a closed `provenance` verdict (`shipped | imported | authored`) on the list row. The RULING
        // still stands and the ladder is unchanged: provenance answers "where did this come from", which
        // is a fact about the FILE, not a description of the character — printing "imported" where a pitch
        // belongs would be the invented second line the ladder refuses. It is not a missing fallback any
        // more; it is a fallback that says the wrong kind of thing.
        const tagLine = character.tags
          .filter((tag) => !tag.isHiddenOnCard)
          .map((tag) => tag.name)
          .join(" · ");
        const caption = character.elevatorPitch ?? (tagLine === "" ? null : tagLine);
        // ONE `useId` at the top of the component, suffixed by the row's own id — never a hook in a map
        // body. The character id is unique within the page by construction, so the pair is unique.
        const captionId = `${captionScope}${character.id}`;
        return (
          // `role="listitem"` rides a layout-primitive WRAPPER, never the Button: an interactive element
          // assigned a non-interactive role is a lie to AT (and eslint's own
          // `no-interactive-element-to-noninteractive-role`). Same shape the recents list uses.
          <Stack key={character.id} role="listitem">
            <Button
              // THE NAME IS THE CHARACTER, THE PITCH IS THE DESCRIPTION (side-eye rail sweep P2-8/P3-19).
              // The cell's name came from its own text content, so AT read the name and the caption as ONE
              // run-on string — "Calamity, Doomblade of the Ninth EpochA legendary, apocalypse-forged…" —
              // because adjacent inline nodes concatenate with no separator. It is also what left these six
              // cells resolvable only by DOM PATH in a `snap --map`: a name that long is unique by accident
              // and unusable by anyone. The name is the FULL name (the visible line clamps; the NAME never
              // does), and the pitch rides `aria-describedby`, which is what a description is for.
              aria-label={character.name}
              className="flex-col items-stretch gap-tight text-left"
              intent="ghost"
              onClick={(): void => startChatWith(castId<CharacterId>(character.id))}
              size="media"
              {...(caption === null ? {} : { "aria-describedby": captionId })}
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
              {/* THE NAME IS A STEP ABOVE ITS GLOSS (side-eye rail sweep P2-9/P3-18). It was `label` over a
                  `gloss prose` caption — 13px over 13px, two identical lines where one is the entity and
                  the other is a sentence about it — so the shelf read as a wall of paragraphs. `promoted`
                  is the ui voice for exactly this relation (the `title` step, the same one `ListRow`
                  resolves for a promoted row).
                  AND IT WRAPS RATHER THAN CUTTING MID-WORD: `truncate` rendered "Morgatha, the Undy…",
                  which is not a name. Two lines of `line-clamp` break at word boundaries, and
                  `whitespace-normal` is load-bearing — the Button base is `whitespace-nowrap`, and a nowrap
                  line inside a `-webkit-box` clamp overflows its cell with no ellipsis at all (measured on
                  the 2000px stage receipt, which is why this was `block truncate` before).
                  AND IT RESERVES BOTH LINES (`lines={2}`, side-eye home re-score 2026-08-18 #216-d): the
                  clamp CAPS at two lines, it does not reserve them, so a one-line name ("Mira") and a
                  two-line one ("Calamity, Doomblade of the Ninth Epoch") started their captions 21px apart
                  IN THE SAME ROW (measured `descTop` 359 vs 380 at 1920) and the shelf read as six loose
                  objects instead of one rank. Reserving is the fix the shape allows — the cells are a
                  fixed-track grid, so there is no subgrid row to share. */}
              <Text as="span" className="text-foreground" lines={2} voice="promoted">
                {character.name}
              </Text>
              {/* `prose`, NOT the bare gloss (side-eye 2026-08-16 F15). Six of the seven interactive text
                  nodes below the readable floor on this page were these captions: 10.5px, inside a button,
                  carrying a whole pitch sentence. `prose` is the sanctioned LENGTH modifier — it lifts the
                  step to `label` and relaxes the leading and changes nothing else, so the caption is still
                  unmistakably the gloss voice, just legible at sentence length. Rendered only when a
                  caption exists (#119) — no line beats a slug.
                  TWO LINES, not one truncated one (P3-18): the shelf has the vertical room, and a pitch cut
                  at ~20 characters mid-word ("A legendary, apocal…") taught nothing about the character. */}
              {caption === null ? null : (
                // AND IT RESERVES ITS TWO LINES, like the name above it (side-eye rail-home P3-5,
                // 2026-08-22). The filed finding was "the name band has a ragged bottom edge"; measured on
                // the live shelf that half is RETRACTED — every name element is 43px and every cell bottom
                // in a row is identical, because #216-d already moved the name to `lines={2}`. What is
                // still a clamp-without-a-reservation is THIS line: a one-line pitch and a two-line pitch
                // end their cells at different baselines in the same row, which is the same defect one row
                // down. `lines={2}` is the same sanctioned variant and carries the same `whitespace-normal`
                // the clamp needs inside the `whitespace-nowrap` Button base, so this is a swap, not an
                // addition. A cell with NO pitch at all (#119 — no line beats a slug) still ends short, and
                // that is left alone deliberately: reserving a box for copy that does not exist is the
                // invented-second-line the ladder ruling refuses.
                <Text as="span" id={captionId} lines={2} prose={true} voice="gloss">
                  {caption}
                </Text>
              )}
            </Button>
          </Stack>
        );
      })}
    </Grid>
  );
}
