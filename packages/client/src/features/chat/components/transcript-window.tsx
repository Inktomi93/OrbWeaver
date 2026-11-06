import { identityKey } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useSuspenseInfiniteQuery, useSuspenseQuery, useTRPC } from "#data";
import { clearChatMoment, setActiveSection, useChatMoment } from "#state";
import { CHAT_EARLIER_MESSAGES_NAME, CHAT_HISTORY_DISMISS_NAME, CHAT_HISTORY_RETRY_NAME } from "../lib/chat-surface-names.ts";
import type { TranscriptEdges } from "../lib/move-neighbours.ts";

type HistoryPage = inferOutput<Trpc["chat"]["listMessages"]>;
type CanonPage = Pick<HistoryPage, "messages" | "identities">;
type AnchoredPage = inferOutput<Trpc["chat"]["getMessageWindow"]>;

interface TranscriptWindowProps {
  readonly chatId: ChatId;
  /** `history` is the ordinary pager, which the transcript carries as its leading chrome. */
  readonly render: (page: CanonPage, window: AnchoredPage | null, edges: TranscriptEdges, history: ReactNode) => ReactElement;
}

export function TranscriptWindow(props: TranscriptWindowProps): ReactElement {
  const trpc = useTRPC();
  useQuery(trpc.chat.getChat.queryOptions({ chatId: props.chatId }));
  const moment = useChatMoment(props.chatId);
  return moment === null ? <OrdinaryThread {...props} /> : <AnchoredThread {...props} target={moment.target} />;
}

const EARLIER_MESSAGES_LABEL = CHAT_EARLIER_MESSAGES_NAME;

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

const HISTORY_FAILURE_COPY = {
  press: "Couldn't load earlier messages. Try again.",
  refresh: "Couldn't refresh the messages loaded here.",
  bridge: "Couldn't load the messages between here and the latest.",
} as const;
type HistoryFailure = keyof typeof HISTORY_FAILURE_COPY;

interface HistoryPagerState {
  readonly available: boolean;
  readonly hasEarlier: boolean;
  readonly busy: boolean;
  readonly failure: HistoryFailure | null;
  readonly pinned: boolean;
  /** The rows paged in so far, or null before the first older page. */
  readonly loaded: number | null;
  readonly onLoad: () => void;
  readonly onRetry: () => void;
  readonly onDismiss: () => void;
}

function HistoryPager({ available, hasEarlier, busy, failure, pinned, loaded, onLoad, onRetry, onDismiss }: HistoryPagerState): ReactNode {
  const description = useId();
  const earlier = useRef<HTMLButtonElement>(null);
  if (!(available || failure !== null)) {
    return null;
  }
  return (
    // Only a reader who pressed is pinned: anyone else finds a failure here, at the pager's home, and hears it announced.
    <Stack className="print:hidden" data-keep-in-view={pinned ? "" : undefined} plate={failure === null && hasEarlier ? "island" : "card"}>
      {failure === null ? null : (
        <Row align="center">
          <Text className="px-block py-row" tone="destructive" role="alert" voice="label">
            {HISTORY_FAILURE_COPY[failure]}
          </Text>
          {failure === "press" ? null : (
            <Button focusRing="inset" loading={busy} size="sm" variant="ghost" onClick={onRetry}>
              {CHAT_HISTORY_RETRY_NAME}
            </Button>
          )}
          {pinned ? (
            <Button
              focusRing="inset"
              size="sm"
              variant="ghost"
              onClick={(): void => {
                // This button goes with the pin, and focus must not fall to the page with it.
                earlier.current?.focus({ preventScroll: true });
                onDismiss();
              }}
            >
              {CHAT_HISTORY_DISMISS_NAME}
            </Button>
          ) : null}
        </Row>
      )}
      <Row gap="field" align="center">
        {/* Focusable at every state, so paging on with the keyboard never drops focus onto the page. */}
        <Button
          ref={earlier}
          aria-describedby={description}
          disabled={!hasEarlier}
          focusRing="inset"
          focusableWhenDisabled={true}
          loading={busy}
          size="sm"
          variant="ghost"
          onClick={onLoad}
        >
          {EARLIER_MESSAGES_LABEL}
        </Button>
        {/* The end of history is read on screen; the sr-only form is only the pager's description while older pages remain. */}
        <Text id={description} className={hasEarlier ? "sr-only" : "pe-block"} role="status" voice={hasEarlier ? "gloss" : "label"}>
          {hasEarlier ? "Load older conversation history without moving your reading position." : "Beginning of available history."}
          {loaded === null ? "" : ` ${String(loaded)} messages loaded.`}
        </Text>
      </Row>
    </Stack>
  );
}

