// CharacterLibraryWelcome — the Characters CONTENT pane AT REST (#864, owner-ruled 2026-08-30).
//
// IT USED TO BE AN `EmptyState`: an icon, "Choose a character", and one instruction, centred in the pane.
// Side-eye's Characters delta pass named what that is on this surface — "a 917×750 hole with a caption in
// it", on the section that owns the app's most VISUAL objects, while Chats gets a committed landing pane
// (`UI-Architecture-and-Layout.md` §4.1). The pane now shows the library the way a reader would ask for it:
// who you were last talking to, who you starred, what arrived lately. The old instruction is not deleted —
// it moved into the lead line, where it is one sentence under a heading rather than the whole pane.
//
// APPLICABILITY, NEVER EMPTY ROOMS. A shelf with nothing in it renders NOTHING — no header, no skeleton, no
// "no starred characters yet" box. The three arms below are the three honest things this pane can be:
//   · SOMETHING TO RESUME  — the lead + whichever shelves have faces.
//   · A FRESH INSTALL      — nothing chatted and nothing starred, but cards exist: "Meet your characters" over the
//                            shipped roster, plus one hint that says the other shelves are coming.
//   · GENUINELY EMPTY      — no cards at all. One line and the door; a shelf grid would be furniture.
//
// #520 / #532 — ONE `New` DOOR ON THE PLANE, and the #446/#520 ruling this file already carried SURVIVES
// unchanged (its condition is the same `listMode === "collapsed"` it always was): with the list DOCKED the
// band's New sits ~200px away, so the landing mints nothing and its lead names that door by its visible
// label (WCAG 2.5.3 — a voice-control user says what is written); with the list COLLAPSED the band went off
// screen with it, so the landing owns the doors and the pane is never a dead end. `!== "docked"` is
// deliberately NOT the test: an `overlay` list is on screen.
//
// #518 — the library CENSUS stays in the list pane. The landing prints SHELF counts only ("Starred · 6"),
// and only where the count is a fact it can prove (see `FreshInstallArm`).
//
// #226 — every shelf is a single-column band over a FIXED-cell grid (`cols="cellShelf"`), so there is no
// two-column crossover to unbalance and a wider pane buys MORE faces rather than bigger ones.
//
// D44 — portraits go through the `Avatar` primitive (`CharacterShelfFace`); no prose is drawn over art.

import type { CharacterId } from "@orb/kit/ids";
import { MS_PER_WEEK } from "@orb/kit/time";
import { Container, Grid, Row, Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import { useSuspenseQueries } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useId } from "react";
import type { Trpc } from "#data";
import { QueryBoundary, QueryErrorState, useTRPC } from "#data";
import { timeLib } from "#lib";
import { LIST_OFF_SCREEN_HINT, selectCharacter, useSectionListMode } from "#state";
import { CharacterLandingDoors } from "./character-create-actions.tsx";
import { CharacterShelfFace } from "./character-shelf-face.tsx";

/** How many faces Recently chatted reaches for. Four to five is the artboard's row; the shelf shows the
 *  ones that have actually been chatted, so the ask is the ceiling, not the count. */
const RECENT_SHELF_LIMIT = 5;
/** Starred's own page. The shelf shows these; the EYEBROW prints the server's census, which is larger. */
const STARRED_SHELF_LIMIT = 6;
/** The newest page, which serves three readers at once: Just added, the week's-additions foot line, and the
 *  fresh-install shipped roster. One read, three derivations — never three reads of the same order. */
const NEWEST_PAGE_LIMIT = 12;
/** How many of the newest page `Just added` draws. */
const JUST_ADDED_SHELF_LIMIT = 6;

/** The lead's gloss with the list ON SCREEN — it points AT the band's New by its visible label rather than
 *  minting a second one (#520). */
const LEAD_GLOSS_DOCKED = "Your library, by who you were talking to. Open anyone to read or edit them; New at the top of the list makes someone new.";
/** …and with the list off screen, where this pane carries the doors itself. `LIST_OFF_SCREEN_HINT` is the
 *  ONE spelling of the way back (#446) — never a hand-copy. */
