// Chat message-list CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module).
// The surface/anchor come through the feature front door; the leaf components come via relative path
// into the package (stories legitimately compose feature INTERNALS the front door doesn't re-export).
// Fixtures are plain `MessageView`/`ChatBusEvent` literals (the support/factories are DB-row builders
// for a different layer). Data-layer stories wrap in <CtDataProviders> (Query + real tRPC over the
// stubbed network); pure-render stories rely on the beforeMount toast/tooltip chrome.

import type { ChatBusDeps } from "@orb/client/data";
import { createInvalidation, QueryBoundary, QueryErrorState, useTRPC } from "@orb/client/data";
import { characterSlashCommands } from "@orb/client/features/character";
import type { GoToSection } from "@orb/client/features/chat";
import {
  ChatLandingSurface,
  ChatListAnchor,
  ChatListSurface,
  ChatRoomSurface,
  CommandPaletteSurface,
  Composer,
  chatSlashCommands,
  JoinInviteDialog,
  MessageListSurface,
  MessageThreadAnchor,
  NewChatPicker,
} from "@orb/client/features/chat";
import type {
  ChatContextState,
  ChatSurfaceAnchor,
  ChatSurfaceContribution,
  ContextTabDef,
  MessageRenderContext,
  MessageToolsRenderer,
  SlashCommandContribution,
  SlashCommandMountProps,
  ToolRenderer,
} from "@orb/client/lib";
import { createContributorRegistry } from "@orb/client/lib";
import type { ActiveChatHandle, ChatHandle } from "@orb/client/state";
import {
  cancelEditingMessage,
  chatStream,
  committedChat,
  draftChat,
  enterSelectionMode,
  isLiveTurnPhase,
  MessageToolsRendererRegistryProvider,
  SlashCommandRegistryProvider,
  selectChat,
  setDraftGreeting,
  startEditingMessage,
  startNewChat,
  toggleMessageSelected,
  useDraftConfig,
  useSectionRegistry,
  useTurnPhase,
} from "@orb/client/state";
import type {
  CharacterAvatarEntry,
  CharacterNameEntry,
  JoinHistoryVisibility,
  MessageView,
  ParticipantView,
  PersonaNameEntry,
  ToolCallRecord,
} from "@orb/contracts/chat";
import { buildCharacterAvatarMap, buildCharacterNameMap, buildPersonaNameMap, DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { RewriteToggleId } from "@orb/contracts/preset";
import { REWRITE_TOGGLES } from "@orb/contracts/preset";
import { composeRewriteSteer } from "@orb/kit/guided";
import type { AssetId, CharacterId, ChatId, MessageId, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import { Text } from "@orb/ui/text";
import type { THEME_SCOPE_CHAT_STYLES } from "@orb/ui/theme-scope";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { SectionContextHeader, SectionContextHost } from "../../../../packages/client/src/features/app-shell/components/section-context-host";
import { CharacterGalleryDialog } from "../../../../packages/client/src/features/chat/anchors/character-gallery-dialog";
import { AssemblyPreviewPanel } from "../../../../packages/client/src/features/chat/components/assembly-preview-panel";
import { ChatCastBar } from "../../../../packages/client/src/features/chat/components/chat-cast-bar";
import { ChatHeaderSurface } from "../../../../packages/client/src/features/chat/components/chat-header";
import { ChatOptionsMenu } from "../../../../packages/client/src/features/chat/components/chat-options-menu";
import { ActiveChatOptionsMenu } from "../../../../packages/client/src/features/chat/components/chat-options-topbar";
import { CompactSummaryPeek } from "../../../../packages/client/src/features/chat/components/compact-summary-peek";
import { DatabankSettingsSection } from "../../../../packages/client/src/features/chat/components/databank-settings-section";
import { GhostMessageRow } from "../../../../packages/client/src/features/chat/components/ghost-message-row";
import { GreetingSwipeStrip } from "../../../../packages/client/src/features/chat/components/greeting-swipe-strip";
import { GroupConfigForm } from "../../../../packages/client/src/features/chat/components/group-config-form";
import { ImageryTemplatesSection } from "../../../../packages/client/src/features/chat/components/imagery-templates-section";
import { InjectionsManager } from "../../../../packages/client/src/features/chat/components/injections-manager";
import { InviteDialog } from "../../../../packages/client/src/features/chat/components/invite-dialog";
import { MembersPanel } from "../../../../packages/client/src/features/chat/components/members-panel";
import { MemorySettingsSection } from "../../../../packages/client/src/features/chat/components/memory-settings-section";
import { MessageActionsRow } from "../../../../packages/client/src/features/chat/components/message-actions-row";
import { MessageContent } from "../../../../packages/client/src/features/chat/components/message-content";
import { MessageCostReadout } from "../../../../packages/client/src/features/chat/components/message-cost-readout";
import { MessageEditTextarea } from "../../../../packages/client/src/features/chat/components/message-edit-textarea";
import { MessageMediaBlock } from "../../../../packages/client/src/features/chat/components/message-media-block";
import type { MessageMetadataVisibility } from "../../../../packages/client/src/features/chat/components/message-metadata-row";
import { MessageMetadataRow } from "../../../../packages/client/src/features/chat/components/message-metadata-row";
import { MessageRow } from "../../../../packages/client/src/features/chat/components/message-row";
import { MessageSelectionBar } from "../../../../packages/client/src/features/chat/components/message-selection-bar";
import { MessageToolCalls } from "../../../../packages/client/src/features/chat/components/message-tool-calls";
import { ReasoningBlock } from "../../../../packages/client/src/features/chat/components/reasoning-block";
import { RewriteDialog } from "../../../../packages/client/src/features/chat/components/rewrite-dialog";
import { RoomOverridesForm } from "../../../../packages/client/src/features/chat/components/room-overrides-form";
import { CommittedSettingsTab, DraftSettingsTab } from "../../../../packages/client/src/features/chat/components/settings-context-tab";
import { SpeakAsSelect } from "../../../../packages/client/src/features/chat/components/speak-as-select";
import { SwipeStrip } from "../../../../packages/client/src/features/chat/components/swipe-strip";
import { AttachmentUrlContext } from "../../../../packages/client/src/features/chat/hooks/attachment-url-context";
import type { MemberCastRow, MemberPersonRow } from "../../../../packages/client/src/features/chat/lib/member-rows";
import { CtChatContributorSectionRegistry, CtDataProviders, CtRealSectionRegistry } from "../../../support/ct/ct-data-providers";
import { CHAT_ID, COMPOSER_CHAT_ID, makeMessageView } from "./fixtures";

// The door's empty chat-surface registry (§6c/M8) — stories that don't test the seam itself pass this,
// mirroring main.tsx's zero-contribution assembly (no visual change over today's layout).
const NO_SURFACE_CONTRIBUTORS = createContributorRegistry<ChatSurfaceContribution>("chat-surface", []);

// The door's empty per-tool-name renderer registry (§6c) — mirrors main.tsx's zero-contribution assembly, so
// every persisted tool record renders through the generic `ToolCallBlock` fallback.
const NO_TOOL_RENDERERS = createContributorRegistry<ToolRenderer>("tool-renderers", []);

// ── Pure-render stories (no data layer) ─────────────────────────────────────────────────────────

/** A persona macro-name producer entry, keyed inline — the CT-serializable shape (a `Map` prop does
 *  NOT survive the Playwright CT mount boundary: props cross a serialization wire, and `Map`/`Set`
 *  instances arrive empty on the other side with no error. Plain arrays of plain objects are the safe
 *  shape; the `ReadonlyMap`s the row actually needs are built HERE, inside the story component that
 *  executes post-mount in the real browser context — never at the `.ct.tsx` call site — via the REAL
 *  `@orb/contracts/chat` producer builders, so a story feeds `MessageRow` exactly the shape the
 *  production surface would). */
interface PersonaNameStoryEntry {
  readonly id: PersonaId;
  readonly name: string;
  readonly description?: string;
}

/** A character macro-producer entry decoupled from the live roster (the removal case): the character
 *  exists in the chat's data (name + avatar producers) but is NOT a `participants` row. Feeds the
 *  character-name AND character-avatar maps directly, exactly as the wire producer would for a character
 *  whose messages are still in the transcript after removal. */
interface CharacterStoryEntry {
  readonly id: CharacterId;
  readonly name: string;
  readonly avatarHash?: string | null;
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
  /** Character name + avatar producer entries INDEPENDENT of `participants` — the transcript-integrity
   *  path: a removed character (no participant row) whose historical message still resolves its portrait. */
  readonly characters?: readonly CharacterStoryEntry[];
  readonly activePersonaId?: PersonaId | null;
  /** The chat's ANCHOR persona id — the null-stamp `{{user}}`/`{{persona}}` MACRO fallback subject
   *  (ruling A moved this off `activePersonaId`). Distinct from the badge/avatar `activePersonaId`. */
  readonly anchorPersonaId?: PersonaId | null;
  /** #31 appearance — the attribution-avatar chrome knobs (default to the schema defaults). */
  readonly avatarSize?: "sm" | "md" | "lg";
  readonly avatarShape?: "round" | "square" | "rounded";
  /** §B.3 avatar versatility. */
  readonly avatarAspect?: "square" | "portrait";
  readonly avatarRing?: "none" | "accent";
  readonly showInChatAvatars?: boolean;
  /** WS3/N3 — the per-toggle metadata-chip visibility (timestamp → name row, the rest → metadata row).
   *  Omitted ⇒ every datum hidden (the `MessageRow` NO_METADATA_VISIBLE default). */
  readonly metadataVisibility?: MessageMetadataVisibility;
  /** The row's persisted tool exchanges (D48) — omitted ⇒ `[]`, the non-tool turn every other story drives. */
  readonly toolCalls?: readonly ToolCallRecord[];
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
  characters,
  activePersonaId,
  anchorPersonaId,
  avatarSize,
  avatarShape,
  avatarAspect,
  avatarRing,
  showInChatAvatars,
  metadataVisibility,
  toolCalls,
}: MessageRowStoryProps): ReactElement {
  const participantsMap =
    participants === undefined
      ? undefined
      : new Map(
          participants.filter((p): p is ParticipantView & { characterId: CharacterId } => p.characterId !== null).map((p) => [p.characterId, p] as const),
        );
  // The story's own producer, built with the REAL contracts builders (never a hand-rolled Map) so
  // `MessageRow` sees exactly the shape `message-list-surface.tsx` would merge from the wire. Names cover
  // the participant roster UNION any decoupled `characters` (the removal case — a character with no
  // participant row whose message is still in the transcript); avatars come from `characters` only (that
  // IS the participant-independent producer under test).
  const rosterNameEntries: CharacterNameEntry[] = (participants ?? [])
    .filter((p): p is ParticipantView & { characterId: CharacterId } => p.characterId !== null)
    .map((p) => ({ id: p.characterId, name: p.displayName }));
  const decoupledNameEntries: CharacterNameEntry[] = (characters ?? []).map((c) => ({ id: c.id, name: c.name }));
  const characterAvatarEntries: CharacterAvatarEntry[] = (characters ?? []).map((c) => ({ id: c.id, avatarHash: c.avatarHash ?? null }));
  const personaNameEntries: PersonaNameEntry[] = (personas ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description ?? "",
  }));
  const characterNamesById = buildCharacterNameMap([...rosterNameEntries, ...decoupledNameEntries]);
  const characterAvatarsById = buildCharacterAvatarMap(characterAvatarEntries);
  const personaNamesById = buildPersonaNameMap(personaNameEntries);

  return (
    // The row now always renders <MessageActionsRow> (Edit/Hide/Delete/Fork/Copy), which reads the
    // data layer (`useTRPC`) even though these CTs never click a mutating action — the provider must
    // exist regardless (the swipe-strip.tsx precedent: any tRPC-reading leaf needs CtDataProviders).
    <CtDataProviders>
      <MessageThreadAnchor>
        <MessageRow
          message={makeMessageView({ role: messageRole, content, characterId, personaId, tokensOut: 128, model: "ct/model-x", toolCalls: toolCalls ?? [] })}
          chatStyle={chatStyle}
          metadataVisibility={metadataVisibility}
          avatarSize={avatarSize}
          avatarShape={avatarShape}
          avatarAspect={avatarAspect}
          avatarRing={avatarRing}
          showInChatAvatars={showInChatAvatars}
          participants={participantsMap}
          characterNamesById={characterNamesById}
          characterAvatarsById={characterAvatarsById}
          personaNamesById={personaNamesById}
          activePersonaId={activePersonaId}
          anchorPersonaId={anchorPersonaId}
          toolRenderers={NO_TOOL_RENDERERS}
        />
      </MessageThreadAnchor>
    </CtDataProviders>
  );
}

