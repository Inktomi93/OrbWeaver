// The message-list surface: composes canon (`MessagesPage`) + roster (`chat.getChat`) via a plural
// `useSuspenseQueries` (parallel, avoids a request waterfall), gated on the ChatHandle discriminant so
// a draft never mounts the query. Merges canon + the streaming ghost into one id-keyed list and
// subscribes only to lifecycle (`useTurnPhase`) — token text stays inside the one ghost row, so a delta
// never re-renders the list. A draft has no committed chatId; `DraftGreetingThread` renders each
// founding character's greeting as a normal, editable `MessageRow` instead of an empty state.

import type { ChatMacroNameProducer, MessageView, PersonaAvatarEntry } from "@orb/contracts/chat";
import { buildCharacterNameMap, buildPersonaAvatarMap, buildPersonaNameMap } from "@orb/contracts/chat";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { Stack } from "@orb/ui/layout";
import type { MessageListHandle } from "@orb/ui/message-list";
import { MessageList } from "@orb/ui/message-list";
import { Text } from "@orb/ui/text";
import { useSuspenseQueries } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useRef } from "react";
import type { ChatBusDeps } from "#data";
import { QueryBoundary, QueryErrorState, SkeletonRows, useChatBus, useTRPC } from "#data";
import type { ChatSurfaceContribution, ContributorRegistry } from "#lib";
import { useFocusOnMount } from "#lib";
import type { ChatHandle, DraftSeed } from "#state";
import { isCommitted, isLiveTurnPhase, useDraftConfig, useTurnPhase, useTurnSpeakerCharacterId } from "#state";
import { GhostMessageRow } from "../components/ghost-message-row";
import { JumpToLatestPill } from "../components/jump-to-latest-pill";
import { MessageRow } from "../components/message-row";
import { useChatBehaviorPrefs } from "../hooks/use-chat-behavior-prefs";
import { useChatStyle } from "../hooks/use-chat-style";
import { useJumpToLatest } from "../hooks/use-jump-to-latest";
import { useMessageAppearance } from "../hooks/use-message-appearance";
import { messageItemKey, useMessageItems, useNewArrivalKeys } from "../hooks/use-message-items";
import { resolveRowAttribution } from "../lib/attribution";
import { resolveContextBoundaryMessageId } from "../lib/context-boundary";
import type { MESSAGE_ROW_SKINS } from "../lib/message-row-variants";
import { buildParticipantsById, resolveViewerActivePersonaId, resolveViewerUserId } from "../lib/roster";
import { synthGreetingRow } from "../lib/synth-greeting-row";

/** Initial per-row height guess (px) — rows re-measure themselves after mount (the seal's job). */
const ESTIMATED_ROW_PX = 96;

export interface MessageListSurfaceProps {
  readonly handle: ChatHandle;
  readonly busDeps: ChatBusDeps;
  /** A draft renders each founding character's greeting as a normal message row from this seed. */
  readonly draftSeed?: DraftSeed | undefined;
  readonly onChatForked?: ((chatId: ChatId) => void) | undefined;
  readonly surfaceContributors: ContributorRegistry<ChatSurfaceContribution>;
}

/** The scrolling chat transcript for one chat (or a draft's editable greeting preview). */
export function MessageListSurface({ handle, busDeps, draftSeed, onChatForked, surfaceContributors }: MessageListSurfaceProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  const chatId = isCommitted(handle) ? handle.id : null;
  useChatBus(chatId, busDeps);
  const chatStyle = useChatStyle();

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
              renderError={(_error, retry): ReactElement => <QueryErrorState label="this conversation" onRetry={retry} />}
            >
              <DraftGreetingThread draftKey={handle.draftKey} characterIds={characterIds} chatStyle={chatStyle} />
            </QueryBoundary>
          );
        }
        return (
          <QueryBoundary
            fallback={<SkeletonRows count={3} />}
            renderError={(_error, retry): ReactElement => <QueryErrorState label="this conversation" onRetry={retry} />}
          >
            <ChatThread chatId={chatId} chatStyle={chatStyle} onChatForked={onChatForked} surfaceContributors={surfaceContributors} />
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
  readonly surfaceContributors: ContributorRegistry<ChatSurfaceContribution>;
}