const LEAD_GLOSS_COLLAPSED = `Your library, by who you were talking to. The list is tucked away — everything you need is here.${LIST_OFF_SCREEN_HINT}`;

const FRESH_GLOSS_DOCKED =
  "Characters shipped with Orbweaver to talk to, take apart, or use as a starting point. Star the ones you like and they gather here; New at the top of the list makes your own.";
const FRESH_GLOSS_COLLAPSED = `Characters shipped with Orbweaver to talk to, take apart, or use as a starting point. Star the ones you like and they gather here.${LIST_OFF_SCREEN_HINT}`;

const FRESH_HINT =
  "Once you've chatted with someone, Recently chatted takes this spot — the shelves appear when they have something to show, never as empty rooms.";

const EMPTY_GLOSS_DOCKED = "Nobody lives here yet. New at the top of the list makes someone, and Import a card beside it brings one in.";
const EMPTY_GLOSS_COLLAPSED = `Nobody lives here yet — make someone, or bring a card in.${LIST_OFF_SCREEN_HINT}`;

/** A shelf's own cells. Empty `faces` is the caller's job to refuse (applicability) — this renders the band
 *  it is given, so a shelf with a header and no faces would be a shape the caller asked for. */
function CharacterShelf({
  label,
  legend,
  faces,
  onOpen,
}: {
  readonly label: string;
  /** The trailing LEGEND on the header rule ("sorted by last chat") — a statement about the shelf's order,
   *  never a link: the artboard draws these as text, and a link-shaped span that does nothing is worse than
   *  no span at all. */
  readonly legend: string | null;
  readonly faces: readonly ShelfFace[];
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
            stamp={face.stamp}
            starred={face.starred}
          />
        ))}
      </Grid>
    </Stack>
  );
}

interface ShelfFace {
  readonly id: CharacterId;
  readonly name: string;
  readonly avatarHash: string | null;
  readonly starred: boolean;
  readonly stamp: string | null;
  readonly caption: string | null;
}

/** The pitch ladder, the library row's own (#119): elevator pitch → the visible tag line → NOTHING. The
 *  handle is row IDENTITY, not caption copy, so a face with neither reads one line shorter rather than
 *  printing a lowercase slug. */
function pitchOf(character: CharacterRow): string | null {
  if (character.elevatorPitch !== null) {
    return character.elevatorPitch;
  }
  const tagLine = character.tags
    .filter((tag) => !tag.isHiddenOnCard)
    .map((tag) => tag.name)
    .join(" · ");
  return tagLine === "" ? null : tagLine;
}

/** "chatted 3h ago · 4 chats". `formatRelativeAgo` is the SENTENCE form (a column stamp would be `2h`), and
 *  it is the form that freezes under `--probe` so a snapshot diff is not a clock diff. `chatCount` is never
 *  null (#865) — a join miss and a zero are the same fact — so the plural is the only branch. */
function chattedStamp(lastChattedAt: number, chatCount: number): string {
  const threads = chatCount === 1 ? "1 chat" : `${chatCount} chats`;
  return `chatted ${timeLib.formatRelativeAgo(lastChattedAt)} · ${threads}`;
}

function faceOf(character: CharacterRow, stamp: string | null, caption: string | null): ShelfFace {
  return { id: character.id, name: character.name, avatarHash: character.avatarHash, starred: character.starred, stamp, caption };
}

/** The Characters CONTENT pane at rest. Its own `QueryBoundary`: the shell does NOT wrap a section's CONTENT
 *  (only CONTEXT is wrapped, `section-context-host.tsx`), and this pane is the first thing in the section to
 *  read anything. */
export function CharacterLibraryWelcome(): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="quiet">Loading your characters…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your characters" onRetry={retry} />}
    >
      <CharacterLandingBody />
    </QueryBoundary>
  );
}

/** The library row and its page, INFERRED from the procedure rather than re-spelled (the library
 *  surface's own seam — the row's declared shape (`CharacterSummary`) lives in the SERVER domain's contract
 *  and no client may import it; `inferOutput` is the sanctioned way the wire shape reaches this side). */
type CharacterListPage = inferOutput<Trpc["character"]["list"]>;
type CharacterRow = CharacterListPage["items"][number];

