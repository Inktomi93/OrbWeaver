// The sessions ROSTER (delta 3 arm A, ruled: FLAT, newest first, the character as row identity — one
// selection axis, one row shape; "sessions for X" is a SEARCH, not a structure). A bounded owner list
// fetched whole ⇒ `useSuspenseQuery` + `LibraryListLayout` (the lockdown §14 adjudication; the paginated
// factory is for unbounded browses). The EMPTY state carries the start door — on a phone this pane IS
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
// `characterAvatarHash` now ride `refinerySessionSummarySchema`, joined on the ownership join the roster
// read already performs, so the roster names EVERY session it lists and there is no second query here.

import { blobUrl } from "@orb/contracts/assets";
import type { RenderHintTone } from "@orb/contracts/refinery";
import type { CharacterId, RefinerySessionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, Plus } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { LibraryListLayout } from "#components";
import { useTRPC } from "#data";
import { timeLib, useFocusOnMount } from "#lib";
import { clearRefinerySelection, selectRefinerySessionFromList, useSelectedRefinerySessionId } from "#state";
import { RefineryChip } from "../components/refinery-chip.tsx";

const VERDICT_TONE: Record<string, RenderHintTone> = {
  // biome-ignore lint/style/useNamingConvention: the key IS the canonical wire verdict member (`REFINERY_VERDICTS`, @orb/contracts/refinery) — a camelCase respell would break the lookup.
  ACCEPT: "good",
  // biome-ignore lint/style/useNamingConvention: same — the wire verdict member.
  NEEDS_REFINEMENT: "warn",
  // biome-ignore lint/style/useNamingConvention: same — the wire verdict member.
  REGRESSION: "bad",
};
const VERDICT_WORD: Record<string, string> = {
  // biome-ignore lint/style/useNamingConvention: the key IS the canonical wire verdict member (`REFINERY_VERDICTS`, @orb/contracts/refinery) — a camelCase respell would break the lookup.
  ACCEPT: "Accept",
  // biome-ignore lint/style/useNamingConvention: same — the wire verdict member.
  NEEDS_REFINEMENT: "Needs refinement",
  // biome-ignore lint/style/useNamingConvention: same — the wire verdict member.
  REGRESSION: "Regression",
};

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
  readonly latestVerdict: string | null;
  /** The session's start time — the subtitle's readout stamp AND the same-card distinguisher (see
   *  `readoutSubtitleOf`). `updatedAt` is no longer read here: the roster arrives newest-updated first, so
   *  freshness is positional and the start stamp is the fact that tells two sessions on one card apart. */
  readonly createdAt: number;
}

/** The verdict chip, folded INTO the row's content (side-eye 2026-08-09 P2 a11y). The readout used to
 *  render in ListRow's `actions` slot — a sibling OUTSIDE the clickable button — so the row's accessible
 *  description was empty and a screen reader heard the bare character name once per session ("Elias Thorn"
 *  ×6 for six sessions on one card). It now heads the subtitle line (`subtitleLead`), which rides the row's
 *  `aria-describedby` through the subtitle span. */
function verdictChipOf(row: ResolvedRow): ReactElement {
  return row.latestVerdict === null ? (
    <RefineryChip tone="neutral">No verdict</RefineryChip>
  ) : (
    <RefineryChip tone={VERDICT_TONE[row.latestVerdict] ?? "neutral"}>{VERDICT_WORD[row.latestVerdict] ?? row.latestVerdict}</RefineryChip>
  );
}

/** The subtitle: iteration + the session's START STAMP. The stamp is the same-card DISTINGUISHER — every
 *  session on one card shares the character title and carries no name of its own, and `createdAt` is
 *  per-session, so an absolute start stamp differs the rows visually AND in the a11y tree (the ruled
 *  auto-label arm; no nameable-session affordance is added here). "Freshness" is already positional (the
 *  roster is newest-updated first), so WHEN-STARTED is the fact that actually tells six sessions apart. A
 *  session that HAS a name leads with it. Rides `aria-describedby` with the verdict via the subtitle span. */
