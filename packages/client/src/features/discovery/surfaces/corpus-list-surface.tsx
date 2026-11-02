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
import { Icon, Search } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement, RefObject } from "react";
import { useDeferredValue, useRef } from "react";
import { ListPage, QueryBoundary, RerankModelDoor, SettingSwitchRow, useRerankModel } from "#components";
import { QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { testId, useDebouncedValue, useFocusOnMount } from "#lib";
import {
  setCorpusSearchQuery,
  setCorpusSearchRerank,
  setCorpusSearchTarget,
  useCorpusSearchQuery,
  useCorpusSearchRerank,
  useCorpusSearchTargetId,
} from "#state";
import { CorpusBrowseView } from "../components/corpus-browse-view.tsx";
import { CorpusSearchResults } from "../components/corpus-search-results.tsx";
import { CORPUS_SEARCH_NAME, CORPUS_SEARCH_TARGET_NAME } from "../lib/corpus-control-names.ts";
import {
  CORPUS_SEARCH_TARGETS,
  CORPUS_SUGGEST_LIMIT,
  CORPUS_SUGGEST_SHOWN,
  CORPUS_TARGET_REST_HINTS,
  CORPUS_TEXT_TARGET_ID,
  isCleanSuggestion,
  resolveSearchTarget,
} from "../lib/corpus-search-targets.ts";

const DEFAULT_TARGET = CORPUS_SEARCH_TARGETS[0].id;
const SKELETON_ROW_COUNT = 5;
const MIN_SUGGEST_LEN = 2;
const RERANK_SETTLE_MS = 400;
const TARGET_ITEMS = CORPUS_SEARCH_TARGETS.map((target) => ({ label: target.label, value: target.id }));

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
  /** The pane box its skip link searches for the first row. */
  const surfaceRef = useRef<HTMLDivElement>(null);
  const query = useCorpusSearchQuery();
  // The axis owns its own default: an unset/stale stored id resolves to the first target.
  const target = resolveSearchTarget(useCorpusSearchTargetId());
  const targetId = target.id;
  const rerankModel = useRerankModel();
  const rerankAsked = useCorpusSearchRerank();
  // A stored ask the Rerank model can no longer serve is not sent: the switch shows off and says why.
  const rerank = rerankAsked && rerankModel.kind === "ready";
  // The stored ask waits for the model read, so the first search carries it instead of a plain one followed by a reranked one.
  const awaitingRerankModel = target.kind === "unified" && rerankAsked && rerankModel.kind === "unknown";
  const deferredQuery = useDeferredValue(query);
  // Each reranked search is a model call, so typing settles before it fires; a plain search keeps its per-keystroke reads.
  const settledQuery = useDebouncedValue(deferredQuery, RERANK_SETTLE_MS);
  const searchQuery = rerank ? settledQuery : deferredQuery;
  const searching = deferredQuery.trim() !== "";

  let pane: ReactElement;
  if (!searching) {
    pane = <CorpusRestState targetId={targetId} />;
  } else if (awaitingRerankModel) {
    pane = <SkeletonRows count={SKELETON_ROW_COUNT} shape="avatar-row" />;
  } else {
    pane = (
      <CorpusSearchResults
        query={searchQuery}
        targetId={targetId}
        rerank={rerank}
        retainFinderScroll={true}
        // The pressed button goes away with the paused state, so focus returns to the field the query is in.
        onTextInstead={(): void => {
          setCorpusSearchTarget(CORPUS_TEXT_TARGET_ID);
          omniboxRef.current?.focus();
        }}
      />
    );
  }

  return (
    <ListPage
      body="bounded"
      data-testid={testId("corpusListSurface")}
      // One control on one row: five target labels never fit a narrow pane side by side, so the target is a
      // select above the omnibox.
      lead={
        <Select
          aria-label={CORPUS_SEARCH_TARGET_NAME}
          data-testid={testId("corpusSearchTarget")}
          items={TARGET_ITEMS}
          onValueChange={(picked): void => setCorpusSearchTarget(picked ?? DEFAULT_TARGET)}
          value={targetId}
        />
      }
      // The lexical text target ranks by BM25 and has nothing to rerank.
      filters={target.kind === "unified" ? <RerankSwitch model={rerankModel} checked={rerank} /> : undefined}
      ref={surfaceRef}
      search={<SearchOmnibox inputRef={omniboxRef} query={query} deferredQuery={deferredQuery} onQuery={setCorpusSearchQuery} />}
      skipTo="Skip to results"
    >
      {pane}
    </ListPage>
  );
}

/** The rerank ask for the unified targets. Off and explained, with the Model-roles door, while no Rerank model can serve it. */
function RerankSwitch({ model, checked }: { readonly model: ReturnType<typeof useRerankModel>; readonly checked: boolean }): ReactElement {
  const ready = model.kind === "ready";
  return (
    <Stack gap="field">
      <SettingSwitchRow
        label="Rerank results"
        description="Re-sorts the nearest hits with your Rerank model. Costs an extra model call."
        checked={checked}
        onChange={setCorpusSearchRerank}
        disabled={!ready}
        disabledReason={rerankOffReason(model)}
      />
      {model.kind === "unset" || model.kind === "blocked" ? <RerankModelDoor /> : null}
    </Stack>
  );
}

function rerankOffReason(model: ReturnType<typeof useRerankModel>): string | undefined {
  switch (model.kind) {
    case "ready":
      return undefined;
    case "unknown":
      return "Checking your Rerank model.";
    case "unset":
      return "No Rerank model is set.";
    case "blocked":
      return `Your Rerank model is set but not running: ${model.cause}.`;
  }
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
    <Stack className="flex-1 min-inline-0" data-testid={testId("corpusSearchSuggest")}>
      <Autocomplete
        aria-label={CORPUS_SEARCH_NAME}
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
        resetKeys={[]}
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