/** The recent page's never-chatted TAIL, narrowed away — a type predicate rather than a `!== null` filter so
 *  the stamp below reads a `number`, not a `number | null` it would have to re-check. */
function hasChatted(character: CharacterRow): character is CharacterRow & { readonly lastChattedAt: number } {
  return character.lastChattedAt !== null;
}

/** The doors, in the ONE arm this pane owns them (#520 — never two `New`s on the plane). */
function doorsFor(listOffScreen: boolean): ReactElement | null {
  return listOffScreen ? <CharacterLandingDoors /> : null;
}

/** How many names the week's-additions line will read out before it stops naming and starts counting. */
const WEEK_LINE_NAMES = 3;

/** "3 characters added this week — Avel the Quiet, Tobias Brand, Lin." The foot line names WHO, because the
 *  count alone is a number with nothing to do; the names are the reason to look.
 *
 *  IT STOPS NAMING AT THREE (measured on the stage, 2026-08-30): a fresh install's whole seeded roster is
 *  "added this week", so the unbounded form printed ten names, wrapped to two lines, and turned a footnote
 *  into the second-longest paragraph on the pane. Three is the artboard's own roll-call; past that the line
 *  says how many more, which is the fact a reader can act on. */
function weekLine(added: readonly CharacterRow[]): string {
  const count = added.length === 1 ? "1 character" : `${String(added.length)} characters`;
  const named = added.slice(0, WEEK_LINE_NAMES).map((character) => character.name);
  const rest = added.length - named.length;
  const roll = rest === 0 ? named.join(", ") : `${named.join(", ")} and ${String(rest)} more`;
  return `${count} added this week — ${roll}.`;
}

/**
 * The three reads, and the ARM they resolve to. Each arm renders itself below: the dispatcher's whole job is
 * to say which of the three honest states this library is in, so no arm carries another's conditions.
 *
 * THREE READS, NOT ONE PAGE SLICED THREE WAYS. Every lens on this library is the SERVER's (owner ruling
 * 2026-08-13) and each shelf is a different order over a different scope — the recent keyset sinks
 * never-chatted rows to the tail, `starred: true` is a predicate the census counts, and `newest` is its own
 * keyset. Deriving all three from one `recent` page would put whoever happens to be on page one into every
 * shelf, which is exactly the client-side-window defect that ruling exists to kill.
 *
 * `archived: false` on all three: an archived character is one you put away, and a landing that resurfaces
 * her has undone the only thing archiving does.
 *
 * THREE READS, ONE WAVE — the PLURAL hook, never three `useSuspenseQuery` calls (side-eye 2026-09-02 F5,
 * re-measured on the live stack). Three singular calls in one body structurally cannot fire together: the
 * first SUSPENDS before React reaches the second hook, so the reads serialize into a waterfall — recent
 * →01.227 ←01.259, starred →01.260 ←01.361, newest →01.362 ←01.369: ~140ms of stacked round trips where
 * ~35ms does, each resume its own commit of `region:content`, and the last one landing inside the list
 * pane's entry animation (`[drop] 82ms · aside[aria-label=Characters list]`). `useSuspenseQueries` issues
 * all three in one pass and suspends once. The COUNT is untouched — the ruling above survives, its input
 * changed. Same idiom and same reason as `chat/components/assembly-preview-panel.tsx`.
 */
