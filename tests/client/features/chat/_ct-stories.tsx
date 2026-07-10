// Chat message-list CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module).
// The surface/anchor come through the feature front door; the leaf components come via relative path
// into the package (stories legitimately compose feature INTERNALS the front door doesn't re-export).
// Fixtures are plain `MessageView`/`ChatBusEvent` literals (the support/factories are DB-row builders
// for a different layer). Data-layer stories wrap in <CtDataProviders> (Query + real tRPC over the
// stubbed network); pure-render stories rely on the beforeMount toast/tooltip chrome.

import type { ChatBusDeps } from "@orb/client/data";
import { createInvalidation, useTRPC } from "@orb/client/data";
import type { GoToSection } from "@orb/client/features/chat";
import {
  ChatContextPanel,
  ChatLandingSurface,
  ChatListAnchor,
  ChatListSurface,
  ChatRoomSurface,
  CommandPaletteSurface,
  Composer,
  DraftContextPanel,
  MessageListSurface,
  MessageThreadAnchor,
  NewChatPicker,
} from "@orb/client/features/chat";
import type { MessageRenderContext } from "@orb/client/lib";
import type { ActiveChatHandle, ChatHandle } from "@orb/client/state";
import {
  cancelEditingMessage,
  chatStream,
  committedChat,
  draftChat,
  startEditingMessage,
  useTurnPhase,
} from "@orb/client/state";
import type {
  CharacterNameEntry,
  MessageView,
  ParticipantView,
  PersonaNameEntry,
} from "@orb/contracts/chat";
import {
  buildCharacterNameMap,
  buildPersonaNameMap,
  DEFAULT_GROUP_CONFIG,
} from "@orb/contracts/chat";
import type { CharacterId, ChatId, MessageId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import type { THEME_SCOPE_CHAT_STYLES } from "@orb/ui/theme-scope";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { ChatCastBar } from "../../../../packages/client/src/features/chat/components/chat-cast-bar";
import { ChatOptionsMenu } from "../../../../packages/client/src/features/chat/components/chat-options-menu";
import { GhostMessageRow } from "../../../../packages/client/src/features/chat/components/ghost-message-row";
import { GroupConfigForm } from "../../../../packages/client/src/features/chat/components/group-config-form";
import { MessageActionsRow } from "../../../../packages/client/src/features/chat/components/message-actions-row";
import { MessageContent } from "../../../../packages/client/src/features/chat/components/message-content";
import { MessageEditTextarea } from "../../../../packages/client/src/features/chat/components/message-edit-textarea";
import { MessageRow } from "../../../../packages/client/src/features/chat/components/message-row";
import { ReasoningBlock } from "../../../../packages/client/src/features/chat/components/reasoning-block";
import type { RosterMember } from "../../../../packages/client/src/features/chat/components/roster-panel";
import { RosterPanel } from "../../../../packages/client/src/features/chat/components/roster-panel";
import { SpeakAsSelect } from "../../../../packages/client/src/features/chat/components/speak-as-select";
import { SwipeStrip } from "../../../../packages/client/src/features/chat/components/swipe-strip";
import { CtDataProviders } from "../../../support/ct/ct-data-providers";
import { CHAT_ID, COMPOSER_CHAT_ID, makeMessageView } from "./fixtures";

// ── Pure-render stories (no data layer) ─────────────────────────────────────────────────────────

/** A persona macro-name producer entry, keyed inline — the CT-serializable shape (a `Map` prop does
 *  NOT survive the Playwright CT mount boundary: props cross a serialization wire, and `Map`/`Set`
 *  instances arrive empty on the other side with no error. Plain arrays of plain objects are the safe
 *  shape; the `ReadonlyMap`s the row actually needs are built HERE, inside the story component that
 *  executes post-mount in the real browser context — never at the `.ct.tsx` call site — via the REAL
 *  `@orb/contracts/chat` producer builders, so a story feeds `MessageRow` exactly the shape the
 *  production surface would). */
export interface PersonaNameStoryEntry {
  readonly id: PersonaId;
  readonly name: string;
  readonly description?: string;
}

export interface MessageRowStoryProps {
  readonly chatStyle: (typeof THEME_SCOPE_CHAT_STYLES)[number];
  // Named `messageRole` (not `role`) so the JSX prop at the CT call site isn't read as an ARIA role.
  readonly messageRole?: MessageRole;
  readonly content?: string;
  /** #21 attribution — the row's server-stamped speaker (assistant) / historical author (user). */
  readonly characterId?: CharacterId | null;
  readonly personaId?: PersonaId | null;
  /** CT-serializable roster (arrays, not `Map`s, cross the wire). */
  readonly participants?: readonly ParticipantView[];
  /** CT-serializable macro-name producer entries (see `PersonaNameStoryEntry`). */
  readonly personas?: readonly PersonaNameStoryEntry[];
  readonly activePersonaId?: PersonaId | null;
  /** #31 appearance — the attribution-avatar chrome knobs (default to the schema defaults). */
  readonly avatarSize?: "sm" | "md" | "lg";
  readonly avatarShape?: "round" | "square" | "rounded";
  /** §B.3 avatar versatility. */
  readonly avatarAspect?: "square" | "portrait";
  readonly avatarRing?: "none" | "accent";
  readonly showInChatAvatars?: boolean;
}

/** One row in a chosen chatStyle — the variant-mechanism CT mounts this three times; also the
 *  #21 attribution-chrome CT's mount point (roster/producer maps are optional pass-throughs). */
export function MessageRowStory({
  chatStyle,
  messageRole = "assistant",
  content = "**Bold** and _italic_",
  characterId = null,
  personaId = null,
  participants,
  personas,
  activePersonaId,
  avatarSize,
  avatarShape,
  avatarAspect,
  avatarRing,
  showInChatAvatars,
}: MessageRowStoryProps): ReactElement {
  const participantsMap =
    participants === undefined
      ? undefined
      : new Map(
          participants
            .filter(
              (p): p is ParticipantView & { characterId: CharacterId } => p.characterId !== null,
            )
            .map((p) => [p.characterId, p] as const),
        );
  // The story's own producer, built with the REAL contracts builders (never a hand-rolled Map) so
  // `MessageRow` sees exactly the shape `message-list-surface.tsx` would merge from the wire.
  const characterNameEntries: CharacterNameEntry[] = (participants ?? [])
    .filter((p): p is ParticipantView & { characterId: CharacterId } => p.characterId !== null)
    .map((p) => ({ id: p.characterId, name: p.displayName }));
  const personaNameEntries: PersonaNameEntry[] = (personas ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description ?? "",
  }));
  const characterNamesById = buildCharacterNameMap(characterNameEntries);
  const personaNamesById = buildPersonaNameMap(personaNameEntries);

  return (
    // The row now always renders <MessageActionsRow> (Edit/Hide/Delete/Fork/Copy), which reads the
    // data layer (`useTRPC`) even though these CTs never click a mutating action — the provider must
    // exist regardless (the swipe-strip.tsx precedent: any tRPC-reading leaf needs CtDataProviders).
    <CtDataProviders>
      <MessageThreadAnchor>
        <MessageRow
          message={makeMessageView({ role: messageRole, content, characterId, personaId })}
          chatStyle={chatStyle}
          avatarSize={avatarSize}
          avatarShape={avatarShape}
          avatarAspect={avatarAspect}
          avatarRing={avatarRing}
          showInChatAvatars={showInChatAvatars}
          participants={participantsMap}
          characterNamesById={characterNamesById}
          personaNamesById={personaNamesById}
          activePersonaId={activePersonaId}
        />
      </MessageThreadAnchor>
    </CtDataProviders>
  );
}

