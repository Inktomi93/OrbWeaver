// The sessions LIST (delta 3 arm A, ruled: FLAT, newest first, the character as row identity — one
// selection axis, one row shape; "sessions for X" is a SEARCH, not a structure). A bounded owner list
// fetched whole ⇒ `useSuspenseQuery` inside a `LibrarySurfaceShell` under a `ListPage` (the lockdown §14
// adjudication; the paginated factory is for unbounded browses). The genuine-empty state carries the start door — on a phone this pane IS
// the screen (the one-shell rule), so a bare "no sessions" would be the whole product on first contact.
//
// ── ROW IDENTITY (side-eye 2026-08-09 P1-4/P1-5/P1-6) ────────────────────────────────────────────────
// Every row read "Untitled session / iteration 0 / NO VERDICT" — four identical rows, no way to tell
// which card any of them was about, and the search box filtered `session.name` (which is always null).
// The row is now the CHARACTER: avatar + name as the title, and the verdict + iteration + start stamp as
// the subtitle line.
//
// ── THE READOUT IS IN THE ROW'S CONTENT, NOT ITS `actions` (side-eye 2026-08-09 P2 a11y) ──────────────
// The readout first shipped in ListRow's `actions` slot — a sibling OUTSIDE the clickable button — so the
// row's accessible NAME was the bare character name and its DESCRIPTION was empty: a screen reader heard
// "Elias Thorn" six times for six sessions on one card, indistinguishable. It now rides the subtitle line
// (verdict via `subtitleLead`, iteration + start stamp via `subtitle`), which ListRow folds into the body's
// `aria-describedby`. The START STAMP doubles as the same-card distinguisher (see `readoutSubtitleOf`): a
// nameless per-card session is told apart by WHEN it was started, in the tree and on screen.
//
// CHARACTER IDENTITY COMES OFF THE WIRE (orchestrator ruling, 2026-08-09 — it reverses the summary
// schema's former "resolves client-side by `characterId`" comment, truth-repaired there). The client-side
// join this surface used to run had a hard ceiling: its only source was `character.list`, one cursor page
// capped at 100 rows, so a session whose card sat past page one rendered UNNAMED and was unfindable by
// the search box below — the paginating-a-list-breaks-resolve-by-find class, exactly. `characterName` and
// `characterAvatarHash` now ride `refinerySessionSummarySchema`, joined on the ownership join the list
// read already performs, so the list names EVERY session it lists and there is no second query here.

import { blobUrl } from "@orb/contracts/assets";
import type { RefineryVerdict } from "@orb/contracts/refinery";
import type { CharacterId, RefinerySessionId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Input } from "@orb/ui/input";
import type { ReactElement, RefObject } from "react";
import { useRef } from "react";
import { LibraryListRows, LibraryRow, LibrarySurfaceShell, ListPage, useRowDeleteFocus } from "#components";
import { useInvalidation, useSuspenseQuery, useTRPC } from "#data";
import { CLEAR_SEARCH_NAME, timeLib, useFocusListArrival } from "#lib";
import {
  refinerySectionSelection,
  requestRefineryLandingFocus,
  selectRefinerySessionFromList,
  setRefinerySearchQuery,
  useMobileViewport,
  useRefinerySearchQuery,
  useSectionListMode,
  useSectionListSearchPlaceholder,
  useSelectedRefinerySessionId,
} from "#state";
import { RefineryChip } from "../components/refinery-chip.tsx";
import { StartSessionDoor } from "../components/start-session-door.tsx";
import { useDeleteRefinerySession } from "../hooks/use-refinery-mutations.ts";
import {
  REFINERY_LIST_LOADING_NAME,
  REFINERY_NO_SESSION_MATCH_TEXT,
  REFINERY_NO_SESSIONS_TITLE,
  REFINERY_PICK_CHARACTER_NAME,
  REFINERY_SEARCH_SESSIONS_NAME,
} from "../lib/refinery-names.ts";
import { matchesRefinerySearch, refinerySearchNeedle } from "../lib/refinery-search.ts";
import { REFINERY_LIST_TITLE } from "../lib/refinery-section-label.ts";
import { verdictToneOf, verdictWordOf } from "../lib/verdict.ts";

