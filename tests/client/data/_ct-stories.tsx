// `_ct-stories.tsx` — the client-CT story convention (docs/law/Spine-Testing.md §7: CT only mounts
// from a non-test module). One story module per mirror directory; each story wraps its root in
// <CtDataProviders> (Query + the real tRPC client — tests/support/browser/ct-data-providers.tsx explains
// why that seam is story-side, not beforeMount). The `.ct.tsx` beside this file mounts ONLY these
// exports. This file is the template every client feature agent copies.

import { QueryBoundary } from "@orb/client/components";
import type { CardFrameRequest, PluginDisplayRow, PluginFrameRequest } from "@orb/client/data";
import {
  __resetSessionFreshness,
  createCollectionSurface,
  createEntityMutation,
  SkeletonRows,
  sessionFreshnessAgeMs,
  skeletonRowCountFor,
  useCardFrameSrc,
  useCarriedAppearance,
  useColorQuotedSpeech,
  useDisplayScripts,
  useGatedQuery,
  useHuskReaper,
  useInvalidation,
  useOnlineStatus,
  useOpenRefinery,
  usePluginDisplayText,
  usePluginFrameSrc,
  usePromptMacroSuggestions,
  useSessionRecovery,
  useSettingsViewerView,
  useStartChat,
  useTRPC,
  useUploadAsset,
} from "@orb/client/data";
import type { NotifyInput } from "@orb/client/lib";
import { bindNotify, renderMessageForDisplay, timeLib, toNotice } from "@orb/client/lib";
import { AppRootSessionBoundary } from "@orb/client/routes/app-root-session-boundary";
import {
  __readSurfaceBoxForTest,
  activeDurableLocalUserId,
  enterCreatedChat,
  goToLanding,
  registerDurableLocalStore,
  rememberSurfaceBox,
  useActiveChatId,
  useActiveSection,
  useOpenModal,
  useSelectedRefinerySessionId,
} from "@orb/client/state";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { CreateTagInput, TagView } from "@orb/contracts/tag";
import type { CharacterId, ChatId, MessageId, PersonaId, PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { CtAppDataProviders, CtDataProviders } from "../../support/browser/ct-data-providers.tsx";
import type { TrpcInput, TrpcWireOutput } from "../../support/node/route-trpc.ts";

/** SettingsViewerViewStory — the ONE home of the `SettingsViewerView` projection a settings `when`
 *  predicate consumes (SET-SEAMS §5). NON-suspense on purpose: gating must never block a pane from
 *  painting, so an unresolved viewer reads as non-admin and the shell re-applies once it resolves. */
export function SettingsViewerViewStory(): ReactElement {
  return (
    <CtDataProviders>
      <SettingsViewerViewReader />
    </CtDataProviders>
  );
}

function SettingsViewerViewReader(): ReactElement {
  const viewer = useSettingsViewerView();
  return <output>{`isAdmin=${String(viewer.isAdmin)}`}</output>;
}

/** ColorQuotedSpeechStory — the ONE home of the `appearance.colorQuotedSpeech` → `colorQuotes` read for
 *  the prose surfaces that render authored content OUTSIDE a message row (the greeting preview, the
 *  greeting studio's preview, the facet editor's example transcript). NON-suspense on purpose: a preview
 *  must paint before the settings read resolves, so an unresolved read falls back to the contract default. */
export function ColorQuotedSpeechStory(): ReactElement {
  return (
    <CtDataProviders>
      <ColorQuotedSpeechReader />
    </CtDataProviders>
  );
}

function ColorQuotedSpeechReader(): ReactElement {
  const colorQuotes = useColorQuotedSpeech();
  return <output>{`colorQuotes=${String(colorQuotes)}`}</output>;
}

// The suspending read under test: a REAL procedure (`echo` — transport/trpc/router.ts loose public
// proc, input {message:string} → output {message:string}) because the options proxy is typed by
// AppRouter — routeTrpc stubs the wire, never the type layer.
function EchoReader(): ReactElement {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.echo.queryOptions({ message: "ping" }));
  return <output>{data.message}</output>;
}

/** The #885 reservation seam under CT — the REAL surface-box store (the #837 lesson: never a double;
 *  `rememberSurfaceBox` writes through zustand `persist` to localStorage). `seed` plants a remembered box
 *  + a sentinel key nothing else writes; `toggle` mounts/unmounts the keyed boundary behind a click so a
 *  test can hold its read open; `probe` stamps the store's CURRENT values and the in-browser
 *  `skeletonRowCountFor(480, 3)` so the pin compares the DOM against the same arithmetic the fill used
 *  (tokens resolved in THIS document — a hardcoded bar count would rot with the pitch tokens). */