export interface MessageActionsRowStoryProps {
  readonly message?: MessageView;
}

/** The actions row in isolation — Edit/Hide/Delete/Fork/Copy, gated per role (message-actions-row.tsx).
 *  Wrapped in a `.group` host (the reveal hook the real `message-row` provides, UIP-305): the cluster
 *  rests hidden (opacity-0 / pointer-events-none) and reveals on hover/focus-within — the CT hovers the
 *  host before interacting. */
export function MessageActionsRowStory({
  message,
}: MessageActionsRowStoryProps = {}): ReactElement {
  return (
    <CtDataProviders>
      <div className="group" data-testid="actions-host">
        <MessageActionsRow message={message ?? makeMessageView()} />
      </div>
    </CtDataProviders>
  );
}

interface MessageEditTextareaStoryInnerProps {
  readonly message: MessageView;
}

/** Drives the external edit-draft store (PD-119) so the textarea mounts already "in edit mode" —
 *  the same store `<MessageActionsRow>`'s Edit button flips in the real row. */
function MessageEditTextareaStoryInner({
  message,
}: MessageEditTextareaStoryInnerProps): ReactElement {
  useEffect(() => {
    startEditingMessage(message.id, message.content);
    return (): void => cancelEditingMessage(message.id);
  }, [message.id, message.content]);
  return <MessageEditTextarea message={message} />;
}

