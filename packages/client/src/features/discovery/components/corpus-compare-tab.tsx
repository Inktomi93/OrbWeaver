// The Compare tab reads the selected pair's facet diff; Deep compare is its one primary and adds grounded
// narrative. The pair lives in corpus-compare-store so Similarity can seed it and the handoff survives the
// shell unmounting the previous Context tab (#554).
//
// Select.Value resolves labels from its current items, but browseCharacters is paged and a seeded pair can
// be outside any loaded page (#563). The store carries each name with its id; the tab merges named-but-
// unlisted selections into its options so the trigger remains legible and the dropdown marks the current
// selection.

import type { CharacterId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Icon, Sparkles } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import type { SelectOption } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useSuspenseQuery, useTRPC } from "#data";
import { testId } from "#lib";
import {
  selectCorpusArtifact,
  setCorpusCompareA,
  setCorpusCompareB,
  useCorpusCompareA,
  useCorpusCompareAName,
  useCorpusCompareB,
  useCorpusCompareBName,
} from "#state";

const CHARACTER_ID = typeIdSchema(ID_PREFIX.character);

const NONE = "";
const REDUNDANCY_PRECISION = 2;
/** The pair pickers read ONE page of the catalog. Pinned to `browseCharacters`'s pre-A8 default so this
 *  tab's reach is unchanged by that lane (the verb's own default is a smaller first page now that the
 *  browse list pages). It is still ONE page: a library past this cannot be fully picked from here, which is
 *  the same truncation A8 fixed for the browse list and is filed as its own follow-up. */
const PICKER_PAGE = 200;

export function CorpusCompareTab(): ReactElement {
  return (
    // The bracket owns the stable viewport; the query boundary measures content without trapping scroll chaining.
    <Stack className="relative min-block-0" data-testid={testId("corpusCompareTab")}>
      <QueryBoundary
        resetKeys={[]}
        fallback={<SkeletonRows count={3} shape="line" />}
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
  const idA = CHARACTER_ID.safeParse(a).data;
  const idB = CHARACTER_ID.safeParse(b).data;
  const ready = idA !== undefined && idB !== undefined && idA !== idB;

  const listed: readonly SelectOption[] = [{ value: NONE, label: "Pick a character" }, ...catalog.items.map((c) => ({ value: c.characterId, label: c.name }))];

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
        <Button
          variant="outline"
          size="sm"
          onClick={(): void => selectCorpusArtifact({ kind: "pair", pair: { kind: "characters", idA, idB, nameA: aName, nameB: bName, score: null } })}
        >
          Read comparison
        </Button>
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
function withSelected(items: readonly SelectOption[], selected: string, name: string): readonly SelectOption[] {
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
  readonly itemsA: readonly SelectOption[];
  readonly itemsB: readonly SelectOption[];
  readonly a: string;
  readonly b: string;
  readonly onA: (id: string, name: string) => void;
  readonly onB: (id: string, name: string) => void;
}): ReactElement {
  // The picked NAME is read off the item the user picked — the picker is the one place that holds both, and
  // the store's whole point is that the name reaches the trigger even when the catalog page does not.
  const nameIn = (items: readonly SelectOption[], value: string): string => items.find((item) => item.value === value)?.label ?? "";
  return (
    <Row align="center" gap="field">
      <Select items={itemsA} value={a} onValueChange={(next): void => onA(next as string, nameIn(itemsA, next as string))} aria-label="First character" />
      <Select items={itemsB} value={b} onValueChange={(next): void => onB(next as string, nameIn(itemsB, next as string))} aria-label="Second character" />
    </Row>
  );
}

export function CompareResult({
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
  return (
    <QueryBoundary
      resetKeys={[idA, idB]}
      fallback={<SkeletonRows count={RESULT_SKELETON_ROWS} shape="line" />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="that comparison" onRetry={retry} />}
    >
      <FacetDiff deep={deep} idA={idA} idB={idB} onDeep={onDeep} />
    </QueryBoundary>
  );
}

const RESULT_SKELETON_ROWS = 3;

function FacetDiff({
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
  const { data: cmp } = useSuspenseQuery(trpc.discovery.compareCharacters.queryOptions({ idA, idB }));

  if (cmp === null) {
    return <Text>One of those characters has no distilled facets yet.</Text>;
  }

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
          <QueryBoundary
            resetKeys={[idA, idB]}
            fallback={<SkeletonRows count={RESULT_SKELETON_ROWS} shape="line" />}
            renderError={(_error, retry): ReactElement => <QueryErrorState label="the narrative" onRetry={retry} />}
          >
            <DeepNarrativeRead idA={idA} idB={idB} />
          </QueryBoundary>
        ) : (
          <Button size="sm" data-testid={testId("corpusCompareDeep")} onClick={onDeep}>
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
function DeepNarrativeRead({ idA, idB }: { readonly idA: CharacterId; readonly idB: CharacterId }): ReactElement {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.discovery.compareCharactersDeep.queryOptions({ idA, idB }));
  return <DeepNarrative narrative={data?.narrative ?? null} />;
}

function DeepNarrative({
  narrative,
}: {
  readonly narrative: NonNullable<inferOutput<Trpc["discovery"]["compareCharactersDeep"]>>["narrative"] | null;
}): ReactElement {
  if (narrative === null) {
    return <Text>No narrative available.</Text>;
  }
  if (narrative.degraded) {
    return (
      <Stack gap="field" data-testid={testId("corpusCompareDeepDegraded")}>
        <Row align="center" gap="field">
          <Badge tone="warning" variant="solid" size="sm">
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
    <Row align="center" gap="field" wrap={true}>
      <Text voice="kicker">{label}</Text>
      {tags.length === 0 ? (
        <Text voice="gloss">—</Text>
      ) : (
        tags.map((tag) => (
          <Badge key={tag} size="sm">
            {tag}
          </Badge>
        ))
      )}
    </Row>
  );
}
