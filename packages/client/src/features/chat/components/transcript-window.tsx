import { identityKey } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useEffect, useId } from "react";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useSuspenseInfiniteQuery, useSuspenseQuery, useTRPC } from "#data";
import { clearChatMoment, setActiveSection, useChatMoment } from "#state";

type HistoryPage = inferOutput<Trpc["chat"]["listMessages"]>;
type CanonPage = Pick<HistoryPage, "messages" | "identities">;
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

const EARLIER_MESSAGES_LABEL = "Earlier messages";

function mergePages(pages: readonly CanonPage[]): CanonPage {
  return {
    messages: [...new Map(pages.flatMap((page) => page.messages).map((message) => [message.id, message])).values()].toSorted((a, b) => a.seq - b.seq),
    identities: [...new Map(pages.flatMap((page) => page.identities).map((identity) => [identityKey(identity), identity])).values()],
  };
}

function OrdinaryThread(props: TranscriptWindowProps): ReactElement {
  const trpc = useTRPC();
  // Composer readers and the live carrier share this finite tail; it wins every overlapping row.
  const { data: tail } = useSuspenseQuery(trpc.chat.listMessages.queryOptions({ chatId: props.chatId }));
  return <OrdinaryHistory {...props} tail={tail} />;
}

function OrdinaryHistory({ tail, ...props }: TranscriptWindowProps & { readonly tail: HistoryPage }): ReactElement {
  const description = useId();
  const trpc = useTRPC();
  const initialCursor = { kind: "before" as const, seq: tail.messages.reduce((seq, message) => Math.max(seq, message.seq), 0) + 1 };
  const pages = useSuspenseInfiniteQuery({
    ...trpc.chat.listMessages.infiniteQueryOptions(
      { chatId: props.chatId },
      {
        initialCursor,
        getPreviousPageParam: (page) => page.previousCursor,
        getNextPageParam: (page) => page.nextCursor,
      },
    ),
    initialData: { pages: [tail], pageParams: [initialCursor] },
  });
  const loadedTailSeq = pages.data.pages.flatMap((page) => page.messages).at(-1)?.seq ?? 0;
  const liveTailSeq = tail.messages.reduce((seq, message) => Math.max(seq, message.seq), 0);
  const bridging = loadedTailSeq < liveTailSeq;
  const { fetchNextPage, hasNextPage, isFetching } = pages;
  useEffect(() => {
    if (bridging && hasNextPage && !isFetching) {
      void fetchNextPage().catch(globalThis.reportError);
    }
  }, [bridging, hasNextPage, isFetching, fetchNextPage]);
  const historyAvailable = pages.hasPreviousPage || pages.data.pages.length > 1;
  return (
    <Stack className="block-full min-block-0" gap="field" aria-busy={bridging || pages.isFetching}>
      {historyAvailable ? (
        <Row gap="field" align="center">
          <Button
            aria-describedby={description}
            intent="ghost"
            size="sm"
            disabled={!pages.hasPreviousPage || pages.isFetching}
            onClick={(): void => void pages.fetchPreviousPage().catch(globalThis.reportError)}
          >
            {EARLIER_MESSAGES_LABEL}
          </Button>
          <Text id={description} className="sr-only" role="status">
            {pages.hasPreviousPage ? "Load older conversation history without moving your reading position." : "Beginning of available history."}
          </Text>
        </Row>
      ) : null}
      {pages.isError ? <QueryErrorState label="conversation history" onRetry={pages.refetch} /> : null}
      {props.render(mergePages([...pages.data.pages, tail]), null)}
    </Stack>
  );
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
        getNextPageParam: (page) => {
          const last = page.messages.at(-1);
          return page.hasAfter && last !== undefined ? { kind: "after" as const, seq: last.seq } : undefined;
        },
        getPreviousPageParam: (page) => {
          const first = page.messages[0];
          return page.hasBefore && first !== undefined ? { kind: "before" as const, seq: first.seq } : undefined;
        },
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
          messages: [
            ...new Map(pages.data.pages.flatMap((page): Readonly<CanonPage["messages"]> => page.messages).map((message) => [message.id, message])).values(),
          ].toSorted((a, b) => a.seq - b.seq),
          identities: [
            ...new Map(
              pages.data.pages.flatMap((page): CanonPage["identities"] => page.identities).map((identity) => [identityKey(identity), identity]),
            ).values(),
          ],
        };
  return (
    <Stack className="block-full min-block-0" gap="field">
      <Row className="flex-wrap" gap="field">
        <Button
          aria-describedby={pagingDescription}
          intent="ghost"
          size="sm"
          disabled={!pages.hasPreviousPage || pages.isFetchingPreviousPage}
          onClick={(): void => void pages.fetchPreviousPage().catch(globalThis.reportError)}
        >
          {EARLIER_MESSAGES_LABEL}
        </Button>
        <Button
          aria-describedby={pagingDescription}
          intent="ghost"
          size="sm"
          disabled={!pages.hasNextPage || pages.isFetchingNextPage}
          onClick={(): void => void pages.fetchNextPage().catch(globalThis.reportError)}
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
