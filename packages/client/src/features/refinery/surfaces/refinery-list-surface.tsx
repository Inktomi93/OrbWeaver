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
import { Icon, Plus } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { CharacterPicker, LibraryListLayout, ListPaneHeader } from "#components";
import { useOpenRefinery, useTRPC } from "#data";
import { timeLib, useFocusOnMount } from "#lib";
import { requestRefineryLandingFocus, selectRefinerySessionFromList, useMobileViewport, useSelectedRefinerySessionId } from "#state";
import { RefineryChip } from "../components/refinery-chip.tsx";
import { useRefineryCensus } from "../hooks/use-refinery-sessions.ts";

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

/**
 * The START DOOR, as one anatomy for the two chromes this file draws: the chrome band's `+` glyph and the
 * empty state's worded CTA. Both are an anchored Popover around the shared `CharacterPicker` firing the
 * shared `useOpenRefinery` flow — the ONE resume-or-mint rule behind all three of the product's doors
 * (#157) — so the only thing a caller supplies is the control the user actually sees.
 *
 * IT EXISTS BECAUSE THE EMPTY STATE'S CTA WAS DEAD (side-eye 2026-08-19 P1-1). "Pick a character" called
 * `clearRefinerySelection()` — in the arm where it renders, no selection can exist, so the press was an
 * unconditional no-op and the shell was byte-identical before and after it. That is the SAME defect the
 * owner ruled on for the `+` (#157, recorded 60 lines below: "the primary action must not be a visible dead
 * control while the real affordance hides below the fold") — the fix landed on the `+` and left its twin
 * standing in the same file. On a phone it was worse than a no-op: the list IS the screen there, the
 * copy pointed at a "main pane" the viewport does not have, and the only working door was a 24px glyph in
 * the worst thumb corner. One door, two chromes, no dead arm.
 *
 * …EXCEPT THE EMPTY STATE'S CTA IS NOT THIS DOOR ON A DESKTOP LANDING (#307, the #284 duplicate-door's last
 * mouth). With nothing selected on a desktop, CONTENT already mounts the full-library landing picker, so a
 * SECOND anchored one over it is two identical 100-row pickers on one plane. There the CTA is a plain button
 * that FOCUSES the mounted picker (`requestRefineryLandingFocus`) rather than a `StartSessionDoor` — the
 * P1-1 ruling ("the CTA must be a live door") survives, its input changed. This door still draws the `+`
 * glyph in every regime and the worded CTA on a PHONE (where CONTENT is not rendered) and with a session
 * open (where CONTENT shows the pipeline) — the arms where it is genuinely the only picker on screen.
 */
