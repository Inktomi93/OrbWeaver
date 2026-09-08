// The message-list surface: composes canon (`MessagesPage`) + roster (`chat.getChat`) via a plural
// `useSuspenseQueries` (parallel, avoids a request waterfall). Merges canon + the streaming ghost into one
// id-keyed list and subscribes only to lifecycle (`useTurnPhase`) — token text stays inside the one ghost
// row, so a delta never re-renders the list.
//
// ONE THREAD (chat-creation-draft-mode-replacement.md §4.1/§4.8, R1). There used to be a second one:
// `DraftGreetingThread` fabricated a `MessageView` per founding character (`synthGreetingRow`) because a
// pre-send room had no canon to read, and it carried its own macro producers — including a CLIENT MIRROR of
// the server's four-rung anchor-persona chain, fed by three extra queries, kept in lockstep by comment only.
// A chat row exists from the creation click, so the greeting rows are REAL canon from frame one and they
// render through the ONE committed thread over the ONE roster plane. The censused group-tint divergence (a
// draft row had no `participants` plane, so its per-speaker tints differed from the committed room's) is not
// fixed here — it is UNREACHABLE, which is the better outcome.

import type { ChatIdentity, ContextFitPreview, MessageKind } from "@orb/contracts/chat";
import { buildIdentityAvatarMaps, buildIdentityNameContext, identityKey } from "@orb/contracts/chat";
import { isRpgEngaged } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import { Stack } from "@orb/ui/layout";
import type { MessageListHandle, MessageListRowMeta } from "@orb/ui/message-list";
import { MessageList } from "@orb/ui/message-list";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQueries } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { QueryBoundary } from "#components";
import type { ChatBusDeps } from "#data";
import { QueryErrorState, SkeletonRows, useChatBus, useDisplayScripts, usePrefetchDisplayScripts, useTRPC } from "#data";
import type { ChatSurfaceContribution, ContributorRegistry, ToolRenderer } from "#lib";
import { RenderProfiler, resolveRowRenderPolicy, useFocusOnMount } from "#lib";
import { isLiveTurnPhase, useTurnPhase, useTurnSpeakerCharacterId } from "#state";
import { GhostMessageRow } from "../components/ghost-message-row.tsx";
import { JumpToLatestPill } from "../components/jump-to-latest-pill.tsx";
import { MessageRow } from "../components/message-row.tsx";
import { useChatBehaviorPrefs } from "../hooks/use-chat-behavior-prefs.ts";
import { useChatStyle } from "../hooks/use-chat-style.ts";
import { useGreetingAlternates } from "../hooks/use-greeting-alternates.ts";
import { useJumpToLatest } from "../hooks/use-jump-to-latest.ts";
import { useMessageAppearance } from "../hooks/use-message-appearance.ts";
import { lastUserRowIndex, messageItemKey, useMessageItems, useNewArrivalKeys } from "../hooks/use-message-items.ts";
import { resolveRowAttribution } from "../lib/attribution.ts";
import { CHAT_TRACK } from "../lib/chat-track.ts";
import { resolveContextBoundaryMessageId } from "../lib/context-boundary.ts";
import { isGreetingWindowOpen, resolveGreetingBinding } from "../lib/greeting-window.ts";
import { BG_PHOTO_ERROR_PLATE, BG_PHOTO_LOADING_PLATE } from "../lib/message-row-backing.ts";
import type { MESSAGE_ROW_SKINS } from "../lib/message-row-variants.ts";
import { buildParticipantsById } from "../lib/roster.ts";

/** Initial row-height model. A flat 96px guess made a 3k-character RPG turn look like a one-line bubble,
 *  so the bottom-anchored virtualizer mounted and parsed too many multi-KB rows before measurement caught up.
 *
 *  THE COEFFICIENT IS CALIBRATED, NOT CHOSEN (#1181). A row's settled height is genuinely UNKNOWABLE before
 *  layout — it depends on wrapping, markdown structure, code blocks and inline media, and measured across 16
 *  rows in 5 rooms this model over-estimates 6 of them and under-estimates 10. That residual error is
 *  irreducible and is NOT the defect. The defect was that the error had a SIGN: at 0.24px/char the model came
 *  in 16% low in aggregate (7077px predicted against 8216px measured), and in a BOTTOM-ANCHORED list a
 *  one-directional bias is exactly what turns unavoidable per-row error into one visible downward settle —
 *  `[cls] 0.1131 · [data-slot=message-list-row] moved 0px,112px · observed 0.1355 OVER BUDGET` on room entry.
 *  The same sample puts the real slope at 0.283px/char over prose rows. 0.28 takes the aggregate bias to
 *  roughly zero, which leaves the residual TWO-DIRECTIONAL so it cancels instead of accumulating.
 *  Over-estimating is also the safe side of this file's own original hazard: a taller guess mounts FEWER rows
 *  before measurement catches up, never more. Attributed against the two alternatives first and ruled out by
 *  measurement, not by argument: `document.fonts.status` was `loaded` and every in-row image `complete` at the
 *  moment of the settle, so neither font swap nor image decode moves these rows.
 *
 *  The number is a CALIBRATION against a corpus, so it is pinned by a test that re-derives the bias rather
 *  than by asserting the literal — see `tests/client/features/chat/surfaces/message-list-surface.ct.tsx`. */