/** The committed-chat transcript — suspends on the canon + roster reads, then merges the live ghost. */
function ChatThread({ chatId, chatStyle, onChatForked, surfaceContributors }: ChatThreadProps): ReactElement {
  const trpc = useTRPC();
  const [{ data: messagesPage }, { data: chatDetail }] = useSuspenseQueries({
    queries: [trpc.chat.listMessages.queryOptions({ chatId }), trpc.chat.getChat.queryOptions({ chatId })],
  });
  const messages = messagesPage.messages;
  const participants = buildParticipantsById(chatDetail.participants);
  // Merge the two ChatMacroNameProducer wire halves (chat-level floor + this page's own stamped ids),
  // last-write-wins on a dup id.
  const producers: readonly ChatMacroNameProducer[] = [chatDetail.macroNames, messagesPage.macroNames];
  const characterNamesById = buildCharacterNameMap(producers.flatMap((p) => p.characterNames));
  const personaNamesById = buildPersonaNameMap(producers.flatMap((p) => p.personaNames));
  const personaAvatarEntries: readonly PersonaAvatarEntry[] = [...chatDetail.personaAvatars, ...messagesPage.personaAvatars];
  const personaAvatarsById = buildPersonaAvatarMap(personaAvatarEntries);
  const activePersonaId = resolveViewerActivePersonaId(chatDetail.participants);
  const viewerUserId = resolveViewerUserId(chatDetail.participants);
  const messageAppearance = useMessageAppearance();
  const behaviorPrefs = useChatBehaviorPrefs();
  const phase = useTurnPhase(chatId);
  // The live turn's voiced speaker, resolved through the SAME resolveRowAttribution the settled row
  // uses, so the ghost's immersive decoration matches what the canonical row will show once it settles.
  const ghostSpeakerCharacterId = useTurnSpeakerCharacterId(chatId);
  const ghostAttribution = resolveRowAttribution({
    role: "assistant",
    characterId: ghostSpeakerCharacterId,
    personaId: null,
    participants,
    characterNamesById,
  });
  const items = useMessageItems(messages, chatId);
  // Only rows that genuinely arrived this render get an enter transition — a windowed row remounts on
  // every scrollback, so "mounted" != "new".
  const newArrivalKeys = useNewArrivalKeys(items, chatId);

  const live = isLiveTurnPhase(phase);

  // "am I at the tail" comes from real scroll geometry sampled at settle, not the seal's follow-intent
  // signal, which desyncs from position once virtual-core writes scrollTop during a re-measure.
  const listHandleRef = useRef<MessageListHandle>(null);
  const jump = useJumpToLatest({ messagesCount: messages.length, live, listHandleRef });
  const lastAssistantId = live ? null : findLastAssistantId(messages);
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
        smoothStream={behaviorPrefs.smoothStream}
        smoothStreamCps={behaviorPrefs.smoothStreamCps}
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
        surfaceContributors={surfaceContributors}
      />
    );

  if (items.length === 0) {
    return <EmptyThread />;
  }
  return (
    <Stack className="relative h-full min-h-0">
      <MessageList
        ref={listHandleRef}
        items={items}
        getItemKey={messageItemKey}
        estimateSize={(): number => ESTIMATED_ROW_PX}
        renderItem={renderItem}
        scrollContainerRef={jump.scrollContainerRef}
        gapToken="block"
        // py-block: the first/last rows breathe off the topbar/composer edges instead of butting the
        // scroll container's border (12px is inside the virtualizer's overscan + isAtEnd tolerances).
        className="h-full py-block"
      />
      <JumpToLatestPill count={jump.count} visible={jump.visible} onJump={jump.onJump} />
    </Stack>
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

/** A draft's editable greeting preview — one MessageRow per founding character, in greet-all order. */
function DraftGreetingThread({ draftKey, characterIds, chatStyle }: DraftGreetingThreadProps): ReactElement {
  const trpc = useTRPC();
  const draftConfig = useDraftConfig(draftKey);
  const messageAppearance = useMessageAppearance();
  const characters = useSuspenseQueries({
    queries: characterIds.map((characterId) => trpc.character.get.queryOptions({ characterId })),
  });
  const characterNamesById = buildCharacterNameMap(characters.map((c) => ({ id: c.data.id, name: c.data.name })));
  const personaNamesById = buildPersonaNameMap([]);

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
      <Text tone="muted">{label.length > 0 ? `Say hello to ${label} to begin the scene.` : "No messages yet."}</Text>
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