interface ResolvedRow {
  readonly id: RefinerySessionId;
  readonly rawId: string;
  readonly characterName: string;
  readonly avatarHash: string | null;
  /** Branded: it is the Avatar's `hueSeed`, i.e. a value that decides what the user SEES. A bare
   *  `string` here would let any other id type-check into the seed and silently recolour a row. */
  readonly characterId: CharacterId;
  readonly sessionName: string | null;
  readonly iterationCount: number;
  readonly latestVerdict: RefineryVerdict | null;
  /** The session's start time — the subtitle's readout stamp AND the same-card distinguisher (see
   *  `readoutSubtitleOf`). `updatedAt` is no longer read here: the list arrives newest-updated first, so
   *  freshness is positional and the start stamp is the fact that tells two sessions on one card apart. */
  readonly createdAt: number;
}

/** The verdict chip, folded INTO the row's content (side-eye 2026-08-09 P2 a11y). The readout used to
 *  render in ListRow's `actions` slot — a sibling OUTSIDE the clickable button — so the row's accessible
 *  description was empty and a screen reader heard the bare character name once per session ("Elias Thorn"
 *  ×6 for six sessions on one card). It now heads the subtitle line (`subtitleLead`), which rides the row's
 *  `aria-describedby` through the subtitle span.
 *
 *  ABSENCE IS NOT A VERDICT (side-eye 2026-08-17, finding c). `latestVerdict === null` means one thing —
 *  ANALYZE has not been run — and it wore the same filled, boxed, uppercase chip as `REGRESSION` on a
 *  session already scored 9.5/10, shouting louder than the character name that is the row's identity. A
 *  chip is for a verdict the model RETURNED; the absent arm has no chip at all and states itself in the
 *  subtitle beside the round and the stamp (`readoutSubtitleOf`), one register BELOW the row's title
 *  rather than above it. The WORD moved with it: "no verdict" named the wire field, "not analyzed" names
 *  the fact the row is reporting. */
function verdictChipOf(row: ResolvedRow): ReactElement | undefined {
  return row.latestVerdict === null ? undefined : <RefineryChip tone={verdictToneOf(row.latestVerdict)}>{verdictWordOf(row.latestVerdict)}</RefineryChip>;
}

/** The subtitle: round + the session's START STAMP. The stamp is the same-card DISTINGUISHER — every
 *  session on one card shares the character title and carries no name of its own, and `createdAt` is
 *  per-session, so an absolute start stamp differs the rows visually AND in the a11y tree (the ruled
 *  auto-label arm; no nameable-session affordance is added here). "Freshness" is already positional (the
 *  list is newest-updated first), so WHEN-STARTED is the fact that actually tells six sessions apart. A
 *  session that HAS a name leads with it. Rides `aria-describedby` with the verdict via the subtitle span.
 *  It also carries the NOT-ANALYZED state (finding c): a row with no verdict says so here, in the same
 *  quiet register as its round and stamp, instead of wearing a filled chip louder than its own name. */
function readoutSubtitleOf(row: ResolvedRow): string {
  const stage = row.latestVerdict === null ? "not analyzed · " : "";
  const readout = `${stage}round ${row.iterationCount} · started ${timeLib.formatDateTime(row.createdAt)}`;
  return row.sessionName === null ? readout : `${row.sessionName} · ${readout}`;
}

export function RefineryListSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusListArrival(surfaceRef, useSectionListMode("refinery") !== "collapsed");
  // The search is pane chrome above the boundary, so it stays on screen while the read is in flight. It is store
  // state because the chrome band's census names the lens the rows are read through.
  const search = useRefinerySearchQuery();
  const searchPlaceholder = useSectionListSearchPlaceholder("refinery");

  return (
    <ListPage
      body="bounded"
      label={REFINERY_LIST_TITLE}
      ref={surfaceRef}
      search={<Input aria-label={REFINERY_SEARCH_SESSIONS_NAME} onValueChange={setRefinerySearchQuery} placeholder={searchPlaceholder} value={search} />}
      skipTo="Skip to sessions"
    >
      <LibrarySurfaceShell errorLabel="your sessions" loadingLabel={REFINERY_LIST_LOADING_NAME} resetKeys={[]}>
        <RefineryList
          listRootRef={surfaceRef}
          onClearSearch={(): void => {
            setRefinerySearchQuery("");
            surfaceRef.current?.focus();
          }}
          search={search}
        />
      </LibrarySurfaceShell>
    </ListPage>
  );
}

