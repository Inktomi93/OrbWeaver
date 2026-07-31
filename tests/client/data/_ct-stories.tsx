// `_ct-stories.tsx` — the client-CT story convention (core/Spine-Testing.md §7: CT only mounts
// from a non-test module). One story module per mirror directory; each story wraps its root in
// <CtDataProviders> (Query + the real tRPC client — tests/support/ct/ct-data-providers.tsx explains
// why that seam is story-side, not beforeMount). The `.ct.tsx` beside this file mounts ONLY these
// exports. This file is the template every client feature agent copies.

import {
  createCollectionSurface,
  createEntityMutation,
  QueryBoundary,
  useGatedQuery,
  useInvalidation,
  useOnlineStatus,
  useTRPC,
  useViewer,
} from "@orb/client/data";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { CreateTagInput, TagView } from "@orb/contracts/tag";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { CtDataProviders } from "../../support/ct/ct-data-providers";

// The suspending read under test: a REAL procedure (`echo` — transport/trpc/router.ts loose public
// proc, input {message:string} → output {message:string}) because the options proxy is typed by
// AppRouter — routeTrpc stubs the wire, never the type layer.
function EchoReader(): ReactElement {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.echo.queryOptions({ message: "ping" }));
  return <output>{data.message}</output>;
}

export function EchoBoundaryStory(): ReactElement {
  return (
    <CtDataProviders>
      <QueryBoundary
        fallback={<p>loading…</p>}
        renderError={(error, retry): ReactElement => (
          <div role="alert">
            <span>{error instanceof Error ? error.message : String(error)}</span>
            <button type="button" onClick={retry}>
              Try again
            </button>
          </div>
        )}
      >
        <EchoReader />
      </QueryBoundary>
    </CtDataProviders>
  );
}

// Bare probe for `useOnlineStatus` — renders the live boolean so the CT can flip the context's
// network emulation and assert the hook tracks the browser online/offline events end-to-end.
export function OnlineStatusProbeStory(): ReactElement {
  const online = useOnlineStatus();
  return <output data-testid="online-status">{online ? "online" : "offline"}</output>;
}

// Defers mounting the suspending reader behind a click, so the offline CT can cut the network AFTER
// the harness assets load but BEFORE the query exists — `networkMode:"online"` then PAUSES it at
// mount (fetchStatus "paused", no request), the exact silent-skeleton state the boundary's offline
// line exists for.
export function DeferredEchoBoundaryStory(): ReactElement {
  const [show, setShow] = useState(false);
  return (
    <CtDataProviders>
      <button type="button" onClick={(): void => setShow(true)}>
        load
      </button>
      {show ? (
        <QueryBoundary fallback={<p>loading…</p>} renderError={(e): ReactElement => <p role="alert">{String(e)}</p>}>
          <EchoReader />
        </QueryBoundary>
      ) : null}
    </CtDataProviders>
  );
}

// `renderError` OMITTED — proves QueryBoundary's default falls back to `QueryErrorState` (rollup-audit
// C2) and the retry it wires still resets both boundaries (a real refetch, not a re-throw).
export function EchoBoundaryWithoutRenderErrorStory(): ReactElement {
  return (
    <CtDataProviders>
      <QueryBoundary fallback={<p>loading…</p>}>
        <EchoReader />
      </QueryBoundary>
    </CtDataProviders>
  );
}

// ── useGatedQuery — a REAL `trpc.chat.getChat.queryOptions(...)` call (the type this primitive
//    exists to wrap; a mock query-key would hide the exact key-variance bug the fix pins). ──────

