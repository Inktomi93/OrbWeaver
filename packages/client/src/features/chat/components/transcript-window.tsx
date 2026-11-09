import { identityKey } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode, RefCallback } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { QueryBoundary } from "#components";
import type { Trpc } from "#data";
import { pressForPage, QueryErrorState, SkeletonRows, useSuspenseInfiniteQuery, useSuspenseQuery, useTRPC } from "#data";
import { RETRY_NAME } from "#lib";
import { clearChatMoment, setActiveSection, useChatMoment } from "#state";
import { CHAT_EARLIER_MESSAGES_NAME, CHAT_HISTORY_DISMISS_NAME, CHAT_HISTORY_FAILURE_COPY, CHAT_WINDOW_PRESS_FAILURE } from "../lib/chat-surface-names.ts";
import type { HistoryFailure, HistoryFetchView } from "../lib/history-failures.ts";
import { dismissHistoryFailure, noHistoryFailures, observeHistoryFetch, pressAsked, pressLost, shownHistoryFailure } from "../lib/history-failures.ts";
import type { TranscriptEdges } from "../lib/move-neighbours.ts";
import { CHAT_HISTORY_BEGINNING, CHAT_HISTORY_PAGER_HINT, chatHistoryLoadedLabel } from "../lib/transcript-copy.ts";

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
      <Text key={announcement} inset="block" tone="destructive" role="alert" voice="label">
        {CHAT_HISTORY_FAILURE_COPY[failure]}
      </Text>
      {retriable ? (
        <Button ref={handFocusBack} focusRing="inset" loading={busy} size="sm" variant="ghost" onClick={onRetry}>
          {RETRY_NAME}
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
  const status = `${hasEarlier ? CHAT_HISTORY_PAGER_HINT : CHAT_HISTORY_BEGINNING}${loaded === null ? "" : ` ${chatHistoryLoadedLabel(loaded)}`}`;
  return (
    // Only a reader who pressed is pinned: anyone else finds a failure here, at the pager's home, and hears it announced.
    <Stack hiddenAt="print" data-keep-in-view={pinned ? "" : undefined} plate={failure === null && hasEarlier ? "island" : "card"}>
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
          {status}
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
  // The room a press is working on: a press there joins it, and one in the next room is its own.
  const pressing = useRef<ChatId | null>(null);
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
      const { chatId } = props;
      setFailures(pressAsked);
      if (pressing.current === chatId) {
        return;
      }
      pressing.current = chatId;
      pressForPage(pages.fetchPreviousPage, pages.data.pages.length, "previous")
        .then((landed) => {
          if (landed === null) {
            setFailures((state) => pressLost(state, chatId));
          }
        })
        .catch(globalThis.reportError)
        .finally(() => {
          if (pressing.current === chatId) {
            pressing.current = null;
          }
        });
    },
    onRetry: (): void => {
      setFailures((state) => ({ ...state, asked: true }));
      void refetch().catch(globalThis.reportError);
    },
    onDismiss: (): void => setFailures(dismissHistoryFailure),
  };
  return (
    <Stack minHeight="shrinks" height="fill" gap="field" aria-busy={(bridging && failure === null) || isFetching}>
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
  const [pressLostHere, setPressLostHere] = useState(false);
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
  const press = (direction: "next" | "previous"): void => {
    setPressLostHere(false);
    pressForPage(direction === "next" ? pages.fetchNextPage : pages.fetchPreviousPage, pages.data.pages.length, direction)
      .then((landed) => setPressLostHere(landed === null))
      .catch(globalThis.reportError);
  };
  const initial = pages.data.pages.find((page) => page.anchorMessageId !== null) ?? pages.data.pages[0];
  if (initial === undefined) {
    throw new Error("An anchored transcript needs its initial page");
  }
  // A target the window could not anchor falls back to the latest page of the ordinary read, under its own boundary so
  // the toolbar, the way back to Corpus, stays in reach while that page loads or fails.
  const transcript =
    initial.anchorMessageId === null ? (
      <QueryBoundary
        resetKeys={[props.chatId]}
        fallback={<SkeletonRows count={3} />}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="the conversation" onRetry={retry} />}
      >
        <LatestPageFallback chatId={props.chatId} render={(page, edges): ReactElement => props.render(page, initial, edges, null)} />
      </QueryBoundary>
    ) : (
      props.render(
        {
          messages: [
            ...new Map(pages.data.pages.flatMap((page): Readonly<CanonPage["messages"]> => page.messages).map((message) => [message.id, message])).values(),
          ].toSorted((a, b) => a.seq - b.seq),
          identities: [
            ...new Map(
              pages.data.pages.flatMap((page): CanonPage["identities"] => page.identities).map((identity) => [identityKey(identity), identity]),
            ).values(),
          ],
        },
        initial,
        { earlier: pages.hasPreviousPage, later: pages.hasNextPage, settling: false },
        null,
      )
    );
  return (
    // The source window's toolbar stays above the transcript: it is the way back to Corpus, and the window opens on the
    // anchor, not on its first row, so toolbar chrome scrolled with the rows would be out of sight at arrival.
    <Stack minHeight="shrinks" height="fill" gap="field">
      <Row hiddenAt="print" wrap={true} gap="field">
        <Button
          aria-describedby={pagingDescription}
          variant="ghost"
          size="sm"
          disabled={!pages.hasPreviousPage || pages.isFetchingPreviousPage}
          onClick={(): void => press("previous")}
        >
          {EARLIER_MESSAGES_LABEL}
        </Button>
        <Button
          aria-describedby={pagingDescription}
          variant="ghost"
          size="sm"
          disabled={!pages.hasNextPage || pages.isFetchingNextPage}
          onClick={(): void => press("next")}
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
      <Text hiddenAt="print" id={pagingDescription} voice="gloss">
        Paging covers visible room history. A direction is unavailable at its history boundary or while loading.
      </Text>
      {pages.isError ? <QueryErrorState label="the transcript window" onRetry={pages.refetch} /> : null}
      {pressLostHere && !pages.isError ? (
        <Text hiddenAt="print" role="alert" tone="destructive" voice="label">
          {CHAT_WINDOW_PRESS_FAILURE}
        </Text>
      ) : null}
      {transcript}
    </Stack>
  );
}

/** The ordinary read's latest page; its edges are that page's own cursor. */
function LatestPageFallback({
  chatId,
  render,
}: {
  readonly chatId: ChatId;
  readonly render: (page: CanonPage, edges: TranscriptEdges) => ReactElement;
}): ReactElement {
  const trpc = useTRPC();
  const { data: page } = useSuspenseQuery(trpc.chat.listMessages.queryOptions({ chatId }));
  return render(page, { earlier: page.previousCursor !== null, later: false, settling: false });
}
