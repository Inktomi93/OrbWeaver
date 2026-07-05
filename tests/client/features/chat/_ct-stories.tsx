// Chat message-list CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module).
// The surface/anchor come through the feature front door; the leaf components come via relative path
// into the package (stories legitimately compose feature INTERNALS the front door doesn't re-export).
// Fixtures are plain `MessageView`/`ChatBusEvent` literals (the support/factories are DB-row builders
// for a different layer). Data-layer stories wrap in <CtDataProviders> (Query + real tRPC over the
// stubbed network); pure-render stories rely on the beforeMount toast/tooltip chrome.

import type { ChatBusDeps } from "@orb/client/data";
import { createInvalidation, useTRPC } from "@orb/client/data";
import {
  ChatListAnchor,
  ChatListSurface,
  ChatRoomSurface,
  Composer,
  MessageListSurface,
  MessageThreadAnchor,
} from "@orb/client/features/chat";
import type { ChatHandle } from "@orb/client/state";
import {
  cancelEditingMessage,
  chatStream,
  committedChat,
  draftChat,
  startEditingMessage,
  useTurnPhase,
} from "@orb/client/state";
import type { MessageView, ParticipantView } from "@orb/contracts/chat";
import type { CharacterId, ChatId, MessageId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import type { THEME_SCOPE_CHAT_STYLES } from "@orb/ui/theme-scope";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { GhostMessageRow } from "../../../../packages/client/src/features/chat/components/ghost-message-row";
import { MessageActionsRow } from "../../../../packages/client/src/features/chat/components/message-actions-row";
import { MessageContent } from "../../../../packages/client/src/features/chat/components/message-content";
import { MessageEditTextarea } from "../../../../packages/client/src/features/chat/components/message-edit-textarea";
import { MessageRow } from "../../../../packages/client/src/features/chat/components/message-row";
import { ReasoningBlock } from "../../../../packages/client/src/features/chat/components/reasoning-block";
import { SwipeStrip } from "../../../../packages/client/src/features/chat/components/swipe-strip";
import type { PersonaAttribution } from "../../../../packages/client/src/features/chat/lib/attribution";
import { CtDataProviders } from "../../../support/ct/ct-data-providers";
import { CHAT_ID, COMPOSER_CHAT_ID, makeMessageView } from "./fixtures";

// ── Pure-render stories (no data layer) ─────────────────────────────────────────────────────────

/** A persona library entry, keyed inline — the CT-serializable shape (a `Map` prop does NOT survive
 *  the Playwright CT mount boundary: props cross a serialization wire, and `Map`/`Set` instances
 *  arrive empty on the other side with no error. Plain arrays of plain objects are the safe shape;
 *  the `Map` the row actually needs is built HERE, inside the story component that executes
 *  post-mount in the real browser context — never at the `.ct.tsx` call site). */
export interface PersonaAttributionEntry extends PersonaAttribution {
  readonly id: PersonaId;
}

export interface MessageRowStoryProps {
  readonly chatStyle: (typeof THEME_SCOPE_CHAT_STYLES)[number];
  // Named `messageRole` (not `role`) so the JSX prop at the CT call site isn't read as an ARIA role.
  readonly messageRole?: MessageRole;
  readonly content?: string;
  /** #21 attribution — the row's server-stamped speaker (assistant) / historical author (user). */
  readonly characterId?: CharacterId | null;
  readonly personaId?: PersonaId | null;
  /** CT-serializable roster (see `PersonaAttributionEntry` — arrays, not `Map`s, cross the wire). */
  readonly participants?: readonly ParticipantView[];
  readonly personas?: readonly PersonaAttributionEntry[];
  readonly activePersonaId?: PersonaId | null;
}

/** One row in a chosen chatStyle — the variant-mechanism CT mounts this three times; also the
 *  #21 attribution-chrome CT's mount point (roster/persona maps are optional pass-throughs). */
export function MessageRowStory({
  chatStyle,
  messageRole = "assistant",
  content = "**Bold** and _italic_",
  characterId = null,
  personaId = null,
  participants,
  personas,
  activePersonaId,
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
  const personasMap =
    personas === undefined
      ? undefined
      : new Map(personas.map(({ id, ...rest }) => [id, rest] as const));

  return (
    // The row now always renders <MessageActionsRow> (Edit/Hide/Delete/Fork/Copy), which reads the
    // data layer (`useTRPC`) even though these CTs never click a mutating action — the provider must
    // exist regardless (the swipe-strip.tsx precedent: any tRPC-reading leaf needs CtDataProviders).
    <CtDataProviders>
      <MessageThreadAnchor>
        <MessageRow
          message={makeMessageView({ role: messageRole, content, characterId, personaId })}
          chatStyle={chatStyle}
          participants={participantsMap}
          personas={personasMap}
          activePersonaId={activePersonaId}
        />
      </MessageThreadAnchor>
    </CtDataProviders>
  );
}

export interface MessageActionsRowStoryProps {
  readonly message?: MessageView;
}

/** The actions row in isolation — Edit/Hide/Delete/Fork/Copy, gated per role (message-actions-row.tsx). */
export function MessageActionsRowStory({
  message,
}: MessageActionsRowStoryProps = {}): ReactElement {
  return (
    <CtDataProviders>
      <MessageActionsRow message={message ?? makeMessageView()} />
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
}

/** The bare `<MessageContent>` — mounts the #21 `<speaker>`-span split + per-span `<ThemeScope>`
 *  in isolation, without the row's attribution chrome. */
export function MessageContentSpansStory({ content }: MessageContentSpansStoryProps): ReactElement {
  return <MessageContent content={content} trust="trusted" />;
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
  return (
    <div style={{ height: 480, width: 320 }}>
      <ChatListAnchor>
        <ChatListSurface
          activeChatId={activeChatId === null ? null : castId<ChatId>(activeChatId)}
          onNewChat={(): void => setNewCount((n) => n + 1)}
          onSelect={(id): void => setSelected(id)}
        />
      </ChatListAnchor>
      <p data-testid="selected">{selected}</p>
      <p data-testid="new-count">{String(newCount)}</p>
    </div>
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
  const handle = committed ? committedChat(CHAT_ID) : draftChat("draft_ct_room");
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
