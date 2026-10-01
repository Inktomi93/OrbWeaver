import type { MessageView } from "@orb/contracts/chat";
import { buildIdentityNameContext, isNarratorVoiced } from "@orb/contracts/chat";
import type { CorpusSourceOutcome } from "@orb/contracts/search";
import type { MessageRole } from "@orb/kit/message-role";
import { Button } from "@orb/ui/button";
import { Section, Stack } from "@orb/ui/layout";
import { Markdown } from "@orb/ui/markdown";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, SkeletonRows, useTRPC } from "#data";
import type { CorpusDestination } from "#lib";
import { openChatMoment, resumeChat } from "#state";
import { CorpusArtifactFrame } from "../components/corpus-artifact-frame.tsx";
import { chatSubtitle } from "../lib/corpus-result-text.ts";

type Moment = Extract<CorpusDestination, { kind: "scene" | "digest" }>;
const RELATED_LIMIT = 6;
const ROLE_NAMES: Readonly<Record<MessageRole, string>> = { user: "User", assistant: "Assistant", system: "System" };
const SOURCE_OUTCOME_TEXT: Readonly<Record<CorpusSourceOutcome, string>> = {
  resolved: "Exact source moment resolved.",
  moved: "The source changed. Showing its surviving source anchor or visible original range.",
  deleted: "The source moment was deleted. Your selected evidence is retained.",
  unavailable: "This source has no available transcript anchor.",
};

export function CorpusMomentSurface({ destination }: { readonly destination: Moment }): ReactElement {
  const source = destination.hit.source;
  const title = chatSubtitle(destination.hit.chatTitle, destination.kind === "digest" ? destination.hit.scopedCharacterName : destination.characterName);
  return (
    <CorpusArtifactFrame title={title}>
      {destination.kind === "digest" ? (
        <Section heading="Generated memory summary">
          <Markdown trust="untrusted" mode="static">
            {destination.hit.text}
          </Markdown>
        </Section>
      ) : null}
      <QueryBoundary
        fallback={<SkeletonRows count={3} />}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="the source moment" onRetry={retry} />}
      >
        <SourceTranscript destination={destination} />
      </QueryBoundary>
      <Section heading="Related rooms">
        <Text voice="gloss">A preview from a bounded pool of recent indexed room passages. Older rooms can be absent.</Text>
        <QueryBoundary
          fallback={<SkeletonRows count={2} />}
          renderError={(_error, retry): ReactElement => <QueryErrorState label="related rooms" onRetry={retry} />}
        >
          <RelatedRooms chatId={source.chatId} />
        </QueryBoundary>
      </Section>
      <Section heading="Alternate takes">
        <QueryBoundary
          fallback={<SkeletonRows count={2} />}
          renderError={(_error, retry): ReactElement => <QueryErrorState label="alternate takes" onRetry={retry} />}
        >
          <AlternateTakes chatId={source.chatId} />
        </QueryBoundary>
      </Section>
    </CorpusArtifactFrame>
  );
}
function SourceTranscript({ destination }: { readonly destination: Moment }): ReactElement {
  const trpc = useTRPC();
  const source = destination.hit.source;
  const { data: window } = useSuspenseQuery(trpc.chat.getMessageWindow.queryOptions({ chatId: source.chatId, target: { kind: "source", source } }));
  const names = buildIdentityNameContext(window.identities);
  return (
    <>
      <Text role="status" voice="gloss">
        {SOURCE_OUTCOME_TEXT[window.outcome]}
      </Text>
      {destination.kind === "scene" && window.messages.length === 0 ? <Text>{destination.hit.snippet}</Text> : null}
      {window.messages.length === 0 ? null : (
        <Section heading="Transcript window">
          <Text voice="gloss">Showing a bounded window around the source start. Open in chat to page earlier and later.</Text>
          <Stack gap="block">
            {window.messages.map((message) => (
              <Stack key={message.id} gap="field">
                <Text voice="gloss">
                  {sourceSpeakerName(message, names)} · Message {message.seq}
                </Text>
                <Markdown trust="untrusted" mode="static">
                  {message.content}
                </Markdown>
              </Stack>
            ))}
          </Stack>
        </Section>
      )}
    </>
  );
}
function sourceSpeakerName(message: MessageView, names: ReturnType<typeof buildIdentityNameContext>): string {
  if (message.role === "assistant" && isNarratorVoiced(message.kind)) {
    return "Narrator";
  }
  const name =
    message.role === "user"
      ? message.personaId === null
        ? undefined
        : names.personaNamesById.get(message.personaId)?.name
      : message.characterId === null
        ? undefined
        : names.characterNamesById.get(message.characterId)?.name;
  return name ?? ROLE_NAMES[message.role];
}
function RelatedRooms({ chatId }: { readonly chatId: Moment["hit"]["source"]["chatId"] }): ReactElement {
  const trpc = useTRPC();
  const { data: rooms } = useSuspenseQuery(trpc.discovery.similarChats.queryOptions({ chatId, limit: RELATED_LIMIT }));
  return rooms.length === 0 ? (
    <Text voice="gloss">No related room in this preview.</Text>
  ) : (
    <Stack gap="field">
      {rooms.map((room) => (
        <Button key={room.chatId} intent="ghost" size="wrap" onClick={(): void => resumeChat(room.chatId)}>
          {room.title ?? "Untitled chat"}
        </Button>
      ))}
    </Stack>
  );
}
function AlternateTakes({ chatId }: { readonly chatId: Moment["hit"]["source"]["chatId"] }): ReactElement {
  const trpc = useTRPC();
  const { data: takes } = useSuspenseQuery(trpc.discovery.swipeHotspots.queryOptions({ chatId, limit: RELATED_LIMIT }));
  return takes.length === 0 ? (
    <Text voice="gloss">No alternate takes in this room.</Text>
  ) : (
    <Stack gap="field">
      {takes.map((take) => (
        <Button key={take.messageId} intent="ghost" size="wrap" onClick={(): void => openChatMoment(chatId, { kind: "message", messageId: take.messageId })}>
          <Stack gap="tight">
            <Text>{take.snippet}</Text>
            <Text voice="gloss">
              {take.variantCount} takes · message {take.seq}
            </Text>
          </Stack>
        </Button>
      ))}
    </Stack>
  );
}
