import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, useTRPC } from "#data";
import type { CorpusDestination } from "#lib";
import { timeLib } from "#lib";
import { openChatMoment, resumeChat, selectCharacter, setActiveSection, useSelectedCorpusDestination } from "#state";

export function CorpusArtifactContext(): ReactElement | null {
  const destination = useSelectedCorpusDestination();
  return destination === null ? null : <ArtifactProvenance destination={destination} />;
}

function ArtifactProvenance({ destination }: { readonly destination: CorpusDestination }): ReactElement {
  switch (destination.kind) {
    case "scene":
    case "digest":
      return <MomentProvenance destination={destination} />;
    case "character":
    case "distill":
      return (
        <Stack gap="field">
          <Text voice="kicker">Character evidence</Text>
          <Text voice="gloss">Generated facets come from the current saved character summary.</Text>
          <Text voice="gloss">The summary does not record an analysis pass identifier.</Text>
          <Button
            intent="secondary"
            size="sm"
            onClick={(): void => {
              selectCharacter(destination.characterId);
              setActiveSection("characters");
            }}
          >
            Open character editor
          </Button>
        </Stack>
      );
    case "theme":
      return (
        <Stack gap="field">
          <Text voice="kicker">Story theme provenance</Text>
          <Text>
            {destination.row.level} · {destination.row.model}
          </Text>
          <Text voice="gloss">Analysis timestamp: {timeLib.formatDateTime(destination.row.computedAt)}</Text>
          <Text voice="gloss">Source identity: {destination.row.id}. A replacement at the same index does not replace this selection.</Text>
        </Stack>
      );
    case "cluster":
      return (
        <Stack gap="field">
          <Text voice="kicker">Grouping provenance</Text>
          <Text>{destination.cluster.model}</Text>
          <Text className="break-all" voice="gloss">
            Grouping input identity: {destination.cluster.passId}
          </Text>
          <Text className="break-all" voice="gloss">
            Generation: {destination.cluster.generationId}
          </Text>
          <Text className="break-all" voice="gloss">
            Encoder fingerprint: {destination.cluster.fingerprint ?? "not recorded"}
          </Text>
          <Text voice="gloss">
            Membership is retained from the selected computation. Unchanged grouping inputs repeat the same identity; names can change on recompute.
          </Text>
        </Stack>
      );
    case "pair":
      return (
        <Stack gap="field">
          <Text voice="kicker">Comparison evidence</Text>
          <Text voice="gloss">
            {destination.pair.kind === "chats"
              ? "Room relation compares segment hashes and fork ancestry."
              : "Character relation compares saved semantic or portrait vectors. The detail shows current distilled facets."}
          </Text>
        </Stack>
      );
    case "image":
      return (
        <Stack gap="field">
          <Text voice="kicker">Asset provenance</Text>
          <Text voice="gloss">Asset: {destination.hit.assetId}</Text>
          <Text voice="gloss">Lens: {destination.hit.lens}</Text>
          <Text voice="gloss">Generated caption; current wearing card shown in Content.</Text>
        </Stack>
      );
    case "keyword":
      return (
        <Stack gap="field">
          <Text voice="kicker">Keyword evidence</Text>
          <Text voice="gloss">Frequency scope: {destination.frequencyScope}. Counts exclude group rooms; search previews cover your indexed library.</Text>
        </Stack>
      );
    case "modelroute":
      return (
        <Stack gap="field">
          <Text voice="kicker">Accounting provenance</Text>
          <Text voice="gloss">
            {destination.route.genre} · {destination.route.provider ?? "Provider not recorded"} · {destination.route.model}
          </Text>
          <Text voice="gloss">
            Returned tokens: {destination.route.tokensOutProvenance}. Cost is a reported total; this aggregate does not retain cost classification.
          </Text>
        </Stack>
      );
    default:
      return assertArtifactNever(destination);
  }
}

function assertArtifactNever(destination: never): never {
  throw new Error(`Missing artifact provenance: ${String(destination)}`);
}

function MomentProvenance({ destination }: { readonly destination: Extract<CorpusDestination, { kind: "scene" | "digest" }> }): ReactElement {
  const source = destination.hit.source;
  return (
    <Stack gap="field">
      <Text voice="kicker">{source.kind === "digest" ? "Generated memory provenance" : "Scene provenance"}</Text>
      <Text voice="gloss">
        {source.kind === "digest" ? `Tier ${source.tier} · block ${source.blockIdx}` : `Block ${source.blockIdx} · chunk ${source.chunkIdx}`}
      </Text>
      <Text voice="gloss">
        Original sequence range: {source.seqStart === null || source.seqEnd === null ? "unavailable" : `${source.seqStart}–${source.seqEnd}`}
      </Text>
      <Text className="break-all" voice="gloss">
        Source row: {source.rowId}
      </Text>
      <Text className="break-all" voice="gloss">
        Generation: {source.generationId}
      </Text>
      <Text className="break-all" voice="gloss">
        Encoder fingerprint: {source.fingerprint ?? "not recorded"}
      </Text>
      {destination.rank === null ? null : <Text voice="gloss">Result rank: {destination.rank}</Text>}
      <QueryBoundary
        fallback={<Text voice="gloss">Resolving the transcript anchor…</Text>}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="the source resolution" onRetry={retry} />}
      >
        <MomentActions source={source} />
      </QueryBoundary>
    </Stack>
  );
}
function MomentActions({ source }: { readonly source: Extract<CorpusDestination, { kind: "scene" | "digest" }>["hit"]["source"] }): ReactElement {
  const trpc = useTRPC();
  const { data: resolution } = useSuspenseQuery(trpc.chat.getMessageWindow.queryOptions({ chatId: source.chatId, target: { kind: "source", source } }));
  if (resolution.anchorMessageId !== null) {
    return (
      <Button intent="primary" size="sm" onClick={(): void => openChatMoment(source.chatId, { kind: "source", source })}>
        Open in chat at this moment
      </Button>
    );
  }
  return (
    <>
      <Text voice="gloss">An exact transcript jump is unavailable.</Text>
      <Button intent="secondary" size="sm" onClick={(): void => resumeChat(source.chatId)}>
        Open chat
      </Button>
    </>
  );
}