function GatedReader({ chatId }: { readonly chatId: ChatId | null }): ReactElement {
  const trpc = useTRPC();
  const query = useGatedQuery(chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  if (chatId === null) {
    // The discriminant: no id → skipToken → the real key is never built, nothing ever fetches.
    return <p data-testid="gated-state">disabled</p>;
  }
  if (query.isPending) {
    return <p data-testid="gated-state">loading…</p>;
  }
  if (query.isError) {
    return <p data-testid="gated-state">error</p>;
  }
  return <output data-testid="gated-state">{query.data.title ?? "untitled"}</output>;
}

export function GatedQueryStory({ chatId }: { readonly chatId: ChatId | null }): ReactElement {
  return (
    <CtDataProviders>
      <GatedReader chatId={chatId} />
    </CtDataProviders>
  );
}

// ── useInvalidation — the hoisted React accessor (data/use-invalidation.ts, PD-124): proves the
//    hook itself wires the LIVE `useTRPC()`/`useQueryClient()` context into `createInvalidation`
//    end-to-end (never a hand-built `{ queryClient, trpc }` pair), the exact seam every feature
//    (chat + settings) now shares instead of each re-deriving it. ─────────────────────────────────

function InvalidationReader({ chatId }: { readonly chatId: ChatId }): ReactElement {
  const trpc = useTRPC();
  const { invalidate } = useInvalidation();
  const query = useSuspenseQuery(trpc.chat.getChat.queryOptions({ chatId }));
  return (
    <div>
      <p data-testid="invalidation-state">{query.data.title ?? "untitled"}</p>
      <button
        type="button"
        onClick={(): void => {
          // `chatUpdated` — the chat-ROW catch-all, i.e. an event whose filters really do name `getChat`
          // (a canon event does NOT: nothing in `ChatDetail` derives from canon — see `chatCanonReads`).
          const event: ChatBusEvent = { type: "chatUpdated", chatId };
          invalidate(event);
        }}
      >
        invalidate
      </button>
    </div>
  );
}

export function InvalidationStory({ chatId }: { readonly chatId: ChatId }): ReactElement {
  return (
    <CtDataProviders>
      <QueryBoundary fallback={<p>loading…</p>} renderError={(e): ReactElement => <p>{String(e)}</p>}>
        <InvalidationReader chatId={chatId} />
      </QueryBoundary>
    </CtDataProviders>
  );
}

// ── createCollectionSurface — a REAL `trpc.notifications.list.infiniteQueryOptions(...)` call
//    (the only router procedure shaped for cursor pagination). ──────────────────────────────────

interface NotificationsParams {
  readonly limit: number;
}

const useNotificationsSurface = createCollectionSurface({
  query: (trpc, params: NotificationsParams) =>
    trpc.notifications.list.infiniteQueryOptions({ limit: params.limit }, { getNextPageParam: (last) => last.nextCursor ?? undefined }),
  itemsOf: (page) => page.items,
  idOf: (item) => item.id,
});

function NotificationsList(): ReactElement {
  const trpc = useTRPC();
  const surface = useNotificationsSurface({ trpc }, { limit: 20 });
  return (
    <div>
      <ul>
        {surface.items.map((item) => (
          <li key={item.id}>{item.type}</li>
        ))}
      </ul>
      <p data-testid="surface-state">{`pending=${surface.isPending} hasNext=${surface.hasNextPage} fetchingNext=${surface.isFetchingNextPage}`}</p>
      <button type="button" onClick={surface.listProps.onEndApproach}>
        approach-end
      </button>
    </div>
  );
}

export function NotificationsSurfaceStory(): ReactElement {
  return (
    <CtDataProviders>
      <QueryBoundary fallback={<p>loading…</p>} renderError={(e): ReactElement => <p>{String(e)}</p>}>
        <NotificationsList />
      </QueryBoundary>
    </CtDataProviders>
  );
}

// ── createEntityMutation — a REAL `trpc.tag.createTag.mutationOptions()` call, both flavors:
//    cache-optimistic (readKey = `trpc.tag.listTags`) and the lightweight variables-render mode. ──

interface CreateTagVars {
  readonly input: CreateTagInput;
}

const useCreateTagOptimistic = createEntityMutation<CreateTagVars, TagView, TagView[]>({
  options: (trpc) => trpc.tag.createTag.mutationOptions(),
  optimistic: {
    readKey: (trpc) => trpc.tag.listTags.queryKey(),
    update: (old, vars) => [
      ...(old ?? []),
      {
        id: castId("tag_pending_optimistic"),
        name: vars.input.name,
        color: null,
        color2: null,
        source: null,
        folderType: "NONE",
        sortOrder: null,
        isHiddenOnCard: false,
      },
    ],
  },
  invalidates: (trpc) => [trpc.tag.listTags.queryFilter()],
});

function TagCreateOptimisticInner(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: tags } = useSuspenseQuery(trpc.tag.listTags.queryOptions());
  const mutation = useCreateTagOptimistic({ trpc, invalidation });

  return (
    <div>
      <ul data-testid="tag-list">
        {tags.map((tag) => (
          <li key={tag.id}>{tag.name}</li>
        ))}
      </ul>
      {mutation.error !== null && <p role="alert">{mutation.error instanceof Error ? mutation.error.message : String(mutation.error)}</p>}
      <button type="button" onClick={(): void => mutation.mutate({ input: { name: "new-tag" } })}>
        create
      </button>
    </div>
  );
}

