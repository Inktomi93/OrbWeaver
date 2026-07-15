// The Corpus CONTENT dossier (a character selected) — one character's composed understanding. Reads
// `characterDossier` (distilled headline facets + portrait↔card alignment + nearest neighbours) +
// `characterKeywords` (its keyword profile, charted as a bar-list). Neighbour rows re-select into this
// same dossier; the "Similar art" strip seeds `search.similarArt` from this character's avatar so
// look-alike portraits are one click away. The ASK panel grounds a free-text question against the
// character's recent PLAYED scenes via `askCard` and shows the answer with a grounded/ungrounded badge —
// the surface's ONE primary is Ask.

import { blobUrl } from "@orb/contracts/assets";
import type { CharacterId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
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
import { CorpusDistillEmptyState } from "../components/corpus-distill-empty-state";
import { toBarItems } from "../lib/corpus-charts";

const ALIGNMENT_PRECISION = 2;
const KEYWORD_LIMIT = 24;
const SIMILAR_ART_TOP_N = 8;
const SKELETON_ROW_COUNT = 3;

export interface CorpusDossierSurfaceProps {
  readonly characterId: CharacterId;
  readonly onBack: () => void;
}

export function CorpusDossierSurface({
  characterId,
  onBack,
}: CorpusDossierSurfaceProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  return (
    <Stack
      ref={surfaceRef}
      tabIndex={-1}
      className="h-full min-h-0 outline-none"
      data-testid={testId("corpusDossierSurface")}
    >
      <QueryBoundary
        fallback={<Text tone="muted">Loading dossier…</Text>}
        renderError={(_error, retry): ReactElement => (
          <Text tone="muted">
            Couldn't load the dossier.{" "}
            <Button intent="ghost" onClick={retry}>
              Retry
            </Button>
          </Text>
        )}
      >
        <DossierBody characterId={characterId} onBack={onBack} />
      </QueryBoundary>
    </Stack>
  );
}

function DossierBody({
  characterId,
  onBack,
}: {
  readonly characterId: CharacterId;
  readonly onBack: () => void;
}): ReactElement {
  const trpc = useTRPC();
  const { data: dossier } = useSuspenseQuery(
    trpc.discovery.characterDossier.queryOptions({ characterId }),
  );
  const { data: keywords } = useSuspenseQuery(
    trpc.discovery.characterKeywords.queryOptions({ characterId, limit: KEYWORD_LIMIT }),
  );

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

  const facet = [dossier.genre, dossier.tone].filter((v) => v !== null).join(" · ");
  const avatarHash = dossier.portrait?.avatarHash ?? null;
  const avatarSrc = avatarHash === null ? {} : { src: blobUrl(avatarHash) };

  return (
    <Stack className="h-full min-h-0 overflow-y-auto overscroll-contain" gap="section">
      <Button intent="ghost" size="sm" onClick={onBack} className="self-start">
        <Icon icon={ArrowLeft} size="sm" />
        Back
      </Button>

      <Row align="center" gap="block">
        <Avatar fallbackDelay={0} hueSeed={characterId} size="lg" {...avatarSrc}>
          {initialsFor(dossier.name)}
        </Avatar>
        <Stack gap="field">
          <Text size="title" weight="semibold">
            {dossier.name}
          </Text>
          {facet !== "" ? (
            <Text size="micro" tone="muted" transform="caps">
              {facet}
            </Text>
          ) : null}
          {dossier.elevatorPitch !== null ? (
            <Text tone="muted">{dossier.elevatorPitch}</Text>
          ) : null}
        </Stack>
      </Row>

      {dossier.portrait !== null ? (
        <Section heading="Portrait alignment">
          <Text size="micro" tone="muted">
            Card ↔ art cosine: {dossier.portrait.alignment.toFixed(ALIGNMENT_PRECISION)}
          </Text>
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
          <Text size="micro" tone="muted">
            No keyword profile computed yet.
          </Text>
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
          <Text size="micro" tone="muted">
            No near neighbours found.
          </Text>
        ) : (
          <Stack gap="row" role="list">
            {dossier.similar.map((neighbor) => {
              const neighborSrc =
                neighbor.avatarHash === null ? {} : { src: blobUrl(neighbor.avatarHash) };
              const neighborFacet = [neighbor.genre, neighbor.tone]
                .filter((v) => v !== null)
                .join(" · ");
              return (
                <ListRow
                  key={neighbor.characterId}
                  clickable={true}
                  onClick={(): void => selectCorpusCharacter(neighbor.characterId)}
                  leading={
                    <Avatar
                      fallbackDelay={0}
                      hueSeed={neighbor.characterId}
                      size="sm"
                      {...neighborSrc}
                    >
                      {initialsFor(neighbor.name)}
                    </Avatar>
                  }
                  title={neighbor.name}
                  subtitle={neighbor.elevatorPitch ?? (neighborFacet === "" ? "" : neighborFacet)}
                  actions={
                    <Badge intent="neutral" size="sm">
                      {neighbor.score.toFixed(ALIGNMENT_PRECISION)}
                    </Badge>
                  }
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
  const art = useQuery(
    trpc.search.similarArt.queryOptions({ characterId, topN: SIMILAR_ART_TOP_N }),
  );

  if (art.isPending) {
    return <SkeletonRows count={SKELETON_ROW_COUNT} shape="avatar-row" />;
  }
  if (art.error !== null) {
    return <QueryErrorState label="the similar art" onRetry={art.refetch} />;
  }
  if (art.data.length === 0) {
    return (
      <Text size="micro" tone="muted">
        No look-alike portraits found.
      </Text>
    );
  }
  return (
    <Stack gap="row" role="list">
      {art.data.map((hit) => {
        const src = hit.avatarHash === null ? {} : { src: blobUrl(hit.avatarHash) };
        return (
          <ListRow
            key={hit.characterId}
            clickable={true}
            onClick={(): void => selectCorpusCharacter(hit.characterId)}
            leading={
              <Avatar fallbackDelay={0} hueSeed={hit.characterId} size="sm" {...src}>
                {initialsFor(hit.name)}
              </Avatar>
            }
            title={hit.name}
            actions={
              <Badge intent="neutral" size="sm">
                {hit.score.toFixed(ALIGNMENT_PRECISION)}
              </Badge>
            }
          />
        );
      })}
    </Stack>
  );
}

function AskPanel({ characterId }: { readonly characterId: CharacterId }): ReactElement {
  const trpc = useTRPC();
  const [draft, setDraft] = useState("");
  const [question, setQuestion] = useState<string | null>(null);

  const answer = useQuery(
    trpc.discovery.askCard.queryOptions(
      { characterId, question: question ?? "" },
      { enabled: question !== null && question !== "" },
    ),
  );

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
          <Button
            intent="primary"
            size="sm"
            data-testid={testId("corpusAskSubmit")}
            onClick={ask}
            disabled={draft.trim() === ""}
          >
            <Icon icon={Sparkles} size="sm" />
            Ask
          </Button>
        </Row>
        <AskAnswer
          isPending={answer.isFetching}
          hasQuestion={question !== null}
          error={answer.error}
          data={answer.data ?? null}
        />
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
    readonly sampledMessages: number;
  } | null;
}): ReactElement | null {
  if (!hasQuestion) {
    return null;
  }
  if (isPending) {
    return (
      <Text size="micro" tone="muted">
        Reading the recent scenes…
      </Text>
    );
  }
  if (error !== null) {
    return (
      <Text size="micro" tone="muted">
        Couldn't answer that one.
      </Text>
    );
  }
  if (data === null) {
    return (
      <Text size="micro" tone="muted">
        No played scenes to answer from yet.
      </Text>
    );
  }
  return (
    <Card padding="block">
      <Stack gap="field">
        <Row align="center" gap="field">
          <Badge intent={data.grounded ? "success" : "warning"} size="sm">
            {data.grounded ? "Grounded" : "Speculative"}
          </Badge>
          <Text size="micro" tone="muted">
            {data.sampledMessages} scenes sampled
          </Text>
        </Row>
        <Text>{data.answer}</Text>
      </Stack>
    </Card>
  );
}
