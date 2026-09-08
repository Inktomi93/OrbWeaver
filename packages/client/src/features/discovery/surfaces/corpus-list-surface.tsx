// The corpus navigator — the Corpus LIST panel. Its heart is the unified SEARCH OMNIBOX (J10): one
// Autocomplete input with as-you-type `search.suggest` typeahead (arrow-key selectable, rendered IN FLOW so
// it can never cover the results it sits above — see `SearchOmnibox`) + a target picker
// (Characters / Scenes / Memories / Images / Text) that dispatches the matching engine and renders the
// result per branch (the Scenes branch previews the matching chat moments; the Text branch is the lexical
// BM25 surface). With an empty query the omnibox rests on the BROWSE view — a facet filter over the
// distilled catalog. Selecting any character hit drives the dossier in CONTENT (`selectCorpusCharacter`).
// Per A2 the ONE primary here is the search itself; there is no create action in this section.
//
// THE SEARCH OUTLIVES THIS COMPONENT. Query + target live in `#state`'s corpus-search store, not in
// `useState`: the shell UNMOUNTS a section's LIST surface on a rail switch, so component state meant that
// opening a result's room and coming back emptied the box and reset the target — while the dossier
// selection beside it survived, because that one is a store (side-eye corpus re-pass 2026-08-19, U1;
// UI-Architecture-and-Layout.md's "per-section selection is REMEMBERED"). Session-scoped, not persisted —
// the store's own header says why a reload should NOT re-ask yesterday's question.

import { Autocomplete } from "@orb/ui/autocomplete";
import { Button } from "@orb/ui/button";
import { Icon, Search } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement, RefObject } from "react";
import { useDeferredValue, useRef } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { testId, useFocusOnMount } from "#lib";
import { setCorpusSearchQuery, setCorpusSearchTarget, useCorpusSearchQuery, useCorpusSearchTargetId } from "#state";
import { CorpusBrowseView } from "../components/corpus-browse-view.tsx";
import { CorpusSearchResults } from "../components/corpus-search-results.tsx";
import {
  CORPUS_SEARCH_TARGETS,
  CORPUS_SUGGEST_LIMIT,
  CORPUS_SUGGEST_SHOWN,
  CORPUS_TARGET_REST_HINTS,
  isCleanSuggestion,
  resolveSearchTarget,
} from "../lib/corpus-search-targets.ts";

const DEFAULT_TARGET = CORPUS_SEARCH_TARGETS[0].id;
const SKELETON_ROW_COUNT = 5;
const MIN_SUGGEST_LEN = 2;
/** The picker's grid: five cells over SIX tracks, so the two rows fill their width exactly — three
 *  2-track cells, then two 3-track cells. See the wrap note on `CorpusListSurface`. */
const PICKER_TRACKS = "grid w-full grid-cols-6";
const PICKER_FIRST_ROW = 3;