export interface MessageEditTextareaStoryProps {
  readonly message?: MessageView;
}

/** The edit-in-place textarea in isolation, pre-seeded into edit mode via the real draft store. */
export function MessageEditTextareaStory({
  message,
}: MessageEditTextareaStoryProps = {}): ReactElement {
  return (
    <CtDataProviders>
      <MessageEditTextareaStoryInner
        message={message ?? makeMessageView({ content: "Hello there" })}
      />
    </CtDataProviders>
  );
}

export interface MessageContentSpansStoryProps {
  readonly content: string;
  /** Opt into the macro DISPLAY pass (`renderMessageForDisplay`) with these two names — omitted
   *  (both undefined, the default) mounts with NO `renderContext` at all, pinning the byte-identical
   *  no-op default every other story here relies on. */
  readonly characterName?: string;
  readonly userName?: string;
  /** The render trust tier to mount at (D44 §12.0) — defaults `trusted` to preserve the pre-#25 stories.
   *  The guardrail tests mount `untrusted` to prove `<speaker>` coloring survives + Mermaid is withheld. */
  readonly trust?: "trusted" | "untrusted";
  /** External-media gate for the mount (defaults `false` = gated, the safe floor). */
  readonly allowExternal?: boolean;
}

/** The bare `<MessageContent>` — mounts the #21 `<speaker>`-span split + per-span `<ThemeScope>`
 *  in isolation, without the row's attribution chrome. Also the macro-resolution CT's mount point
 *  (`characterName`/`userName` build a minimal `renderContext` when supplied — as the `speakerCharName`/
 *  `fallbackPersonaName` DEFAULTS, with empty producer maps, matching a chat with no roster wired). */
export function MessageContentSpansStory({
  content,
  characterName,
  userName,
  trust = "trusted",
  allowExternal = false,
}: MessageContentSpansStoryProps): ReactElement {
  const renderContext: MessageRenderContext | undefined =
    characterName === undefined && userName === undefined
      ? undefined
      : {
          characterNamesById: buildCharacterNameMap([]),
          personaNamesById: buildPersonaNameMap([]),
          ...(characterName === undefined ? {} : { speakerCharName: characterName }),
          ...(userName === undefined ? {} : { fallbackPersonaName: userName }),
        };
  return (
    <MessageContent
      content={content}
      render={{ trust, allowExternal }}
      renderContext={renderContext}
    />
  );
}

function GhostRowInner(): ReactElement {
  const phase = useTurnPhase(CHAT_ID);
  return (
    <div>
      <div data-testid="phase">{phase}</div>
      <GhostMessageRow chatId={CHAT_ID} chatStyle="bubble" streaming={phase === "streaming"} />
    </div>
  );
}

/** The ghost row + store-driving controls: proves the token subscription lives in the ghost alone
 *  while the lifecycle-only `phase` read stays stable across tokens (ghost isolation). */
export function GhostRowStory(): ReactElement {
  return (
    // A bounded width so the shimmer's w-full skeleton bars have real size (a bare shrink-to-fit box
    // collapses them to zero width → "hidden"); real rows get width from the message-list.
    <div style={{ width: 360 }}>
      <GhostRowInner />
      <button
        type="button"
        data-testid="begin"
        onClick={(): void => {
          chatStream.beginTurn(CHAT_ID, {
            intent: "send",
            speakerCharacterId: null,
            targetMessageId: null,
          });
        }}
      >
        begin
      </button>
      <button
        type="button"
        data-testid="token"
        onClick={(): void => {
          chatStream.appendDelta({ chatId: CHAT_ID, kind: "text", text: "Hi " });
        }}
      >
        token
      </button>
      <button
        type="button"
        data-testid="complete"
        onClick={(): void => {
          chatStream.completeTurn(CHAT_ID, castId<MessageId>("msg_ct_done"));
        }}
      >
        complete
      </button>
    </div>
  );
}

export interface ReasoningBlockStoryProps {
  readonly reasoning: string;
  readonly thinking: boolean;
}

/** The bare `<ReasoningBlock>` — a pure-render leaf (no chat-store dependency), so the CT test drives
 *  its TTFT/auto-collapse/toggle behavior by mounting with props and re-`update()`-ing them, exactly
 *  like `crossfade-image.ct.tsx` drives a prop transition. */
