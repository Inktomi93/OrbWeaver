// The Corpus CONTEXT "Compare" tab — a two-character facet diff. Two Selects (populated from
// `browseCharacters`) pick the pair → `compareCharacters` renders the no-LLM diff (shared/only tags +
// redundancy). "Deep compare" adds `compareCharactersDeep`'s grounded narrative — this tab's ONE primary.
//
// THE PAIR LIVES IN A STORE, NOT IN THIS COMPONENT (side-eye populated arm 2026-08-23, #554). It was
// `useState` here, which made this tab the ONLY way to name a pair — and next door the Similarity tab was
// listing 1,782 of them as inert text with `clickablePairs: 0`, the app's best answer to "are these two
// the same character?" sitting one tab away from the question and unreachable from it. A pair row is a
// door now, and a door needs somewhere to put what it carries: `state/corpus-compare-store.ts` (which also
// survives the CONTEXT tab body being unmounted on the tab switch that door performs).
//
// AND THE PICKERS NAME WHAT THEY HOLD (side-eye se-verify-4 N2, issue #563). Base UI's `Select.Value`
// resolves the trigger's text by looking the value up in the `items` it was handed; these items are ONE
// page of `browseCharacters`, so a pair seeded by the door above — from anywhere in a 313-card catalog —
// routinely is not among them, and the trigger fell back to printing the raw value: two
// `character_01m0n6e2…` ULIDs above a body naming those same two characters in words, the same entity
// spelled twice in one frame, once as a database key. Paging the picker would not close it (the seeded pair
// can always be off whatever page is loaded), so the NAME travels with the id in the store and this tab
// MERGES a named-but-unlisted selection into its own item list. The picker then names the pair it holds
// whatever page is loaded, and because the merge produces a real option the dropdown shows the current pick
// as selected rather than as a missing one.

import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Icon, Sparkles } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import type { SelectOption } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary, QueryErrorState, useTRPC } from "#data";
import { testId } from "#lib";
import { setCorpusCompareA, setCorpusCompareB, useCorpusCompareA, useCorpusCompareAName, useCorpusCompareB, useCorpusCompareBName } from "#state";

const NONE = "";
const REDUNDANCY_PRECISION = 2;
/** The pair pickers read ONE page of the catalog. Pinned to `browseCharacters`'s pre-A8 default so this
 *  tab's reach is unchanged by that lane (the verb's own default is a smaller first page now that the
 *  browse list pages). It is still ONE page: a library past this cannot be fully picked from here, which is
 *  the same truncation A8 fixed for the browse list and is filed as its own follow-up. */
const PICKER_PAGE = 200;

export function CorpusCompareTab(): ReactElement {
  return (
    // THE SCROLL BOX IS THE TAB'S, NOT THE BODY'S (#1726/#1727, the #1133 hoist). `reserveKey` wraps the
    // settled child in an auto-height measuring Stack, so a scroller under the boundary resolves `flex-1`
    // against an indefinite parent and strands everything past the fold; hoisted, the wrapper sits INSIDE
    // the scroller and the scroller survives the read. (Its sibling corpus tabs key with no scroller of
    // their own.)
    <Stack className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid={testId("corpusCompareTab")}>
      <QueryBoundary
        fallback={<Text voice="gloss">Loading characters…</Text>}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="characters" onRetry={retry} />}
        reserveKey="corpus.compare"
      >
        <CompareBody />
      </QueryBoundary>
    </Stack>
  );
}

function CompareBody(): ReactElement {
  const trpc = useTRPC();
  const { data: catalog } = useSuspenseQuery(trpc.discovery.browseCharacters.queryOptions({ limit: PICKER_PAGE }));
  const a = useCorpusCompareA();
  const b = useCorpusCompareB();
  const aName = useCorpusCompareAName();
  const bName = useCorpusCompareBName();
  // DEEP IS PER-PAIR, AND IT IS DERIVED RATHER THAN SYNCED. It used to be a boolean the two pickers reset
  // by hand, which was correct while this component OWNED the pair — it no longer does, so a pair seeded
  // from the Similarity tab would have arrived carrying the previous pair's escalation and fired a model
  // call nobody asked for. Storing WHICH pair was escalated makes the stale case unrepresentable; no
  // effect, no reset call, and the two pickers go back to doing one thing.
  const [deepPair, setDeepPair] = useState(NONE);

  const ready = a !== NONE && b !== NONE && a !== b;
  const pairKey = `${a}\u0000${b}`;
  const idA = castId<CharacterId>(a);
  const idB = castId<CharacterId>(b);

  const listed: readonly SelectOption<string>[] = [
    { value: NONE, label: "Pick a character" },
    ...catalog.items.map((c) => ({ value: c.characterId, label: c.name })),
  ];

  return (
    <Stack gap="section">
      <ComparePickers
        a={a}
        b={b}
        itemsA={withSelected(listed, a, aName)}
        itemsB={withSelected(listed, b, bName)}
        onA={setCorpusCompareA}
        onB={setCorpusCompareB}
      />
      {ready ? (
        <CompareResult deep={deepPair === pairKey} idA={idA} idB={idB} onDeep={(): void => setDeepPair(pairKey)} />
      ) : (
        <Text voice="gloss">Pick two different characters to compare.</Text>
      )}
    </Stack>
  );
}

/**
 * The picker's item list with the CURRENT selection guaranteed present (#563).
 *
 * `Select.Value` prints the raw value for a selection it cannot find, and a pair seeded from the Similarity
 * tab is routinely outside the one catalog page these items come from. The store carries the name for
 * exactly that case, so the missing option is minted from it — a real option, so the dropdown also shows the
 * pick as selected. An id we have no name for is left alone: printing the ULID is bad, and inventing a name
 * for it would be worse.
 */