function CharacterLandingBody(): ReactElement {
  const trpc = useTRPC();
  const listOffScreen = useSectionListMode("characters") === "collapsed";
  const [{ data: recentPage }, { data: starredPage }, { data: newestPage }] = useSuspenseQueries({
    queries: [
      trpc.character.list.queryOptions({ archived: false, limit: RECENT_SHELF_LIMIT, sort: "recent" }),
      // BOTH the predicate AND the sort. The predicate is what makes the shelf APPLICABLE (a `starred` sort
      // alone returns the whole library with the starred ones first, so an unstarred library would render a
      // full shelf of unstarred faces) and what makes `totalCount` the starred CENSUS the eyebrow prints.
      trpc.character.list.queryOptions({ archived: false, limit: STARRED_SHELF_LIMIT, sort: "starred", starred: true }),
      trpc.character.list.queryOptions({ archived: false, limit: NEWEST_PAGE_LIMIT, sort: "newest" }),
    ],
  });

  // The recent SORT orders by last activity but does not FILTER by it — it sinks the never-chatted tail to
  // the end. "Recently chatted" is a claim about people you have chatted with, so the tail is dropped here.
  const recentFaces = recentPage.items
    .filter(hasChatted)
    .map((character) => faceOf(character, chattedStamp(character.lastChattedAt, character.chatCount), pitchOf(character)));
  const starredFaces = starredPage.items.map((character) => faceOf(character, null, null));

  if (newestPage.totalCount === 0) {
    return <EmptyArm listOffScreen={listOffScreen} />;
  }
  if (recentFaces.length === 0 && starredFaces.length === 0) {
    return <FreshInstallArm listOffScreen={listOffScreen} newest={newestPage} />;
  }
  return (
    <ResumeArm
      listOffScreen={listOffScreen}
      newestItems={newestPage.items}
      recentFaces={recentFaces}
      starredCount={starredPage.totalCount}
      starredFaces={starredFaces}
    />
  );
}

/** GENUINELY EMPTY — not a shelf in sight, because there is nothing to shelve. The docked arm points at the
 *  band's two doors by their visible labels; the collapsed arm carries them itself (#520). */
function EmptyArm({ listOffScreen }: { readonly listOffScreen: boolean }): ReactElement {
  return (
    <LandingFrame doors={doorsFor(listOffScreen)} gloss={listOffScreen ? EMPTY_GLOSS_COLLAPSED : EMPTY_GLOSS_DOCKED} title="No characters yet">
      {null}
    </LandingFrame>
  );
}

/** THE FRESH INSTALL — cards exist, but nothing has been chatted and nothing starred, so both of the
 *  landing's usual shelves are inapplicable. The roster it CAN show is the one that arrived with the app. */
function FreshInstallArm({ listOffScreen, newest }: { readonly listOffScreen: boolean; readonly newest: CharacterListPage }): ReactElement {
  const shippedFaces = newest.items.filter((character) => character.provenance === "shipped").map((character) => faceOf(character, null, pitchOf(character)));
  // THE COUNT IS PRINTED ONLY WHEN IT IS A CENSUS. `provenance` is a row field, not a server predicate, so
  // the shipped set is derived over THIS PAGE — which IS the whole library exactly when the census fits in
  // it. Past that the honest label is the bare noun: an un-computable number is never badged.
  const label = newest.totalCount <= newest.items.length ? `Shipped with Orbweaver · ${String(shippedFaces.length)}` : "Shipped with Orbweaver";
  return (
    <LandingFrame doors={doorsFor(listOffScreen)} gloss={listOffScreen ? FRESH_GLOSS_COLLAPSED : FRESH_GLOSS_DOCKED} title="Meet your characters">
      <Stack gap="section">
        {shippedFaces.length === 0 ? null : <CharacterShelf faces={shippedFaces} label={label} legend={null} onOpen={selectCharacter} />}
        <Text className="max-w-(--reading-measure-prose) rounded-base border border-border border-dashed p-row" voice="quiet">
          {FRESH_HINT}
        </Text>
      </Stack>
    </LandingFrame>
  );
}