export function ReasoningBlockStory({
  reasoning,
  thinking,
}: ReasoningBlockStoryProps): ReactElement {
  return (
    <div style={{ width: 360 }}>
      <ReasoningBlock reasoning={reasoning} thinking={thinking} />
    </div>
  );
}

const SCRIPTED_CHAT_ID = castId<ChatId>("chat_ct_ghost_scripted");

export interface GhostRowScriptedStoryProps {
  /** The exact sequence of raw TEXT deltas to append, one per `next-chunk` click — lets a CT test
   *  assemble a precise streaming sequence (an unterminated code fence, a torn `<speaker` tag, …) and
   *  assert the render after each step (UI-Gates §11.6 golden checkpoint). */
  readonly chunks: readonly string[];
}

/** The ghost row driven by an explicit, test-controlled SCRIPT of raw text chunks (rather than the
 *  fixed "Hi " token `GhostRowStory` uses). */
export function GhostRowScriptedStory({ chunks }: GhostRowScriptedStoryProps): ReactElement {
  const [next, setNext] = useState(0);
  return (
    <div style={{ width: 360 }}>
      <GhostMessageRow
        chatId={SCRIPTED_CHAT_ID}
        chatStyle="bubble"
        streaming={useTurnPhase(SCRIPTED_CHAT_ID) === "streaming"}
      />
      <button
        type="button"
        data-testid="begin"
        onClick={(): void => {
          chatStream.beginTurn(SCRIPTED_CHAT_ID, {
            intent: "send",
            speakerCharacterId: null,
            targetMessageId: null,
          });
        }}
      >
        begin
      </button>
      <button
        type="button"
        data-testid="next-chunk"
        onClick={(): void => {
          const chunk = chunks[next];
          if (chunk !== undefined) {
            chatStream.appendDelta({ chatId: SCRIPTED_CHAT_ID, kind: "text", text: chunk });
            setNext((n) => n + 1);
          }
        }}
      >
        next chunk
      </button>
    </div>
  );
}

export interface SwipeStripStoryProps {
  /** @defaultValue a 3-variant assistant message, selection sitting on the middle (2nd) variant. */
  readonly message?: MessageView;
}

/** The swipe strip, addressing a caller-supplied (or default 3-variant) assistant message — a CT test
 *  drives step-back/step-forward-to-existing by `update()`-ing this with a DIFFERENT `message` prop
 *  across renders (the `reasoning-block.ct.tsx` prop-transition pattern), which lets
 *  `useVariantHistory`'s per-mount memory accumulate exactly like a live session would. */
export function SwipeStripStory({ message }: SwipeStripStoryProps = {}): ReactElement {
  return (
    <CtDataProviders>
      <SwipeStrip
        message={message ?? makeMessageView({ variantCount: 3, selectedVariantIdx: 1 })}
      />
    </CtDataProviders>
  );
}

// ── Surface story (data layer + live stream) ────────────────────────────────────────────────────

interface SurfaceHarnessProps {
  readonly committed: boolean;
}

function SurfaceHarness({ committed }: SurfaceHarnessProps): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const busDeps: ChatBusDeps = {
    stream: chatStream,
    invalidate: createInvalidation({ queryClient, trpc }).invalidate,
  };
  const handle = committed ? committedChat(CHAT_ID) : draftChat("draft_ct");
  return (
    <div style={{ height: 480 }}>
      <MessageThreadAnchor>
        <MessageListSurface handle={handle} busDeps={busDeps} />
      </MessageThreadAnchor>
    </div>
  );
}

export interface MessageListSurfaceStoryProps {
  readonly committed?: boolean;
}

/** The keystone surface in a bounded box (so the message-list seal has a real scroll window). */
export function MessageListSurfaceStory({
  committed = true,
}: MessageListSurfaceStoryProps): ReactElement {
  return (
    <CtDataProviders>
      <SurfaceHarness committed={committed} />
    </CtDataProviders>
  );
}

/** Bug-1 (first-turn streaming race) harness: mounts a DRAFT surface (no subscription), and a
 *  `commit-draft` button flips the handle draft→committed WITHIN this one mount — exactly the
 *  transition `useChatBus` seeds a replay cursor for. The CT asserts the subscription then carries
 *  `lastEventId:"0"` and the scripted head deltas animate the ghost. */