function withSelected(items: readonly SelectOption<string>[], selected: string, name: string): readonly SelectOption<string>[] {
  if (selected === NONE || name === "" || items.some((item) => item.value === selected)) {
    return items;
  }
  return [...items, { value: selected, label: name }];
}

function ComparePickers({
  itemsA,
  itemsB,
  a,
  b,
  onA,
  onB,
}: {
  readonly itemsA: readonly SelectOption<string>[];
  readonly itemsB: readonly SelectOption<string>[];
  readonly a: string;
  readonly b: string;
  readonly onA: (id: string, name: string) => void;
  readonly onB: (id: string, name: string) => void;
}): ReactElement {
  // The picked NAME is read off the item the user picked — the picker is the one place that holds both, and
  // the store's whole point is that the name reaches the trigger even when the catalog page does not.
  const nameIn = (items: readonly SelectOption<string>[], value: string): string => items.find((item) => item.value === value)?.label ?? "";
  return (
    <Row align="center" gap="field">
      <Select items={itemsA} value={a} onValueChange={(next): void => onA(next as string, nameIn(itemsA, next as string))} aria-label="First character" />
      <Select items={itemsB} value={b} onValueChange={(next): void => onB(next as string, nameIn(itemsB, next as string))} aria-label="Second character" />
    </Row>
  );
}

function CompareResult({
  idA,
  idB,
  deep,
  onDeep,
}: {
  readonly idA: CharacterId;
  readonly idB: CharacterId;
  readonly deep: boolean;
  readonly onDeep: () => void;
}): ReactElement {
  const trpc = useTRPC();
  const diff = useQuery(trpc.discovery.compareCharacters.queryOptions({ idA, idB }));
  const deepDiff = useQuery(trpc.discovery.compareCharactersDeep.queryOptions({ idA, idB }, { enabled: deep }));

  if (diff.isPending) {
    return <Text>Comparing…</Text>;
  }
  if (diff.error !== null) {
    return <Text>Couldn't compare those two.</Text>;
  }
  if (diff.data === null) {
    return <Text>One of those characters has no distilled facets yet.</Text>;
  }
  const cmp = diff.data;

  return (
    <Stack gap="section">
      <Section heading="Facet diff">
        <Stack gap="field">
          <Text voice="gloss">
            Genre: {cmp.sameGenre ? "same" : "different"} · Tone: {cmp.sameTone ? "same" : "different"} · Redundancy:{" "}
            {cmp.redundancy.toFixed(REDUNDANCY_PRECISION)}
          </Text>
          <TagLine label="Shared" tags={cmp.sharedTags} />
          <TagLine label={cmp.a.name} tags={cmp.onlyA} />
          <TagLine label={cmp.b.name} tags={cmp.onlyB} />
        </Stack>
      </Section>

      <Section heading="Deep compare">
        {deep ? (
          <DeepNarrative isPending={deepDiff.isPending} error={deepDiff.error} narrative={deepDiff.data?.narrative ?? null} />
        ) : (
          <Button intent="primary" size="sm" data-testid={testId("corpusCompareDeep")} onClick={onDeep}>
            <Icon icon={Sparkles} size="sm" />
            Deep compare
          </Button>
        )}
      </Section>
    </Stack>
  );
}

/** The narrative, or the honest DEGRADED arm. `narrative.degraded` says the model's reply failed the payload
 *  schema twice, so `summary` is its RAW text and overlap/distinction are empty — rendering that as a finished
 *  narrative beside two blank sections is the lie the flag exists to stop. Degraded shows the raw reply
 *  LABELLED, and drops the two empty headings entirely. */
function DeepNarrative({
  isPending,
  error,
  narrative,
}: {
  readonly isPending: boolean;
  readonly error: unknown | null;
  readonly narrative: {
    readonly summary: string;
    readonly overlap: string;
    readonly distinction: string;
    readonly degraded: boolean;
  } | null;
}): ReactElement {
  if (isPending) {
    return <Text>Reading both characters…</Text>;
  }
  if (error !== null) {
    return <Text>Couldn't generate the narrative.</Text>;
  }
  if (narrative === null) {
    return <Text>No narrative available.</Text>;
  }
  if (narrative.degraded) {
    return (
      <Stack gap="field" data-testid={testId("corpusCompareDeepDegraded")}>
        <Row align="center" gap="field">
          <Badge intent="warning" size="sm">
            Unstructured reply
          </Badge>
          <Text voice="gloss">The model didn't return a comparison in the expected shape — this is its raw answer.</Text>
        </Row>
        <Text>{narrative.summary}</Text>
      </Stack>
    );
  }
  return (
    <Stack gap="field">
      <Text>{narrative.summary}</Text>
      <Text voice="kicker">Overlap</Text>
      <Text>{narrative.overlap}</Text>
      <Text voice="kicker">Distinction</Text>
      <Text>{narrative.distinction}</Text>
    </Stack>
  );
}

function TagLine({ label, tags }: { readonly label: string; readonly tags: readonly string[] }): ReactElement {
  return (
    <Row align="center" gap="field" className="flex-wrap">
      <Text voice="kicker">{label}</Text>
      {tags.length === 0 ? (
        <Text voice="gloss">—</Text>
      ) : (
        tags.map((tag) => (
          <Badge key={tag} intent="neutral" size="sm">
            {tag}
          </Badge>
        ))
      )}
    </Row>
  );
}
