// CharacterShelf — one labelled band of the Characters landing, over a FIXED-cell grid (#226, #864).
//
// SPLIT OUT OF `character-library-welcome.tsx` (#1662): that file carries three arms, three reads and a
// frame, and the shelf's own door vocabulary pushed it past the 450-line component cap. It is a component
// with one job, so it gets a file, beside the cell it renders (`character-shelf-face.tsx`).
//
// THE DOOR IS A PER-SHELF FACT, never a per-face one — the whole point of the #1662 ruling. "Recently
// chatted" is the only shelf whose cells have a room behind them and the only one whose door the library
// row beside it was duplicating, so the shelf declares which door its faces are and the cell obeys.

import type { CharacterId, ChatId } from "@orb/kit/ids";
import { Grid, Row, Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useId } from "react";
import { resumeChat } from "#state";
import type { ShelfFaceResume } from "./character-shelf-face.tsx";
import { CharacterShelfFace } from "./character-shelf-face.tsx";

/** A shelf's own cells. Empty `faces` is the caller's job to refuse (applicability) — this renders the band
 *  it is given, so a shelf with a header and no faces would be a shape the caller asked for. */
export function CharacterShelf({
  label,
  legend,
  faces,
  door,
  onOpen,
}: {
  readonly label: string;
  /** The trailing LEGEND on the header rule ("sorted by last chat") — a statement about the shelf's order,
   *  never a link: the artboard draws these as text, and a link-shaped span that does nothing is worse than
   *  no span at all. */
  readonly legend: string | null;
  readonly faces: readonly ShelfFace[];
  /** WHICH DOOR this shelf's faces are (#1662) — a per-SHELF fact, never a per-face one: "sorted by last
   *  chat" is the only shelf whose cells have a room behind them, and it is the only one whose door the
   *  library row beside it was duplicating. Every other shelf opens the character. */
  readonly door: ShelfDoor;
  readonly onOpen: (id: CharacterId) => void;
}): ReactElement {
  // ONE `useId` per shelf, suffixed by each face's own id — never a hook inside a map body. The character id
  // is unique within a shelf by construction, so the pair is unique.
  const captionScope = useId();
  return (
    <Stack gap="row">
      <Row align="baseline" className="border-border border-b pb-tight" gap="field" justify="between">
        <Heading level={3} voice="kicker">
          {label}
        </Heading>
        {legend === null ? null : (
          <Text as="span" voice="gloss">
            {legend}
          </Text>
        )}
      </Row>
      <Grid aria-label={label} cols="cellShelf" gap="row" role="list">
        {faces.map((face) => (
          <CharacterShelfFace
            avatarHash={face.avatarHash}
            caption={face.caption}
            captionId={`${captionScope}${face.id}`}
            id={face.id}
            key={face.id}
            name={face.name}
            onOpen={onOpen}
            resume={resumeFor(door, face)}
            stamp={face.stamp}
            starred={face.starred}
          />
        ))}
      </Grid>
    </Stack>
  );
}

export interface ShelfFace {
  readonly id: CharacterId;
  readonly name: string;
  readonly avatarHash: string | null;
  readonly starred: boolean;
  readonly stamp: string | null;
  readonly caption: string | null;
  /** Her newest room (`CharacterSummary.lastChatId`), or null when she has never been chatted with. Carried
   *  on EVERY face, spent only by the shelf whose {@link ShelfDoor} is `"resume"`. */
  readonly lastChatId: ChatId | null;
}

/** A shelf's door, closed: press a face to OPEN her in the editor, or to RESUME her newest room (#1662).
 *  FILE-LOCAL on purpose: callers pass the literal, so exporting it would put a two-member axis in a
 *  component file, which is what `no-inline-types` refuses. */
type ShelfDoor = "open" | "resume";

/** The face's resume half, resolved from the SHELF's door. A `"resume"` shelf whose face somehow carries no
 *  room falls back to `null` — i.e. to the OPEN door and the plain name — rather than announcing a verb it
 *  cannot perform; the Recently-chatted shelf's own {@link hasChatted} filter makes that arm unreachable,
 *  and it is spelled anyway because "unreachable" is a property of one caller, not of this function. */
function resumeFor(door: ShelfDoor, face: ShelfFace): ShelfFaceResume | null {
  return door === "resume" && face.lastChatId !== null ? { chatId: face.lastChatId, onResume: resumeChat } : null;
}