function ReplaySeedHarness(): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const busDeps: ChatBusDeps = {
    stream: chatStream,
    invalidate: createInvalidation({ queryClient, trpc }).invalidate,
  };
  const [committed, setCommitted] = useState(false);
  const handle: ChatHandle = committed ? committedChat(CHAT_ID) : draftChat("draft_ct_replay");
  return (
    <div style={{ height: 480 }}>
      <MessageThreadAnchor>
        <MessageListSurface handle={handle} busDeps={busDeps} />
      </MessageThreadAnchor>
      <button type="button" data-testid="commit-draft" onClick={(): void => setCommitted(true)}>
        commit
      </button>
    </div>
  );
}

/** The Bug-1 replay-seed harness (draft→committed within one mount). */
export function MessageListReplaySeedStory(): ReactElement {
  return (
    <CtDataProviders>
      <ReplaySeedHarness />
    </CtDataProviders>
  );
}

/** Bug-2 (Stop flashes the reply away) harness: a committed surface + a `mark-stopping` button that
 *  drives the slot streaming→stopping (client-only `markStopping`, no bus event) so the CT can assert
 *  the ghost row stays mounted and keeps its accumulated text through `stopping`. */
function StoppingHarness(): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const busDeps: ChatBusDeps = {
    stream: chatStream,
    invalidate: createInvalidation({ queryClient, trpc }).invalidate,
  };
  return (
    <div style={{ height: 480 }}>
      <MessageThreadAnchor>
        <MessageListSurface handle={committedChat(CHAT_ID)} busDeps={busDeps} />
      </MessageThreadAnchor>
      <button
        type="button"
        data-testid="mark-stopping"
        onClick={(): void => chatStream.markStopping(CHAT_ID)}
      >
        stop
      </button>
    </div>
  );
}

/** The Bug-2 stopping harness (a committed surface with a markStopping driver). */
export function MessageListStoppingStory(): ReactElement {
  return (
    <CtDataProviders>
      <StoppingHarness />
    </CtDataProviders>
  );
}

// ── Composer story (data layer + turn-lifecycle drivers) ───────────────────────────────────────────

export interface ComposerStoryProps {
  /** @defaultValue true — a committed chat (`COMPOSER_CHAT_ID`); `false` mounts a draft handle. */
  readonly committed?: boolean;
}

function ComposerStoryInner({ committed = true }: ComposerStoryProps): ReactElement {
  const [value, setValue] = useState("");
  const [startedChatId, setStartedChatId] = useState<ChatId | null>(
    committed ? COMPOSER_CHAT_ID : null,
  );
  const handle: ChatHandle =
    startedChatId !== null ? committedChat(startedChatId) : draftChat("draft_ct_composer");

  return (
    <div>
      <Composer
        handle={handle}
        value={value}
        onChange={setValue}
        onCommitted={(id): void => setStartedChatId(id)}
      />
      {/* Turn-lifecycle drivers (mirrors GhostRowStory above) — the CT clicks these to move
          `chatStream`'s slot through pending/streaming/stopping/aborted without a real SSE round-trip
          (Stop's immediate-feedback half is client-only; only the eventual close needs the bus). */}
      <button
        type="button"
        data-testid="drive-begin"
        onClick={(): void => {
          chatStream.beginTurn(COMPOSER_CHAT_ID, {
            intent: "send",
            speakerCharacterId: null,
            targetMessageId: null,
          });
        }}
      >
        begin
      </button>
      <button
        type="button"
        data-testid="drive-delta"
        onClick={(): void => {
          chatStream.appendDelta({ chatId: COMPOSER_CHAT_ID, kind: "text", text: "Hi" });
        }}
      >
        token
      </button>
      <button
        type="button"
        data-testid="drive-abort"
        onClick={(): void => {
          chatStream.abortTurn(COMPOSER_CHAT_ID, "user");
        }}
      >
        abort
      </button>
      {/* The clear-on-commit signal (UI-Gates §11.1): simulates the bus observing the caller's OWN
          user-row `messageCommitted` — the composer's send-hook subscribes to this and clears the draft
          HERE (never optimistically on submit). In production `applyChatBusEvent` fires it; the CT drives
          it directly, the same way the turn-lifecycle buttons above stand in for the SSE bus. */}
      <button
        type="button"
        data-testid="drive-message-committed"
        onClick={(): void => {
          chatStream.notifyUserMessageCommitted(COMPOSER_CHAT_ID);
        }}
      >
        commit
      </button>
    </div>
  );
}

