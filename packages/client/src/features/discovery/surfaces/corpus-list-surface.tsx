// The corpus navigator — the Corpus LIST panel. Its heart is the unified SEARCH OMNIBOX (J10): one
// Autocomplete input with as-you-type `search.suggest` typeahead (arrow-key selectable, rendered IN FLOW so
// it can never cover the results it sits above — see `SearchOmnibox`) + a target picker
// (Characters / Scenes / Memories / Images / Text) that dispatches the matching engine and renders the
// result per branch (the Scenes branch previews the matching chat moments; the Text branch is the lexical
// BM25 surface). With an empty query the omnibox rests on the BROWSE view — a facet filter over the
// distilled catalog. Selecting any character hit drives the dossier in CONTENT (`selectCorpusCharacter`).
// Per A2 the ONE primary here is the search itself; there is no create action in this section.

import { Autocomplete } from "@orb/ui/autocomplete";
import { Icon, Search } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useDeferredValue, useRef, useState } from "react";
import { QueryBoundary, QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { testId, useFocusOnMount } from "#lib";
import { CorpusBrowseView } from "../components/corpus-browse-view.tsx";
import { CorpusSearchResults } from "../components/corpus-search-results.tsx";
import { CORPUS_SEARCH_TARGETS, CORPUS_SUGGEST_LIMIT, CORPUS_TARGET_REST_HINTS, resolveSearchTarget } from "../lib/corpus-search-targets.ts";

const DEFAULT_TARGET = CORPUS_SEARCH_TARGETS[0].id;
const SKELETON_ROW_COUNT = 5;
const MIN_SUGGEST_LEN = 2;

export function CorpusListSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  const [query, setQuery] = useState("");
  const [targetId, setTargetId] = useState<string>(DEFAULT_TARGET);
  const deferredQuery = useDeferredValue(query);
  const searching = deferredQuery.trim() !== "";

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="h-full min-h-0 outline-none" data-testid={testId("corpusListSurface")} gap="block">
      <ToggleGroup
        aria-label="Search target"
        data-testid={testId("corpusSearchTarget")}
        value={[targetId]}
        onValueChange={(picked): void => setTargetId((picked[0] ?? DEFAULT_TARGET) as string)}
      >
        {CORPUS_SEARCH_TARGETS.map((target) => (
          <Toggle key={target.id} value={target.id} aria-label={`Search ${target.label}`}>
            {target.label}
          </Toggle>
        ))}
      </ToggleGroup>
      <SearchOmnibox query={query} deferredQuery={deferredQuery} onQuery={setQuery} />
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
}: {
  readonly query: string;
  readonly deferredQuery: string;
  readonly onQuery: (value: string) => void;
}): ReactElement {
  const trpc = useTRPC();
  const trimmed = deferredQuery.trim();
  const suggestions = useQuery(
    trpc.search.suggest.queryOptions({ query: trimmed, limit: CORPUS_SUGGEST_LIMIT }, { enabled: trimmed.length >= MIN_SUGGEST_LEN }),
  );
  const items = (suggestions.data ?? []).map((hit) => hit.suggestion);

  return (
    <Stack data-testid={testId("corpusSearchSuggest")}>
      <Autocomplete
        aria-label="Search your corpus"
        inline={true}
        mode="none"
        items={items}
        open={true}
        value={query}
        onValueChange={onQuery}
        placeholder="Search characters, scenes, memories…"
      />
    </Stack>
  );
}

/** The empty-query rest state. Only the Characters target has a distilled catalog to rest on; every
 *  other target rests on an honest per-target hint (what it searches + what to type) — the browse
 *  view is Characters-only, so it must not render under the other targets. */
function CorpusRestState({ targetId }: { readonly targetId: string }): ReactElement {
  if (targetId === DEFAULT_TARGET) {
    return (
      <QueryBoundary
        fallback={<SkeletonRows count={SKELETON_ROW_COUNT} shape="avatar-row" />}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="the corpus catalog" onRetry={retry} />}
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