const ESTIMATED_ROW_BASE_PX = 96;
const ESTIMATED_ROW_PX_PER_CHARACTER = 0.28;
const ESTIMATED_ROW_MAX_PX = 1200;
const CHAT_TRANSCRIPT_PROFILER_ID = "chat:transcript";

function estimateMessageRow(item: { readonly kind: "message" | "ghost"; readonly view?: { readonly content: string } }): number {
  if (item.kind === "ghost" || item.view === undefined) {
    return ESTIMATED_ROW_BASE_PX;
  }
  return Math.min(ESTIMATED_ROW_MAX_PX, ESTIMATED_ROW_BASE_PX + item.view.content.length * ESTIMATED_ROW_PX_PER_CHARACTER);
}

export interface MessageListSurfaceProps {
  readonly chatId: ChatId;
  readonly busDeps: ChatBusDeps;
  readonly onChatForked?: ((chatId: ChatId) => void) | undefined;
  readonly surfaceContributors: ContributorRegistry<ChatSurfaceContribution>;
  readonly toolRenderers: ContributorRegistry<ToolRenderer>;
}

/** The scrolling chat transcript for one chat. */
export function MessageListSurface({ chatId, busDeps, onChatForked, surfaceContributors, toolRenderers }: MessageListSurfaceProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  useChatBus(chatId, busDeps);
  // OUTSIDE the boundary on purpose (#514): the display-tier regex reads are needed by the rows INSIDE it,
  // but feed nothing it waits for — so they leave now, with the canon + roster reads, instead of after them.
  // The read itself still happens where it belongs, in `ChatThread` (see `use-display-scripts.ts`'s header).
  usePrefetchDisplayScripts(chatId);
  const chatStyle = useChatStyle();

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="h-full min-h-0 w-full outline-none">
      <QueryBoundary
        // THE LOADING STATE IS PART OF THE COLUMN, NOT A BARE FALLBACK (#468). It takes the transcript's
        // own TRACK (`CHAT_TRACK` — the room's one answer to "where is the middle", #213) so the three
        // placeholder rows stand exactly where the rows they stand in for will, and it takes the
        // wallpaper-gated reading plate so it is still an OBJECT over a room's art instead of three faint
        // bands on a photo. The timing was never the defect: #454's rAF sampler proves the skeleton paints
        // on the first room frame of a Resume; it was invisible, so Resume — the most-pressed action in the
        // app — read as an empty room for ~400ms. Both classes are inert on a plain background.
        fallback={
          <Stack className={`${CHAT_TRACK} ${BG_PHOTO_LOADING_PLATE}`} data-slot="transcript-loading">
            <SkeletonRows count={3} />
          </Stack>
        }
        // THE ERROR STATE IS PART OF THE COLUMN TOO (#681) — the same argument as the fallback directly
        // above, for the state on the other side of the same read. It took the transcript's TRACK and a
        // surface of its own; over art it had neither, so the muted "Couldn't load…" line and its Retry
        // drew onto the wallpaper at 1.50:1 / 1.57:1. The backing is the OPAQUE `card` member rather than
        // the loading sibling's translucent plate because this state carries real MUTED-tone text and a
        // control, and `muted-foreground` is floored against `card` (BG_PHOTO_ERROR_PLATE states the ink
        // routing in full). Both classes are inert on a plain background.
        // It hands the battery its SURFACE rather than wrapping it: `render-error-via-battery` REDs an arm
        // that does not render `QueryErrorState` directly (proven — the wrapper this replaced tripped it),
        // and that gate is right, so the plate rides the component's own `className`.
        renderError={(_error, retry): ReactElement => (
          <QueryErrorState className={`${CHAT_TRACK} ${BG_PHOTO_ERROR_PLATE}`} label="this conversation" onRetry={retry} />
        )}
      >
        {/* The parent content region owns the console warning; this nested profiler only attributes its cost. */}
        <RenderProfiler id={CHAT_TRANSCRIPT_PROFILER_ID} warn={false}>
          <ChatThread
            chatId={chatId}
            chatStyle={chatStyle}
            onChatForked={onChatForked}
            surfaceContributors={surfaceContributors}
            toolRenderers={toolRenderers}
          />
        </RenderProfiler>
      </QueryBoundary>
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
  // Merge the two CHAT IDENTITY wire halves (D137: the chat-level participant floor ∪ this page's own stamped
  // ids — the half that carries a REMOVED character's portrait / a since-switched persona), last-write-wins on
  // `identityKey` (the page's fresher entry wins). Both projections derive from the ONE merged identity set.
  const identityByKey = new Map<string, ChatIdentity>([...chatDetail.identities, ...messagesPage.identities].map((e) => [identityKey(e), e]));
  const identities = [...identityByKey.values()];
  const { characterNamesById, personaNamesById } = buildIdentityNameContext(identities);
  const { characterAvatarsById, personaAvatarsById } = buildIdentityAvatarMaps(identities);
  // Server-resolved from the principal (ChatDetail's own header: "so the client never has to
  // find-and-match its own userId in participants"). The roster-scan proxies these replaced returned the
  // FIRST PRESENT HUMAN — the host in any group room — so every viewer saw the host's identity as their
  // own, and a member's null-persona rows rendered under the HOST's name (live 2026-08-03).
  const activePersonaId = chatDetail.viewerActivePersonaId;
  const viewerUserId = chatDetail.viewerUserId;
  // The §4.8 lenient-wrap verdict (parity-plus P4): a GAME chat with `features.immersiveHtml` on wraps
  // naked/```html model HTML into implicit cards. Cross-domain read rides `trpc.rpg.getGame` DIRECTLY
  // (lockdown §12 — the rpg panel shares this exact cache key), non-suspending: until it settles the
  // wrap stays off (literal text, today's behavior — never a blocking read for a non-game render path).
  // #40 — a DISENGAGED game (pointer engaged:false) reads like a non-game chat (one predicate home).
  const isGame = isRpgEngaged(chatDetail.rpg ?? null);
  const gameQuery = useQuery({ ...trpc.rpg.getGame.queryOptions({ chatId }), enabled: isGame });
  const lenientHtmlCards = isGame && gameQuery.data?.publicConfig.immersiveHtml === true;
  const messageAppearance = useMessageAppearance();
  const displayScripts = useDisplayScripts(chatId);
  const behaviorPrefs = useChatBehaviorPrefs();
  const phase = useTurnPhase(chatId);
  // The live turn's voiced speaker, resolved through the SAME resolveRowAttribution the settled row
  // uses, so the ghost's immersive decoration matches what the canonical row will show once it settles.
  const ghostSpeakerCharacterId = useTurnSpeakerCharacterId(chatId);
  // THE ONE PLACE THE ROOM DIAL IS STILL THE HONEST SOURCE (D129): the GHOST is an in-flight turn with no
  // committed row, so there is no declared kind to read — the kind this round WILL be born with is exactly
  // what the dial says. Every settled row reads its own `message.kind` instead. The ghost must resolve
  // through the SAME narrator branch the settled row will, or the streaming row labels "Group" for the
  // length of the turn and then swaps to "Narrator" when it commits.
  const ghostKind: MessageKind = chatDetail.group.output === "narrator" ? "narrator" : "standard";
  const ghostAttribution = resolveRowAttribution({
    role: "assistant",
    characterId: ghostSpeakerCharacterId,
    personaId: null,
    participants,
    characterNamesById,
    characterAvatarsById,
    kind: ghostKind,
  });
  // The ghost's CARD TIER, resolved through the ONE trust authority with the SAME inputs `MessageRow` will
  // use once this turn settles — so a card that mounts mid-stream (at its fence CLOSE, §4.5) does not change
  // tier at commit. Only the tier crosses: the ghost pins its markdown trust, external-media verdict and
  // frame delivery at the stream floor (`ghost-message-row.tsx`'s header states why). `authorUserId: null`
  // is the assistant arm — a generation is never the viewer's own input.
  const ghostCardTier = resolveRowRenderPolicy({
    role: "assistant",
    authorUserId: null,
    characterId: ghostSpeakerCharacterId,
    viewerUserId,
    participants,
    lenientHtmlCards,
  }).cardTier;
  // THE GREETING WINDOW (§4.8/F6, R3) — resolved HERE, once, from canon this surface already holds plus the
  // roster it already read: a room with no user row is still steppable, and the seated characters' cards say
  // what the alternates are. Per-row it is a map lookup (`resolveGreetingBinding`), so the N card reads are N
  // per ROOM, not per row — and they are gated to the window, so a settled chat makes none at all.
  const greetingWindowOpen = isGreetingWindowOpen(messages);
  const seatedCharacterIds = [...participants.keys()];
  const greetingAlternates = useGreetingAlternates(seatedCharacterIds, greetingWindowOpen);
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
  // Which row carries the swipe controls: the newest assistant row. Every one of them is a real GENERATION
  // now — D124 retired the rpg state-anchor slot, an empty-body assistant row that was filtered out of the
  // rendered list yet still answered this question, stripping the arrows off the last visible reply.
  const lastAssistantId = live ? undefined : messages.findLast((row) => row.role === "assistant")?.id;
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
  // The compaction fact: when a compactSummary covers the span above the boundary, the divider says the older
  // messages are compacted into a summary + offers a peek at that text. Null ⇒ nothing above is compacted.
  // (The noun is COMPACTION, not memory — this is `chats.compactSummary`, not the Memory plane.)
  const contextBoundaryCompactSummary = previewFit.data?.compactSummary ?? null;

  // `meta.exceedsViewport` is the virtualizer's OWN measurement of this row against the scrollport — the
  // only honest answer to "is this turn taller than the reader's screen", which is what decides whether
  // the speaker attribution has to be sticky (#113). A content-length proxy would be wrong for exactly the
  // rows that matter (a short body carrying three cards is multi-viewport; a long one-liner is not).
  const renderItem = (item: (typeof items)[number], _index: number, meta: MessageListRowMeta): ReactNode =>
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
        colorQuotedSpeech={messageAppearance.colorQuotedSpeech}
        cardTier={ghostCardTier}
        smoothStream={behaviorPrefs.smoothStream}
        smoothStreamCps={behaviorPrefs.smoothStreamCps}
        reasoningAutoCollapse={behaviorPrefs.reasoningAutoCollapse}
        enterMotion={newArrivalKeys.has(item.id)}
        // #116 — the SAME measured verdict the settled row takes. The live turn is the row that exceeds the
        // scrollport most often (it grows past it while streaming), so this is where the pin earns most.
        stickyAttribution={meta.exceedsViewport}
      />
    ) : (
      <MessageRow
        message={item.view}
        chatStyle={chatStyle}
        stickyAttribution={meta.exceedsViewport}
        {...((): { readonly greeting?: ReturnType<typeof resolveGreetingBinding> } => {
          // exactOptionalPropertyTypes: a non-greeting row must OMIT the prop, never pass explicit-undefined.
          const greeting = resolveGreetingBinding({ windowOpen: greetingWindowOpen, message: item.view, alternatesByCharacter: greetingAlternates });
          return greeting === undefined ? {} : { greeting };
        })()}
        avatarSize={messageAppearance.avatarSize}
        avatarShape={messageAppearance.avatarShape}
        avatarAspect={messageAppearance.avatarAspect}
        avatarRing={messageAppearance.avatarRing}
        showInChatAvatars={messageAppearance.showInChatAvatars}
        autoFixMarkdown={messageAppearance.autoFixMarkdown}
        displayScripts={displayScripts}
        colorQuotedSpeech={messageAppearance.colorQuotedSpeech}
        showLLMReasoningIcon={messageAppearance.showLLMReasoningIcon}
        metadataVisibility={messageAppearance.metadataVisibility}
        viewerIsHost={chatDetail.viewerIsHost === true}
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
        ariaLabel="Conversation messages"
        items={items}
        getItemKey={messageItemKey}
        estimateSize={(index): number => estimateMessageRow(items[index] ?? { kind: "ghost" })}
        renderItem={renderItem}
        // #107: the transcript is UNBOUNDED, so its rows must not each contribute their action cluster to
        // the document tab order — measured, a keyboard reader paid ~7 Tabs per message and 32 of them
        // never reached the composer. One tab stop enters the log; arrows walk the rows.
        rowNavigation="roving"
        scrollContainerRef={jump.scrollContainerRef}
        scrollMode={behaviorPrefs.streamScrollMode}
        gapToken="block"
        // Block breathing rides the virtualizer's OWN padding (never CSS `py-*` on the scroll
        // container): sticky `top: 0` resolves against the scroller's content box, so container padding
        // pinned the sticky name band 12px below the visible top with a guillotined strip of prose
        // permanently above it (#204). The first/last rows still breathe off the topbar/composer edges.
        blockPaddingToken="block"
        className="h-full"
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

/** The empty-transcript state — a room whose opening policy seeded nothing, before its first turn. */
function EmptyThread(): ReactElement {
  return (
    <Stack align="center" justify="center" padding="section" className="h-full">
      {/* An empty state stays READABLE PROSE — the prose default, not a muted gloss (density S3 ruling):
          the one line standing in for a whole transcript is the last thing that should recede. */}
      <Text>No messages yet.</Text>
    </Stack>
  );
}
