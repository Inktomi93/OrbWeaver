// THE chat keystone — the message-list surface (UI-Arch §2.1 CONSUMER tier; scout §"chat-surface").
// It COMPOSES the built seams — it never paints raw:
//   • reads canon (`MessagesPage`) + the roster (`chat.getChat`, see below) via
//     `useSuspenseQueries`, wrapped in `<QueryBoundary>` (the loading/error battery — the
//     EchoBoundaryStory canonical, §13.1);
//   • GATES the read on the ChatHandle discriminant: a draft (no server id) never mounts the query, so
//     no `castId("")` sentinel ever reaches the server (no-fake-disabled-id in spirit — the discriminant
//     is a stronger gate than skipToken);
//   • attaches the live room stream with `useChatBus(chatId, busDeps)` — `busDeps` is assembled at the
//     composition root (a feature may not import the write store, gate chat-stream-writes-in-bus-only);
//   • merges canon + the streaming ghost into ONE id-keyed list (`useMessageItems`) and renders it
//     through `@orb/ui/message-list` (anchorTo/followOnAppend hard-wired in the seal);
//   • subscribes ONLY to lifecycle (`useTurnPhase`) — token text stays inside the ONE ghost row, so a
//     delta never re-renders the list (the ghost-isolation invariant, §11.1).
//
// ROSTER + MACRO-PRODUCER THREADING (the `{{char}}`/`{{user}}` macro + #21 attribution wiring):
// `MessageRow` ACCEPTS `participants`/`characterNamesById`/`personaNamesById`/`activePersonaId` — the
// roster read lives HERE, alongside `listMessages`, via `useSuspenseQueries` (PLURAL — two suspense
// reads in one component would otherwise serially waterfall, UI-Lib-TanStack-Query.md §"request
// waterfalls"). `chat.listMessages` now returns `MessagesPage { messages, macroNames }` (Chat-Macro-
// Resolution.md §1/§3, its return shape CHANGED from a bare `MessageView[]`); `chat.getChat`'s
// `ChatDetail` carries the roster (`participants`) + its OWN `macroNames` floor (participant-scoped).
// The client MERGES both `ChatMacroNameProducer`s (`@orb/contracts/chat`'s `buildCharacterNameMap`/
// `buildPersonaNameMap`, last-write-wins on a dup id) into the two lookup maps `resolveRowMacros`
// (`@orb/kit/macro`) wants — covering every participant PLUS this page's own stamped ids (a
// since-switched persona). The owner-scoped `persona.list` read is GONE: the member-gated producer
// replaced it (that read was the cross-owner bug — Chat-Macro-Resolution.md).
//
// THE DRAFT BRANCH (J2/J3): a draft has no committed chatId, so it never touches the canon/roster reads
// above — but it is NOT an empty void. `DraftGreetingThread` reads only the FOUNDING cards (character.get)
// and renders each character's greeting as a normal, editable `MessageRow` (synth-greeting-row.ts), with a
// `{{char}}` producer built from those cards. Edit/Swipe on a greeting row route to the draft-config store
// (the row's `greeting` binding), never a chat verb.
//
// READ-PATH NOTE: this surface uses `QueryBoundary` + `useSuspenseQueries` (PLURAL — the roster + canon
// reads must run in PARALLEL, not serially waterfall), gated by the ChatHandle discriminant. `useGatedQuery`
// (the non-suspense gated read) is now realigned and tRPC-`queryOptions`-compatible — four siblings in this
// slice consume it — so this is NOT a deviation: the suspense-plural boundary is simply the right fit for a
// two-read surface, not a fallback around a broken factory.