function StartSessionDoor({ trigger }: { readonly trigger: (busy: boolean) => ReactElement }): ReactElement {
  const { openRefinery, isPending } = useOpenRefinery();
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <Popover onOpenChange={setPickerOpen} open={pickerOpen}>
      {/* The trigger is a FUNCTION of the in-flight state, not a fixed element: a start is a real await
          (the flow resolves resume-vs-mint against the list at CLICK time), and the control the user
          pressed is the honest place to say so — which only the caller's own chrome can spell. */}
      <PopoverTrigger render={trigger(isPending)} />
      <PopoverPopup>
        <CharacterPicker
          autoFocusSearch={true}
          emptyText="No characters match."
          label="Start a refinery session"
          onEscape={(): void => setPickerOpen(false)}
          onSelect={(id): void => {
            setPickerOpen(false);
            // @orb-waive caught-failure-ownership(openRefinery): useOpenRefinery's own errorToast
            // surfaces the failure. Ends if useOpenRefinery drops its errorToast.
            void openRefinery(id).catch(() => undefined);
          }}
          placeholder="Search characters…"
          reserveKey="refinery.startSessionPicker"
        />
      </PopoverPopup>
    </Popover>
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

/**
 * The LIST chrome band (D66 A1/A2): the shared `ListPaneHeader` cluster — title + count + the START
 * DOOR since P1-6. Once a session is selected there was NO way back to "start another one" from anywhere
 * in the feature (and the phone list, which IS the whole screen, never had one at all): the only door
 * lived in CONTENT's teaching state, which a selected session replaces.
 *
 * REBUILT ONTO `ListPaneHeader` (#1206): this band was the ONE hand-rolled `Text voice="kicker"`/
 * `voice="gloss"` pair left after `ListPaneHeader` was minted to retire exactly that duplication
 * (chat/corpus/analytics) — it also missed the #1136 title-size step (16→24px display) every other
 * list-bearing section already carries, and left `LIST_PANE_TITLE_ID` unset, so `panel-chrome.tsx`'s
 * `aria-labelledby` for the LIST `<aside>` resolved to nothing here. The action slot carries the
 * IDENTICAL `StartSessionDoor` this band already had; only the vehicle changed.
 *

 * ── THE `+` IS A DOOR, NOT A SELECTION-CLEARER (owner ruling, 2026-08-17, #157) ──────────────────────
 * It used to call `clearRefinerySelection()` and nothing else, which meant it did NOTHING at cold open
 * (where the selection is already null) — so it shipped `disabled` there, and the real pick-a-character
 * affordance sat in the content pane below a scroll. The owner ruled the inversion IS the defect: "the
 * primary action must not be a visible dead control while the real affordance hides below the fold."
 * (The kept-as-designed review this reverses, and the CT pin that recorded it, are named in
 * `tests/client/features/refinery/surfaces/refinery-list-surface.ct.tsx`.)
 *
 * So the `+` now opens the SAME picker the landing shows and fires the SAME flow (`useOpenRefinery` —
 * one resume-or-mint rule for all three doors), from cold open and with a session open alike. The
 * anchored-Popover-around-a-shared-Command-body shape is `AddMemberPopover`'s, which is also what
 * `CharacterDoor` does one folder over; the OUTER chrome differs (a glyph button in a chrome band, not a
 * secondary button that echoes a choice), which is exactly the part each consumer is supposed to own.
 *
 * ── …AND NOT WHEN CONTENT IS ALREADY SHOWING THAT PICKER (side-eye 2026-08-19 P1-3) ──────────────────
 * "From cold open and with a session open alike" turned out to be one arm too many. With nothing selected
 * the landing MOUNTS the full-library picker in the content pane; the `+` opened a SECOND one over it —
 * two identical 100-row pickers on one plane, which the duplicate-door lens fires on and which makes the
 * glyph a worse copy of a control already on screen. So the `+` earns its keep only where the landing is
 * not: with a session open (the landing is replaced by the pipeline), or on a PHONE with nothing selected,
 * where the one-shell rule makes this list the whole screen and CONTENT is not rendered at all
 * (`resolvePanelMode`'s `listIsScreen` arm) — there the glyph is the only door and hiding it would leave
 * the phone startable only from the empty state. Not `disabled`: that is the #157 defect itself.
 */
export function RefineryListHeader(): ReactElement {
  // ONE census spelling, shared with the phone topbar's screen title (#1676) — and non-suspending, like every
  // other section's band ("the title renders immediately and the count settles in place"). It is the SAME
  // `listSessions` key the roster surface below suspends on, so the band still costs no extra request and the
  // settled render is unchanged.
  const census = useRefineryCensus();
  const selectedId = useSelectedRefinerySessionId();
  const isMobile = useMobileViewport();
  const contentShowsPicker = selectedId === null && !isMobile;
  return (
    <ListPaneHeader
      action={
        contentShowsPicker ? undefined : (
          <StartSessionDoor
            trigger={(busy): ReactElement => (
              <Button aria-busy={busy} aria-label="Start a new session" intent="ghost" size="glyph-md" title="Start a new session">
                <Icon icon={Plus} size="sm" />
              </Button>
            )}
          />
        )
      }
      count={census ?? 0}
      title="Sessions"
    />
  );
}