export function CorpusListSurface(): ReactElement {
  // FOCUS LANDS ON THE OMNIBOX, NOT ON A WRAPPER (side-eye corpus re-pass 2026-08-19, C7). This used to
  // focus the surface root — a `tabIndex={-1}` div — which is a target that announces nothing and puts the
  // pane's own control one Tab further away than it looks; on the audited walk the omnibox was the 18th
  // stop. The search IS this surface (its query and target outlive the component precisely because it is
  // the home you come back to), so it is what a keyboard/SR user should land on when the section mounts.
  // `useFocusOnMount` still declines on the INITIAL page load (`activeElement === <body>`), so this does
  // NOT move the start of the tab order past the rail nav on a cold boot — the skip-link/first-Tab
  // behaviour is unchanged, and only a real rail navigation moves focus here.
  const omniboxRef = useRef<HTMLInputElement>(null);
  useFocusOnMount(omniboxRef);
  /** The pane box the skip link searches for its first row — see the control's own note. */
  const surfaceRef = useRef<HTMLDivElement>(null);
  const query = useCorpusSearchQuery();
  // The axis owns its own default: an unset/stale stored id resolves to the first target.
  const targetId = resolveSearchTarget(useCorpusSearchTargetId()).id;
  const deferredQuery = useDeferredValue(query);
  const searching = deferredQuery.trim() !== "";

  return (
    <Stack className="h-full min-h-0" data-testid={testId("corpusListSurface")} gap="block" ref={surfaceRef}>
      {/* SKIP THE CHROME (#537, the #491 pane-scoped twin). The app-shell's own `Skip to content` moves
          focus to `<main>` — i.e. PAST this pane — so a keyboard user who came for the RESULTS had no
          shortcut at all: five target toggles, the omnibox and up to four typeahead rows stand in front of
          the first hit. This lands directly ON the first row, which is what the search exists to produce.
          Same posture and same contract as the characters pane's (`character-library-surface.tsx`):
          `not-focus-visible:sr-only` (never `sr-only focus-visible:not-sr-only` — `not-sr-only` is a RESET
          whose `padding:0; height:auto` beats the Button's own box and renders the revealed control under
          the WCAG 2.5.8 floor), and FIRST IN DOM ORDER inside the surface, because a skip control that is
          not the first focusable is a second tab stop rather than a skip.
          It is not in the way of `useFocusOnMount` below: that hook declines on the initial page load, and
          on a rail switch it moves focus INTO the omnibox, past this control by design. */}
      <Button
        className="not-focus-visible:sr-only focus-visible:self-start"
        intent="secondary"
        onClick={(): void => surfaceRef.current?.querySelector<HTMLElement>('[data-slot="list-row-body"]')?.focus()}
        size="sm"
        type="button"
      >
        Skip to results
      </Button>
      {/* THE PICKER WRAPS ON PURPOSE (side-eye corpus re-pass 2026-08-19 §5). Five content-sized cells in a
          `w-fit` wrapping flex row missed one row by ~2px at the LIST pane's real width: "Memories" dropped
          to a second line, leaving a 99px hole beside "Scenes" and a ragged right edge on the first thing
          the pane shows. Five labels cannot fit one row at a 320-360px pane without truncating names that
          ARE the vocabulary, so the wrap is made DELIBERATE and balanced instead of emergent: a 6-track grid
          with 2-track cells on row one and 3-track cells on row two fills both rows exactly at EVERY width —
          unconditional track sizing, no measurement, no count gate, and the mobile 4+1 ragged arm is gone
          with it. */}
      <ToggleGroup
        aria-label="Search target"
        className={PICKER_TRACKS}
        data-testid={testId("corpusSearchTarget")}
        value={[targetId]}
        onValueChange={(picked): void => setCorpusSearchTarget(picked[0] ?? DEFAULT_TARGET)}
      >
        {CORPUS_SEARCH_TARGETS.map((target, index) => (
          <Toggle key={target.id} value={target.id} aria-label={`Search ${target.label}`} className={index < PICKER_FIRST_ROW ? "col-span-2" : "col-span-3"}>
            {target.label}
          </Toggle>
        ))}
      </ToggleGroup>
      <SearchOmnibox inputRef={omniboxRef} query={query} deferredQuery={deferredQuery} onQuery={setCorpusSearchQuery} />
      <Stack className="min-h-0 flex-1">
        {searching ? <CorpusSearchResults query={deferredQuery} targetId={targetId} /> : <CorpusRestState targetId={targetId} />}
      </Stack>
    </Stack>
  );
}

/** The omnibox input with server-driven typeahead. `mode="none"` shows the suggestions VERBATIM (they are
 *  already server-ranked for the query — no client re-filter); selecting one writes it into the query.
 *
 *  IN FLOW, NOT IN A POPUP (#244, the corpus quick-wins lane's find). An anchored popup lands on whatever
 *  sits below the field, and below THIS field are the search results — so the typeahead physically covered
 *  the first rows and result #1 could not be clicked at all (a CT click on it waited for actionability
 *  forever; the test that proved the row was a door had to press Escape first). It was cosmetic while those
 *  rows were dead divs and became a blocker the moment they became doors.
 *
 *  `inline` is the `Autocomplete` seal's own escape for exactly this — its founding caller is the prompt
 *  dialog, whose popup covered the confirm row it pointed at and `aria-hidden`'d the rest of the card out of
 *  the accessibility tree. The list renders as a bounded scroller under the input, RESERVING space instead
 *  of overlaying: nothing can be covered at any z-index, and it collapses to nothing (`data-empty:hidden`)
 *  when there is nothing to suggest — which is also what deletes the "No suggestions." panel that used to
 *  sit over the answer while the server had nothing to add. `open` is unconditionally true by Base UI's
 *  documented requirement for this arm (the item list is the visibility gate). */