import type { ChatMacroNameProducer, MessageView, PersonaAvatarEntry } from "@orb/contracts/chat";
import {
  buildCharacterNameMap,
  buildPersonaAvatarMap,
  buildPersonaNameMap,
} from "@orb/contracts/chat";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { Stack } from "@orb/ui/layout";
import { MessageList } from "@orb/ui/message-list";
import { Text } from "@orb/ui/text";
import { useSuspenseQueries } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useRef } from "react";
import type { ChatBusDeps } from "#data";
import { QueryBoundary, QueryErrorState, SkeletonRows, useChatBus, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import type { ChatHandle, DraftSeed } from "#state";
import {
  isCommitted,
  isLiveTurnPhase,
  useDraftConfig,
  useTurnPhase,
  useTurnSpeakerCharacterId,
} from "#state";
import { GhostMessageRow } from "../components/ghost-message-row";
import { MessageRow } from "../components/message-row";
import { useChatStyle } from "../hooks/use-chat-style";
import { useMessageAppearance } from "../hooks/use-message-appearance";
import { messageItemKey, useMessageItems, useNewArrivalKeys } from "../hooks/use-message-items";
import { resolveRowAttribution } from "../lib/attribution";
import { resolveContextBoundaryMessageId } from "../lib/context-boundary";
import type { MESSAGE_ROW_SKINS } from "../lib/message-row-variants";
import {
  buildParticipantsById,
  resolveViewerActivePersonaId,
  resolveViewerUserId,
} from "../lib/roster";
import { synthGreetingRow } from "../lib/synth-greeting-row";

/** Initial per-row height guess (px) — rows re-measure themselves after mount (the seal's job). */
const ESTIMATED_ROW_PX = 96;

export interface MessageListSurfaceProps {
  readonly handle: ChatHandle;
  /** The reducer deps, assembled at the composition root (stream + invalidate + onWarning). */
  readonly busDeps: ChatBusDeps;
  /** The new-chat seed (founding cast) — a DRAFT renders each founding character's greeting as a normal
   *  message row from this (J2/J3), so a new chat is character-first, not a "No messages yet." void. */
  readonly draftSeed?: DraftSeed | undefined;
  /** Navigate to a forked chat (threaded to each row's Fork action) — route maps it to `selectChat`. */
  readonly onChatForked?: ((chatId: ChatId) => void) | undefined;
}

/** The scrolling chat transcript for one chat (or a draft's editable greeting preview). */
export function MessageListSurface({
  handle,
  busDeps,
  draftSeed,
  onChatForked,
}: MessageListSurfaceProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  const chatId = isCommitted(handle) ? handle.id : null;
  useChatBus(chatId, busDeps);
  const chatStyle = useChatStyle();

  // Draft: no server row yet → no canon read, no live stream (the discriminant IS the gate). But it is NOT
  // an empty void — each founding character's greeting renders as a NORMAL, fully-editable message row
  // (synth-greeting-row.ts), reading only the founding cards (character.get). A characterless draft (a
  // narrator-only room) has no greeting to show → the empty state.
  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="h-full min-h-0 w-full outline-none">
      {((): ReactElement => {
        if (chatId === null) {
          const characterIds = handle.kind === "draft" ? (draftSeed?.characterIds ?? []) : [];
          if (handle.kind !== "draft" || characterIds.length === 0) {
            return <EmptyThread />;
          }
          return (
            <QueryBoundary
              fallback={<SkeletonRows count={3} />}
              renderError={(_error, retry): ReactElement => (
                <QueryErrorState label="this conversation" onRetry={retry} />
              )}
            >
              <DraftGreetingThread
                draftKey={handle.draftKey}
                characterIds={characterIds}
                chatStyle={chatStyle}
              />
            </QueryBoundary>
          );
        }
        return (
          <QueryBoundary
            fallback={<SkeletonRows count={3} />}
            renderError={(_error, retry): ReactElement => (
              <QueryErrorState label="this conversation" onRetry={retry} />
            )}
          >
            <ChatThread chatId={chatId} chatStyle={chatStyle} onChatForked={onChatForked} />
          </QueryBoundary>
        );
      })()}
    </Stack>
  );
}

interface ChatThreadProps {
  readonly chatId: ChatId;
  readonly chatStyle: keyof typeof MESSAGE_ROW_SKINS;
  readonly onChatForked?: ((chatId: ChatId) => void) | undefined;
}

