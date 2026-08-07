// `_ct-stories.tsx` — the client-CT story convention (core/Spine-Testing.md §7: CT only mounts
// from a non-test module). One story module per mirror directory; each story wraps its root in
// <CtDataProviders> (Query + the real tRPC client — tests/support/ct/ct-data-providers.tsx explains
// why that seam is story-side, not beforeMount). The `.ct.tsx` beside this file mounts ONLY these
// exports. This file is the template every client feature agent copies.

import {
  createCollectionSurface,
  createEntityMutation,
  QueryBoundary,
  useCarriedAppearanceCast,
  useColorQuotedSpeech,
  useDisplayScripts,
  useGatedQuery,
  useInvalidation,
  useOnlineStatus,
  usePromptMacroSuggestions,
  useSettingsViewerView,
  useTRPC,
  useUploadAsset,
  useViewer,
} from "@orb/client/data";
import { bindNotify, renderMessageForDisplay } from "@orb/client/lib";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { CreateTagInput, TagView } from "@orb/contracts/tag";
import type { CharacterId, ChatId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { CtDataProviders } from "../../support/ct/ct-data-providers.tsx";

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

// ── createEntityMutation `echo` — the write's OWN response seeds the read it makes stale ────────────
// Driven on the REAL pair the seam exists for (`settings.updateUserSettingsSection` → the identical
// `settings.getUserSettings` view): a `busDriven` write reconciles via the bus, so between its 200 and the
// bus tick the read still serves the PRE-write row — and a surface computing its honesty from that read
// (Connections' "a turn still uses X") calls a persisted selection unsaved for as long as the tick is
// missing. `echo` closes that window without inventing a second truth source.

interface UpdateSectionVars {
  readonly section: "routing";
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
      <p data-testid="chat-source">{data.config.routing.roleDefaults.chat?.source ?? "unset"}</p>
      <button type="button" onClick={(): void => mutation.mutate({ section: "routing", patch: { roleDefaults: { chat: { source: "vllm" } } } })}>
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

const useRefusableSectionUpdate = createEntityMutation<UpdateSectionVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true,
  echo: (trpc) => trpc.settings.getUserSettings.queryKey(),
  refusal: (data): string | null => {
    const verdict = data as { readonly ok?: boolean; readonly reason?: string };
    return verdict.ok === false ? `refused — ${verdict.reason ?? ""}` : null;
  },
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
    bindNotify({ info: (m): void => setNotified(m), success: (m): void => setNotified(m), error: (m): void => setNotified(m) });
    return null;
  });

  return (
    <div>
      <p data-testid="chat-source">{data.config.routing.roleDefaults.chat?.source ?? "unset"}</p>
      <p data-testid="notified">{notified}</p>
      <button type="button" onClick={(): void => mutation.mutate({ section: "routing", patch: { roleDefaults: { chat: { source: "vllm" } } } })}>
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
function DisplayTierBody({ chatId }: { readonly chatId: ChatId }): ReactElement {
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

/** CarriedAppearanceCastStory — the ONE home of "whose card dresses this room", resolved for BOTH chat
 *  phases: a COMMITTED chat's roster (`chat.getChat`) or a pre-send DRAFT's founding CARDS
 *  (`character.get` per id). NON-suspense on purpose: appearance is decoration, so an unresolved read must
 *  report `undefined` (the viewer's own chrome) rather than block or error the surface reading it.
 *
 *  The readout is the resolved COMPOSITION — the two counts every takeover rule gates on — plus the
 *  carried names, so a partially-loaded draft cast (which must read as `pending`, never as a SMALLER cast
 *  that would momentarily look true-solo) is distinguishable from a settled one. */
export function CarriedAppearanceCastStory({
  chatId,
  draftCharacterIds,
}: {
  readonly chatId: ChatId | null;
  readonly draftCharacterIds: readonly CharacterId[];
}): ReactElement {
  return (
    <CtDataProviders>
      <CarriedAppearanceCastReader chatId={chatId} draftCharacterIds={draftCharacterIds} />
    </CtDataProviders>
  );
}

function CarriedAppearanceCastReader({
  chatId,
  draftCharacterIds,
}: {
  readonly chatId: ChatId | null;
  readonly draftCharacterIds: readonly CharacterId[];
}): ReactElement {
  const cast = useCarriedAppearanceCast(chatId, draftCharacterIds);
  const readout = cast === undefined ? "pending" : `humans=${cast.humanCount} cards=${cast.characters.map((member) => member.displayName).join("+")}`;
  return <output data-testid="carried-cast">{readout}</output>;
}