function SearchOmnibox({
  query,
  deferredQuery,
  onQuery,
  inputRef,
}: {
  readonly query: string;
  readonly deferredQuery: string;
  readonly onQuery: (value: string) => void;
  /** The surface's focus target on mount — see `CorpusListSurface` (C7). */
  readonly inputRef: RefObject<HTMLInputElement | null>;
}): ReactElement {
  const trpc = useTRPC();
  const trimmed = deferredQuery.trim();
  const suggestions = useQuery(
    trpc.search.suggest.queryOptions({ query: trimmed, limit: CORPUS_SUGGEST_LIMIT }, { enabled: trimmed.length >= MIN_SUGGEST_LEN }),
  );
  const pool = (suggestions.data ?? []).map((hit) => hit.suggestion);
  const items = suggestionsToShow(pool, trimmed);

  return (
    <Stack data-testid={testId("corpusSearchSuggest")}>
      <Autocomplete
        aria-label="Search your corpus"
        inline={true}
        inputRef={inputRef}
        mode="none"
        items={items}
        open={true}
        value={query}
        onValueChange={onQuery}
        // SHORT ENOUGH TO RENDER WHOLE (side-eye re-pass C9): the old line ("Search characters, scenes,
        // memories…") clipped with NO ellipsis under the `reading` appearance preset — a placeholder cut
        // mid-word reads as a rendering fault, and the per-target rest hint below already teaches what each
        // target searches, so the placeholder only has to name the act.
        placeholder="Search your corpus…"
      />
    </Stack>
  );
}

/** What the typeahead actually renders: server suggestions minus the junk, capped to what its bounded
 *  in-flow box can SHOW.
 *
 *  Three measured defects, one seam (side-eye re-pass B4). (1) The list overflowed its own box —
 *  `scrollHeight 210` vs `clientHeight 158`, two of six options cut with no visible scrollbar — because the
 *  caller asked for eight suggestions while the shared inline list is deliberately a fixed ~4-row scroller
 *  (it sits INSIDE this pane and may not grow it). Asking for more than fits is the caller's bug, so the
 *  ask is capped here rather than the primitive's box being unsealed. (2) The suggest index leaks raw
 *  tokenizer fragments (`"elf elf<"`), which teach nothing and cost a slot a real phrase wanted.
 *  (3) The verbatim query already in the box was offered back as a suggestion — a row whose only effect is
 *  to retype what you typed. The server keeps returning the wider set; only the DISPLAY is narrowed. */
function suggestionsToShow(suggestions: readonly string[], query: string): readonly string[] {
  const seen = new Set<string>([query.toLowerCase()]);
  const kept: string[] = [];
  for (const suggestion of suggestions) {
    const key = suggestion.trim().toLowerCase();
    if (key === "" || seen.has(key) || !isCleanSuggestion(suggestion)) {
      continue;
    }
    seen.add(key);
    kept.push(suggestion);
    if (kept.length === CORPUS_SUGGEST_SHOWN) {
      break;
    }
  }
  return kept;
}

/** The empty-query rest state. Only the Characters target has a distilled catalog to rest on; every
 *  other target rests on an honest per-target hint (what it searches + what to type) — the browse
 *  view is Characters-only, so it must not render under the other targets. */
function CorpusRestState({ targetId }: { readonly targetId: string }): ReactElement {
  if (targetId === DEFAULT_TARGET) {
    return (
      <QueryBoundary
        fallback={<SkeletonRows count={SKELETON_ROW_COUNT} shape="avatar-row" />}
        fill={true}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="the corpus catalog" onRetry={retry} />}
        reserveKey="corpus.browse"
      >
        <CorpusBrowseView />
      </QueryBoundary>
    );
  }
  return (
    <Stack align="center" className="p-block" gap="field">
      <Icon icon={Search} size="lg" />
      <Text>{CORPUS_TARGET_REST_HINTS[resolveSearchTarget(targetId).id]}</Text>
    </Stack>
  );
}