export interface MessageToolCallsStoryProps {
  readonly records: readonly ToolCallRecord[];
  /** Registers a per-tool-name `ToolRenderer` claiming this wire tool name (the specialization seam). */
  readonly customToolName?: string;
  /** Registers a whole-message renderer: "claims" owns the block; "abstains" returns null (chat falls
   *  through to the per-record path). Omitted ⇒ no Provider at all, the zero-registrant default. */
  readonly messageRenderer?: "claims" | "abstains";
}

/** The tool-call block seam in isolation (message-tool-calls.tsx): the generic `@orb/ui` `ToolCallBlock`
 *  fallback, an optional per-tool-name renderer that wins on a name match, and an optional whole-message
 *  renderer with first refusal. The registries are built HERE (post-mount, in the browser) because a
 *  registry instance does NOT survive the Playwright CT prop wire — only plain data crosses it. */
export function MessageToolCallsStory({ records, customToolName, messageRenderer }: MessageToolCallsStoryProps): ReactElement {
  const renderers = createContributorRegistry<ToolRenderer>(
    "tool-renderers",
    customToolName === undefined
      ? []
      : [{ id: customToolName, render: (record): ReactElement => <div data-testid="custom-tool">{`custom:${record.name}`}</div> }],
  );
  const block = <MessageToolCalls records={records} renderers={renderers} />;
  if (messageRenderer === undefined) {
    return block;
  }
  const messageRenderers = createContributorRegistry<MessageToolsRenderer>("message-tools-renderer", [
    {
      id: "ct-message-tools",
      render: (all): ReactElement | null => (messageRenderer === "claims" ? <div data-testid="message-fold">{`${all.length} tool calls`}</div> : null),
    },
  ]);
  return <MessageToolsRendererRegistryProvider value={messageRenderers}>{block}</MessageToolsRendererRegistryProvider>;
}

export interface MessageActionsRowStoryProps {
  readonly message?: MessageView;
}

/** The actions row in isolation — Edit/Hide/Delete/Fork/Copy, gated per role (message-actions-row.tsx).
 *  Wrapped in a `.group` host (the reveal hook the real `message-row` provides, UIP-305): the cluster
 *  rests hidden (opacity-0 / pointer-events-none) and reveals on hover/focus-within — the CT hovers the
 *  host before interacting. */
