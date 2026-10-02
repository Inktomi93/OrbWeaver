// The sessions LIST (delta 3 arm A, ruled: FLAT, newest first, the character as row identity — one
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
// `characterAvatarHash` now ride `refinerySessionSummarySchema`, joined on the ownership join the list
// read already performs, so the list names EVERY session it lists and there is no second query here.

import { blobUrl } from "@orb/contracts/assets";
import type { RenderHintTone } from "@orb/contracts/refinery";
import type { CharacterId, RefinerySessionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { LibraryListLayout, RowActionsMenu } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { timeLib, useFocusOnMount } from "#lib";
import { refinerySectionSelection, requestRefineryLandingFocus, selectRefinerySessionFromList, useMobileViewport, useSelectedRefinerySessionId } from "#state";
import { RefineryChip } from "../components/refinery-chip.tsx";
import { StartSessionDoor } from "../components/start-session-door.tsx";
import { useDeleteRefinerySession } from "../hooks/use-refinery-mutations.ts";

const VERDICT_TONE: Record<string, RenderHintTone> = {
  ACCEPT: "good",
  NEEDS_REFINEMENT: "warn",
  REGRESSION: "bad",
};
const VERDICT_WORD: Record<string, string> = {
  ACCEPT: "Accept",
  NEEDS_REFINEMENT: "Needs refinement",
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
 *  subtitle beside the iteration and the stamp (`readoutSubtitleOf`), one register BELOW the row's title
 *  rather than above it. The WORD moved with it: "no verdict" named the wire field, "not analyzed" names
 *  the fact the row is reporting. */
function verdictChipOf(row: ResolvedRow): ReactElement | undefined {
  return row.latestVerdict === null ? undefined : (
    <RefineryChip tone={VERDICT_TONE[row.latestVerdict] ?? "neutral"}>{VERDICT_WORD[row.latestVerdict] ?? row.latestVerdict}</RefineryChip>
  );
}

/** The subtitle: iteration + the session's START STAMP. The stamp is the same-card DISTINGUISHER — every
 *  session on one card shares the character title and carries no name of its own, and `createdAt` is
 *  per-session, so an absolute start stamp differs the rows visually AND in the a11y tree (the ruled
 *  auto-label arm; no nameable-session affordance is added here). "Freshness" is already positional (the
 *  list is newest-updated first), so WHEN-STARTED is the fact that actually tells six sessions apart. A
 *  session that HAS a name leads with it. Rides `aria-describedby` with the verdict via the subtitle span.
 *  It also carries the NOT-ANALYZED state (finding c): a row with no verdict says so here, in the same
 *  quiet register as its iteration and stamp, instead of wearing a filled chip louder than its own name. */
function readoutSubtitleOf(row: ResolvedRow): string {
  const stage = row.latestVerdict === null ? "not analyzed · " : "";
  const readout = `${stage}iteration ${row.iterationCount} · started ${timeLib.formatDateTime(row.createdAt)}`;
  return row.sessionName === null ? readout : `${row.sessionName} · ${readout}`;
}

/** The roster owns the session lifecycle door: deleting a session removes its full refinery run history,
 * while leaving the character itself untouched. The shared row composite keeps the destructive action
 * outside the clickable row body and puts the irreversible write behind the house confirmation. */
function RefinerySessionRowActions({ row, selected }: { readonly row: ResolvedRow; readonly selected: boolean }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const remove = useDeleteRefinerySession({ trpc, invalidation });
  const started = timeLib.formatDateTime(row.createdAt);

  const deleteSession = (): Promise<void> =>
    remove.mutateAsync({ sessionId: row.id }).then((): void => {
      // A successful delete cannot leave CONTENT drilled into the now-missing row. This is the same
      // section-selection clear the shell's back door uses, so it also releases an open mobile roster.
      if (selected) {
        refinerySectionSelection.clear();
      }
    });

  return (
    <RowActionsMenu
      label={`Session actions for ${row.characterName}, started ${started}`}
      reveal={true}
      destructive={{
        title: "Delete this refinery session?",
        description: `This permanently deletes this session and all of its refinery runs. ${row.characterName}'s character card is unchanged.`,
        onConfirm: deleteSession,
      }}
    />
  );
}

export function RefineryListSurface(): ReactElement {
  const trpc = useTRPC();
  const sessions = useSuspenseQuery(trpc.refinery.listSessions.queryOptions());
  const selectedId = useSelectedRefinerySessionId();
  const isMobile = useMobileViewport();
  // The SAME condition the header's `+` reads (#307): with nothing selected on a desktop, CONTENT mounts
  // the full-library landing picker — so the empty-state CTA must focus THAT one, not open a second copy
  // over it (the #284 duplicate-door's last mouth). On a phone CONTENT is not rendered (this list is the
  // screen, `resolvePanelMode`'s `listIsScreen` arm) and with a session open CONTENT shows the pipeline, so
  // in both of those the CTA is the only door and stays the anchored picker popover.
  const contentShowsPicker = selectedId === null && !isMobile;
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

  // P1-5: the predicate matches the CHARACTER NAME as well as the session's own name — the list's
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
              // NOT A SECOND PICKER WHERE ONE IS ALREADY ON SCREEN (#307). On a desktop landing the CTA
              // focuses the picker CONTENT mounts (`requestRefineryLandingFocus`) instead of anchoring a
              // duplicate over it. The #157 ruling that made this CTA a LIVE door — never the dead no-op it
              // was, byte-identical before and after — SURVIVES; its input changed: on desktop the live act
              // is focusing the mounted picker, on a phone (no CONTENT picker) it is still opening the one.
              contentShowsPicker ? (
                <Button intent="secondary" onClick={requestRefineryLandingFocus} size="sm">
                  Pick a character
                </Button>
              ) : (
                <StartSessionDoor
                  trigger={(busy): ReactElement => (
                    <Button aria-busy={busy} intent="secondary" size="sm">
                      Pick a character
                    </Button>
                  )}
                />
              )
            }
            description={
              sessions.data.length === 0
                ? // NO "IN THE MAIN PANE" (side-eye 2026-08-19 P1-2). On a phone this pane IS the screen —
                  // there is no main pane to point at — and on a desktop the sentence was directing the user
                  // away from the button directly beneath it. The CTA opens the picker here, so the copy
                  // names the act rather than a place.
                  "A session pins a card as it is right now, then scores, rewrites and re-checks it against that pinned version. Pick a character to start."
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
            actions={<RefinerySessionRowActions row={row} selected={selectedId === row.rawId} />}
            actionsFloat={true}
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