function readoutSubtitleOf(row: ResolvedRow): string {
  const readout = `iteration ${row.iterationCount} · started ${timeLib.formatDateTime(row.createdAt)}`;
  return row.sessionName === null ? readout : `${row.sessionName} · ${readout}`;
}

export function RefineryListSurface(): ReactElement {
  const trpc = useTRPC();
  const sessions = useSuspenseQuery(trpc.refinery.listSessions.queryOptions());
  const selectedId = useSelectedRefinerySessionId();
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();

  const resolved: ResolvedRow[] = sessions.data.map((session) => ({
    id: castId<RefinerySessionId>(session.id),
    rawId: session.id,
    characterName: session.characterName,
    avatarHash: session.characterAvatarHash,
    characterId: session.characterId,
    sessionName: session.name,
    iterationCount: session.iterationCount,
    latestVerdict: session.latestVerdict,
    createdAt: session.createdAt,
  }));

  // P1-5: the predicate matches the CHARACTER NAME as well as the session's own name — the roster's
  // whole organising fact was previously unsearchable, and `session.name` is null on every row. Since
  // the name rides the summary, this now matches EVERY session, including one whose card sits past the
  // page `character.list` would have returned.
  const rows = resolved.filter(
    (r) => query.length === 0 || r.characterName.toLowerCase().includes(query) || (r.sessionName ?? "").toLowerCase().includes(query),
  );

  return (
    <Stack className="h-full outline-none" gap="block" ref={surfaceRef} tabIndex={-1}>
      <LibraryListLayout
        empty={
          <EmptyState
            action={
              <Button intent="secondary" onClick={(): void => clearRefinerySelection()} size="sm">
                Pick a character
              </Button>
            }
            description={
              sessions.data.length === 0
                ? "A session pins a card as it is right now, then scores, rewrites and re-checks it against that pinned version. Pick a character in the main pane to start."
                : "No sessions match that search."
            }
            title={sessions.data.length === 0 ? "No refinery sessions yet" : "Nothing matches"}
          />
        }
        isEmpty={rows.length === 0}
        onSearchChange={setSearch}
        searchLabel="Search sessions by character or name"
        searchPlaceholder="Search sessions"
        searchValue={search}
      >
        {rows.map((row) => (
          <ListRow
            clickable={true}
            key={row.rawId}
            leading={
              <Avatar
                fallbackDelay={0}
                hueSeed={row.characterId}
                shape="square"
                size="sm"
                {...(row.avatarHash === null ? {} : { src: blobUrl(row.avatarHash) })}
              >
                {initialsFor(row.characterName)}
              </Avatar>
            }
            onClick={(): void => selectRefinerySessionFromList(row.id)}
            selected={selectedId === row.rawId}
            subtitle={readoutSubtitleOf(row)}
            subtitleLead={verdictChipOf(row)}
            title={row.characterName}
          />
        ))}
      </LibraryListLayout>
    </Stack>
  );
}

/** The LIST chrome band (D66 A1/A2): the micro-caps title, the count, and — since P1-6 — the START
 *  DOOR. Once a session is selected there was NO way back to "start another one" from anywhere in the
 *  feature (and the phone roster, which IS the whole screen, never had one at all): the only door lived
 *  in CONTENT's teaching state, which a selected session replaces. The `+` clears the selection, which
 *  is exactly what re-renders that teaching state — one action, no new flow. */
export function RefineryListHeader(): ReactElement {
  const trpc = useTRPC();
  const sessions = useSuspenseQuery(trpc.refinery.listSessions.queryOptions());
  const selectedId = useSelectedRefinerySessionId();
  return (
    <>
      <Text voice="kicker">Sessions</Text>
      <Text voice="gloss">{sessions.data.length}</Text>
      <Row className="flex-1" gap="field" justify="end">
        <Button
          aria-label="Start a new session"
          disabled={selectedId === null}
          intent="ghost"
          onClick={(): void => clearRefinerySelection()}
          size="glyph-md"
          title="Start a new session"
        >
          <Icon icon={Plus} size="sm" />
        </Button>
      </Row>
    </>
  );
}
