import { identityKey } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode, RefCallback } from "react";
import { useEffect, useId, useRef, useState } from "react";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useSuspenseInfiniteQuery, useSuspenseQuery, useTRPC } from "#data";
import { clearChatMoment, setActiveSection, useChatMoment } from "#state";
import { CHAT_EARLIER_MESSAGES_NAME, CHAT_HISTORY_DISMISS_NAME, CHAT_HISTORY_FAILURE_COPY, CHAT_HISTORY_RETRY_NAME } from "../lib/chat-surface-names.ts";
import type { HistoryFailure, HistoryFetchView } from "../lib/history-failures.ts";
import { dismissHistoryFailure, noHistoryFailures, observeHistoryFetch, shownHistoryFailure } from "../lib/history-failures.ts";
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

interface HistoryPagerState {
  readonly available: boolean;
  readonly hasEarlier: boolean;
  readonly busy: boolean;
  readonly failure: HistoryFailure | null;
  readonly pinned: boolean;
  /** Rises when a failure must be heard again, even in the same words. */
  readonly announcement: number;
  /** The rows paged in so far, or null before the first older page. */
  readonly loaded: number | null;
  readonly onLoad: () => void;
  readonly onRetry: () => void;
  readonly onDismiss: () => void;
}

function HistoryFailureRow({
  failure,
  busy,
  pinned,
  announcement,
  onRetry,
  onDismiss,
  handFocusBack,
}: Pick<HistoryPagerState, "busy" | "pinned" | "announcement" | "onRetry" | "onDismiss"> & {
  readonly failure: HistoryFailure;
  readonly handFocusBack: RefCallback<HTMLButtonElement>;
}): ReactElement {
  const retriable = failure === "bridge" || failure === "refresh";
  return (
    <Row align="center">
      <Text key={announcement} className="px-block py-row" tone="destructive" role="alert" voice="label">
        {CHAT_HISTORY_FAILURE_COPY[failure]}
      </Text>
      {retriable ? (
        <Button ref={handFocusBack} focusRing="inset" loading={busy} size="sm" variant="ghost" onClick={onRetry}>
          {CHAT_HISTORY_RETRY_NAME}
        </Button>
      ) : null}
      {pinned ? (
        <Button ref={handFocusBack} focusRing="inset" size="sm" variant="ghost" onClick={onDismiss}>
          {CHAT_HISTORY_DISMISS_NAME}
        </Button>
      ) : null}
    </Row>
  );
}

function HistoryPager({ available, hasEarlier, busy, failure, pinned, announcement, loaded, onLoad, onRetry, onDismiss }: HistoryPagerState): ReactNode {
  const description = useId();
  const earlier = useRef<HTMLButtonElement>(null);
  // These controls leave with their failure, and focus must not fall to the page with them. The cleanup runs before the node goes.
  const handFocusBack: RefCallback<HTMLButtonElement> = (node) => (): void => {
    if (node !== null && node === document.activeElement) {
      earlier.current?.focus({ preventScroll: true });
    }
  };
  if (!(available || failure !== null)) {
    return null;
  }
  return (
    // Only a reader who pressed is pinned: anyone else finds a failure here, at the pager's home, and hears it announced.
    <Stack className="print:hidden" data-keep-in-view={pinned ? "" : undefined} plate={failure === null && hasEarlier ? "island" : "card"}>
      {failure === null ? null : (
        <HistoryFailureRow
          announcement={announcement}
          busy={busy}
          failure={failure}
          handFocusBack={handFocusBack}
          pinned={pinned}
          onDismiss={onDismiss}
          onRetry={onRetry}
        />
      )}
      <Row gap="field" align="center" paddingInlineEnd="block">
        {/* Focusable at every state, so paging on with the keyboard never drops focus onto the page. */}
        <Button
          ref={earlier}
          aria-describedby={description}
          disabled={!hasEarlier}
          focusRing="inset"
          focusableWhenDisabled={true}
          loading={busy}
          quietDisabled={true}
          size="sm"
          variant="ghost"
          onClick={onLoad}
        >
          {EARLIER_MESSAGES_LABEL}
        </Button>
        {/* The end of history is read on screen; the sr-only form is only the pager's description while older pages remain. */}
        <Text id={description} className={hasEarlier ? "sr-only" : undefined} role="status" voice={hasEarlier ? "gloss" : "label"}>
          {hasEarlier ? "Load older conversation history without moving your reading position." : "Beginning of available history."}
          {loaded === null ? "" : ` ${String(loaded)} messages loaded.`}
        </Text>
      </Row>
    </Stack>
  );
}

function readInFlight(pages: {
  readonly isFetching: boolean;
  readonly isFetchingPreviousPage: boolean;
  readonly isFetchingNextPage: boolean;
}): HistoryFetchView["read"] {
  if (pages.isFetchingPreviousPage) {
    return "press";
  }
  if (pages.isFetchingNextPage) {
    return "bridge";
  }
  return pages.isFetching ? "refresh" : null;
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
  const { fetchNextPage, hasNextPage, isFetching, refetch } = pages;
  const [failures, setFailures] = useState(() => noHistoryFailures(props.chatId));
  const observed = observeHistoryFetch(failures, {
    chatId: props.chatId,
    read: readInFlight(pages),
    paused: pages.isPaused,
    errors: pages.errorUpdateCount,
    landedAt: pages.dataUpdatedAt,
    canBridge: bridging && hasNextPage,
  });
  if (observed !== failures) {
    setFailures(observed);
  }
  const failure: HistoryFailure | null = shownHistoryFailure(failures);
  // A failed bridge waits for a sign the server is back: each attempt flips `isFetching`, so retrying here would hammer it.
  const mayBridge = !failures.refreshDue && (!failures.bridge || failures.bridgeDue);
  useEffect(() => {
    if (bridging && hasNextPage && !isFetching && mayBridge) {
      void fetchNextPage().catch(globalThis.reportError);
    }
  }, [bridging, hasNextPage, isFetching, mayBridge, fetchNextPage]);
  useEffect(() => {
    if (failures.refreshDue && !isFetching) {
      void refetch().catch(globalThis.reportError);
    }
  }, [failures.refreshDue, isFetching, refetch]);
  const merged = mergePages([...pages.data.pages, tail]);
  const pager: HistoryPagerState = {
    available: pages.hasPreviousPage || pages.data.pages.length > 1 || failures.reported,
    hasEarlier: pages.hasPreviousPage,
    busy: isFetching,
    failure,
    pinned: failures.pinned,
    announcement: failures.announcement,
    loaded: pages.data.pages.length > 1 ? merged.messages.length : null,
    onLoad: (): void => {
      setFailures((state) => ({ ...state, asked: true }));
      void pages.fetchPreviousPage().catch(globalThis.reportError);
    },
    onRetry: (): void => {
      setFailures((state) => ({ ...state, asked: true }));
      void refetch().catch(globalThis.reportError);
    },
    onDismiss: (): void => setFailures(dismissHistoryFailure),
  };
  return (
    <Stack className="min-block-0" fill={true} gap="field" aria-busy={(bridging && failure === null) || isFetching}>
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
    <Stack className="min-block-0" fill={true} gap="field">
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
