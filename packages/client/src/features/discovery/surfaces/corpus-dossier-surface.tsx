// The Corpus CONTENT dossier (a character selected) — one character's composed understanding. Reads
// `characterDossier` (distilled headline facets + portrait↔card alignment + nearest neighbours) +
// `characterKeywords` (its keyword profile, charted as a bar-list). Neighbour rows re-select into this
// same dossier; the "Similar art" strip seeds `search.similarArt` from this character's avatar so
// look-alike portraits are one click away. The ASK panel grounds a free-text question against the
// character's recent PLAYED scenes via `askCard` and badges the answer with its provenance — the surface's
// ONE primary is Ask.
//
// THREE provenance states, not two (`answerState`): `grounded`/`speculative` are the MODEL'S claim about its
// own answer; `degraded` is OURS — the reply failed the payload schema twice, so the body is raw text the
// server couldn't parse. Merging degraded into "Speculative" blamed the model for our parse failure and hid
// that the text below was never validated at all.

import type { CharacterId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { BarList } from "@orb/ui/bar-list";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { ArrowLeft, Icon, Sparkles } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { QueryBoundary, QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { testId, useFocusOnMount } from "#lib";
import { selectCorpusCharacter } from "#state";
import { CharacterAvatar } from "../components/character-avatar.tsx";
import { CorpusDistillEmptyState } from "../components/corpus-distill-empty-state.tsx";
import { characterFacetLine } from "../lib/character-facet.ts";
import { toBarItems } from "../lib/corpus-charts.ts";

const ALIGNMENT_PRECISION = 2;
const KEYWORD_LIMIT = 24;
const SIMILAR_ART_TOP_N = 8;
const SKELETON_ROW_COUNT = 3;

export interface CorpusDossierSurfaceProps {
  readonly characterId: CharacterId;
  readonly onBack: () => void;
}

export function CorpusDossierSurface({ characterId, onBack }: CorpusDossierSurfaceProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  return (
    // No height/scroll/inset of its own — the CONTENT region owns all three for both corpus surfaces
    // (`corpus-content.tsx`, the Configuration precedent).
    <Stack ref={surfaceRef} tabIndex={-1} className="outline-none" data-testid={testId("corpusDossierSurface")}>
      <QueryBoundary
        fallback={<Text voice="gloss">Loading dossier…</Text>}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="the dossier" onRetry={retry} />}
      >
        <DossierBody characterId={characterId} onBack={onBack} />
      </QueryBoundary>
    </Stack>
  );
}

function DossierBody({ characterId, onBack }: { readonly characterId: CharacterId; readonly onBack: () => void }): ReactElement {
  const trpc = useTRPC();
  const { data: dossier } = useSuspenseQuery(trpc.discovery.characterDossier.queryOptions({ characterId }));
  const { data: keywords } = useSuspenseQuery(trpc.discovery.characterKeywords.queryOptions({ characterId, limit: KEYWORD_LIMIT }));

  if (dossier === null) {
    return (
      <CorpusDistillEmptyState
        title="Not distilled yet"
        description="This character has no distilled dossier. Distill it in the Refinery, then come back."
        secondaryAction={
          <Button intent="secondary" size="sm" onClick={onBack}>
            <Icon icon={ArrowLeft} size="sm" />
            Back
          </Button>
        }
      />
    );
  }

  const facet = characterFacetLine(dossier.genre, dossier.tone);
  const avatarHash = dossier.portrait?.avatarHash ?? null;

  return (
    <Stack gap="section">
      <Button intent="ghost" size="sm" onClick={onBack} className="self-start">
        <Icon icon={ArrowLeft} size="sm" />
        Back
      </Button>

      <Row align="center" gap="block">
        <CharacterAvatar id={characterId} name={dossier.name} hash={avatarHash} size="lg" />
        <Stack gap="field">
          <Text className="text-title leading-title font-semibold">{dossier.name}</Text>
          {facet !== "" ? <Text voice="kicker">{facet}</Text> : null}
          {dossier.elevatorPitch !== null ? <Text className="text-muted-foreground">{dossier.elevatorPitch}</Text> : null}
        </Stack>
      </Row>

      {dossier.portrait !== null ? (
        <Section heading="Portrait alignment">
          <Text voice="gloss">Card ↔ art cosine: {dossier.portrait.alignment.toFixed(ALIGNMENT_PRECISION)}</Text>
        </Section>
      ) : null}

      {dossier.tags.length > 0 ? (
        <Section heading="Tags">
          <Row align="center" gap="field" className="flex-wrap">
            {dossier.tags.map((tag) => (
              <Badge key={tag} intent="neutral" size="sm">
                {tag}
              </Badge>
            ))}
          </Row>
        </Section>
      ) : null}

      <Section heading="Keywords">
        {keywords.length === 0 ? (
          <Text voice="gloss">No keyword profile computed yet.</Text>
        ) : (
          <BarList
            label="Keyword profile"
            items={toBarItems(
              keywords,
              (keyword) => keyword.keyword,
              (keyword) => keyword.count,
            )}
          />
        )}
      </Section>

      <Section heading="Similar characters">
        {dossier.similar.length === 0 ? (
          <Text voice="gloss">No near neighbours found.</Text>
        ) : (
          <Stack gap="row" role="list">
            {dossier.similar.map((neighbor) => {
              const neighborFacet = characterFacetLine(neighbor.genre, neighbor.tone);
              return (
                <ListRow
                  key={neighbor.characterId}
                  clickable={true}
                  onClick={(): void => selectCorpusCharacter(neighbor.characterId)}
                  leading={<CharacterAvatar id={neighbor.characterId} name={neighbor.name} hash={neighbor.avatarHash} />}
                  title={neighbor.name}
                  subtitle={neighbor.elevatorPitch ?? (neighborFacet === "" ? "" : neighborFacet)}
                  actions={<Score value={neighbor.score} />}
                />
              );
            })}
          </Stack>
        )}
      </Section>

      <SimilarArtSection characterId={characterId} />

      <AskPanel characterId={characterId} />
    </Stack>
  );
}

/** The look-alike-portrait strip — `search.similarArt` seeded by this character's own avatar vector.
 *  A plain query (not suspense) so an empty/undistilled art result degrades to a muted note in place. */
function SimilarArtSection({ characterId }: { readonly characterId: CharacterId }): ReactElement {
  return (
    <Section heading="Similar art">
      <SimilarArtBody characterId={characterId} />
    </Section>
  );
}

function SimilarArtBody({ characterId }: { readonly characterId: CharacterId }): ReactElement {
  const trpc = useTRPC();
  const art = useQuery(trpc.search.similarArt.queryOptions({ characterId, topN: SIMILAR_ART_TOP_N }));

  if (art.isPending) {
    return <SkeletonRows count={SKELETON_ROW_COUNT} shape="avatar-row" />;
  }
  if (art.error !== null) {
    return <QueryErrorState label="the similar art" onRetry={art.refetch} />;
  }
  if (art.data.length === 0) {
    return <Text voice="gloss">No look-alike portraits found.</Text>;
  }
  return (
    <Stack gap="row" role="list">
      {art.data.map((hit) => (
        <ListRow
          key={hit.characterId}
          clickable={true}
          onClick={(): void => selectCorpusCharacter(hit.characterId)}
          leading={<CharacterAvatar id={hit.characterId} name={hit.name} hash={hit.avatarHash} />}
          title={hit.name}
          actions={<Score value={hit.score} />}
        />
      ))}
    </Stack>
  );
}

/** Quiet metadata (§6.3 P5): a cosine/relevance score is a readout, not a pill — inline micro/mono/muted. */
function Score({ value }: { readonly value: number }): ReactElement {
  return (
    <Text voice="gloss" className="shrink-0 font-mono">
      {value.toFixed(ALIGNMENT_PRECISION)}
    </Text>
  );
}

function AskPanel({ characterId }: { readonly characterId: CharacterId }): ReactElement {
  const trpc = useTRPC();
  const [draft, setDraft] = useState("");
  const [question, setQuestion] = useState<string | null>(null);

  const answer = useQuery(trpc.discovery.askCard.queryOptions({ characterId, question: question ?? "" }, { enabled: question !== null && question !== "" }));

  const ask = (): void => {
    const trimmed = draft.trim();
    if (trimmed !== "") {
      setQuestion(trimmed);
    }
  };

  return (
    <Section heading="Ask">
      <Stack gap="block">
        <Row align="center" gap="field">
          <Input
            aria-label="Ask a question about this character"
            data-testid={testId("corpusAskInput")}
            onValueChange={setDraft}
            placeholder="What drives them? How do they treat allies?"
            value={draft}
          />
          <Button intent="primary" size="sm" data-testid={testId("corpusAskSubmit")} onClick={ask} disabled={draft.trim() === ""}>
            <Icon icon={Sparkles} size="sm" />
            Ask
          </Button>
        </Row>
        <AskAnswer isPending={answer.isFetching} hasQuestion={question !== null} error={answer.error} data={answer.data ?? null} />
      </Stack>
    </Section>
  );
}

function AskAnswer({
  isPending,
  hasQuestion,
  error,
  data,
}: {
  readonly isPending: boolean;
  readonly hasQuestion: boolean;
  readonly error: unknown | null;
  readonly data: {
    readonly answer: string;
    readonly grounded: boolean;
    readonly degraded: boolean;
    readonly sampledMessages: number;
  } | null;
}): ReactElement | null {
  if (!hasQuestion) {
    return null;
  }
  if (isPending) {
    return <Text voice="gloss">Reading the recent scenes…</Text>;
  }
  if (error !== null) {
    return <Text voice="gloss">Couldn't answer that one.</Text>;
  }
  if (data === null) {
    return <Text voice="gloss">No played scenes to answer from yet.</Text>;
  }
  const state = answerState(data);
  return (
    <Card>
      <Stack gap="field">
        <Row align="center" gap="field">
          <Badge intent={state.intent} size="sm" data-testid={testId("corpusAskState")} data-answer-state={state.key}>
            {state.label}
          </Badge>
          <Text voice="gloss">{state.gloss ?? `${data.sampledMessages} scenes sampled`}</Text>
        </Row>
        <Text>{data.answer}</Text>
      </Stack>
    </Card>
  );
}

/** THREE states, not two — `degraded` is OUR parse failing, `grounded` is the MODEL'S claim about its own
 *  answer (contract/results.ts). Showing "Speculative" for a degraded reply attributes our failure to the
 *  model and hides that the text below is unparsed raw output, so degraded wins the badge outright. */
function answerState(data: { readonly grounded: boolean; readonly degraded: boolean }): {
  readonly key: string;
  readonly label: string;
  readonly intent: "success" | "warning";
  readonly gloss: string | null;
} {
  if (data.degraded) {
    return { key: "degraded", label: "Unstructured reply", intent: "warning", gloss: "The model didn't answer in the expected shape — this is its raw text." };
  }
  if (data.grounded) {
    return { key: "grounded", label: "Grounded", intent: "success", gloss: null };
  }
  return { key: "speculative", label: "Speculative", intent: "warning", gloss: null };
}