export function TagCreateOptimisticStory(): ReactElement {
  return (
    <CtDataProviders>
      <QueryBoundary fallback={<p>loading…</p>} renderError={(e): ReactElement => <p>{String(e)}</p>}>
        <TagCreateOptimisticInner />
      </QueryBoundary>
    </CtDataProviders>
  );
}

// COLD-cache probe (the N0 rollback fix): NO `listTags` reader mounts, so that query is never
// fetched — its snapshot in onMutate is `undefined` and the optimistic write CREATES the cache
// entry. On failure the fix must REMOVE the entry (a v5 `setQueryData(key, undefined)` is a no-op —
// the phantom row would otherwise stick). The `read-cache` button reads the cache directly
// (getQueryData never fetches; onSettled's invalidate can't refetch an unobserved query) so the
// assertion sees the raw entry: `absent` (fixed) vs `rows=N` (the phantom sticks — the old bug).
function TagCreateColdCacheInner(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const queryClient = useQueryClient();
  const mutation = useCreateTagOptimistic({ trpc, invalidation });
  const [cacheState, setCacheState] = useState<string>("unread");

  return (
    <div>
      {mutation.error !== null && <p role="alert">{mutation.error instanceof Error ? mutation.error.message : String(mutation.error)}</p>}
      <button type="button" onClick={(): void => mutation.mutate({ input: { name: "new-tag" } })}>
        create
      </button>
      <button
        type="button"
        onClick={(): void => {
          const cached = queryClient.getQueryData<TagView[]>(trpc.tag.listTags.queryKey());
          setCacheState(cached === undefined ? "absent" : `rows=${cached.length}`);
        }}
      >
        read-cache
      </button>
      <p data-testid="cache-state">{cacheState}</p>
    </div>
  );
}

export function TagCreateColdCacheStory(): ReactElement {
  return (
    <CtDataProviders>
      <TagCreateColdCacheInner />
    </CtDataProviders>
  );
}

const useCreateTagVariables = createEntityMutation<CreateTagVars, TagView>({
  options: (trpc) => trpc.tag.createTag.mutationOptions(),
  invalidates: (trpc) => [trpc.tag.listTags.queryFilter()],
});

function TagCreateVariablesInner(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const mutation = useCreateTagVariables({ trpc, invalidation });

  return (
    <div>
      {mutation.pendingVariables !== undefined && <p data-testid="ghost-row">creating: {mutation.pendingVariables.input.name}</p>}
      {mutation.error !== null && (
        <div role="alert">
          <span>{mutation.error instanceof Error ? mutation.error.message : String(mutation.error)}</span>
          <button type="button" onClick={mutation.retry}>
            Retry
          </button>
        </div>
      )}
      <button type="button" onClick={(): void => mutation.mutate({ input: { name: "variables-tag" } })}>
        create
      </button>
    </div>
  );
}

export function TagCreateVariablesStory(): ReactElement {
  return (
    <CtDataProviders>
      <TagCreateVariablesInner />
    </CtDataProviders>
  );
}

