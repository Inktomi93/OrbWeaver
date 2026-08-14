// The Corpus CONTEXT "Compare" tab — a two-character facet diff. Two Selects (populated from
// `browseCharacters`) pick the pair → `compareCharacters` renders the no-LLM diff (shared/only tags +
// redundancy). "Deep compare" adds `compareCharactersDeep`'s grounded narrative — this tab's ONE primary.

import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Icon, Sparkles } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary, QueryErrorState, useTRPC } from "#data";
import { testId } from "#lib";

const NONE = "";
const REDUNDANCY_PRECISION = 2;

export function CorpusCompareTab(): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading characters…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="characters" onRetry={retry} />}
    >
      <CompareBody />
    </QueryBoundary>
  );
}

function CompareBody(): ReactElement {
  const trpc = useTRPC();
  const { data: catalog } = useSuspenseQuery(trpc.discovery.browseCharacters.queryOptions({}));
  const [a, setA] = useState(NONE);
  const [b, setB] = useState(NONE);
  const [deep, setDeep] = useState(false);

  const ready = a !== NONE && b !== NONE && a !== b;
  const idA = castId<CharacterId>(a);
  const idB = castId<CharacterId>(b);

  const items: SelectItems<string> = [{ value: NONE, label: "Pick a character" }, ...catalog.map((c) => ({ value: c.characterId, label: c.name }))];

  const onPickA = (value: string): void => {
    setA(value);
    setDeep(false);
  };
  const onPickB = (value: string): void => {
    setB(value);
    setDeep(false);
  };

  return (
    <Stack className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid={testId("corpusCompareTab")} gap="section">
      <ComparePickers itemsA={items} itemsB={items} a={a} b={b} onA={onPickA} onB={onPickB} />
      {ready ? (
        <CompareResult idA={idA} idB={idB} deep={deep} onDeep={(): void => setDeep(true)} />
      ) : (
        <Text voice="gloss">Pick two different characters to compare.</Text>
      )}
    </Stack>
  );
}

function ComparePickers({
  itemsA,
  itemsB,
  a,
  b,
  onA,
  onB,
}: {
  readonly itemsA: SelectItems<string>;
  readonly itemsB: SelectItems<string>;
  readonly a: string;
  readonly b: string;
  readonly onA: (value: string) => void;
  readonly onB: (value: string) => void;
}): ReactElement {
  return (
    <Row align="center" gap="field">
      <Select items={itemsA} value={a} onValueChange={(next): void => onA(next as string)} aria-label="First character" />
      <Select items={itemsB} value={b} onValueChange={(next): void => onB(next as string)} aria-label="Second character" />
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
