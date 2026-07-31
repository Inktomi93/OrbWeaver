// The message-list surface: composes canon (`MessagesPage`) + roster (`chat.getChat`) via a plural
// `useSuspenseQueries` (parallel, avoids a request waterfall), gated on the ChatHandle discriminant so
// a draft never mounts the query. Merges canon + the streaming ghost into one id-keyed list and
// subscribes only to lifecycle (`useTurnPhase`) — token text stays inside the one ghost row, so a delta
// never re-renders the list. A draft has no committed chatId; `DraftGreetingThread` renders each
// founding character's greeting as a normal, editable `MessageRow` instead of an empty state.

import type { CharacterAvatarEntry, ChatMacroNameProducer, ContextFitPreview, PersonaAvatarEntry } from "@orb/contracts/chat";
import { buildCharacterAvatarMap, buildCharacterNameMap, buildPersonaAvatarMap, buildPersonaNameMap, lastVisibleAssistant } from "@orb/contracts/chat";
import { isRpgEngaged } from "@orb/contracts/rpg";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { Stack } from "@orb/ui/layout";
import type { MessageListHandle } from "@orb/ui/message-list";
import { MessageList } from "@orb/ui/message-list";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQueries } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef } from "react";
import type { ChatBusDeps } from "#data";
import { QueryBoundary, QueryErrorState, SkeletonRows, useChatBus, useTRPC } from "#data";
import type { ChatSurfaceContribution, ContributorRegistry, ToolRenderer } from "#lib";
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
import { lastUserRowIndex, messageItemKey, useMessageItems, useNewArrivalKeys } from "../hooks/use-message-items";
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
  readonly toolRenderers: ContributorRegistry<ToolRenderer>;
}

/** The scrolling chat transcript for one chat (or a draft's editable greeting preview). */
export function MessageListSurface({ handle, busDeps, draftSeed, onChatForked, surfaceContributors, toolRenderers }: MessageListSurfaceProps): ReactElement {
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
            <ChatThread
              chatId={chatId}
              chatStyle={chatStyle}
              onChatForked={onChatForked}
              surfaceContributors={surfaceContributors}
              toolRenderers={toolRenderers}
            />
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
  readonly toolRenderers: ContributorRegistry<ToolRenderer>;
}