/** THE RESTING STATE — at least one shelf has faces. */
function ResumeArm({
  listOffScreen,
  recentFaces,
  starredFaces,
  starredCount,
  newestItems,
}: {
  readonly listOffScreen: boolean;
  readonly recentFaces: readonly ShelfFace[];
  readonly starredFaces: readonly ShelfFace[];
  readonly starredCount: number;
  readonly newestItems: readonly CharacterRow[];
}): ReactElement {
  const justAddedFaces = newestItems
    .slice(0, JUST_ADDED_SHELF_LIMIT)
    // `formatRelativeAgo`, not `formatDate`: the absolute form is "Aug 30, 2026" — a year of
    // characters nobody reads at shelf density, on a shelf whose whole claim is RECENCY. The
    // sentence-relative form is also the one that freezes under `--probe`.
    .map((character) => faceOf(character, `added ${timeLib.formatRelativeAgo(character.createdAt)}`, null));
  const addedThisWeek = newestItems.filter((character) => timeLib.now() - character.createdAt < MS_PER_WEEK);
  return (
    <LandingFrame doors={doorsFor(listOffScreen)} gloss={listOffScreen ? LEAD_GLOSS_COLLAPSED : LEAD_GLOSS_DOCKED} title="Pick up where you left off">
      <Stack gap="section">
        {recentFaces.length === 0 ? null : (
          <CharacterShelf faces={recentFaces} label="Recently chatted" legend="sorted by last chat" onOpen={selectCharacter} />
        )}
        {starredFaces.length === 0 ? null : (
          <CharacterShelf faces={starredFaces} label={`Starred · ${String(starredCount)}`} legend={null} onOpen={selectCharacter} />
        )}
        {/* JUST ADDED belongs to the COLLAPSED arm alone (the artboards' own split). With the list docked the
            list itself is where newest rows are browsed, and a third shelf repeating it is this pane
            competing with the pane beside it; collapsed, the list is gone and this is the only way to reach
            them. */}
        {listOffScreen && justAddedFaces.length > 0 ? (
          <CharacterShelf faces={justAddedFaces} label="Just added" legend={null} onOpen={selectCharacter} />
        ) : null}
        {addedThisWeek.length === 0 ? null : (
          // THE RULE SPANS THE PANE, THE LINE DOES NOT: the foot's border is the shelves' bottom edge, so it
          // rides a full-width wrapper, while the measure caps the PARAGRAPH (design-audit `line-length` —
          // uncapped, this line ran to 145 characters at 1280).
          <Stack className="border-border border-t pt-row">
            <Text className="max-w-(--reading-measure-prose)" voice="gloss">
              {weekLine(addedThisWeek)}
            </Text>
          </Stack>
        )}
      </Stack>
    </LandingFrame>
  );
}

/** The pane's frame: the lead (heading + one gloss), the doors when this pane owns them, then the shelves.
 *  A `<Container>` because the shelf grid is CONTAINER-queried (`cols="cellShelf"`) — it answers to the
 *  pane's width, not the viewport's, and an element cannot query itself. */
function LandingFrame({
  title,
  gloss,
  doors,
  children,
}: {
  readonly title: string;
  readonly gloss: string;
  readonly doors: ReactElement | null;
  readonly children: ReactElement | null;
}): ReactElement {
  return (
    // `relative` rides the SAME class string as the overflow token (`scroll-container-positioned`): a
    // scroll box with no containing block dumps every `position:absolute` descendant — `sr-only`
    // announcers included — into an ANCESTOR's scrollable area, and the pane scrolls past its last shelf
    // into blank space.
    <Container className="relative h-full overflow-y-auto">
      <Stack gap="section" padding="section">
        {/* THE DOORS DROP BELOW THE LEAD ON A NARROW PANE (measured at 430, 2026-08-30): held on one line by
            `justify=between`, the two buttons took ~250px of a 398px pane and squeezed "Pick up where you
            left off" into a ~110px column eleven lines tall. `@max-md:flex-col` is the `actionBar` recipe's
            own precedent for the same shape — a row that packs by FIT rather than by breakpoint arithmetic.
            Container-queried, so it answers to the PANE (a three-pane desktop is as narrow as a phone). */}
        <Row align="start" className="@max-md:flex-col" gap="section" justify="between">
          <Stack className="min-w-0 flex-1" gap="tight">
            <Heading level={2}>{title}</Heading>
            {/* The measure rides the PARAGRAPH, not its box: a `ch` resolves against the element's OWN
                font, so the same cap on the Stack above was computed at the heading's step and let this
                13px line run to 114 characters (design-audit `line-length`, measured at 1280). The token
                is `--reading-measure-prose` (#1145): the house `--reading-measure`'s 75 CSS `ch` is ~117
                of the characters that 114 was counted in, so it was never the right ceiling for prose. */}
            <Text className="max-w-(--reading-measure-prose)" voice="gloss">
              {gloss}
            </Text>
          </Stack>
          {doors}
        </Row>
        {children}
      </Stack>
    </Container>
  );
}