// ── useViewer — the canonical "who am I" hook (data/use-viewer.ts). Composes THREE real procedures
//    (`sessions.me` + `settings.getUserSettings` + `persona.list`) and derives the current persona
//    client-side; routeTrpc stubs the wire so the probe asserts the composed + derived shape. ──────

function ViewerProbe(): ReactElement {
  const viewer = useViewer();
  return (
    <dl>
      <dd data-testid="viewer-handle">{viewer.handle}</dd>
      <dd data-testid="viewer-role">{viewer.globalRole}</dd>
      <dd data-testid="viewer-persona">{viewer.currentPersona?.name ?? "none"}</dd>
      <dd data-testid="viewer-persona-avatar">{viewer.currentPersona?.avatarHash ?? "none"}</dd>
    </dl>
  );
}

export function ViewerStory(): ReactElement {
  return (
    <CtDataProviders>
      <QueryBoundary fallback={<p>loading…</p>} renderError={(e): ReactElement => <p>{String(e)}</p>}>
        <ViewerProbe />
      </QueryBoundary>
    </CtDataProviders>
  );
}

// ── The startChat BURST probe (bus-invalidation hygiene) — the four events a `chat.startChat` lands on a
//    client inside ~80ms, each on its OWN button so a CT can attribute a wire fetch to exactly one event
//    (a whole-burst button fires them in one tick for the end-to-end count). Both burst-touched reads are
//    mounted and ACTIVE, so an invalidation that reaches them is a real round-trip routeTrpc counts, never
//    a silent stale-mark. The measured order: user-bus `chatsChanged` (the member fan, chatId present) →
//    `chatOpened` (the attach synthesis) → `chatCreated` + `messageCommitted` (the draft→committed
//    from-zero durable replay). ──────────────────────────────────────────────────────────────────────────

function StartChatBurstProbe({ chatId }: { readonly chatId: ChatId }): ReactElement {
  const trpc = useTRPC();
  const { invalidate, invalidateUser } = useInvalidation();
  const chat = useSuspenseQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const list = useSuspenseQuery(trpc.chat.listChats.queryOptions());
  const opened: ChatBusEvent = { type: "chatOpened", chatId };
  const created: ChatBusEvent = { type: "chatCreated", chatId };
  const committed: ChatBusEvent = { type: "messageCommitted", chatId, messageId: castId("msg_ctburst00000001") };
  const edited: ChatBusEvent = { type: "messageEdited", chatId, messageId: castId("msg_ctburst00000002") };
  return (
    <div>
      <p data-testid="burst-state">{`${chat.data.title ?? "untitled"} · ${list.data.length}`}</p>
      <button type="button" onClick={(): void => invalidateUser({ type: "chatsChanged", chatId })}>
        chatsChanged
      </button>
      <button type="button" onClick={(): void => invalidate(opened)}>
        chatOpened
      </button>
      <button type="button" onClick={(): void => invalidate(created)}>
        chatCreated
      </button>
      <button type="button" onClick={(): void => invalidate(committed)}>
        messageCommitted
      </button>
      {/* A NON-terminal canon event: `chatReads` — the chat list + canon, never `getChat`. The CT's
          round-trip BARRIER for the getChat assertions (fire it, await its listChats fetch, and any
          getChat request an earlier click had issued is necessarily already recorded). */}
      <button type="button" onClick={(): void => invalidate(edited)}>
        messageEdited
      </button>
      <button
        type="button"
        onClick={(): void => {
          invalidateUser({ type: "chatsChanged", chatId });
          invalidate(opened);
          invalidate(created);
          invalidate(committed);
        }}
      >
        whole-burst
      </button>
    </div>
  );
}

export function StartChatBurstStory({ chatId }: { readonly chatId: ChatId }): ReactElement {
  return (
    <CtDataProviders>
      <QueryBoundary fallback={<p>loading…</p>} renderError={(e): ReactElement => <p>{String(e)}</p>}>
        <StartChatBurstProbe chatId={chatId} />
      </QueryBoundary>
    </CtDataProviders>
  );
}