const CT_RESERVE_KEY = "ct.reserve.probe";
const CT_RESERVE_SENTINEL = "zzz.ct.reserve.sentinel";

export function ReservedBoundaryStory(): ReactElement {
  const [mounted, setMounted] = useState(false);
  const [probe, setProbe] = useState("unread");
  return (
    <CtDataProviders>
      <button
        type="button"
        onClick={(): void => {
          rememberSurfaceBox(CT_RESERVE_KEY, 480);
          rememberSurfaceBox(CT_RESERVE_SENTINEL, 999);
        }}
      >
        seed
      </button>
      <button type="button" onClick={(): void => setMounted((m) => !m)}>
        toggle
      </button>
      <button
        type="button"
        onClick={(): void =>
          setProbe(
            `box=${String(__readSurfaceBoxForTest(CT_RESERVE_KEY))} sentinel=${String(__readSurfaceBoxForTest(CT_RESERVE_SENTINEL))} fill=${String(skeletonRowCountFor(480, 3))}`,
          )
        }
      >
        probe
      </button>
      <output data-testid="reserve-probe">{probe}</output>
      {mounted ? (
        <QueryBoundary fallback={<SkeletonRows count={3} />} reserveKey={CT_RESERVE_KEY}>
          <EchoReader />
        </QueryBoundary>
      ) : null}
    </CtDataProviders>
  );
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

// ── routeTrpc's DEFERRED responder (`trpcHold`, #136) — the harness arm's own mechanism proof ───────
// Two reads fired in the SAME commit, which is what makes `httpBatchLink` put them in ONE request: a
// hold on either therefore holds both, and both must come back correct and index-aligned when it is
// released. NON-suspense on purpose — a suspending pair could never batch (the first reader suspends
// before the second one renders), so the batch invariant this exists to prove would not arise at all.
function BatchedHoldProbe(): ReactElement {
  const trpc = useTRPC();
  const held = useQuery(trpc.echo.queryOptions({ message: "ping" }));
  // Only the COUNT is read: this reader exists to witness that the sibling entry of a held envelope
  // carried its own responder's data, not the held procedure's and not a null.
  const sibling = useQuery(trpc.tag.listTags.queryOptions());
  return (
    <div>
      <output data-testid="held-state">{held.isPending ? "pending" : (held.data?.message ?? "none")}</output>
      <output data-testid="sibling-state">{sibling.isPending ? "pending" : `tags=${sibling.data?.length ?? 0}`}</output>
    </div>
  );
}

export function BatchedHoldStory(): ReactElement {
  return (
    <CtDataProviders>
      <BatchedHoldProbe />
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

// ── useUploadAsset — the upload front door bound to its freshness consequence (data/use-upload-asset.ts).
//    The upload route is a RAW multipart POST with no `invalidates` and no bus event, so before the hook a
//    completed upload was invisible to `assets.listOwned` (the gallery dialog's owned-asset picker) until
//    gcTime evicted it. The probe mounts that read ACTIVE, so a reached invalidate is a real wire refetch
//    routeTrpc counts — never a silent stale-mark that would pass with the hook removed. ─────────────────

function UploadAssetProbe(): ReactElement {
  const trpc = useTRPC();
  const upload = useUploadAsset();
  const owned = useSuspenseQuery(trpc.assets.listOwned.queryOptions({ limit: 20 }));
  const [state, setState] = useState("idle");
  return (
    <div>
      <p data-testid="owned-count">{`rows=${owned.data.length}`}</p>
      <p data-testid="upload-state">{state}</p>
      <button
        type="button"
        onClick={(): void => {
          void upload(new File(["x"], "pic.png", { type: "image/png" }), "avatar").then(
            (stored) => setState(`stored:${stored.hash}`),
            (error: unknown) => setState(`failed:${String(error)}`),
          );
        }}
      >
        upload
      </button>
    </div>
  );
}

export function UploadAssetStory(): ReactElement {
  return (
    <CtDataProviders>
      <QueryBoundary fallback={<p>loading…</p>} renderError={(e): ReactElement => <p>{String(e)}</p>}>
        <UploadAssetProbe />
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

interface OverlapTagVars {
  readonly label: "older" | "newer";
  readonly name: string;
}

let rejectOlderOverlap: (() => void) | undefined;

const useCreateTagOverlap = createEntityMutation<OverlapTagVars, TagView, TagView[]>({
  options: () => ({
    mutationKey: ["ct", "overlap"],
    mutationFn: (vars): Promise<TagView> => {
      if (vars.label === "older") {
        return new Promise<TagView>((_resolve, reject) => {
          rejectOlderOverlap = (): void => reject(new Error("older failed"));
        });
      }
      return Promise.resolve({
        id: castId(`tag_pending_${vars.name}`),
        name: vars.name,
        color: null,
        color2: null,
        source: null,
        folderType: "NONE",
        sortOrder: null,
        isHiddenOnCard: false,
      });
    },
  }),
  optimistic: {
    readKey: (trpc) => trpc.tag.listTags.queryKey(),
    update: (old, vars) =>
      vars.label === "newer"
        ? old
        : [
            ...(old ?? []),
            {
              id: castId(`tag_pending_${vars.name}`),
              name: vars.name,
              color: null,
              color2: null,
              source: null,
              folderType: "NONE",
              sortOrder: null,
              isHiddenOnCard: false,
            },
          ],
  },
  busDriven: true,
});

function TagCreateOverlapInner({ sameValue }: { readonly sameValue: boolean }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const queryClient = useQueryClient();
  const { data: tags } = useSuspenseQuery(trpc.tag.listTags.queryOptions());
  const mutation = useCreateTagOverlap({ trpc, invalidation });
  const [settledFailure, setSettledFailure] = useState<string | null>(null);
  const create = (label: OverlapTagVars["label"]): void => {
    const vars = { label, name: sameValue ? "desired" : label };
    if (label === "older") {
      void mutation.mutateAsync(vars).catch((error: unknown) => {
        setSettledFailure(error instanceof Error ? error.message : String(error));
      });
      return;
    }
    mutation.mutate(vars, {
      onSuccess: (created): void => {
        queryClient.setQueryData<TagView[]>(trpc.tag.listTags.queryKey(), [created]);
      },
    });
  };

  return (
    <div>
      <ul data-testid="overlap-tag-list">
        {tags.map((tag) => (
          <li key={tag.id}>{tag.name}</li>
        ))}
      </ul>
      {settledFailure !== null ? <p role="alert">{settledFailure}</p> : null}
      <button type="button" onClick={(): void => create("older")}>
        older
      </button>
      <button type="button" onClick={(): void => create("newer")}>
        newer
      </button>
      <button type="button" onClick={(): void => rejectOlderOverlap?.()}>
        fail older
      </button>
    </div>
  );
}

export function TagCreateOverlapStory(): ReactElement {
  return (
    <CtDataProviders>
      <QueryBoundary fallback={<p>loading…</p>} renderError={(e): ReactElement => <p>{String(e)}</p>}>
        <TagCreateOverlapInner sameValue={false} />
      </QueryBoundary>
    </CtDataProviders>
  );
}

export function TagCreateSameValueOverlapStory(): ReactElement {
  return (
    <CtDataProviders>
      <QueryBoundary fallback={<p>loading…</p>} renderError={(e): ReactElement => <p>{String(e)}</p>}>
        <TagCreateOverlapInner sameValue={true} />
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
      <p data-testid="burst-state">{`${chat.data.title ?? "untitled"} · ${list.data.items.length}`}</p>
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

// ── createEntityMutation `echo` — the write's OWN response seeds the read it makes stale ────────────
// Driven on the REAL pair the seam exists for (`settings.updateUserSettingsSection` → the identical
// `settings.getUserSettings` view): a `busDriven` write reconciles via the bus, so between its 200 and the
// bus tick the read still serves the PRE-write row — and a surface computing its honesty from that read
// (Model roles' "a turn still uses X") calls a persisted selection unsaved for as long as the tick is
// missing. `echo` closes that window without inventing a second truth source.

interface UpdateSectionVars {
  readonly section: "seeds";
  readonly patch: Record<string, unknown>;
}

// TData is left `unknown` HERE only because the tests tree carries no `@trpc/tanstack-react-query` dep to
// spell `inferOutput<Trpc["settings"]["getUserSettings"]>` with; production derives the response type off
// the READ (connections-settings-surface.tsx), which is what proves the echo fits the read's cache entry.
const useEchoingSectionUpdate = createEntityMutation<UpdateSectionVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true,
  echo: (trpc) => trpc.settings.getUserSettings.queryKey(),
});

function SectionEchoInner(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const mutation = useEchoingSectionUpdate({ trpc, invalidation });

  return (
    <div>
      <p data-testid="seed-preset">{data.config.seeds.defaultPresetId ?? "unset"}</p>
      <button type="button" onClick={(): void => mutation.mutate({ section: "seeds", patch: { defaultPresetId: "preset_after" } })}>
        save
      </button>
    </div>
  );
}

export function SectionEchoStory(): ReactElement {
  return (
    <CtDataProviders>
      <QueryBoundary fallback={<p>loading…</p>} renderError={(e): ReactElement => <p>{String(e)}</p>}>
        <SectionEchoInner />
      </QueryBoundary>
    </CtDataProviders>
  );
}

// ── createEntityMutation `refusal` — the ERRORS-AS-DATA outcome class (EDITSNAP-OK) ────────────────
// A verb that refuses LEGIBLY as data resolves the mutation: `errorToast` cannot fire, `onError` never runs,
// and the sticky error slot stays null — so a fire-and-forget call site drops the refusal on the floor. This
// story reuses the echo pair on purpose: the OTHER half of the arm is that a refused write must not seed the
// read it would otherwise be authoritative for.

const useRefusableSectionUpdate = createEntityMutation<TrpcInput<"rpg.editSnapshot">, TrpcWireOutput<"rpg.editSnapshot">>({
  options: (trpc) => trpc.rpg.editSnapshot.mutationOptions(),
  busDriven: true,
  echo: (trpc) => trpc.settings.getUserSettings.queryKey(),
  refusal: (data): string | null => (data.ok === false ? `refused — ${data.reason}` : null),
});

function SectionRefusalInner(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const mutation = useRefusableSectionUpdate({ trpc, invalidation });
  const [notified, setNotified] = useState<string>("");
  useState(() => {
    // `bindNotify` is main.tsx-only, so the CT harness leaves `notify` a no-op unless a story binds it — and
    // the toast is the ONLY observable a refusal has (the `PersonaThisChatStory` precedent).
    const sink = (notice: NotifyInput): void => setNotified(toNotice(notice).title);
    bindNotify({ error: sink, info: sink, success: sink, warn: sink });
    return null;
  });

  return (
    <div>
      <p data-testid="seed-preset">{data.config.seeds.defaultPresetId ?? "unset"}</p>
      <p data-testid="notified">{notified}</p>
      <button type="button" onClick={(): void => mutation.mutate({ chatId: "chat_ct_refusal", patch: { actorState: "invalid-image" } })}>
        save
      </button>
    </div>
  );
}

export function SectionRefusalStory(): ReactElement {
  return (
    <CtDataProviders>
      <QueryBoundary fallback={<p>loading…</p>} renderError={(e): ReactElement => <p>{String(e)}</p>}>
        <SectionRefusalInner />
      </QueryBoundary>
    </CtDataProviders>
  );
}

// ── D121-E / F1: the DISPLAY TIER ───────────────────────────────────────────────────────────────────────
const DISPLAY_STORY_CHAT = "chat_ctdisplaystoryyyyyyyyy" as ChatId;

// The raw canon every display-tier arm starts from. NOT exported: playwright-ct rewrites every named
// import from a story module into a generated component `const`, so a story module may only export
// components to its CT — the CT restates this literal instead.
const DISPLAY_STORY_RAW = "the GOBLIN snarls";

/**
 * Renders ONE body through the production `renderMessageForDisplay` with the hook's RESOLVED display set,
 * and mounts a composer + an edit textarea beside it holding the SAME raw text — so one CT proves in a
 * single shot that a display script transforms the rendered body and touches NEITHER input nor the wire.
 */
function DisplayTierBody({ chatId }: { readonly chatId: ChatId | null }): ReactElement {
  const scripts = useDisplayScripts(chatId);
  const rendered = renderMessageForDisplay(DISPLAY_STORY_RAW, {
    // Branded key types, not bare `new Map()` — the maps are keyed by CharacterId/PersonaId.
    characterNamesById: new Map<CharacterId, RowCharacterName>(),
    personaNamesById: new Map<PersonaId, RowPersonaName>(),
    displayScripts: scripts,
  });
  return (
    <div>
      <p data-testid="rendered-body">{rendered}</p>
      {/* The composer + the edit textarea hold the RAW canon — the display leg must never reach them. */}
      <textarea aria-label="Message composer" defaultValue={DISPLAY_STORY_RAW} />
      <textarea aria-label="Edit message" defaultValue={DISPLAY_STORY_RAW} />
      {/* Stands in for the wire payload a send would carry: the un-transformed body. */}
      <output data-testid="wire-payload">{DISPLAY_STORY_RAW}</output>
    </div>
  );
}

/** In-room: BOTH display tiers apply (the room's broadcast set, then the viewer's own). */
export function DisplayTierInRoomStory(): ReactElement {
  return (
    <CtDataProviders>
      <DisplayTierBody chatId={DISPLAY_STORY_CHAT} />
    </CtDataProviders>
  );
}

/** Chat-less: only the viewer tier exists; no room query may be constructed or sent. */
export function DisplayTierChatlessStory(): ReactElement {
  return (
    <CtDataProviders>
      <DisplayTierBody chatId={null} />
    </CtDataProviders>
  );
}

/** MACU-2 — `usePromptMacroSuggestions` in isolation. The hook is the ONE home of the global-editor macro
 *  plane (persona description, character card facets): the builtin catalog UNION the ACTIVE preset's user
 *  macros, sourced `settings.getUserSettings` → `seeds.defaultPresetId` → `preset.get`. The story renders the
 *  offered NAMES so the `.ct.tsx` can assert the union and the built-in (`defaultPresetId: null`) arm without
 *  driving a whole editor. */
export function PromptMacroSuggestionsStory(): ReactElement {
  return (
    <CtDataProviders>
      <PromptMacroSuggestionsProbe />
    </CtDataProviders>
  );
}

function PromptMacroSuggestionsProbe(): ReactElement {
  const suggestions = usePromptMacroSuggestions();
  return (
    <div>
      {/* The ORDER matters as much as the membership: `withUserMacros` leads with the user plane, because the
          bare-`{{` popover only shows eight rows and a user macro behind the builtin lead is invisible on the
          very surfaces that exist to call it. */}
      <output data-testid="macro-names">{suggestions.map((entry) => entry.name).join(" ")}</output>
      <output data-testid="macro-lead">{suggestions[0]?.name ?? ""}</output>
    </div>
  );
}

/** CarriedAppearanceCastStory — the ONE home of "whose card dresses this room". ONE ARM since
 *  D166 R1: a room has a row from the creation CLICK, so the
 *  COMMITTED roster (`chat.getChat`) is the only source and the pre-send DRAFT resolver over founding
 *  CARDS (`character.get` per id) is deleted — do not restore a card-reading branch here. NON-suspense on
 *  purpose: appearance is decoration, so an unresolved OR FAILED read must report `undefined` (the
 *  viewer's own chrome) rather than block or error the surface reading it.
 *
 *  The readout is the resolved COMPOSITION — the two counts every takeover rule gates on — plus the
 *  carried names, so a settled cast is distinguishable from an unresolved one. It deliberately renders the
 *  SAME `pending` for every unresolved cause (gated-off, in-flight, errored), because the hook's contract
 *  is that consumers cannot tell them apart either. */
export function CarriedAppearanceCastStory({ chatId }: { readonly chatId: ChatId | null }): ReactElement {
  return (
    <CtDataProviders>
      <CarriedAppearanceCastReader chatId={chatId} />
    </CtDataProviders>
  );
}

function CarriedAppearanceCastReader({ chatId }: { readonly chatId: ChatId | null }): ReactElement {
  const cast = useCarriedAppearance(chatId);
  const readout = cast === undefined ? "pending" : `humans=${cast.humanCount} cards=${cast.characters.map((member) => member.displayName).join("+")}`;
  return <output data-testid="carried-cast">{readout}</output>;
}

/** `useSessionRecovery` — the ONE mount that arms the session machinery.
 *  It is a wiring hook with no pixels, so the story renders the two facts a CT can see: the
 *  durable-local namespace it BOUND (proof the per-user rebind ran off `sessions.me`, F1) and the fact that
 *  the mount itself neither suspends nor navigates. A regression here is silent by construction — an
 *  un-bound namespace keeps writing the legacy key and the next identity inherits it. */
function SessionRecoveryProbe(): ReactElement {
  useSessionRecovery();
  // The bind happens in the hook's EFFECT, so a render-time read of the namespace is one commit behind.
  // A short interval polls the module-level value until it settles — the CT waits on the rendered text,
  // so the poll's cadence is invisible to the assertion. (The previous dep-less setState-per-commit
  // spelling was an eslint-banned cascading-render pattern that only redded on the MERGED tree.)
  const [bound, setBound] = useState<string | null>(null);
  useEffect((): (() => void) => {
    const read = (): void => setBound(activeDurableLocalUserId());
    read();
    const timer = setInterval(read, 50);
    return (): void => clearInterval(timer);
  }, []);
  return <output data-testid="durable-local-user">{bound ?? "unbound"}</output>;
}

export function SessionRecoveryStory(): ReactElement {
  return (
    <CtDataProviders>
      <SessionRecoveryProbe />
    </CtDataProviders>
  );
}

function SessionRecoveryBindFailureProbe(): ReactElement {
  useState(() => {
    let failNext = true;
    const failOnce = (): void => {
      if (failNext) {
        failNext = false;
        throw new Error("planted durable-local bind failure");
      }
    };
    registerDurableLocalStore({
      prefix: "ct:",
      name: "bind-failure",
      api: {
        persist: {
          getOptions: () => ({ storage: { getItem: failOnce, setItem: () => undefined, removeItem: () => undefined } }),
          rehydrate: failOnce,
          setOptions: () => undefined,
        },
      },
      reset: () => undefined,
    });
  });
  const recovery = useSessionRecovery();
  return (
    <AppRootSessionBoundary recovery={recovery}>
      <output data-testid="session-bind-state">{recovery.status}</output>
    </AppRootSessionBoundary>
  );
}

export function SessionRecoveryBindFailureStory(): ReactElement {
  return (
    <CtDataProviders>
      <SessionRecoveryBindFailureProbe />
    </CtDataProviders>
  );
}

/**
 * The terminal `sessions.me` failure is the awkward lifecycle edge: QueryCache starts recovery while the
 * hook observing that same query re-renders. The modal-state read makes the bound host's verdict visible
 * without mounting the shell's modal renderer — auth's CT owns that rendered-dialog proof.
 */
function SessionRecoveryReauthProbe(): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const modal = useOpenModal();
  useSessionRecovery();
  useQuery(trpc.sessions.me.queryOptions());
  return (
    <div>
      <output data-testid="session-recovery-modal">{modal ?? "none"}</output>
      <button
        type="button"
        data-testid="ct-revoke-session"
        onClick={(): void => {
          void fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).then(() =>
            queryClient.invalidateQueries(trpc.sessions.me.queryFilter()),
          );
        }}
      >
        revoke session
      </button>
    </div>
  );
}

export function SessionRecoveryReauthStory(): ReactElement {
  return (
    <CtAppDataProviders>
      <SessionRecoveryReauthProbe />
    </CtAppDataProviders>
  );
}

/**
 * THE NO-401 IDENTITY SWAP (§4.4.1 × §4.2.1) — the one attack path no other sensor can reach. When another
 * human signs in on this browser, the shared `__Host-orb_session` cookie becomes THEIRS while this warm tab
 * keeps rendering the previous human's cache: every request now succeeds, so nothing 401s, so neither belt
 * ever fires. The visibility probe's identity compare is the only thing left that can notice.
 *
 * The story renders the probe's own clock so the CT can prove the INSTRUMENT before trusting its verdict: a
 * confirmed probe resets the age to ~0 ("fresh"), so the control case shows the edge really fired. The
 * `wake` button is the browser's tab-focus edge, with the clock pushed past the 5-minute floor first.
 */
function SessionSwapProbe(): ReactElement {
  const trpc = useTRPC();
  const { data: me } = useQuery(trpc.sessions.me.queryOptions());
  useSessionRecovery();
  const [freshness, setFreshness] = useState("pending");
  useEffect((): (() => void) => {
    const timer = setInterval((): void => setFreshness(sessionFreshnessAgeMs() < 60_000 ? "fresh" : "stale"), 50);
    return (): void => clearInterval(timer);
  }, []);
  return (
    <div>
      <output data-testid="viewer-handle">{me?.handle ?? "pending"}</output>
      <output data-testid="freshness">{freshness}</output>
      <button
        type="button"
        data-testid="ct-wake-tab"
        onClick={(): void => {
          __resetSessionFreshness(timeLib.now() - 600_000);
          document.dispatchEvent(new Event("visibilitychange"));
        }}
      >
        wake the tab
      </button>
    </div>
  );
}

export function SessionSwapStory(): ReactElement {
  return (
    <CtDataProviders>
      <SessionSwapProbe />
    </CtDataProviders>
  );
}

// ── CREATE-A-CHAT + THE HUSK REAPER (D166) ────────

const HUSK_CHAT_ID = castId<ChatId>("chat_ct_husk_probe");

/** `useStartChat` — the ONE client creation seam. The probe fires it and publishes what a caller can
 *  observe: the active-chat pointer it navigated to, and the section it switched to. The CACHE SEED is the
 *  claim that needs a witness of its own, so a sibling reader renders `chat.getChat`'s cached title WITHOUT
 *  its own fetch — if the seed did not land, that read is cold on the first frame. */
function StartChatProbe({ characterIds }: { readonly characterIds: readonly CharacterId[] }): ReactElement {
  const { startChat, isPending } = useStartChat();
  const activeChatId = useActiveChatId();
  const activeSection = useActiveSection();
  return (
    <div>
      <output data-testid="start-chat-state">{`chat=${activeChatId ?? "none"} section=${activeSection} pending=${String(isPending)}`}</output>
      {activeChatId === null ? null : <SeededRoomReader chatId={activeChatId} />}
      <button type="button" onClick={(): void => void startChat({ characterIds })}>
        start chat
      </button>
    </div>
  );
}

/** Reads `chat.getChat` CACHE-FIRST. `useStartChat` seeds this exact key from `startChat`'s own response,
 *  so a room's first frame is warm with zero extra round-trips (the `echo` idiom, §4.10). */
function SeededRoomReader({ chatId }: { readonly chatId: ChatId }): ReactElement {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  return <output data-testid="seeded-room">{data?.title ?? "cold"}</output>;
}

export function StartChatStory({ characterIds = [] }: { readonly characterIds?: readonly CharacterId[] } = {}): ReactElement {
  return (
    <CtDataProviders>
      <StartChatProbe characterIds={characterIds} />
    </CtDataProviders>
  );
}

// ── ENTER-A-REFINERY-SESSION (the ONE flow behind #157's three doors) ──────────────────────────────

/** `useOpenRefinery` — the ONE client seam for entering a refinery session on a card. The probe fires it
 *  and publishes exactly what a caller can observe: the session pointer it landed on, the section it
 *  switched to, and its in-flight flag. The resume-vs-mint DECISION is invisible in those three, which is
 *  the point — the CT reads it off the wire (`refinery.startSession`'s call count) beside them. */
function OpenRefineryProbe({ characterId }: { readonly characterId: CharacterId }): ReactElement {
  const { openRefinery, isPending } = useOpenRefinery();
  const sessionId = useSelectedRefinerySessionId();
  const activeSection = useActiveSection();
  return (
    <div>
      <output data-testid="open-refinery-state">{`session=${sessionId ?? "none"} section=${activeSection} pending=${String(isPending)}`}</output>
      <button type="button" onClick={(): void => void openRefinery(characterId).catch(() => undefined)}>
        open refinery
      </button>
    </div>
  );
}

export function OpenRefineryStory({ characterId }: { readonly characterId: CharacterId }): ReactElement {
  return (
    <CtDataProviders>
      <OpenRefineryProbe characterId={characterId} />
    </CtDataProviders>
  );
}

/** `useHuskReaper` — the nav-away arm of husk GC. It is a wiring hook with no pixels: mounted, it turns the
 *  store's `subscribeHuskAbandoned` publication into a best-effort `chat.reapHusk`. The probe drives the
 *  REAL store transition (enter a created room, then leave it) and renders the pointer + any toast, so the
 *  CT asserts the WIRE call — and, on the FAILING arm, that navigation still completed and nothing
 *  surfaced. */
function HuskReaperProbe(): ReactElement {
  useHuskReaper();
  const activeChatId = useActiveChatId();
  const [notified, setNotified] = useState<string>("none");
  useState(() => {
    const sink = (notice: NotifyInput): void => setNotified(toNotice(notice).title);
    bindNotify({ error: sink, info: sink, success: sink, warn: sink });
    return null;
  });
  return (
    <div>
      <output data-testid="husk-state">{`chat=${activeChatId ?? "none"} notified=${notified}`}</output>
      <button type="button" onClick={(): void => enterCreatedChat(HUSK_CHAT_ID)}>
        enter created
      </button>
      <button type="button" onClick={(): void => goToLanding()}>
        leave
      </button>
    </div>
  );
}

export function HuskReaperStory(): ReactElement {
  return (
    <CtDataProviders>
      <HuskReaperProbe />
    </CtDataProviders>
  );
}

// ── The plugin DISPLAY-transform seam (U6, seam 14) ──────────────────────────────────
// `usePluginDisplayText` is the last step of the row render: it takes what the house pipeline produced and
// hands back what the viewer's own plugins made of it. Its two load-bearing properties are BOTH about cost
// and silence, so the story renders the ANSWER and the `.ct.tsx` drives the DATA:
//   • zero registrants ⇒ the input string comes straight back and NO per-row request is made at all;
//   • a registrant ⇒ the annotated text replaces it, after one round-trip.

const DISPLAY_TRANSFORM_CHAT = castId<ChatId>("chat_ct_display0000000000000");
const DISPLAY_TRANSFORM_MESSAGE = castId<MessageId>("msg_ct_display00000000000000");

/** The hook's answer for one row, rendered as text so a CT can read it without a transcript. */
function PluginDisplayTextBody({ text, row }: { readonly text: string; readonly row: PluginDisplayRow | undefined }): ReactElement {
  const shown = usePluginDisplayText(text, row);
  return <p data-slot="plugin-display-text">{shown}</p>;
}

/** `usePluginDisplayText` in isolation, at a real row identity. */
export function PluginDisplayTextStory({ text = "a rendered line" }: { readonly text?: string }): ReactElement {
  return (
    <CtDataProviders>
      <PluginDisplayTextBody text={text} row={{ chatId: DISPLAY_TRANSFORM_CHAT, messageId: DISPLAY_TRANSFORM_MESSAGE }} />
    </CtDataProviders>
  );
}

/** A chat-less display surface has no row identity and therefore cannot call the per-row transform. */
export function PluginDisplayTextWithoutRowStory({ text = "a rendered line" }: { readonly text?: string }): ReactElement {
  return (
    <CtDataProviders>
      <PluginDisplayTextBody text={text} row={undefined} />
    </CtDataProviders>
  );
}

// ── THE FRAME-MINT MEMOS (#1486) ──────────────────────────────────────────────────────────────────
//
// Both frame hooks memoize the mint promise per SERIALIZED BODY, module-wide, for the tab's life — and both
// collapse every failure into a resolved `undefined`. So a memo that keeps the failed promise answers one
// bad second forever: the card renders the srcdoc floor and the plugin surface renders NOTHING, for those
// exact bytes, until the page is reloaded. The probes below remount a reader at the SAME body (the `key`
// bump), which is what a collapse/expand, a scroll-back or a re-opened panel does in the app — so a second
// attempt either re-mints or proves the memo poisoned itself.

const MEMO_CARD_REQUEST: CardFrameRequest = {
  chatId: castId<ChatId>("chat_ct_frame_memo"),
  characterId: castId<CharacterId>("character_ct_frame_memo"),
  html: "<p>a sealed letter</p>",
  css: undefined,
  themeTokens: { "--sandbox-bg": "#101014" },
  fontFamily: undefined,
};

const MEMO_PLUGIN_REQUEST: PluginFrameRequest = {
  pluginId: castId<PluginId>("plugin_ct_frame_memo"),
  surfaceId: "board",
  themeTokens: { "--sandbox-bg": "#101014" },
  styleTokens: { "--sandbox-radius": "0.5rem" },
  fontFamily: undefined,
};

function CardFrameSrcReader(): ReactElement {
  const src = useCardFrameSrc(MEMO_CARD_REQUEST);
  return <output data-testid="frame-src">{src ?? "floor"}</output>;
}

function PluginFrameSrcReader(): ReactElement {
  const src = usePluginFrameSrc(MEMO_PLUGIN_REQUEST);
  return <output data-testid="frame-src">{src ?? "nothing"}</output>;
}

/** A remount button plus one reader, so a CT can ask the same body twice from a fresh hook instance. */
function FrameMemoProbe({ reader }: { readonly reader: "card" | "plugin" }): ReactElement {
  const [attempt, setAttempt] = useState(0);
  return (
    <div>
      <button data-testid="ct-remount-frame" onClick={(): void => setAttempt((n) => n + 1)} type="button">
        remount
      </button>
      {reader === "card" ? <CardFrameSrcReader key={attempt} /> : <PluginFrameSrcReader key={attempt} />}
    </div>
  );
}

export function CardFrameMemoStory(): ReactElement {
  return (
    <CtDataProviders>
      <FrameMemoProbe reader="card" />
    </CtDataProviders>
  );
}

export function PluginFrameMemoStory(): ReactElement {
  return (
    <CtDataProviders>
      <FrameMemoProbe reader="plugin" />
    </CtDataProviders>
  );
}