function RefineryList({
  search,
  onClearSearch,
  listRootRef,
}: {
  readonly search: string;
  readonly onClearSearch: () => void;
  readonly listRootRef: RefObject<HTMLElement | null>;
}): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const sessions = useSuspenseQuery(trpc.refinery.listSessions.queryOptions());
  const remove = useDeleteRefinerySession({ trpc, invalidation, failureShownInline: "the delete-session confirm's alert line" });
  const selectedId = useSelectedRefinerySessionId();
  const isMobile = useMobileViewport();
  // The SAME condition the header's `+` reads (#307): with nothing selected on a desktop, CONTENT mounts
  // the full-library landing picker — so the empty-state CTA must focus THAT one, not open a second copy
  // over it (the #284 duplicate-door's last mouth). On a phone CONTENT is not rendered (this list is the
  // screen, `resolvePanelMode`'s `listIsScreen` arm) and with a session open CONTENT shows the pipeline, so
  // in both of those the CTA is the only door and stays the anchored picker popover.
  const contentShowsPicker = selectedId === null && !isMobile;
  const needle = refinerySearchNeedle(search);

  const resolved: ResolvedRow[] = sessions.data.map((session) => ({
    id: session.id,
    rawId: session.id,
    characterName: session.characterName,
    avatarHash: session.characterAvatarHash,
    characterId: session.characterId,
    sessionName: session.name,
    iterationCount: session.iterationCount,
    latestVerdict: session.latestVerdict,
    createdAt: session.createdAt,
  }));

  // P1-5: the predicate matches the CHARACTER NAME as well as the session's own name — the list's
  // whole organising fact was previously unsearchable, and `session.name` is null on every row. Since
  // the name rides the summary, this now matches EVERY session, including one whose card sits past the
  // page `character.list` would have returned.
  const rows = resolved.filter((r) => matchesRefinerySearch(r.characterName, r.sessionName, needle));

  const rowFocus = useRowDeleteFocus(
    listRootRef,
    rows.map((row) => row.rawId),
  );

  // A desktop landing focuses the existing CONTENT picker; the other regimes open the existing start door.
  const startDoor = contentShowsPicker ? (
    <Button variant="outline" onClick={requestRefineryLandingFocus} size="sm">
      {REFINERY_PICK_CHARACTER_NAME}
    </Button>
  ) : (
    <StartSessionDoor
      trigger={(busy): ReactElement => (
        <Button aria-busy={busy} variant="outline" size="sm">
          {REFINERY_PICK_CHARACTER_NAME}
        </Button>
      )}
    />
  );

  // A successful delete cannot leave CONTENT drilled into the now-missing row. This is the same
  // section-selection clear the shell's back door uses, so it also releases an open mobile roster.
  const deleteSession = (row: ResolvedRow): Promise<void> =>
    remove.mutateAsync({ sessionId: row.id }).then((): void => {
      if (selectedId === row.rawId) {
        refinerySectionSelection.clear();
      }
    });

  return (
    <LibraryListRows
      empty={
        <EmptyState
          action={
            sessions.data.length > 0 ? (
              <Button variant="outline" size="sm" type="button" onClick={onClearSearch}>
                {CLEAR_SEARCH_NAME}
              </Button>
            ) : (
              startDoor
            )
          }
          description={
            sessions.data.length === 0
              ? // NO "IN THE MAIN PANE" (side-eye 2026-08-19 P1-2). On a phone this pane IS the screen —
                // there is no main pane to point at — and on a desktop the sentence was directing the user
                // away from the button directly beneath it. The CTA opens the picker here, so the copy
                // names the act rather than a place.
                "A session pins a card as it is right now, then scores, rewrites and re-checks it against that pinned version. Pick a character to start."
              : REFINERY_NO_SESSION_MATCH_TEXT
          }
          title={sessions.data.length === 0 ? REFINERY_NO_SESSIONS_TITLE : "Nothing matches"}
        />
      }
      isEmpty={rows.length === 0}
      scroll={true}
    >
      {rows.map((row) => (
        <LibraryRow
          bodyRef={rowFocus.bodyRef(row.rawId)}
          actions={{
            name: row.characterName,
            qualifier: `started ${timeLib.formatDateTime(row.createdAt)}`,
            ...rowFocus.delete(row.rawId, (): Promise<void> => deleteSession(row)),
            deleteDescription: `This permanently deletes this session and all of its refinery runs. ${row.characterName}'s character card is unchanged.`,
          }}
          key={row.rawId}
          leading={
            <Avatar fallbackDelay={0} hueSeed={row.characterId} size="sm" {...(row.avatarHash === null ? {} : { src: blobUrl(row.avatarHash) })}>
              {initialsFor(row.characterName)}
            </Avatar>
          }
          onSelect={(): void => selectRefinerySessionFromList(row.id)}
          selected={selectedId === row.rawId}
          subtitle={readoutSubtitleOf(row)}
          subtitleStep="label"
          subtitleLead={verdictChipOf(row)}
          title={row.characterName}
        />
      ))}
    </LibraryListRows>
  );
}