/** The composer wired to the real data layer (routeTrpc stubs the network) + the turn-lifecycle
 *  driver buttons a CT clicks to move it through pending → streaming → stopping → aborted. */
export function ComposerStory(props: ComposerStoryProps): ReactElement {
  return (
    <CtDataProviders>
      <ComposerStoryInner {...props} />
    </CtDataProviders>
  );
}

// ── Chat-list story (data layer — listChats stubbed at the network) ─────────────────────────────────

export interface ChatListSurfaceStoryProps {
  /** The active chat id (paints the selected row) — a plain string, cast to `ChatId` inside. */
  readonly activeChatId?: string | null;
}

/** The Chats-section LIST surface + its anchor, wired to the real data layer (routeTrpc stubs
 *  `chat.listChats`). Records select / new-chat clicks into visible markers so a CT can assert the
 *  callbacks fire with the right id. */
export function ChatListSurfaceStory({
  activeChatId = null,
}: ChatListSurfaceStoryProps): ReactElement {
  return (
    <CtDataProviders>
      <ChatListInner activeChatId={activeChatId} />
    </CtDataProviders>
  );
}

function ChatListInner({ activeChatId }: { readonly activeChatId: string | null }): ReactElement {
  const [selected, setSelected] = useState("none");
  const [newCount, setNewCount] = useState(0);
  const [deleted, setDeleted] = useState("none");
  return (
    <div style={{ height: 480, width: 320 }}>
      <ChatListAnchor>
        <ChatListSurface
          activeChatId={activeChatId === null ? null : castId<ChatId>(activeChatId)}
          onDeletedChat={(id): void => setDeleted(id)}
          onNewChat={(): void => setNewCount((n) => n + 1)}
          onSelect={(id): void => setSelected(id)}
        />
      </ChatListAnchor>
      <p data-testid="selected">{selected}</p>
      <p data-testid="new-count">{String(newCount)}</p>
      <p data-testid="deleted">{deleted}</p>
    </div>
  );
}

// ── Landing story (data layer — listChats + character.list stubbed at the network) ────────────────

/** The Chats-section LANDING surface (J1), wired to the real data layer (routeTrpc stubs
 *  `chat.listChats` + `character.list`). Records select / start-chat / new-chat / browse clicks into
 *  visible markers so a CT can assert the write-intent callbacks fire with the right id. */
export function ChatLandingSurfaceStory({
  showRecents,
}: {
  readonly showRecents?: boolean;
} = {}): ReactElement {
  return (
    <CtDataProviders>
      <ChatLandingInner showRecents={showRecents} />
    </CtDataProviders>
  );
}

function ChatLandingInner({
  showRecents,
}: {
  readonly showRecents: boolean | undefined;
}): ReactElement {
  const [selected, setSelected] = useState("none");
  const [started, setStarted] = useState("none");
  const [newCount, setNewCount] = useState(0);
  const [browsed, setBrowsed] = useState(0);
  return (
    <div style={{ height: 640, width: 720 }}>
      <ChatLandingSurface
        onBrowseCharacters={(): void => setBrowsed((n) => n + 1)}
        onNewChat={(): void => setNewCount((n) => n + 1)}
        onSelect={(id): void => setSelected(id)}
        onStartChat={(id): void => setStarted(id)}
        {...(showRecents === undefined ? {} : { showRecents })}
      />
      <p data-testid="selected">{selected}</p>
      <p data-testid="started">{started}</p>
      <p data-testid="new-count">{String(newCount)}</p>
      <p data-testid="browsed">{String(browsed)}</p>
    </div>
  );
}

// ── New-chat picker story (data layer — character.list stubbed at the network) ────────────────────

/** The J2 new-chat character picker modal body, wired to the real data layer (routeTrpc stubs
 *  `character.list`). Multi-select is internal state (a local Set); the CT asserts rows render, search
 *  filters, and the confirm item's label reflects the selection count. */
export function NewChatPickerStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 560, width: 480 }}>
        <NewChatPicker />
      </div>
    </CtDataProviders>
  );
}

// ── Command palette story (data layer — listChats stubbed at the network) ─────────────────────────

const CT_GO_TO_SECTIONS: readonly GoToSection[] = [
  { id: "chats", label: "Chats" },
  { id: "characters", label: "Characters" },
  { id: "corpus", label: "Corpus" },
];

/** The J4 ⌘K command palette body, wired to the real data layer (routeTrpc stubs `chat.listChats`).
 *  `goToSections` is a fixed CT literal (the route supplies RAIL_SECTIONS in production). */
export function CommandPaletteSurfaceStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 480, width: 560 }}>
        <CommandPaletteSurface goToSections={CT_GO_TO_SECTIONS} />
      </div>
    </CtDataProviders>
  );
}

// ── Chat-room story (the composed transcript + composer pane) ────────────────────────────────────

function ChatRoomHarness({ committed }: { readonly committed: boolean }): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const busDeps: ChatBusDeps = {
    stream: chatStream,
    invalidate: createInvalidation({ queryClient, trpc }).invalidate,
  };
  const handle: ActiveChatHandle = committed ? committedChat(CHAT_ID) : draftChat("draft_ct_room");
  // A draft carries a founding roster seed (the new-chat-with-character path); a committed room ignores it.
  const draftSeed = committed ? undefined : { characterIds: [castId<CharacterId>("char_ct_room")] };
  return (
    <div style={{ height: 480 }}>
      <ChatRoomSurface busDeps={busDeps} draftSeed={draftSeed} initialHandle={handle} />
    </div>
  );
}

export interface ChatRoomSurfaceStoryProps {
  /** @defaultValue false — a seeded draft (empty transcript, no server read); `true` = a committed chat. */
  readonly committed?: boolean;
}

/** The composed chat-room pane (transcript + composer) — a seeded draft by default (proves the empty
 *  transcript + live composer with NO server read), or a committed chat (reads `listMessages`). */
export function ChatRoomSurfaceStory({
  committed = false,
}: ChatRoomSurfaceStoryProps): ReactElement {
  return (
    <CtDataProviders>
      <ChatRoomHarness committed={committed} />
    </CtDataProviders>
  );
}

/** The chat CONTEXT panel (task #28 — overrides · preview · injections tabs), over the stubbed network
 *  (`chat.getChat` drives the host gate + overrides; `chat.listChatInjections`/`chat.previewAssembly`
 *  feed the tabs). The `.ct.tsx` sets the routeTrpc stubs (incl. the host/member roster) per case. */
export function ChatContextPanelStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 560 }}>
        <ChatContextPanel chatId={CHAT_ID} />
      </div>
    </CtDataProviders>
  );
}

/** The DRAFT CONTEXT panel (J2/J3) — the draft-config-backed twin of `ChatContextPanel`. No server reads:
 *  the Overrides tab renders from `draftConfig` (keyed by this key) and writes to the draft-config store on
 *  edit. The `.ct.tsx` asserts the tab + fields render and that editing lands in the store (no network). */
export const DRAFT_CONTEXT_KEY = "draft-ct-context";
export function DraftContextPanelStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 560 }}>
        {/* An empty founding cast ⇒ the solo case (Overrides tab only; no Roster). The Roster tab is
            covered by the pure `RosterPanelStory` below. */}
        <DraftContextPanel draftKey={DRAFT_CONTEXT_KEY} characterIds={[]} />
      </div>
    </CtDataProviders>
  );
}

/** The group-config form (group-config-form.tsx, P3) as the PURE component it is — seeded with
 *  `DEFAULT_GROUP_CONFIG`, the `.ct.tsx` drives controls and reads the last saved config off the
 *  `group-config-saved` readout (immediate-commit; no network). */
export function GroupConfigFormStory(): ReactElement {
  const [saved, setSaved] = useState("");
  return (
    <CtDataProviders>
      <div style={{ width: 380 }}>
        <div data-testid="group-config-saved">{saved}</div>
        <GroupConfigForm
          entityId="group-config:ct"
          config={DEFAULT_GROUP_CONFIG}
          save={(config): Promise<void> => {
            setSaved(JSON.stringify(config));
            return Promise.resolve();
          }}
        />
      </div>
    </CtDataProviders>
  );
}

// ── Group-roster-controls stories (task #29) ────────────────────────────────────────────────────

/** The read-only cast bar (chat-cast-bar.tsx) — the roster comes from the routeTrpc `chat.getChat`
 *  stub the `.ct.tsx` sets per case (a solo roster → the bar renders `null`; a 2+ roster → chips). */
export function ChatCastBarStory(): ReactElement {
  return (
    <CtDataProviders>
      {/* A wrapping div so the mount `component` locator is the WRAPPER, not the cast bar's own root
          element — a `component.getByTestId`/`getByText` then searches its descendants (the
          ComposerStory precedent; without it `component` IS the bar and its own testid is not a
          descendant of itself). */}
      <div>
        <ChatCastBar chatId={CHAT_ID} />
      </div>
    </CtDataProviders>
  );
}

