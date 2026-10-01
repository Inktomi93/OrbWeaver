import { identityKey } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseInfiniteQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useId } from "react";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { clearChatMoment, setActiveSection, useChatMoment } from "#state";

type CanonPage = inferOutput<Trpc["chat"]["listMessages"]>;
type AnchoredPage = inferOutput<Trpc["chat"]["getMessageWindow"]>;
interface TranscriptWindowProps {
  readonly chatId: ChatId;
  readonly render: (page: CanonPage, window: AnchoredPage | null) => ReactElement;
}

export function TranscriptWindow(props: TranscriptWindowProps): ReactElement {
  const trpc = useTRPC();
  useQuery(trpc.chat.getChat.queryOptions({ chatId: props.chatId }));
  const moment = useChatMoment(props.chatId);
  return moment === null ? <OrdinaryThread {...props} /> : <AnchoredThread {...props} target={moment.target} />;
}

function OrdinaryThread(props: TranscriptWindowProps): ReactElement {
  const trpc = useTRPC();
  const { data: page } = useSuspenseQuery(trpc.chat.listMessages.queryOptions({ chatId: props.chatId }));
  return props.render(page, null);
}

function AnchoredThread({
  target,
  ...props
}: TranscriptWindowProps & { readonly target: NonNullable<ReturnType<typeof useChatMoment>>["target"] }): ReactElement {
  const pagingDescription = useId();
  const trpc = useTRPC();
  const pages = useSuspenseInfiniteQuery(
    trpc.chat.getMessageWindow.infiniteQueryOptions(
      { chatId: props.chatId, target },
      {
        initialCursor: null,
        getNextPageParam: (page) =>
          page.hasAfter && page.messages.at(-1) !== undefined ? { kind: "after" as const, seq: page.messages.at(-1)?.seq ?? 0 } : undefined,
        getPreviousPageParam: (page) =>
          page.hasBefore && page.messages[0] !== undefined ? { kind: "before" as const, seq: page.messages[0]?.seq ?? 0 } : undefined,
      },
    ),
  );
  const initial = pages.data.pages.find((page) => page.anchorMessageId !== null) ?? pages.data.pages[0];
  const fallback = useQuery(trpc.chat.listMessages.queryOptions({ chatId: props.chatId }, { enabled: initial?.anchorMessageId === null }));
  if (initial === undefined) {
    throw new Error("An anchored transcript needs its initial page");
  }
  if (initial.anchorMessageId === null && fallback.isPending) {
    return <SkeletonRows count={3} />;
  }
  if (initial.anchorMessageId === null && fallback.isError) {
    return <QueryErrorState label="the conversation" onRetry={fallback.refetch} />;
  }
  const messagesPage =
    initial.anchorMessageId === null && fallback.data !== undefined
      ? fallback.data
      : {
          messages: [...new Map(pages.data.pages.flatMap((page) => page.messages).map((message) => [message.id, message])).values()].toSorted(
            (a, b) => a.seq - b.seq,
          ),
          identities: [...new Map(pages.data.pages.flatMap((page) => page.identities).map((identity) => [identityKey(identity), identity])).values()],
        };
  return (
    <Stack className="h-full min-h-0" gap="field">
      <Row className="flex-wrap" gap="field">
        <Button
          aria-describedby={pagingDescription}
          intent="ghost"
          size="sm"
          disabled={!pages.hasPreviousPage || pages.isFetchingPreviousPage}
          onClick={(): void => void pages.fetchPreviousPage()}
        >
          Earlier messages
        </Button>
        <Button
          aria-describedby={pagingDescription}
          intent="ghost"
          size="sm"
          disabled={!pages.hasNextPage || pages.isFetchingNextPage}
          onClick={(): void => void pages.fetchNextPage()}
        >
          Later messages
        </Button>
        <Button intent="ghost" size="sm" onClick={clearChatMoment}>
          Latest messages
        </Button>
        <Button intent="ghost" size="sm" onClick={(): void => setActiveSection("corpus")}>
          Back to Corpus
        </Button>
      </Row>
      <Text id={pagingDescription} voice="gloss">
        Paging covers visible room history. A direction is unavailable at its history boundary or while loading.
      </Text>
      {pages.isError ? <QueryErrorState label="the transcript window" onRetry={pages.refetch} /> : null}
      {props.render(messagesPage, initial)}
    </Stack>
  );
}