/** The committed-chat transcript — suspends on the canon + roster reads, then merges the live ghost. */
function ChatThread({ chatId, chatStyle, onChatForked }: ChatThreadProps): ReactElement {
  const trpc = useTRPC();
  // ONE `useSuspenseQueries` (plural) — two suspense reads, fetched in parallel (see header note).
  const [{ data: messagesPage }, { data: chatDetail }] = useSuspenseQueries({
    queries: [
      trpc.chat.listMessages.queryOptions({ chatId }),
      trpc.chat.getChat.queryOptions({ chatId }),
    ],
  });
  const messages = messagesPage.messages;
  const participants = buildParticipantsById(chatDetail.participants);
  // The client's OWN merge of the two `ChatMacroNameProducer` wire halves (header note): the chat-level
  // floor ∪ this page's own stamped ids, last-write-wins on a dup id (contracts' own doc on the builders).
  const producers: readonly ChatMacroNameProducer[] = [
    chatDetail.macroNames,
    messagesPage.macroNames,
  ];
  const characterNamesById = buildCharacterNameMap(producers.flatMap((p) => p.characterNames));
  const personaNamesById = buildPersonaNameMap(producers.flatMap((p) => p.personaNames));
  // The persona AVATAR-chrome producer — the SAME chat-floor ∪ page-stamped merge as the names above, but
  // a SEPARATE array (Chat-Macro-Resolution.md §1: names-only, never denormalized with display fields; #67).
  const personaAvatarEntries: readonly PersonaAvatarEntry[] = [
    ...chatDetail.personaAvatars,
    ...messagesPage.personaAvatars,
  ];
  const personaAvatarsById = buildPersonaAvatarMap(personaAvatarEntries);
  const activePersonaId = resolveViewerActivePersonaId(chatDetail.participants);
  // The viewing principal (D44 §12.0 render-trust "own input" comparand) — the first-human-seat proxy
  // until real auth (#50). Read ONCE here, threaded to each row (rows stay prop-driven, not per-row).
  const viewerUserId = resolveViewerUserId(chatDetail.participants);
  // Per-message avatar chrome from the synced appearance pref (§12.1) — read ONCE here, threaded to
  // each row as props (rows stay prop-driven + Compiler-memoized, never a per-row query).
  const messageAppearance = useMessageAppearance();
  const phase = useTurnPhase(chatId);
  // Phase 4b gap-fix (b) — the live turn's voiced speaker (a chrome-safe id-stable selector, §A.8;
  // never re-renders this surface on a token delta). Resolved through the SAME `resolveRowAttribution`
  // the settled row uses, so the ghost's immersive decoration (Echo/Whisper/Hush/Ripple) matches
  // exactly what the canonical row will show once the turn settles.
  const ghostSpeakerCharacterId = useTurnSpeakerCharacterId(chatId);
  const ghostAttribution = resolveRowAttribution({
    role: "assistant",
    characterId: ghostSpeakerCharacterId,
    personaId: null,
    participants,
    characterNamesById,
  });
  const items = useMessageItems(messages, chatId);
  // Motion guide §4.2 item 1 — the keys that GENUINELY arrived this render (appended, not scrolled
  // back into the window, not a ghost→committed settle; see use-message-items.ts). Only these rows
  // get an enter transition — a windowed row remounts on every scrollback, so "mounted" ≠ "new".
  const newArrivalKeys = useNewArrivalKeys(items, chatId);

  const live = isLiveTurnPhase(phase);
  // The tail assistant message is the swipe-eligible row (hidden mid-stream — scout swipe-strip rule).
  const lastAssistantId = live ? null : findLastAssistantId(messages);
  // Phase 4b §B.5.2 — the current "last-in-context" boundary (lib/context-boundary; null ⇒ no divider).
  const contextBoundaryMessageId = resolveContextBoundaryMessageId(messages);

  const renderItem = (item: (typeof items)[number]): ReactNode =>
    item.kind === "ghost" ? (
      <GhostMessageRow
        chatId={chatId}
        chatStyle={chatStyle}
        streaming={phase === "streaming" || phase === "stopping"}
        rowCharacterId={ghostSpeakerCharacterId}
        attribution={ghostAttribution}
        avatarSize={messageAppearance.avatarSize}
        avatarShape={messageAppearance.avatarShape}
        avatarAspect={messageAppearance.avatarAspect}
        avatarRing={messageAppearance.avatarRing}
        showInChatAvatars={messageAppearance.showInChatAvatars}
        showLLMReasoningIcon={messageAppearance.showLLMReasoningIcon}
        enterMotion={newArrivalKeys.has(item.id)}
      />
    ) : (
      <MessageRow
        message={item.view}
        chatStyle={chatStyle}
        avatarSize={messageAppearance.avatarSize}
        avatarShape={messageAppearance.avatarShape}
        avatarAspect={messageAppearance.avatarAspect}
        avatarRing={messageAppearance.avatarRing}
        showInChatAvatars={messageAppearance.showInChatAvatars}
        autoFixMarkdown={messageAppearance.autoFixMarkdown}
        metadataVisibility={messageAppearance.metadataVisibility}
        messageActions={messageAppearance.messageActions}
        showSwipes={item.view.id === lastAssistantId}
        contextBoundary={item.view.id === contextBoundaryMessageId}
        participants={participants}
        characterNamesById={characterNamesById}
        personaNamesById={personaNamesById}
        personaAvatarsById={personaAvatarsById}
        activePersonaId={activePersonaId}
        anchorPersonaId={chatDetail.anchorPersonaId}
        viewerUserId={viewerUserId}
        onChatForked={onChatForked}
        enterMotion={newArrivalKeys.has(item.view.id)}
      />
    );

  if (items.length === 0) {
    return <EmptyThread />;
  }
  return (
    <MessageList
      items={items}
      getItemKey={messageItemKey}
      estimateSize={(): number => ESTIMATED_ROW_PX}
      renderItem={renderItem}
      gapToken="block"
      className="h-full"
    />
  );
}