/** The committed-chat transcript — suspends on the canon + roster reads, then merges the live ghost. */
function ChatThread({ chatId, chatStyle, onChatForked, surfaceContributors, toolRenderers }: ChatThreadProps): ReactElement {
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
  // The assistant-row portrait floor (same merge contract as macroNames): the chat-level roster avatars
  // UNION this page's message-stamped ids — the half that carries a REMOVED character's portrait.
  const characterAvatarEntries: readonly CharacterAvatarEntry[] = [...chatDetail.characterAvatars, ...messagesPage.characterAvatars];
  const characterAvatarsById = buildCharacterAvatarMap(characterAvatarEntries);
  const activePersonaId = resolveViewerActivePersonaId(chatDetail.participants);
  const viewerUserId = resolveViewerUserId(chatDetail.participants);
  // The §4.8 lenient-wrap verdict (parity-plus P4): a GAME chat with `features.immersiveHtml` on wraps
  // naked/```html model HTML into implicit cards. Cross-domain read rides `trpc.rpg.getGame` DIRECTLY
  // (lockdown §12 — the rpg panel shares this exact cache key), non-suspending: until it settles the
  // wrap stays off (literal text, today's behavior — never a blocking read for a non-game render path).
  // #40 — a DISENGAGED game (pointer engaged:false) reads like a non-game chat (one predicate home).
  const isGame = isRpgEngaged(chatDetail.rpg ?? null);
  const gameQuery = useQuery({ ...trpc.rpg.getGame.queryOptions({ chatId }), enabled: isGame });
  const lenientHtmlCards = isGame && gameQuery.data?.publicConfig.immersiveHtml === true;
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
    characterAvatarsById,
  });
  const items = useMessageItems(messages, chatId);
  // Only rows that genuinely arrived this render get an enter transition — a windowed row remounts on
  // every scrollback, so "mounted" != "new".
  const newArrivalKeys = useNewArrivalKeys(items, chatId);

  const live = isLiveTurnPhase(phase);

  // "am I at the tail" comes from real scroll geometry sampled at settle, not the seal's follow-intent
  // signal, which desyncs from position once virtual-core writes scrollTop during a re-measure.
  const listHandleRef = useRef<MessageListHandle>(null);

  // pin-prompt scroll mode (PD-147): on each NEW user message (a send), pin it to the viewport top and
  // let the reply stream below. The primitive owns the pin/spacer; the surface only names which row is the
  // prompt. The seed guard means opening a chat lands at the tail (no pin) — only a fresh send fires it.
  const pinMode = behaviorPrefs.streamScrollMode === "pin-prompt";
  // A pin is armed only for the live turn it was placed in — feed that to the pill so its spacer void
  // doesn't read as "scrolled away" (the newest content is on-screen, pinned + streaming).
  const jump = useJumpToLatest({ messagesCount: messages.length, live, pinActive: pinMode && live, listHandleRef });
  const pinnedPromptIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!pinMode) {
      pinnedPromptIdRef.current = undefined;
      return;
    }
    const idx = lastUserRowIndex(items);
    const row = idx >= 0 ? items[idx] : undefined;
    const promptId = row !== undefined && row.kind === "message" ? row.view.id : null;
    if (pinnedPromptIdRef.current === undefined || promptId === null || promptId === pinnedPromptIdRef.current) {
      pinnedPromptIdRef.current = promptId; // seed on mount / no new prompt → never pins
      return;
    }
    pinnedPromptIdRef.current = promptId;
    listHandleRef.current?.pinToIndex(idx);
  }, [pinMode, items]);
  // Which row carries the swipe controls: the newest real GENERATION. An rpg state anchor (the empty-body
  // snapshot key a host resync/hand-edit appends) is filtered out of the rendered list, so letting it answer
  // this stripped the arrows off the last visible reply entirely.
  const lastAssistantId = live ? undefined : lastVisibleAssistant(messages)?.id;
  // The transcript divider's PRESENT-TENSE source (PD-#7): previewContextFit runs the same fit the next real
  // turn would, so the line tracks preset/settings knob changes live (it's invalidated on canon-terminal bus
  // events + settings/preset changes via the central seam). Non-suspense so it never blocks the transcript;
  // until it resolves (or if it errors) the canon-stamp resolver — the per-generation provenance — is the
  // fallback. Paused during a live turn (the canon isn't settled; the ghost row carries no boundary).
  const previewFit = useQuery({ ...trpc.chat.previewContextFit.queryOptions({ chatId }), enabled: !live });
  // A RESOLVED preview is authoritative — a `null` boundary means "everything fits" (suppress the divider),
  // NOT "fall back". Only an unresolved/errored preview defers to the canon-stamp resolver.
  const contextBoundaryMessageId = previewFit.data !== undefined ? previewFit.data.boundaryMessageId : resolveContextBoundaryMessageId(messages);
  // The budget line the boundary divider carries once the preview resolves: "N of M used · R reserved" — or,
  // when the connected model's window is a fallback GUESS (`ceilingEstimated`, e.g. an unreachable catalog),
  // the used total with the window named unknown. Never a ratio against a fabricated denominator (D41).
  const contextBoundaryLabel = previewFit.data !== undefined ? contextFitLabel(previewFit.data) : undefined;
  // The memory fact: when a compactSummary covers the span above the boundary, the divider says the older
  // messages are compacted into memory + offers a peek at the summary text. Null ⇒ nothing above is compacted.
  const contextBoundaryCompactSummary = previewFit.data?.compactSummary ?? null;

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
        contextBoundaryLabel={contextBoundaryLabel}
        contextBoundaryCompactSummary={contextBoundaryCompactSummary}
        participants={participants}
        characterNamesById={characterNamesById}
        personaNamesById={personaNamesById}
        personaAvatarsById={personaAvatarsById}
        characterAvatarsById={characterAvatarsById}
        activePersonaId={activePersonaId}
        anchorPersonaId={chatDetail.anchorPersonaId}
        viewerUserId={viewerUserId}
        lenientHtmlCards={lenientHtmlCards}
        onChatForked={onChatForked}
        enterMotion={newArrivalKeys.has(item.view.id)}
        surfaceContributors={surfaceContributors}
        toolRenderers={toolRenderers}
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
        scrollMode={behaviorPrefs.streamScrollMode}
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
/** The context-boundary divider's budget line. A ratio is drawn ONLY against a real model window: when the
 *  window is a fallback guess (`ceilingEstimated`) the line reports the used total and names the window
 *  unknown, because "N of 200,000 used" against a number nobody published is a lie the divider would tell on
 *  every scroll (D41 no-silent-degrade). */
function contextFitLabel(fit: ContextFitPreview): string {
  const reserved = `${fit.reserveOutputTokens} reserved`;
  return fit.ceilingEstimated ? `${fit.usedTokens} used · window unknown · ${reserved}` : `${fit.usedTokens} of ${fit.ceilingTokens} used · ${reserved}`;
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
    const text = typeof shown === "string" ? shown : shown.text;
    return text.length === 0 ? [] : [{ character, row: synthGreetingRow(character.id, text, i) }];
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
          greeting={{ draftKey, characterId: character.id, variants: character.greetings.map((g) => (typeof g === "string" ? g : g.text)) }}
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