function historyFailureOf(pages: {
  readonly isFetchPreviousPageError: boolean;
  readonly isFetchNextPageError: boolean;
  readonly isRefetchError: boolean;
}): HistoryFailure | null {
  if (pages.isFetchPreviousPageError) {
    return "press";
  }
  if (pages.isFetchNextPageError) {
    return "bridge";
  }
  return pages.isRefetchError ? "refresh" : null;
}

function OrdinaryHistory({ tail, ...props }: TranscriptWindowProps & { readonly tail: HistoryPage }): ReactElement {
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
  const { fetchNextPage, hasNextPage, isFetching, isFetchNextPageError } = pages;
  // A failed bridge waits to be asked: each attempt flips `isFetching`, so retrying here would hammer a server that is down.
  useEffect(() => {
    if (bridging && hasNextPage && !isFetching && !isFetchNextPageError) {
      void fetchNextPage().catch(globalThis.reportError);
    }
  }, [bridging, hasNextPage, isFetching, isFetchNextPageError, fetchNextPage]);
  // Read only once settled: a fetch restates its direction as it starts, which would call a press through a failed refresh
  // its own failure before it has one, and a retry's alert must not blink out while it runs.
  const [failure, setFailure] = useState<HistoryFailure | null>(null);
  const settledFailure = historyFailureOf(pages);
  if (!isFetching && failure !== settledFailure) {
    setFailure(settledFailure);
  }
  const [dismissed, setDismissed] = useState<string | null>(null);
  const failureId = `${props.chatId}:${String(pages.errorUpdateCount)}`;
  const merged = mergePages([...pages.data.pages, tail]);
  const pager: HistoryPagerState = {
    available: pages.hasPreviousPage || pages.data.pages.length > 1,
    hasEarlier: pages.hasPreviousPage,
    busy: pages.isFetching,
    failure,
    pinned: failure === "press" && dismissed !== failureId,
    loaded: pages.data.pages.length > 1 ? merged.messages.length : null,
    // A press always asks for older rows. A failure may have cost a refresh, which a landed page clears without repeating.
    onLoad: (): void => {
      const recovering = pages.isError;
      void pages
        .fetchPreviousPage()
        .then((result) => (recovering && result.isSuccess ? pages.refetch() : result))
        .catch(globalThis.reportError);
    },
    onRetry: (): void => void pages.refetch().catch(globalThis.reportError),
    onDismiss: (): void => setDismissed(failureId),
  };
  return (
    <Stack className="block-full min-block-0" gap="field" aria-busy={(bridging && failure === null) || isFetching}>
      {/* The merged list ends at the live tail, which wins every overlap: nothing exists after its last row. `hasNextPage`
          only describes the bridge from older pages up to that tail, and reads true while the tail is catching up. */}
      {props.render(merged, null, { earlier: pages.hasPreviousPage, later: false, settling: bridging }, <HistoryPager {...pager} />)}
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
  // The no-anchor fallback is the latest page of the ordinary read, so its edges are that page's own cursor.
  const edges: TranscriptEdges =
    initial.anchorMessageId === null && fallback.data !== undefined
      ? { earlier: fallback.data.previousCursor !== null, later: false, settling: false }
      : { earlier: pages.hasPreviousPage, later: pages.hasNextPage, settling: false };
  return (
    // The source window's toolbar stays above the transcript: it is the way back to Corpus, and the window opens on the
    // anchor, not on its first row, so toolbar chrome scrolled with the rows would be out of sight at arrival.
    <Stack className="block-full min-block-0" gap="field">
      <Row className="flex-wrap print:hidden" gap="field">
        <Button
          aria-describedby={pagingDescription}
          variant="ghost"
          size="sm"
          disabled={!pages.hasPreviousPage || pages.isFetchingPreviousPage}
          onClick={(): void => void pages.fetchPreviousPage().catch(globalThis.reportError)}
        >
          {EARLIER_MESSAGES_LABEL}
        </Button>
        <Button
          aria-describedby={pagingDescription}
          variant="ghost"
          size="sm"
          disabled={!pages.hasNextPage || pages.isFetchingNextPage}
          onClick={(): void => void pages.fetchNextPage().catch(globalThis.reportError)}
        >
          Later messages
        </Button>
        <Button variant="ghost" size="sm" onClick={clearChatMoment}>
          Latest messages
        </Button>
        <Button variant="ghost" size="sm" onClick={(): void => setActiveSection("corpus")}>
          Back to Corpus
        </Button>
      </Row>
      <Text className="print:hidden" id={pagingDescription} voice="gloss">
        Paging covers visible room history. A direction is unavailable at its history boundary or while loading.
      </Text>
      {pages.isError ? <QueryErrorState label="the transcript window" onRetry={pages.refetch} /> : null}
      {props.render(messagesPage, initial, edges, null)}
    </Stack>
  );
}