/** The newest assistant message's id (drives swipe-strip visibility), or null for none. */
function findLastAssistantId(messages: readonly MessageView[]): MessageView["id"] | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m !== undefined && m.role === "assistant") {
      return m.id;
    }
  }
  return null;
}

interface DraftGreetingThreadProps {
  readonly draftKey: string;
  readonly characterIds: readonly CharacterId[];
  readonly chatStyle: keyof typeof MESSAGE_ROW_SKINS;
}

/** A draft's editable greeting preview — one NORMAL `MessageRow` per founding character, in greet-all
 *  order (mirrors the server's default opening policy: solo ⇒ first-message, group ⇒ greet-all). Reads
 *  only the founding cards (`character.get`) — a draft has no server roster — and builds the `{{char}}`
 *  producer from them so macros resolve live. The shown text = the draft's edited/swiped greeting ?? the
 *  card's `greetings[0]`; each row's Edit/Swipe route to the draft-config store (the `greeting` binding). */
function DraftGreetingThread({
  draftKey,
  characterIds,
  chatStyle,
}: DraftGreetingThreadProps): ReactElement {
  const trpc = useTRPC();
  const draftConfig = useDraftConfig(draftKey);
  const messageAppearance = useMessageAppearance();
  const characters = useSuspenseQueries({
    queries: characterIds.map((characterId) => trpc.character.get.queryOptions({ characterId })),
  });
  // The `{{char}}` producer from the founding cast (no server roster for a draft); persona names are
  // empty pre-commit, so `{{user}}` falls to the kit's "User" floor (never a literal `{{user}}`).
  const characterNamesById = buildCharacterNameMap(
    characters.map((c) => ({ id: c.data.id, name: c.data.name })),
  );
  const personaNamesById = buildPersonaNameMap([]);

  // One row per founding character with a non-blank greeting; a blank/greeting-less card contributes none.
  const rows = characters.flatMap((c, i) => {
    const character = c.data;
    const shown = draftConfig.greetings?.[character.id] ?? character.greetings[0] ?? "";
    return shown.length === 0 ? [] : [{ character, row: synthGreetingRow(character.id, shown, i) }];
  });

  if (rows.length === 0) {
    return <DraftGreetingEmpty names={characters.map((c) => c.data.name)} />;
  }
  return (
    <Stack gap="block" padding="section" className="h-full overflow-y-auto">
      {rows.map(({ character, row }) => (
        <MessageRow
          key={character.id}
          message={row}
          chatStyle={chatStyle}
          avatarSize={messageAppearance.avatarSize}
          avatarShape={messageAppearance.avatarShape}
          avatarAspect={messageAppearance.avatarAspect}
          avatarRing={messageAppearance.avatarRing}
          showInChatAvatars={messageAppearance.showInChatAvatars}
          autoFixMarkdown={messageAppearance.autoFixMarkdown}
          messageActions={messageAppearance.messageActions}
          characterNamesById={characterNamesById}
          personaNamesById={personaNamesById}
          greeting={{ draftKey, characterId: character.id, variants: character.greetings }}
        />
      ))}
    </Stack>
  );
}

/** A characterful draft whose cast has no opening yet — the composer below is the next step (§4.3 rule 1). */
function DraftGreetingEmpty({ names }: { readonly names: readonly string[] }): ReactElement {
  const label = names.filter((n) => n.length > 0).join(", ");
  return (
    <Stack align="center" justify="center" padding="section" className="h-full">
      <Text tone="muted">
        {label.length > 0 ? `Say hello to ${label} to begin the scene.` : "No messages yet."}
      </Text>
    </Stack>
  );
}

/** The empty-transcript state (a draft, or a committed chat with no messages). */
function EmptyThread(): ReactElement {
  return (
    <Stack align="center" justify="center" padding="section" className="h-full">
      <Text tone="muted">No messages yet.</Text>
    </Stack>
  );
}