/** The Roster tab body (roster-panel.tsx) as the PURE component it now is — the `.ct.tsx` passes fixed
 *  `members` and asserts the three write CALLBACKS fire (via the `roster-last-action` readout), no network.
 *  `omitForceTurn` drops `onForceTurn` (the DRAFT case — a draft has no turn to force ⇒ no Zap button). */
export interface RosterPanelStoryProps {
  readonly omitForceTurn?: boolean;
}
export function RosterPanelStory({ omitForceTurn = false }: RosterPanelStoryProps): ReactElement {
  const [lastAction, setLastAction] = useState("");
  const members: RosterMember[] = [
    {
      characterId: castId<CharacterId>("character_aria"),
      displayName: "Aria",
      disabled: false,
      talkativeness: 0.5,
    },
    {
      characterId: castId<CharacterId>("character_bryn"),
      displayName: "Bryn",
      disabled: true,
      talkativeness: 0.5,
    },
  ];
  return (
    <CtDataProviders>
      <div style={{ width: 360 }}>
        <div data-testid="roster-last-action">{lastAction}</div>
        <RosterPanel
          members={members}
          onSetDisabled={(id, disabled): void => setLastAction(`disabled:${id}:${disabled}`)}
          onSetTalkativeness={(id, t): void => setLastAction(`talkativeness:${id}:${t}`)}
          {...(omitForceTurn
            ? {}
            : { onForceTurn: (id: CharacterId): void => setLastAction(`force:${id}`) })}
        />
      </div>
    </CtDataProviders>
  );
}

/** The ⋯ chat-options menu (chat-options-menu.tsx). Its turn actions (Continue/Regenerate/Impersonate)
 *  reuse `useGuidedActions` with an EMPTY steer — the `.ct.tsx` stubs `chat.listMessages` (a tail assistant
 *  enables Continue/Regenerate) and asserts each verb fires with NO `guided` object (the F2 plain-turn fix). */
export function ChatOptionsMenuStory(): ReactElement {
  return (
    <CtDataProviders>
      {/* A wrapping div so `component` is the WRAPPER (the popup renders through a Portal — item
          assertions use the PAGE locator, the composer-wand precedent). */}
      <div>
        <ChatOptionsMenu chatId={CHAT_ID} title="Test chat" characterIds={[]} isHost={true} />
      </div>
    </CtDataProviders>
  );
}

/** The Roster tab with a re-seed harness (F4): `bump-aria` moves the talkativeness PROP (a bus/other-device
 *  echo), and `onSetTalkativeness` is a NO-OP (busDriven: no optimistic prop update — stands in for a FAILED
 *  write). Proves the thumb re-seeds from the prop on a value-only change AND snaps back on a failed write —
 *  neither of which a once-seeded `useState` could do (the row is keyed by member id, so no remount). */
export function RosterReseedStory(): ReactElement {
  const [ariaWeight, setAriaWeight] = useState(0.5);
  const members: RosterMember[] = [
    {
      characterId: castId<CharacterId>("character_aria"),
      displayName: "Aria",
      disabled: false,
      talkativeness: ariaWeight,
    },
  ];
  return (
    <CtDataProviders>
      <div style={{ width: 360 }}>
        <button type="button" data-testid="bump-aria" onClick={(): void => setAriaWeight(0.8)}>
          bump
        </button>
        <RosterPanel
          members={members}
          onSetDisabled={(): void => undefined}
          onSetTalkativeness={(): void => undefined}
        />
      </div>
    </CtDataProviders>
  );
}

/** The composer-adjacent speak-as dropdown (speak-as-select.tsx). A committed handle by default (reads
 *  the `chat.getChat` roster + fires `chat.generate`); `committed=false` mounts a draft (renders `null`). */
export function SpeakAsSelectStory({
  committed = true,
}: {
  readonly committed?: boolean;
}): ReactElement {
  const handle: ChatHandle = committed ? committedChat(CHAT_ID) : draftChat("draft_ct_speak_as");
  return (
    <CtDataProviders>
      {/* A wrapping div so the mount `component` locator is the WRAPPER (see ChatCastBarStory) — the
          `.ct.tsx` uses `component.getByRole("button", …)` to find the trigger as a descendant. */}
      <div>
        <SpeakAsSelect handle={handle} />
      </div>
    </CtDataProviders>
  );
}