export function MessageActionsRowStory({ message }: MessageActionsRowStoryProps = {}): ReactElement {
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
function MessageEditTextareaStoryInner({ message }: MessageEditTextareaStoryInnerProps): ReactElement {
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
export function MessageEditTextareaStory({ message }: MessageEditTextareaStoryProps = {}): ReactElement {
  return (
    <CtDataProviders>
      <MessageEditTextareaStoryInner message={message ?? makeMessageView({ content: "Hello there" })} />
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
  return <MessageContent content={content} render={{ trust, allowExternal, lenientCards: false }} renderContext={renderContext} />;
}

function GhostRowInner(): ReactElement {
  const phase = useTurnPhase(CHAT_ID);
  // Mount the ghost row ONLY while the turn is live — exactly as the production surface gates it
  // (`message-list-surface.tsx` `isLiveTurnPhase`); at idle/completed the row is unmounted, not idling.
  return (
    <div>
      <div data-testid="phase">{phase}</div>
      {isLiveTurnPhase(phase) ? <GhostMessageRow chatId={CHAT_ID} chatStyle="bubble" streaming={phase === "streaming"} /> : null}
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
  readonly smoothStream?: boolean;
  readonly smoothStreamCps?: number;
}

/** The bare `<ReasoningBlock>` — a pure-render leaf (no chat-store dependency), so the CT test drives
 *  its TTFT/auto-collapse/toggle behavior by mounting with props and re-`update()`-ing them, exactly
 *  like `crossfade-image.ct.tsx` drives a prop transition. */
export function ReasoningBlockStory({ reasoning, thinking, smoothStream, smoothStreamCps }: ReasoningBlockStoryProps): ReactElement {
  return (
    <div style={{ width: 360 }}>
      <ReasoningBlock reasoning={reasoning} thinking={thinking} smoothStream={smoothStream} smoothStreamCps={smoothStreamCps} />
    </div>
  );
}

const SCRIPTED_CHAT_ID = castId<ChatId>("chat_ct_ghost_scripted");

export interface GhostRowScriptedStoryProps {
  /** The exact sequence of raw TEXT deltas to append, one per `next-chunk` click — lets a CT test
   *  assemble a precise streaming sequence (an unterminated code fence, a torn `<speaker` tag, …) and
   *  assert the render after each step (UI-Gates §11.6 golden checkpoint). */
  readonly chunks: readonly string[];
  /** The live turn's speaker name — mounts the row WITH attribution so the streaming leading-self-label
   *  strip (`stripLeadingSpeakerName`) has a name to match. Absent ⇒ no attribution (the pre-existing
   *  byte-identical mount every other scripted CT uses). */
  readonly speakerName?: string;
}

/** The ghost row driven by an explicit, test-controlled SCRIPT of raw text chunks (rather than the
 *  fixed "Hi " token `GhostRowStory` uses). */
export function GhostRowScriptedStory({ chunks, speakerName }: GhostRowScriptedStoryProps): ReactElement {
  const [next, setNext] = useState(0);
  const attribution =
    speakerName === undefined
      ? undefined
      : { name: speakerName, kind: "character" as const, avatarAssetId: null, avatarHash: null, hueSeed: speakerName, tokens: null };
  return (
    <div style={{ width: 360 }}>
      <GhostMessageRow
        chatId={SCRIPTED_CHAT_ID}
        chatStyle="bubble"
        streaming={useTurnPhase(SCRIPTED_CHAT_ID) === "streaming"}
        {...(attribution === undefined ? {} : { attribution })}
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
      <SwipeStrip message={message ?? makeMessageView({ variantCount: 3, selectedVariantIdx: 1 })} />
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
        <MessageListSurface handle={handle} busDeps={busDeps} surfaceContributors={NO_SURFACE_CONTRIBUTORS} toolRenderers={NO_TOOL_RENDERERS} />
      </MessageThreadAnchor>
    </div>
  );
}

export interface MessageListSurfaceStoryProps {
  readonly committed?: boolean;
}

/** The keystone surface in a bounded box (so the message-list seal has a real scroll window). */
export function MessageListSurfaceStory({ committed = true }: MessageListSurfaceStoryProps): ReactElement {
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
        <MessageListSurface handle={handle} busDeps={busDeps} surfaceContributors={NO_SURFACE_CONTRIBUTORS} toolRenderers={NO_TOOL_RENDERERS} />
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
        <MessageListSurface handle={committedChat(CHAT_ID)} busDeps={busDeps} surfaceContributors={NO_SURFACE_CONTRIBUTORS} toolRenderers={NO_TOOL_RENDERERS} />
      </MessageThreadAnchor>
      <button type="button" data-testid="mark-stopping" onClick={(): void => chatStream.markStopping(CHAT_ID)}>
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
  /** The tail turn role — `"assistant"` (+ `tailAssistantMessageId`) makes continue-on-empty eligible. */
  readonly tailRole?: MessageRole | null;
  /** The tail assistant message id continue-on-empty targets (PD-146). */
  readonly tailAssistantMessageId?: MessageId | null;
}

function ComposerStoryInner({ committed = true, tailRole = null, tailAssistantMessageId = null }: ComposerStoryProps): ReactElement {
  const [value, setValue] = useState("");
  const [startedChatId, setStartedChatId] = useState<ChatId | null>(committed ? COMPOSER_CHAT_ID : null);
  const handle: ChatHandle = startedChatId !== null ? committedChat(startedChatId) : draftChat("draft_ct_composer");

  return (
    <div>
      <Composer
        handle={handle}
        value={value}
        onChange={setValue}
        onCommitted={(id): void => setStartedChatId(id)}
        tailRole={tailRole}
        tailAssistantMessageId={tailAssistantMessageId}
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

// ── Rewrite dialog story (the guided-Rewrite modal in isolation) ─────────────────────────────────
// Owns the instruction + toggle-selection state exactly as the wand does (the modal is controlled), and
// composes the SAME `composeRewriteSteer` the wand fires on Apply — the composed steer is written to a
// readout so the CT can assert the exact fired string WITHOUT a tRPC round-trip (the pure-component lane;
// the wand's own CT proves the tRPC wire). `initialInstruction` seeds the field (the draft-preseed case).

export interface RewriteDialogStoryProps {
  /** Seeds the instruction field on mount (the composer-draft preseed case). @defaultValue "" */
  readonly initialInstruction?: string;
}

function RewriteDialogStoryInner({ initialInstruction = "" }: RewriteDialogStoryProps): ReactElement {
  const [open, setOpen] = useState(true);
  const [instruction, setInstruction] = useState(initialInstruction);
  const [selected, setSelected] = useState<ReadonlySet<RewriteToggleId>>(new Set<RewriteToggleId>());
  const [fired, setFired] = useState("");
  return (
    <div>
      <button type="button" data-testid="reopen" onClick={(): void => setOpen(true)}>
        open
      </button>
      <div data-testid="fired-steer">{fired}</div>
      <RewriteDialog
        open={open}
        onOpenChange={setOpen}
        instruction={instruction}
        onInstructionChange={setInstruction}
        selected={selected}
        onToggle={(id, on): void =>
          setSelected((prev) => {
            const next = new Set(prev);
            if (on) {
              next.add(id);
            } else {
              next.delete(id);
            }
            return next;
          })
        }
        onApply={(): void => {
          const fragments = REWRITE_TOGGLES.filter((t) => selected.has(t.id)).map((t) => t.fragment);
          setFired(composeRewriteSteer(fragments, instruction));
          setOpen(false);
        }}
      />
    </div>
  );
}

/** The Rewrite modal in isolation — controlled state + a composed-steer readout (`fired-steer`). */
export function RewriteDialogStory(props: RewriteDialogStoryProps): ReactElement {
  return (
    <CtDataProviders>
      <RewriteDialogStoryInner {...props} />
    </CtDataProviders>
  );
}

// ── Chat-list story (data layer — listChats stubbed at the network) ─────────────────────────────────

export interface ChatListSurfaceStoryProps {
  /** The active chat id (paints the selected row) — a plain string, cast to `ChatId` inside. Drives the
   *  REAL active-chat-store via `selectChat` (ChatListSurface reads `useActiveChatId()` internally now —
   *  the character/preset/world-info library-surface precedent), not a passthrough prop. */
  readonly activeChatId?: string | null;
}

/** The Chats-section LIST surface + its anchor, wired to the real data layer (routeTrpc stubs
 *  `chat.listChats`). Records select / new-chat clicks into visible markers so a CT can assert the
 *  callbacks fire with the right id. */
export function ChatListSurfaceStory({ activeChatId = null }: ChatListSurfaceStoryProps): ReactElement {
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
  useEffect(() => {
    if (activeChatId !== null) {
      selectChat(castId<ChatId>(activeChatId));
    }
  }, [activeChatId]);
  return (
    <div style={{ height: 480, width: 320 }}>
      <ChatListAnchor>
        <ChatListSurface
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
export function ChatLandingSurfaceStory({ showRecents }: { readonly showRecents?: boolean } = {}): ReactElement {
  return (
    <CtDataProviders>
      <ChatLandingInner showRecents={showRecents} />
    </CtDataProviders>
  );
}

function ChatLandingInner({ showRecents }: { readonly showRecents: boolean | undefined }): ReactElement {
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

const CT_PALETTE_COMMAND_ID = "ct-fake-command";
const CT_PALETTE_COMMAND_LABEL = "Fake contributed command";

function CtFakeCommandMount({ onRunner, onFire }: SlashCommandMountProps & { readonly onFire: () => void }): null {
  useEffect(() => {
    onRunner((): void => onFire());
  }, [onRunner, onFire]);
  return null;
}

export interface CommandPaletteSurfaceStoryProps {
  /** Which slash-command registry the palette reads.
   *  `"door"` (default) mirrors main.tsx's assembly — the feature-owned built-ins, and nothing else.
   *  `"none"` mounts NO Provider at all: the zero-registrant baseline (navigation groups only).
   *  `"contributed"` adds one fake contribution on top of the door set (the extension proof). */
  readonly commands?: "door" | "none" | "contributed";
}

/** The J4 ⌘K command palette body, wired to the real data layer (routeTrpc stubs `chat.listChats`).
 *  `goToSections` is a fixed CT literal (app-root derives it from the section registry in production);
 *  the COMMAND rows come from the real slash-command registry, exactly as they do at the door. */
export function CommandPaletteSurfaceStory({ commands = "door" }: CommandPaletteSurfaceStoryProps): ReactElement {
  const [ranFake, setRanFake] = useState(false);
  const registry = useMemo(() => {
    const door = [...chatSlashCommands, ...characterSlashCommands];
    const contributions: readonly SlashCommandContribution[] =
      commands === "contributed"
        ? [
            ...door,
            {
              id: CT_PALETTE_COMMAND_ID,
              label: CT_PALETTE_COMMAND_LABEL,
              describe: "A grafted command, registered at the door",
              mount: (props): ReactElement => <CtFakeCommandMount {...props} onFire={(): void => setRanFake(true)} />,
            },
          ]
        : door;
    return createContributorRegistry<SlashCommandContribution>("slash-commands", contributions);
  }, [commands]);

  const body = (
    <div style={{ height: 480, width: 560 }}>
      <CommandPaletteSurface goToSections={CT_GO_TO_SECTIONS} />
      <div data-testid="ct-palette-command-ran">{ranFake ? "ran" : ""}</div>
    </div>
  );
  return <CtDataProviders>{commands === "none" ? body : <SlashCommandRegistryProvider value={registry}>{body}</SlashCommandRegistryProvider>}</CtDataProviders>;
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
      <ChatRoomSurface
        busDeps={busDeps}
        draftSeed={draftSeed}
        initialHandle={handle}
        surfaceContributors={NO_SURFACE_CONTRIBUTORS}
        toolRenderers={NO_TOOL_RENDERERS}
      />
      {/* The clear-on-commit signal (mirrors ComposerStory's `drive-message-committed`): simulates the bus
          observing the caller's OWN user-row `messageCommitted` on the (post-promotion) committed chat.
          Driven directly rather than through the SSE stub because the draft→committed subscription churns
          (null→committed re-attach), so a scripted stream event races the sticky subscribe; the signal
          itself is what the send hook subscribes to, and this fires it deterministically for CHAT_ID. */}
      <button type="button" data-testid="drive-message-committed" onClick={(): void => chatStream.notifyUserMessageCommitted(CHAT_ID)}>
        commit
      </button>
    </div>
  );
}

export interface ChatRoomSurfaceStoryProps {
  /** @defaultValue false — a seeded draft (empty transcript, no server read); `true` = a committed chat. */
  readonly committed?: boolean;
}

/** The composed chat-room pane (transcript + composer) — a seeded draft by default (proves the empty
 *  transcript + live composer with NO server read), or a committed chat (reads `listMessages`). */
export function ChatRoomSurfaceStory({ committed = false }: ChatRoomSurfaceStoryProps): ReactElement {
  return (
    <CtDataProviders>
      <ChatRoomHarness committed={committed} />
    </CtDataProviders>
  );
}

// Mounts the chats section's CONTEXT through the real `SectionContextHost` (the shell's one consumer) —
// the section's `useChatContextState` resolves the active handle against the stubbed network, exactly as
// production does. The `key` mirrors the shell's per-section remount.
function ChatContextHostHarness(): ReactElement {
  const registry = useSectionRegistry();
  return (
    <div style={{ height: 560 }}>
      <SectionContextHost key="chats" definition={registry.get("chats")} />
    </div>
  );
}

/** The chat CONTEXT panel via the real host (§6b — overrides · preview · injections · members tabs), over
 *  the stubbed network (`chat.getChat` drives the host gate + overrides; `chat.listChatInjections`/
 *  `chat.previewAssembly` feed the tabs). The `.ct.tsx` sets the routeTrpc stubs + the `/api/auth/config`
 *  capability stub (the People-tab gate — `multiHumanCapable` now reads from auth-config, not a prop). */
export function ChatContextPanelStory(): ReactElement {
  useEffect(() => {
    selectChat(CHAT_ID);
  }, []);
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <ChatContextHostHarness />
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

// Mounts the chats section's CONTEXT BAND identity (N4/P4) through the real `SectionContextHeader` — the
// shell's band consumer — over the chats `defineContextTabs` `header` slot. The `key` mirrors the shell's
// per-section remount.
function ChatContextHeaderHarness(): ReactElement {
  const registry = useSectionRegistry();
  return <SectionContextHeader key="chats" definition={registry.get("chats")} />;
}

/** The chats def supplies the CONTEXT-band identity (N4): a DRAFT (empty cast, no network) names the new
 *  chat, proving the definition-owned header channel carries the chat identity end-to-end through the real
 *  section → mint → `SectionContextHeader` path. */
export function ChatContextHeaderDraftStory(): ReactElement {
  useEffect(() => {
    startNewChat({ characterIds: [] });
  }, []);
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <ChatContextHeaderHarness />
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

// ── M8: fake-contributor stories (§6c) — prove BOTH contributor seams render + `when`-gate through the
// REAL section/factory/mint/anchor path, driven by a FAKE registry (mirrors the doctrine: a CT fake, not
// a bespoke test double of the seam itself). ───────────────────────────────────────────────────────

const CT_CONTRIBUTOR_TAB_ID = "ct-fake-context-tab";
const CT_CONTRIBUTOR_TAB_LABEL = "Fake Tab";

export interface ChatContextTabContributorStoryProps {
  /** Drives the fake tab's `when` — `false` proves the seam HIDES it, not just that it CAN render. */
  readonly visible: boolean;
}

/** The chat-context contributor seam (§6c) LIVE: a fake `ContextTabDef<ChatContextState>` registered at
 *  a CtChatContributorSectionRegistry door (mirroring main.tsx) in place of the empty M3 registry, mounted
 *  through the real `SectionContextHost` → `defineContextTabs` → `resolveContextTabs` path. */
export function ChatContextTabContributorStory({ visible }: ChatContextTabContributorStoryProps): ReactElement {
  useEffect(() => {
    selectChat(CHAT_ID);
  }, []);
  const fakeTab: ContextTabDef<ChatContextState> = {
    id: CT_CONTRIBUTOR_TAB_ID,
    label: CT_CONTRIBUTOR_TAB_LABEL,
    when: () => visible,
    body: (): ReactElement => <div data-testid="ct-fake-context-tab-body">fake tab body</div>,
  };
  const contextContributors = createContributorRegistry<ContextTabDef<ChatContextState>>("chat-context", [fakeTab]);
  return (
    <CtDataProviders>
      <CtChatContributorSectionRegistry contextContributors={contextContributors}>
        <ChatContextHostHarness />
      </CtChatContributorSectionRegistry>
    </CtDataProviders>
  );
}

export interface ChatSurfaceContributorStoryProps {
  readonly anchor: ChatSurfaceAnchor;
  /** Drives the fake contribution's `when` — `false` proves the anchor HIDES it. */
  readonly visible: boolean;
  /** @defaultValue true — a committed room (canon read); message-footer needs a committed message to
   *  attach to. */
  readonly committed?: boolean;
}

const CT_SURFACE_CONTRIBUTION_ID = "ct-fake-surface-contribution";

/** The chat-surface-anchor contributor seam (§6c/M8) LIVE: a single fake `ChatSurfaceContribution` at the
 *  given anchor, registered at a `CtChatContributorSectionRegistry` door in place of the empty registry,
 *  mounted through the REAL `chats` section's `content()` → `ChatContent` → `ChatRoomSurface`/`MessageRow`
 *  anchor-consumer path (chat-room-surface.tsx / message-row.tsx). */
export function ChatSurfaceContributorStory({ anchor, visible, committed = true }: ChatSurfaceContributorStoryProps): ReactElement {
  useEffect(() => {
    if (committed) {
      selectChat(CHAT_ID);
    } else {
      startNewChat({ characterIds: [] });
    }
  }, [committed]);
  const fakeContribution: ChatSurfaceContribution =
    anchor === "message-footer"
      ? {
          id: CT_SURFACE_CONTRIBUTION_ID,
          anchor: "message-footer",
          when: () => visible,
          body: (): ReactElement => <div data-testid="ct-fake-surface-contribution">fake footer</div>,
        }
      : {
          id: CT_SURFACE_CONTRIBUTION_ID,
          anchor,
          when: () => visible,
          body: (): ReactElement => <div data-testid="ct-fake-surface-contribution">fake {anchor}</div>,
        };
  const surfaceContributors = createContributorRegistry<ChatSurfaceContribution>("chat-surface", [fakeContribution]);
  return (
    <CtDataProviders>
      <CtChatContributorSectionRegistry surfaceContributors={surfaceContributors}>
        <ChatContentHarness />
      </CtChatContributorSectionRegistry>
    </CtDataProviders>
  );
}

// Mounts the chats section's CONTENT through the real registry (`registry.get("chats").content()`) — the
// same call the shell's `SectionContent` makes — so the surface-anchor CT drives the production path.
function ChatContentHarness(): ReactElement {
  const registry = useSectionRegistry();
  const content = registry.get("chats").content;
  if (typeof content !== "function") {
    throw new Error("ct-stories: chats section content is a planned stub, not a body");
  }
  return <div style={{ height: 480 }}>{content()}</div>;
}

export interface DraftContextPanelStoryProps {
  /** The founding cast seed. Empty (default) ⇒ the solo case (Overrides + Injections only; no
   *  Members/Group — both gate at cast≥2). A ≥2-length seed exercises the Members/Group `when` predicates
   *  live (M3.3). */
  readonly characterIds?: readonly CharacterId[];
}

/** The DRAFT CONTEXT panel via the real host (J2/J3) — the draft-config-backed twin. No server reads for
 *  the solo case: the Overrides tab renders from `draftConfig` and writes to the draft-config store on
 *  edit. A ≥2-cast seed additionally reads `character.get` per cast id (the Members roster) — the
 *  `.ct.tsx` routeTrpc-stubs those for that case. */
export function DraftContextPanelStory({ characterIds = [] }: DraftContextPanelStoryProps): ReactElement {
  useEffect(() => {
    startNewChat({ characterIds });
  }, [characterIds]);
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <ChatContextHostHarness />
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

export interface CommittedSettingsTabStoryProps {
  /** Gates the host-only "Group behavior" section (with `showGroup`) + the overrides read-only copy. */
  readonly isHost?: boolean;
  /** The group-level gate the section carries — host of a group chat (CP-1). @defaultValue false */
  readonly showGroup?: boolean;
}

/** The consolidated Settings CONTEXT tab (settings-context-tab.tsx, CP-1) mounted DIRECTLY as the component
 *  it is — the `.ct.tsx` pins its own section-composition contract (Appearance overrides always; Group
 *  behavior gated by `showGroup`) independent of the section-registry resolve. The `.ct.tsx` routeTrpc-stubs
 *  `chat.getGroupConfig` (the Group-behavior section's suspense read) + `chat.setRoomOverrides`. */
export function CommittedSettingsTabStory({ isHost = true, showGroup = false }: CommittedSettingsTabStoryProps): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 380 }}>
        <CommittedSettingsTab chatId={CHAT_ID} roomOverrides={{}} isHost={isHost} background={null} showGroup={showGroup} />
      </div>
    </CtDataProviders>
  );
}

export interface DraftSettingsTabStoryProps {
  /** The draft group-level gate (≥2 cast) the section carries. @defaultValue false */
  readonly showGroup?: boolean;
}

/** The draft twin of the Settings tab (settings-context-tab.tsx, CP-1) mounted directly — store-backed, no
 *  network. Appearance overrides always renders (a draft is host-editable); Group behavior gates on
 *  `showGroup`. */
export function DraftSettingsTabStory({ showGroup = false }: DraftSettingsTabStoryProps): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 380 }}>
        <DraftSettingsTab draftKey="settings-tab-ct" showGroup={showGroup} />
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

// ── Context-tab entity-switch stories (F1 leg-1 key-placement pins) ─────────────────────────────
// Both forms mount under `ContextTabsPanel`, which keys by TAB id only. A chat switch with the tab open
// keeps the SAME component instance unless the form is keyed by its entity identity ABOVE the hook owner.
// These stories flip `entityId`+`config` on a button — exactly what a chat switch does to the tab body —
// and record every save so the CT proves the switched-to chat's own values are saved, never the previous
// chat's frozen seed. Two distinct `entityId`s (chat A / chat B) drive the remount.

const SWITCH_CHAT_A = "chatA";
const SWITCH_CHAT_B = "chatB";

/** GroupConfigForm switch harness: A seeds groupNudge=true, B seeds groupNudge=false — a field the test
 *  does NOT touch, so after a switch it must read B's seed (false), never A's frozen true. A button flips
 *  to B (the chat-switch prop change); the readout shows the LAST saved config. */
export function GroupConfigSwitchStory(): ReactElement {
  const [chat, setChat] = useState<"a" | "b">("a");
  const [saved, setSaved] = useState("");
  const config = chat === "a" ? { ...DEFAULT_GROUP_CONFIG, groupNudge: true } : { ...DEFAULT_GROUP_CONFIG, groupNudge: false };
  return (
    <CtDataProviders>
      <div style={{ width: 380 }}>
        <button type="button" onClick={(): void => setChat("b")}>
          switch chat
        </button>
        <div data-testid="group-config-saved">{saved}</div>
        <GroupConfigForm
          entityId={`group-config:${chat === "a" ? SWITCH_CHAT_A : SWITCH_CHAT_B}`}
          config={config}
          save={(next): Promise<void> => {
            setSaved(JSON.stringify(next));
            return Promise.resolve();
          }}
        />
      </div>
    </CtDataProviders>
  );
}

/** RoomOverridesForm switch harness: A seeds mainPrompt="A-prompt", B seeds "". A button flips to B; the
 *  readout shows the LAST saved overrides (the mainPrompt field is the probe). */
export function RoomOverridesSwitchStory(): ReactElement {
  const [chat, setChat] = useState<"a" | "b">("a");
  const [saved, setSaved] = useState("");
  const overrides = chat === "a" ? { mainPrompt: "A-prompt" } : {};
  return (
    <CtDataProviders>
      <div style={{ width: 380 }}>
        <button type="button" onClick={(): void => setChat("b")}>
          switch chat
        </button>
        <div data-testid="room-overrides-saved">{saved}</div>
        <RoomOverridesForm
          entityId={`room-overrides:${chat === "a" ? SWITCH_CHAT_A : SWITCH_CHAT_B}`}
          roomOverrides={overrides}
          isHost={true}
          save={(next): Promise<void> => {
            setSaved(JSON.stringify(next));
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

/** The topbar chat-identity header LEAD (chat-header.tsx) — avatar/title + the member-count chip. The
 *  roster comes from the routeTrpc `chat.getChat` stub the `.ct.tsx` sets per case. (The ⋯ options menu
 *  moved to the topbar TRAIL — ChatOptionsTopbarStory owns its host-gate coverage now.) */
export function ChatHeaderStory(): ReactElement {
  return (
    <CtDataProviders>
      <div>
        <ChatHeaderSurface chatId={CHAT_ID} />
      </div>
    </CtDataProviders>
  );
}

/** The active chat's options ⋯ menu as it renders at the END of the topbar TRAIL (chat-options-topbar.tsx).
 *  Drives the production path over the stubbed network: `chat.getChat` supplies the roster + the
 *  server-resolved host gate (`viewerIsHost` gates the ⋯ menu's host-only "Preview request…" item),
 *  `chat.listMessages` feeds the menu's guided turn actions. The inner `ActiveChatOptionsMenu` takes the id
 *  as a prop (the chrome wrapper's `useActiveChatId` narrowing needs no store seed here). */
export function ChatOptionsTopbarStory(): ReactElement {
  return (
    <CtDataProviders>
      {/* A wrapping div so `component` is the WRAPPER (the ⋯ menu popup renders through a Portal — item
          assertions use the PAGE locator, the ChatOptionsMenuStory precedent). */}
      <div>
        <ActiveChatOptionsMenu chatId={CHAT_ID} />
      </div>
    </CtDataProviders>
  );
}

/** The Members panel (members-panel.tsx + member-row-menu.tsx — the §7.1 Roster+People merge) as the
 *  PURE source-agnostic component it is: fixed People + Cast rows in, every action observed via the
 *  `members-last-action` readout, no network. `withPeople` seats two humans (viewer-host Riley + member
 *  Kestrel, Kestrel pending-nominated); `memberView` is the NON-host viewer (only View character
 *  remains); `omitForceTurn` is the DRAFT case (no turn to force). */
export interface MembersPanelStoryProps {
  readonly omitForceTurn?: boolean;
  readonly withPeople?: boolean;
  readonly memberView?: boolean;
  /** Seats Kestrel at the NON-default D16 posture (`from-join`) — the state chip + the RESTORE direction. */
  readonly restrictedMember?: boolean;
}
export function MembersPanelStory({
  omitForceTurn = false,
  withPeople = false,
  memberView = false,
  restrictedMember = false,
}: MembersPanelStoryProps): ReactElement {
  const [lastAction, setLastAction] = useState("");
  const people: MemberPersonRow[] = withPeople
    ? [
        {
          kind: "person",
          key: "participant_riley",
          userId: castId<UserId>("user_riley"),
          displayName: "Riley",
          handle: "riley",
          isHost: !memberView,
          isViewer: true,
          avatarHash: null,
          pendingNominee: false,
          historyVisibility: "full",
        },
        {
          kind: "person",
          key: "participant_kestrel",
          userId: castId<UserId>("user_kestrel"),
          displayName: "Kestrel",
          handle: "kestrel",
          isHost: memberView,
          isViewer: false,
          avatarHash: null,
          pendingNominee: !memberView,
          // Default `full` ⇒ the row menu offers the RESTRICT direction; `restrictedMember` flips both the
          // state chip and the item to the RESTORE direction.
          historyVisibility: restrictedMember ? "from-join" : "full",
        },
      ]
    : [];
  const cast: MemberCastRow[] = [
    {
      kind: "cast",
      key: "participant_aria",
      characterId: castId<CharacterId>("character_aria"),
      displayName: "Aria",
      disabled: false,
      talkativeness: 0.5,
      avatarHash: null,
      responding: true,
    },
    {
      kind: "cast",
      key: "participant_bryn",
      characterId: castId<CharacterId>("character_bryn"),
      displayName: "Bryn",
      disabled: true,
      talkativeness: 0.5,
      avatarHash: null,
      responding: false,
    },
  ];
  return (
    <CtDataProviders>
      <div style={{ width: 420 }}>
        <div data-testid="members-last-action">{lastAction}</div>
        <MembersPanel
          people={people}
          cast={cast}
          onViewCharacter={(id): void => setLastAction(`view:${id}`)}
          {...(memberView
            ? {}
            : {
                onSetDisabled: (id: CharacterId, disabled: boolean): void => setLastAction(`disabled:${id}:${disabled}`),
                onSetTalkativeness: (id: CharacterId, t: number): void => setLastAction(`talkativeness:${id}:${t}`),
              })}
          {...(omitForceTurn || memberView ? {} : { onForceTurn: (id: CharacterId): void => setLastAction(`force:${id}`) })}
          {...(memberView ? {} : { onRemoveCharacter: (id: CharacterId): void => setLastAction(`remove:${id}`) })}
          {...(withPeople && !memberView
            ? {
                onInvitePeople: (): void => setLastAction("invite"),
                onKick: (userId: UserId): void => setLastAction(`kick:${userId}`),
                onNominateHost: (userId: UserId): void => setLastAction(`nominate:${userId}`),
                onSetHistoryVisibility: (userId: UserId, visibility: JoinHistoryVisibility): void => setLastAction(`history:${userId}:${visibility}`),
                onLeave: (): void => setLastAction("leave"),
                leaveArchivesRoom: true,
              }
            : {})}
          {...(withPeople && memberView ? { onLeave: (): void => setLastAction("leave") } : {})}
        />
      </div>
    </CtDataProviders>
  );
}

/** The Members panel with a REMOVABLE person row — `remove-kestrel` simulates the bus echo dropping
 *  the kicked row, so the CT can prove the §7.1 post-destructive focus rule (focus lands on a
 *  neighbor, never `body`). */
export function MembersKickFocusStory(): ReactElement {
  const [kicked, setKicked] = useState(false);
  const kestrel: MemberPersonRow = {
    kind: "person",
    key: "participant_kestrel",
    userId: castId<UserId>("user_kestrel"),
    displayName: "Kestrel",
    handle: "kestrel",
    isHost: false,
    isViewer: false,
    avatarHash: null,
    pendingNominee: false,
    historyVisibility: "full",
  };
  const people: MemberPersonRow[] = [
    {
      kind: "person",
      key: "participant_riley",
      userId: castId<UserId>("user_riley"),
      displayName: "Riley",
      handle: "riley",
      isHost: true,
      isViewer: true,
      avatarHash: null,
      pendingNominee: false,
      historyVisibility: "full",
    },
    ...(kicked ? [] : [kestrel]),
  ];
  const cast: MemberCastRow[] = [
    {
      kind: "cast",
      key: "participant_aria",
      characterId: castId<CharacterId>("character_aria"),
      displayName: "Aria",
      disabled: false,
      talkativeness: 0.5,
      avatarHash: null,
      responding: false,
    },
  ];
  return (
    <CtDataProviders>
      <div style={{ width: 420 }}>
        <button type="button" data-testid="remove-kestrel" onClick={(): void => setKicked(true)}>
          remove
        </button>
        <MembersPanel
          people={people}
          cast={cast}
          onInvitePeople={(): void => undefined}
          onKick={(): void => undefined}
          onSetDisabled={(): void => undefined}
          onSetTalkativeness={(): void => undefined}
        />
      </div>
    </CtDataProviders>
  );
}

/** The invite MINT dialog (invite-dialog.tsx — §8.2) over the stubbed network: the `.ct.tsx` sets
 *  `invites.createInvite`/`invites.listInvites`/`invites.revokeInvite` per case. Mounted OPEN. */
export function InviteDialogStory(): ReactElement {
  return (
    <CtDataProviders>
      <div>
        <InviteDialog chatId={CHAT_ID} open={true} onOpenChange={(): void => undefined} />
      </div>
    </CtDataProviders>
  );
}

export interface ChatOptionsMenuStoryProps {
  /** @defaultValue true — a committed chat (`CHAT_ID`); `false` mounts the DRAFT arm (no chatId, the #8
   *  grey-out: the SAME menu with the canon-requiring actions disabled). */
  readonly committed?: boolean;
  /** @defaultValue false — seed one cast member (enables "New chat with same cast" + the solo gallery), so
   *  the draft/committed FULL-item-set parity CT can assert the character-gated rows too. */
  readonly withCast?: boolean;
}

const CT_OPTIONS_CAST = [{ characterId: castId<CharacterId>("char_ct_options"), name: "Aria" }];

/** The ⋯ chat-options menu (chat-options-menu.tsx). Its turn actions (Continue/Regenerate/Impersonate)
 *  reuse `useGuidedActions` with an EMPTY steer — the `.ct.tsx` stubs `chat.listMessages` (a tail assistant
 *  enables Continue/Regenerate) and asserts each verb fires with NO `guided` object (the F2 plain-turn fix).
 *  `committed=false` mounts the DRAFT arm (no `chatId`) — the SAME menu, canon-requiring items disabled (#8). */
export function ChatOptionsMenuStory({ committed = true, withCast = false }: ChatOptionsMenuStoryProps = {}): ReactElement {
  return (
    <CtDataProviders>
      {/* A wrapping div so `component` is the WRAPPER (the popup renders through a Portal — item
          assertions use the PAGE locator, the composer-wand precedent). */}
      <div>
        <ChatOptionsMenu {...(committed ? { chatId: CHAT_ID } : { committed: false })} title="Test chat" characters={withCast ? CT_OPTIONS_CAST : []} />
      </div>
    </CtDataProviders>
  );
}

/** The Members panel with a re-seed harness (F4): `bump-aria` moves the talkativeness PROP (a
 *  bus/other-device echo), and `onSetTalkativeness` is a NO-OP (busDriven: no optimistic prop update —
 *  stands in for a FAILED write). Proves the weight chip re-seeds from the prop on a value-only change
 *  AND the popover thumb snaps back after a failed write (the row is keyed by member id, so no remount). */
export function MembersReseedStory(): ReactElement {
  const [ariaWeight, setAriaWeight] = useState(0.5);
  const cast: MemberCastRow[] = [
    {
      kind: "cast",
      key: "participant_aria",
      characterId: castId<CharacterId>("character_aria"),
      displayName: "Aria",
      disabled: false,
      talkativeness: ariaWeight,
      avatarHash: null,
      responding: false,
    },
  ];
  return (
    <CtDataProviders>
      <div style={{ width: 420 }}>
        <button type="button" data-testid="bump-aria" onClick={(): void => setAriaWeight(0.8)}>
          bump
        </button>
        <MembersPanel people={[]} cast={cast} onSetDisabled={(): void => undefined} onSetTalkativeness={(): void => undefined} />
      </div>
    </CtDataProviders>
  );
}

/** The composer-adjacent speak-as dropdown (speak-as-select.tsx). A committed handle by default (reads
 *  the `chat.getChat` roster + fires `chat.generate`); `committed=false` mounts a draft (renders `null`). */
export function SpeakAsSelectStory({ committed = true }: { readonly committed?: boolean }): ReactElement {
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

/** The `/join` link landing (preview→confirm — the multi-human invites lane) over the stubbed network:
 *  the `.ct.tsx` scripts `invites.previewInvite` (the minimal room/host/count/mode preview OR the
 *  leak-free NOT_FOUND) + `invites.redeemInvite`. `onDone` surfaces as rendered text so the CT can
 *  assert the close/teardown path without a route harness. */
/** The per-character gallery modal (grid + lightbox + destructive-remove confirm) over the stubbed
 *  network: the `.ct.tsx` scripts `assets.listGallery` (the curated grid) + `assets.removeFromGallery`.
 *  Starts OPEN so the CT drives grid → lightbox → confirm without a trigger. */
export function CharacterGalleryDialogStory({ characterName = "Aria" }: { readonly characterName?: string }): ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <CtDataProviders>
      <div>
        <CharacterGalleryDialog open={open} onOpenChange={setOpen} characterId={castId<CharacterId>("character_ct_gallery")} characterName={characterName} />
      </div>
    </CtDataProviders>
  );
}

export function JoinInviteDialogStory({ token }: { readonly token: string }): ReactElement {
  const [done, setDone] = useState(false);
  return (
    <CtDataProviders>
      {done ? <p data-testid="ct-join-done">join dialog closed</p> : <JoinInviteDialog token={token} onDone={(): void => setDone(true)} />}
    </CtDataProviders>
  );
}

// ── Attachment media render story (#67) — the asset arm of `MessageMediaBlock` over the resolver context ──

/** A stable asset id the render CT keys its provided url on. */
const CT_ATTACH_ASSET_ID = castId<AssetId>("asset_ct_attach");

/** A valid 1×1 transparent PNG data URL — an ASSET src (own origin) renders it directly (no network, no
 *  `onError` broken-fallback), so the CT can assert the real `<img>` src deterministically. */
const CT_PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

export interface AttachmentMediaStoryProps {
  /** `true` mounts the context EMPTY (the provider-less / still-loading placeholder path); default provides
   *  the resolved data-URL blob for the asset (the render path). A boolean — not an optional url — so the
   *  empty case can't be swallowed by a default param. */
  readonly empty?: boolean;
}

/** `MessageMediaBlock`'s ASSET arm (#67) over the `AttachmentUrlContext`: the resolved case provides a url
 *  (renders the gated `<MessageMedia>` image); `empty` provides an empty map (the `[image]` placeholder
 *  degrade). A pure-render story (no data layer — the context IS the seam). */
export function AttachmentMediaStory({ empty = false }: AttachmentMediaStoryProps): ReactElement {
  const block = {
    kind: "media",
    media: "image",
    src: { kind: "asset", assetId: CT_ATTACH_ASSET_ID },
    alt: "an attached image",
  } as const;
  const map = new Map<AssetId, string>(empty ? [] : [[CT_ATTACH_ASSET_ID, CT_PNG_DATA_URL]]);
  return (
    <AttachmentUrlContext value={map}>
      <MessageMediaBlock block={block} allowExternal={false} />
    </AttachmentUrlContext>
  );
}

// ── Metadata / cost stories (WS3, PD-137) ─────────────────────────────────────────────────────────

const FROZEN_META_AT = 1_750_000_000_000;

/** `MessageMetadataRow` over a fully-populated `MessageView`, the visibility toggles supplied by the
 *  `.ct.tsx` — proving the datum-gating matrix (toggle ⋀ datum-present) + the `·` separators + the
 *  render-nothing-when-empty floor. Wrapped in `CtDataProviders` because a revealed cost datum's
 *  `MessageCostReadout` reads tRPC (it never fetches until clicked). */
export function MessageMetadataRowStory({
  visibility,
  message,
}: {
  readonly visibility: MessageMetadataVisibility;
  readonly message?: Partial<MessageView>;
}): ReactElement {
  const view = makeMessageView({
    model: "qwen3-vl",
    tokensOut: 128,
    tokensIn: 64,
    genStartedAt: FROZEN_META_AT,
    genFinishedAt: FROZEN_META_AT + 3400,
    generationId: null,
    ...message,
  });
  return (
    <CtDataProviders>
      <div data-testid="metadata-host">
        <MessageMetadataRow message={view} visibility={visibility} />
      </div>
    </CtDataProviders>
  );
}

/** `MessageCostReadout` in isolation — the PD-137 paid-fetch gate. The story sets a `generationId` so the
 *  row renders (a null-id row returns null); the `.ct.tsx` routes (or withholds) `connection.orGenerationCost`
 *  to drive the reveal → loading → settled / error labels, and asserts the fetch fires ONLY after the click. */
export function MessageCostReadoutStory({ generationId = "gen_ct_1" }: { readonly generationId?: string | null }): ReactElement {
  const view = makeMessageView({ generationId });
  return (
    <CtDataProviders>
      <MessageCostReadout message={view} />
    </CtDataProviders>
  );
}

const SELECTION_MSG_A = castId<MessageId>("msg_ct_sel_a");
const SELECTION_MSG_B = castId<MessageId>("msg_ct_sel_b");

/** `MessageSelectionBar` driven by the real `message-selection` store. The store lives in the BROWSER, so
 *  the `.ct.tsx` (node-side) can't call its setters directly — this harness exposes them as in-page
 *  controls (the jump-to-latest `ctl-*` precedent): enter select mode, toggle each id. The bar then
 *  renders-when-active with the live count, and the `.ct.tsx` observes confirm→`chat.deleteMessages`→
 *  exit-mode via routeTrpc. Renders null while the mode is off (the render-when-active contract). */
export function MessageSelectionBarStory(): ReactElement {
  return (
    <CtDataProviders>
      <button type="button" data-testid="ctl-enter" onClick={(): void => enterSelectionMode()}>
        enter
      </button>
      <button type="button" data-testid="ctl-toggle-a" onClick={(): void => toggleMessageSelected(SELECTION_MSG_A)}>
        toggle a
      </button>
      <button type="button" data-testid="ctl-toggle-b" onClick={(): void => toggleMessageSelected(SELECTION_MSG_B)}>
        toggle b
      </button>
      <MessageSelectionBar chatId={CHAT_ID} />
    </CtDataProviders>
  );
}

// ── #9 compaction-marker peek ─────────────────────────────────────────────────────────────────────

/** `CompactSummaryPeek` — the memory-marker popover. Pure render; the `.ct.tsx` proves the summary text
 *  is behind the trigger (not in the DOM until opened) and reveals on click. The popup renders through a
 *  Base UI Portal, so the `.ct.tsx` reads it via the PAGE locator. */
export function CompactSummaryPeekStory({ summary }: { readonly summary: string }): ReactElement {
  return <CompactSummaryPeek summary={summary} />;
}

// ── Draft greeting swipe strip ────────────────────────────────────────────────────────────────────

const GREETING_DRAFT_KEY = "draft_ct_greeting";
const GREETING_CHARACTER_ID = castId<CharacterId>("character_ct_greeting");

/** `GreetingSwipeStrip` wired to the real draft-config store the way `message-row.tsx` drives it: the
 *  shown `current` text is DERIVED from `useDraftConfig` (falling back to `variants[0]`), so a prev/next
 *  pick writes `setDraftGreeting` → the store updates → this harness re-derives `current` → the counter
 *  moves. That round-trip (not just "a button exists") is what the `.ct.tsx` asserts, plus the
 *  hand-edited "— / m" custom case and the disabled-edge gating. A `custom` seed models a hand-typed
 *  greeting that matches no alternate. */
export function GreetingSwipeStripStory({ variants, custom = false }: { readonly variants: readonly string[]; readonly custom?: boolean }): ReactElement {
  const draft = useDraftConfig(GREETING_DRAFT_KEY);
  const stored = draft.greetings?.[GREETING_CHARACTER_ID];
  // Seed a hand-edited greeting (matches no alternate → idx -1) once, so the "— / m" custom path renders
  // without the store already holding an alternate.
  useEffect(() => {
    if (custom) {
      setDraftGreeting(GREETING_DRAFT_KEY, GREETING_CHARACTER_ID, "a hand-typed opening that matches no alternate");
    }
  }, [custom]);
  const current = stored ?? variants[0] ?? "";
  return (
    <div>
      <div data-testid="greeting-current">{current}</div>
      <GreetingSwipeStrip draftKey={GREETING_DRAFT_KEY} characterId={GREETING_CHARACTER_ID} variants={variants} current={current} />
    </div>
  );
}

// ── Assembly preview panel (#28 Preview tab) — host-only, host/getShapeTrace + previewAssembly reads ──

/** `AssemblyPreviewPanel` over the stubbed `chat.previewAssembly` + `chat.getShapeTrace` reads (both
 *  host-only). The `.ct.tsx` routeTrpc-stubs both to drive loading/error/success + the retry path
 *  (`QueryBoundary`'s reset handshake). */
export function AssemblyPreviewPanelStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 480 }}>
        <AssemblyPreviewPanel chatId={CHAT_ID} />
      </div>
    </CtDataProviders>
  );
}

// ── Injections manager (the manual-injections CRUD tab) ─────────────────────────────────────────────

/** `InjectionsManager` over the stubbed `chat.listChatInjections` + the `setChatInjection`/
 *  `deleteChatInjection` mutations. Wrapped in `QueryBoundary` (mirrors `chats-section.tsx`'s own
 *  `injections` tab body — `InjectionsManager` is never mounted bare in production, only ever behind its
 *  own suspense/error boundary). The `.ct.tsx` drives add/edit/delete and asserts the MUTATION count
 *  (routeTrpc's recorder), never a UI reaction — the autosave form's own CT covers the save chrome. */
export function InjectionsManagerStory({ isHost = true }: { readonly isHost?: boolean }): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 420 }}>
        <QueryBoundary
          fallback={<Text tone="muted">Loading injections…</Text>}
          renderError={(_error, retry): ReactElement => <QueryErrorState label="injections" onRetry={retry} />}
        >
          <InjectionsManager chatId={CHAT_ID} isHost={isHost} />
        </QueryBoundary>
      </div>
    </CtDataProviders>
  );
}

/** The Memory settings SECTION (Phase B ①) over the real data layer — getUserSettings +
 *  updateUserSettingsSection("memory") stubbed in the `.ct.tsx`. Proves the master switch's write path. */
export function MemorySettingsSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 640, padding: 16 }}>
        <MemorySettingsSection />
      </div>
    </CtDataProviders>
  );
}

/** The Databank settings SECTION (Phase B ④) over the real data layer — getUserSettings +
 *  updateUserSettingsSection("databank") stubbed in the `.ct.tsx`. Proves the retrieval-tuning write path. */
export function DatabankSettingsSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 640, padding: 16 }}>
        <DatabankSettingsSection />
      </div>
    </CtDataProviders>
  );
}

/** The Image-prompts settings SECTION (Phase B ⑫) over the real data layer — getUserSettings +
 *  updateUserSettingsSection("imagery") stubbed in the `.ct.tsx`. Proves the per-mode template write path. */
export function ImageryTemplatesSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 720, padding: 16 }}>
        <ImageryTemplatesSection />
      </div>
    </CtDataProviders>
  );
}
