// The sessions ROSTER (delta 3 arm A, ruled: FLAT, newest first, the character as row identity — one
// selection axis, one row shape; "sessions for X" is a SEARCH, not a structure). A bounded owner list
// fetched whole ⇒ `useSuspenseQuery` + `LibraryListLayout` (the lockdown §14 adjudication; the paginated
// factory is for unbounded browses). The EMPTY state carries the start door — on a phone this pane IS
// the screen (the one-shell rule), so a bare "no sessions" would be the whole product on first contact.

import type { RenderHintTone } from "@orb/contracts/refinery";
import type { RefinerySessionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { LibraryListLayout } from "#components";
import { useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
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

export function RefineryListSurface(): ReactElement {
  const trpc = useTRPC();
  const sessions = useSuspenseQuery(trpc.refinery.listSessions.queryOptions());
  const selectedId = useSelectedRefinerySessionId();
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const rows = sessions.data.filter((s) => query.length === 0 || (s.name ?? "untitled session").toLowerCase().includes(query));
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
        searchLabel="Search sessions"
        searchPlaceholder="Search sessions"
        searchValue={search}
      >
        {rows.map((session) => {
          const id = castId<RefinerySessionId>(session.id);
          return (
            <ListRow
              clickable={true}
              key={session.id}
              onClick={(): void => selectRefinerySessionFromList(id)}
              selected={selectedId === session.id}
              subtitle={`iteration ${session.iterationCount}`}
              title={session.name ?? "Untitled session"}
              actions={
                session.latestVerdict === null ? (
                  <RefineryChip tone="neutral">No verdict</RefineryChip>
                ) : (
                  <RefineryChip tone={VERDICT_TONE[session.latestVerdict] ?? "neutral"}>
                    {VERDICT_WORD[session.latestVerdict] ?? session.latestVerdict}
                  </RefineryChip>
                )
              }
            />
          );
        })}
      </LibraryListLayout>
    </Stack>
  );
}

/** The LIST chrome band (D66 A1/A2): the micro-caps title + the count — the panel's start door lives in
 *  CONTENT's teaching state (starting needs a character pick, which is a CONTENT flow, not a bare `+`). */
export function RefineryListHeader(): ReactElement {
  const trpc = useTRPC();
  const sessions = useSuspenseQuery(trpc.refinery.listSessions.queryOptions());
  return (
    <>
      <Text voice="kicker">Sessions</Text>
      <Text voice="gloss">{sessions.data.length}</Text>
    </>
  );
}
