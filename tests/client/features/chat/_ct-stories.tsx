// Chat message-list CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module).
// The surface/anchor come through the feature front door; the leaf components come via relative path
// into the package (stories legitimately compose feature INTERNALS the front door doesn't re-export).
// Fixtures are plain `MessageView`/`ChatBusEvent` literals (the support/factories are DB-row builders
// for a different layer). Data-layer stories wrap in <CtDataProviders> (Query + real tRPC over the
// stubbed network); pure-render stories rely on the beforeMount toast/tooltip chrome.

import { QueryBoundary } from "@orb/client/components";
import type { ChatBusDeps } from "@orb/client/data";
import { applyChatBusEvent, createInvalidation, QueryErrorState, useOrbSocket, useTRPC } from "@orb/client/data";
import { automationActivityTab, automationQuickReplySource, automationSuggestionSource } from "@orb/client/features/automation";
import { characterSlashCommands } from "@orb/client/features/character";
import type { GoToSection } from "@orb/client/features/chat";
import {
  ChatLandingSurface,
  ChatListAnchor,
  ChatListSurface,
  ChatRoomSurface,
  CommandPaletteSurface,
  Composer,
  chatAlsoOpenTile,
  chatMastheadTile,
  chatQuickPicksTile,
  chatRecentsTile,
  chatSlashCommands,
  chatTempChatTile,
  JoinInviteDialog,
  MessageListSurface,
  MessageThreadAnchor,
  makeChatControlsContribution,
  NewChatPicker,
} from "@orb/client/features/chat";
import { HomeSurface } from "@orb/client/features/home";
// #618 — the shell-level detail modal the room-image click opens; imported through the SAME front door the
// providers use, never a relative path (a relative import gets a different React context instance).
import { ImageDetailBody, ImageEditBody } from "@orb/client/features/imagery";
// B8 (interaction-direction-spec §7): the REAL rpg dice ASK source + in-thread RESULT renderer, through the
// same front door the providers use (a relative import gets a different React context instance).
import { rpgDiceAskSource, rpgDiceToolRenderer } from "@orb/client/features/rpg";
import type {
  ChatContextState,
  ChatControl,
  ChatControlSource,
  ChatControlSourceMountProps,
  ChatSurfaceAnchor,
  ChatSurfaceContribution,
  ContextTabDef,
  ContributorRegistry,
  MessageRenderContext,
  MessageToolsRenderer,
  NotifyInput,
  RowRenderPolicy,
  SlashCommandContribution,
  SlashCommandMountProps,
  ToolRenderer,
} from "@orb/client/lib";
import { bindNotify, createContributorRegistry, notify, resolveRowRenderPolicy, toNotice } from "@orb/client/lib";
import type { HomeTileContribution } from "@orb/client/state";
import {
  cancelEditingMessage,
  chatDeletedFromList,
  chatStream,
  committedChat,
  enterSelectionMode,
  isLiveTurnPhase,
  MessageToolsRendererRegistryProvider,
  openNewChatPicker,
  SlashCommandRegistryProvider,
  selectChat,
  setFocusMode,
  setMobileViewport,
  startEditingMessage,
  toggleMessageSelected,
  useActiveSection,
  useContextTab,
  useImagineSeed,
  useNewChatIntent,
  useOpenModal,
  useOpenOverlayPanel,
  usePanelOverride,
  useSectionRegistry,
  useStatusAnnouncement,
  useTurnPhase,
} from "@orb/client/state";
import type { QuickReplyMode } from "@orb/contracts/automation";
import type {
  CardTrust,
  ChatIdentity,
  HandoffOffer,
  JoinHistoryVisibility,
  MemoryRecallSlice,
  MessageKind,
  MessageView,
  ParticipantView,
  RoomOverrides,
  ToolCallRecord,
} from "@orb/contracts/chat";
import { buildIdentityAvatarMaps, buildIdentityNameContext, DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { RewriteToggleId } from "@orb/contracts/preset";
import { REWRITE_TOGGLES } from "@orb/contracts/preset";
import { BACKGROUND_DIM_MIN } from "@orb/contracts/settings";
import type { ThemeChatStyle } from "@orb/contracts/theme";
import type { AssetId, CharacterId, ChatId, DocumentId, MessageId, PersonaId, UserId, WorldBookId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import { AriaAnnouncer } from "@orb/ui/aria-announcer";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { ThemeScope } from "@orb/ui/theme-scope";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { useEffect, useLayoutEffect, useState } from "react";
import { NoticeBand } from "../../../../packages/client/src/features/app-shell/components/notice-band.tsx";
import { SectionContextHeader, SectionContextHost } from "../../../../packages/client/src/features/app-shell/components/section-context-host.tsx";
import { CharacterGalleryDialog } from "../../../../packages/client/src/features/chat/anchors/character-gallery-dialog.tsx";
import { AddChatBookDialog } from "../../../../packages/client/src/features/chat/components/add-chat-book-dialog.tsx";
import { AddChatDocumentDialog } from "../../../../packages/client/src/features/chat/components/add-chat-document-dialog.tsx";
import { AppearanceAvatarsSection } from "../../../../packages/client/src/features/chat/components/appearance-avatars-section.tsx";
import { AppearanceMessageDetailsSection } from "../../../../packages/client/src/features/chat/components/appearance-message-details-section.tsx";
import { AppearanceMessageStyleSection } from "../../../../packages/client/src/features/chat/components/appearance-message-style-section.tsx";
import { AssemblyPreviewPanel } from "../../../../packages/client/src/features/chat/components/assembly-preview-panel.tsx";
import { ChatMessageHandlingSection } from "../../../../packages/client/src/features/chat/components/chat-behavior-message-handling-section.tsx";
import { ChatStreamingSection } from "../../../../packages/client/src/features/chat/components/chat-behavior-streaming-section.tsx";
import { ChatBooksSection } from "../../../../packages/client/src/features/chat/components/chat-books-section.tsx";
import { ChatCharacterBar } from "../../../../packages/client/src/features/chat/components/chat-character-bar.tsx";
import { DisclosureSection } from "../../../../packages/client/src/features/chat/components/chat-context-disclosure-section.tsx";
import { ChatDocumentsSection } from "../../../../packages/client/src/features/chat/components/chat-documents-section.tsx";
import { ChatHeaderSurface } from "../../../../packages/client/src/features/chat/components/chat-header.tsx";
import { ChatImportDialog } from "../../../../packages/client/src/features/chat/components/chat-import-dialog.tsx";
import { ChatListHeader } from "../../../../packages/client/src/features/chat/components/chat-list-header.tsx";
import { ChatOptionsMenu } from "../../../../packages/client/src/features/chat/components/chat-options-menu.tsx";
import { ChatRecallIndicator } from "../../../../packages/client/src/features/chat/components/chat-recall-indicator.tsx";
import { ChatsTopbarHeader } from "../../../../packages/client/src/features/chat/components/chats-topbar-header.tsx";
import { ChoiceSendProvider } from "../../../../packages/client/src/features/chat/components/choice-send-provider.tsx";
import { CommittedMembersTab } from "../../../../packages/client/src/features/chat/components/committed-members-tab.tsx";
import { CompactSummaryPeek } from "../../../../packages/client/src/features/chat/components/compact-summary-peek.tsx";
import { ComposerArgHintStrip } from "../../../../packages/client/src/features/chat/components/composer-arg-hint-strip.tsx";
import { ComposerAttachmentStrip } from "../../../../packages/client/src/features/chat/components/composer-attachment-strip.tsx";
import { ActiveChatOptionsMenu } from "../../../../packages/client/src/features/chat/components/composer-chat-options.tsx";
import { DatabankSettingsSection } from "../../../../packages/client/src/features/chat/components/databank-settings-section.tsx";
import { GhostMessageRow } from "../../../../packages/client/src/features/chat/components/ghost-message-row.tsx";
import { GreetingSwipeStrip } from "../../../../packages/client/src/features/chat/components/greeting-swipe-strip.tsx";
import { CommittedGroupConfigTab, GroupConfigForm } from "../../../../packages/client/src/features/chat/components/group-config-form.tsx";
import { ImageryTemplatesSection } from "../../../../packages/client/src/features/chat/components/imagery-templates-section.tsx";
import { InjectionsManager, InjectionsSkeleton } from "../../../../packages/client/src/features/chat/components/injections-manager.tsx";
import { InviteDialog } from "../../../../packages/client/src/features/chat/components/invite-dialog.tsx";
import { MacroPicksSection } from "../../../../packages/client/src/features/chat/components/macro-picks-section.tsx";
import { MemberCardViewer } from "../../../../packages/client/src/features/chat/components/member-card-viewer.tsx";
import { MembersPanel } from "../../../../packages/client/src/features/chat/components/members-panel.tsx";
import { MemoryRecallDetail } from "../../../../packages/client/src/features/chat/components/memory-recall-detail.tsx";
import { MemorySettingsSection } from "../../../../packages/client/src/features/chat/components/memory-settings-section.tsx";
import { MessageActionsRow } from "../../../../packages/client/src/features/chat/components/message-actions-row.tsx";
import { MessageContent } from "../../../../packages/client/src/features/chat/components/message-content.tsx";
import { MessageCostReadout } from "../../../../packages/client/src/features/chat/components/message-cost-readout.tsx";
import { MessageEditTextarea } from "../../../../packages/client/src/features/chat/components/message-edit-textarea.tsx";
import { MessageMediaBlock } from "../../../../packages/client/src/features/chat/components/message-media-block.tsx";
import type { MessageMetadataVisibility } from "../../../../packages/client/src/features/chat/components/message-metadata-row.tsx";
import { MessageMetadataRow } from "../../../../packages/client/src/features/chat/components/message-metadata-row.tsx";
import { MessageRow } from "../../../../packages/client/src/features/chat/components/message-row.tsx";
import { MessageSelectionBar } from "../../../../packages/client/src/features/chat/components/message-selection-bar.tsx";
import { MessageToolCalls } from "../../../../packages/client/src/features/chat/components/message-tool-calls.tsx";
import { ProseSettingsSection } from "../../../../packages/client/src/features/chat/components/prose-settings-section.tsx";
import { ReasoningBlock } from "../../../../packages/client/src/features/chat/components/reasoning-block.tsx";
import { RegexSection } from "../../../../packages/client/src/features/chat/components/regex-section.tsx";
import { RewriteDialog } from "../../../../packages/client/src/features/chat/components/rewrite-dialog.tsx";
import { RoomOverridesForm } from "../../../../packages/client/src/features/chat/components/room-overrides-form.tsx";
import { CommittedSettingsTab } from "../../../../packages/client/src/features/chat/components/settings-context-tab.tsx";
import { SwipeStrip } from "../../../../packages/client/src/features/chat/components/swipe-strip.tsx";
import type { ResolvedAttachment } from "../../../../packages/client/src/features/chat/hooks/attachment-url-context.tsx";
import { AttachmentUrlContext } from "../../../../packages/client/src/features/chat/hooks/attachment-url-context.tsx";
import { ChoiceSendContext } from "../../../../packages/client/src/features/chat/hooks/choice-send-context.tsx";
import type { PendingAttachment } from "../../../../packages/client/src/features/chat/hooks/use-composer-attachments.ts";
import { speakerThemesByName } from "../../../../packages/client/src/features/chat/lib/attribution.ts";
import { useChatsSelectionTitle } from "../../../../packages/client/src/features/chat/lib/chats-selection-title.ts";
import type { MemberCharacterRow, MemberPersonRow } from "../../../../packages/client/src/features/chat/lib/member-rows.ts";
import { warningNotice } from "../../../../packages/client/src/features/chat/lib/warning-notice.ts";
import { enableAppearanceMessageRegistry } from "../../../../packages/client/src/lib/appearance-message-registry.ts";
import type { SlashArgOffer } from "../../../../packages/client/src/lib/contribution-contracts.ts";
import { CtAppDataProviders, CtChatContributorSectionRegistry, CtDataProviders, CtRealSectionRegistry } from "../../../support/browser/ct-data-providers.tsx";
import { CtToastSurface } from "../../lib/_ct-stories.tsx";
import { CHAT_ID, COMPOSER_CHAT_ID, makeMessageView } from "./fixtures.ts";

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
  /** A FIXED mount width (px) — the row is its own `@container`, so this is what its composition reads. */
  readonly width?: number;
  readonly chatStyle: ThemeChatStyle;
  readonly messageId?: MessageId;
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
  readonly autoFixMarkdown?: boolean;
  readonly colorQuotedSpeech?: boolean;
  readonly messageActions?: "expanded" | "hover";
  /** WS3/N3 — the per-toggle metadata-chip visibility (timestamp → name row, the rest → metadata row).
   *  Omitted ⇒ every datum hidden (the `MessageRow` NO_METADATA_VISIBLE default). */
  readonly metadataVisibility?: MessageMetadataVisibility;
  /** The row's persisted tool exchanges (D48) — omitted ⇒ `[]`, the non-tool turn every other story drives. */
  readonly toolCalls?: readonly ToolCallRecord[];
  /** The DURABLE reasoning trace (`MessageView.reasoning`) a completed turn persisted. Omitted/null ⇒ the
   *  no-reasoning row AND the §3.6-stripped shape a member of a deception game receives — both must render
   *  no disclosure at all. */
  readonly reasoning?: string | null;
  /** Phase 4b §B.5.5 — the reasoning-disclosure glyph pref. */
  readonly showLLMReasoningIcon?: boolean;
  /** #1032 — the edit stamp (`MessageView.editedAt`, epoch-ms). Omitted/null ⇒ the never-edited row every
   *  other story drives; a number drives the name row's "edited" marker beside the timestamp. */
  readonly editedAt?: number | null;
  /** WIREBTN — the server-resolved room-HOST bit (`ChatDetail.viewerIsHost`). Gates the kebab's
   *  "View wire trace…" item; default false = the member plane every other row story drives. */
  readonly viewerIsHost?: boolean;
  /** The row's DECLARED purpose (`MessageView.kind`, D129) — `narrator` gates the plain-`Name:` speaker-span
   *  split AND the narrator attribution. Omitted ⇒ `standard`, the ordinary row every other story drives. */
  readonly messageKind?: MessageKind;
  /** #113 — the verdict `MessageListRowMeta.exceedsViewport` carries in production (this row is taller
   *  than the scrollport). Passed directly here so a CT can assert the sticky treatment across every
   *  chatStyle without building eight multi-viewport transcripts. */
  readonly stickyAttribution?: boolean;
  /** Present ⇒ the row mounts inside a bounded SCROLLPORT of this pixel height, so a long body really
   *  exceeds the viewport and the #113 pin can be measured against a real scroll (the settled-row twin of
   *  `GhostRowScriptedStoryProps.scrollportHeight`). Absent ⇒ the unbounded mount every other row story uses. */
  readonly scrollportHeight?: number;
  /** The variant's `model` identifier (#167 — the credit the action cluster prints through
   *  `@orb/kit/model-name`). Omitted ⇒ the story's hosted-route default; `null` ⇒ a row with no model at
   *  all (a greeting/draft), which must credit nothing. */
  readonly model?: string | null;
  /** `MessageRow.showSwipes` — the tail-assistant bit that renders the SWIPE STRIP under the bubble.
   *  The row is given 3 variants so the strip renders its full pager (#221 measures the strip's own
   *  backing over wallpaper, and a single-variant strip is just the generate chevron). */
  readonly showSwipes?: boolean;
}

/** One row in a chosen chatStyle — the variant-mechanism CT mounts this three times; also the
 *  #21 attribution-chrome CT's mount point (roster/producer maps are optional pass-throughs). */
export function MessageRowStory({
  width,
  chatStyle,
  messageId,
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
  autoFixMarkdown,
  colorQuotedSpeech,
  messageActions,
  metadataVisibility,
  toolCalls,
  reasoning = null,
  showLLMReasoningIcon,
  editedAt = null,
  viewerIsHost = false,
  messageKind = "standard",
  stickyAttribution = false,
  scrollportHeight,
  model = "ct/model-x",
  showSwipes = false,
}: MessageRowStoryProps): ReactElement {
  const participantsMap =
    participants === undefined
      ? undefined
      : new Map(
          participants.filter((p): p is ParticipantView & { characterId: CharacterId } => p.characterId !== null).map((p) => [p.characterId, p] as const),
        );
  // The story's own producer, built with the REAL contracts identity projections (never a hand-rolled Map) so
  // `MessageRow` sees exactly the maps `message-list-surface.tsx` would derive from the wire identities (D137).
  // Names cover the participant roster UNION any decoupled `characters` (the removal case — a character
  // with no participant row whose message is still in the transcript); the decoupled `characters` entries
  // (later in the array — last-write-wins) are what carry avatar hashes: that IS the
  // participant-independent portrait floor under test.
  const storyIdentities: readonly ChatIdentity[] = [
    ...(participants ?? [])
      .filter((p): p is ParticipantView & { characterId: CharacterId } => p.characterId !== null)
      .map((p): ChatIdentity => ({ kind: "character", id: p.characterId, name: p.displayName, avatarHash: null })),
    ...(characters ?? []).map((c): ChatIdentity => ({ kind: "character", id: c.id, name: c.name, avatarHash: c.avatarHash ?? null })),
    ...(personas ?? []).map((p): ChatIdentity => ({ kind: "persona", id: p.id, name: p.name, description: p.description ?? "", avatarHash: null })),
  ];
  const { characterNamesById, personaNamesById } = buildIdentityNameContext(storyIdentities);
  const { characterAvatarsById } = buildIdentityAvatarMaps(storyIdentities);

  return (
    // The row now always renders <MessageActionsRow> (Edit/Hide/Delete/Fork/Copy), which reads the
    // data layer (`useTRPC`) even though these CTs never click a mutating action — the provider must
    // exist regardless (the swipe-strip.tsx precedent: any tRPC-reading leaf needs CtDataProviders).
    //
    // `width` is a FIXED container (the narrowest-mount rule): the row is its own `@container`, so its
    // reading composition is a function of this box — a content-sized mount root agrees with the bug.
    // `scrollportHeight` turns that same box into the row's SCROLLPORT, which is the only mount where a
    // `position: sticky` band actually sticks and a scroll can be driven under it (#168).
    <CtDataProviders>
      <div
        data-testid="row-scrollport"
        style={{
          ...(width === undefined ? {} : { width }),
          ...(scrollportHeight === undefined ? {} : { height: scrollportHeight, overflowY: "auto" }),
        }}
      >
        <MessageThreadAnchor>
          <MessageRow
            message={makeMessageView({
              ...(messageId === undefined ? {} : { id: messageId }),
              role: messageRole,
              kind: messageKind,
              editedAt,
              content,
              characterId,
              personaId,
              tokensOut: 128,
              model,
              toolCalls: toolCalls ?? [],
              reasoning,
              ...(showSwipes ? { variantCount: 3, selectedVariantIdx: 1 } : {}),
            })}
            chatStyle={chatStyle}
            showSwipes={showSwipes}
            stickyAttribution={stickyAttribution}
            showLLMReasoningIcon={showLLMReasoningIcon}
            metadataVisibility={metadataVisibility}
            avatarSize={avatarSize}
            avatarShape={avatarShape}
            avatarAspect={avatarAspect}
            avatarRing={avatarRing}
            showInChatAvatars={showInChatAvatars}
            autoFixMarkdown={autoFixMarkdown}
            colorQuotedSpeech={colorQuotedSpeech}
            messageActions={messageActions}
            participants={participantsMap}
            characterNamesById={characterNamesById}
            characterAvatarsById={characterAvatarsById}
            personaNamesById={personaNamesById}
            activePersonaId={activePersonaId}
            anchorPersonaId={anchorPersonaId}
            viewerIsHost={viewerIsHost}
            toolRenderers={NO_TOOL_RENDERERS}
          />
        </MessageThreadAnchor>
      </div>
    </CtDataProviders>
  );
}

const APPEARANCE_REGISTRY_MESSAGE_A = castId<MessageId>("msg_ct_appearance_registry_a");
const APPEARANCE_REGISTRY_MESSAGE_B = castId<MessageId>("msg_ct_appearance_registry_b");

/** Production-mode CT host for the bridge-scoped MessageRow registry. A layout effect enters the same
 * enablement door the agent debug bridge's install uses, before either real row's registration effect runs. */
export function AppearanceMessageRegistryStory(): ReactElement {
  useLayoutEffect(() => enableAppearanceMessageRegistry(), []);
  return (
    <>
      <MessageRowStory
        chatStyle="bubble"
        messageId={APPEARANCE_REGISTRY_MESSAGE_A}
        avatarSize="sm"
        avatarShape="round"
        avatarAspect="square"
        avatarRing="none"
        showInChatAvatars={true}
        autoFixMarkdown={false}
        colorQuotedSpeech={true}
        messageActions="hover"
        metadataVisibility={{
          showGenerationCost: false,
          showGenerationTimer: false,
          showMessageId: false,
          showModelIcon: false,
          showTimestamps: true,
          showTokenCount: false,
        }}
        showLLMReasoningIcon={false}
      />
      <MessageRowStory
        chatStyle="document"
        messageId={APPEARANCE_REGISTRY_MESSAGE_B}
        avatarSize="lg"
        avatarShape="square"
        avatarAspect="portrait"
        avatarRing="accent"
        showInChatAvatars={false}
        autoFixMarkdown={true}
        colorQuotedSpeech={false}
        messageActions="expanded"
        metadataVisibility={{
          showGenerationCost: true,
          showGenerationTimer: true,
          showMessageId: true,
          showModelIcon: true,
          showTimestamps: false,
          showTokenCount: true,
        }}
        showLLMReasoningIcon={true}
      />
    </>
  );
}

export interface NarratorTranscriptStoryProps {
  readonly participants: readonly ParticipantView[];
  /** The NARRATOR row's body (multi-voice, plain `Name:` labels). */
  readonly narratorContent: string;
  /** The character whose OWN per-speaker row is rendered beside it — the color comparand. */
  readonly ownRowCharacterId: CharacterId;
  readonly ownRowContent: string;
  /**
   * The PRODUCER id the narrator row is stamped with, and a name for it in the producer map — the room's
   * synthetic group character, exactly as the server ships it (`__group__<chatId>`, card name "Group").
   * Omit for the plain `characterId: null` narrator row.
   */
  readonly narratorProducer?: { readonly id: CharacterId; readonly name: string };
}

/** TWO rows of ONE narrator-grammar transcript in a SINGLE mount (the mount-once law): a narrator row
 *  (no single author ⇒ `characterId: null`) above that character's own per-speaker row. The CT reads the
 *  resolved `--color-dialogue` off both paths and requires them equal — the one-hash-input pin.
 *
 *  ONLY THE NARRATOR ROW DECLARES `kind: "narrator"` (fixed 2026-08-03; re-expressed on the kind axis
 *  2026-08-07, D129). It used to be the ROOM's `narratorRoom` flag, and passing it to both rows was harmless
 *  only while it changed nothing but the span grammar; once it also routed attribution (a narrator row is the
 *  Narrator whatever producer id the write stamped on it — side-eye 2026-08-03 P1) the comparand row had to be
 *  what it depicts. On the kind axis the comparand is exact and needs no room at all: a `standard` row and a
 *  `narrator` row, side by side, which is a pair the ROOM flag could not even express. */
export function NarratorTranscriptStory({
  participants,
  narratorContent,
  ownRowCharacterId,
  ownRowContent,
  narratorProducer,
}: NarratorTranscriptStoryProps): ReactElement {
  const participantsMap = new Map(
    participants.filter((p): p is ParticipantView & { characterId: CharacterId } => p.characterId !== null).map((p) => [p.characterId, p] as const),
  );
  const { characterNamesById, personaNamesById } = buildIdentityNameContext([
    ...participants
      .filter((p): p is ParticipantView & { characterId: CharacterId } => p.characterId !== null)
      .map((p): ChatIdentity => ({ kind: "character", id: p.characterId, name: p.displayName, avatarHash: null })),
    // The synthetic group card rides the producer like any character seat — that is the whole defect.
    ...(narratorProducer === undefined
      ? []
      : [{ kind: "character", id: narratorProducer.id, name: narratorProducer.name, avatarHash: null } satisfies ChatIdentity]),
  ]);
  const rowProps = {
    chatStyle: "bubble",
    participants: participantsMap,
    characterNamesById,
    personaNamesById,
    toolRenderers: NO_TOOL_RENDERERS,
  } as const;
  return (
    <CtDataProviders>
      <MessageThreadAnchor>
        <div data-testid="narrator-row">
          <MessageRow
            message={makeMessageView({
              role: "assistant",
              kind: "narrator",
              content: narratorContent,
              characterId: narratorProducer === undefined ? null : narratorProducer.id,
            })}
            {...rowProps}
          />
        </div>
        <div data-testid="own-row">
          <MessageRow message={makeMessageView({ role: "assistant", content: ownRowContent, characterId: ownRowCharacterId })} {...rowProps} />
        </div>
      </MessageThreadAnchor>
    </CtDataProviders>
  );
}

export interface GroupTranscriptAttributionStoryProps {
  readonly chatStyle: ThemeChatStyle;
  /** The seated characters — one assistant row is rendered per character, in roster order. */
  readonly participants: readonly ParticipantView[];
  /** The viewer's persona; its row sits between the two character rows, as a real room's would. */
  readonly persona: PersonaNameStoryEntry;
  readonly showInChatAvatars: boolean;
}

/**
 * A GROUP transcript in ONE mount (the mount-once law): two different characters' turns with the viewer's
 * turn between them. The question it answers is the one a single-row story structurally cannot — with
 * avatars off, does EVERY row still say who is speaking, or do consecutive turns run together
 * unattributed? (side-eye 2026-08-16 read a scrolled screenshot as "the promised name fallback never
 * renders"; the fallback does render, and this is the fence that keeps it that way across the display
 * modes a reader actually switches between.)
 */
export function GroupTranscriptAttributionStory({ chatStyle, participants, persona, showInChatAvatars }: GroupTranscriptAttributionStoryProps): ReactElement {
  const seated = participants.filter((p): p is ParticipantView & { characterId: CharacterId } => p.characterId !== null);
  const participantsMap = new Map(seated.map((p) => [p.characterId, p] as const));
  const { characterNamesById, personaNamesById } = buildIdentityNameContext([
    ...seated.map((p): ChatIdentity => ({ kind: "character", id: p.characterId, name: p.displayName, avatarHash: null })),
    { kind: "persona", id: persona.id, name: persona.name, description: persona.description ?? "", avatarHash: null },
  ]);
  const rowProps = {
    chatStyle,
    showInChatAvatars,
    participants: participantsMap,
    characterNamesById,
    personaNamesById,
    toolRenderers: NO_TOOL_RENDERERS,
  } as const;
  const [first, second] = seated;
  return (
    <CtDataProviders>
      <MessageThreadAnchor>
        {first === undefined ? null : (
          <MessageRow
            message={makeMessageView({ role: "assistant", content: "The vault door has not moved in an epoch.", characterId: first.characterId })}
            {...rowProps}
          />
        )}
        <MessageRow message={makeMessageView({ role: "user", content: "Then we open it.", personaId: persona.id })} {...rowProps} />
        {second === undefined ? null : (
          <MessageRow
            message={makeMessageView({ role: "assistant", content: "You say that as if entropy takes requests.", characterId: second.characterId })}
            {...rowProps}
          />
        )}
      </MessageThreadAnchor>
    </CtDataProviders>
  );
}

export interface MessageToolCallsStoryProps {
  readonly records: readonly ToolCallRecord[];
  /** Registers a per-tool-name `ToolRenderer` claiming this wire tool name (the specialization seam). */
  readonly customToolName?: string;
  /** Registers a NAMESPACE-claiming renderer for this prefix — the plugin plane's shape (#679 U3), where the
   *  wire names depend on who installed what and cannot be listed at door-assembly time. Registered AFTER the
   *  exact renderer, so an arm supplying both also pins that door order never decides against an exact claim. */
  readonly prefixToolName?: string;
  /** Registers a whole-message renderer: "claims" owns the block; "abstains" returns null (chat falls
   *  through to the per-record path). Omitted ⇒ no Provider at all, the zero-registrant default. */
  readonly messageRenderer?: "claims" | "abstains";
}

/** The tool-call block seam in isolation (message-tool-calls.tsx): the generic `@orb/ui` `ToolCallBlock`
 *  fallback, an optional per-tool-name renderer that wins on a name match, and an optional whole-message
 *  renderer with first refusal. The registries are built HERE (post-mount, in the browser) because a
 *  registry instance does NOT survive the Playwright CT prop wire — only plain data crosses it. */
export function MessageToolCallsStory({ records, customToolName, prefixToolName, messageRenderer }: MessageToolCallsStoryProps): ReactElement {
  // The PREFIX claim is registered FIRST, deliberately: an arm supplying both then proves an exact claim wins
  // because resolution TRIES EVERY EXACT CLAIM BEFORE ANY PREFIX ONE — not because door order happened to
  // favour it. A single in-order scan (the natural wrong implementation) passes an exact-first roster and
  // fails this one; planted 2026-08-28, and it did exactly that.
  const contributions: ToolRenderer[] = [];
  if (prefixToolName !== undefined) {
    contributions.push({
      id: prefixToolName,
      match: "prefix",
      render: (record): ReactElement => <div data-testid="prefix-tool">{`prefix:${record.name}`}</div>,
    });
  }
  if (customToolName !== undefined) {
    contributions.push({ id: customToolName, match: "name", render: (record): ReactElement => <div data-testid="custom-tool">{`custom:${record.name}`}</div> });
  }
  const renderers = createContributorRegistry<ToolRenderer>("tool-renderers", contributions);
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
  /** The room's characters — fed through the REAL `speakerThemesByName` producer, so the story's per-speaker
   *  tints and character-name set are exactly what `MessageRow` computes. Omitted ⇒ no roster (hash fallback). */
  readonly participants?: readonly ParticipantView[];
  /** The NARRATOR grammar gate on the plain-`Name:` span split. */
  readonly narratorVoiced?: boolean;
  /** The ROOM's immersive-HTML consent (a game chat with `features.immersiveHtml` ON). Independent of
   *  `trust`: either axis grants the tier-B card sandbox, so this mounts the room-consent half. */
  readonly lenientHtmlCards?: boolean;
}

/** Build the row policy through the REAL resolver rather than a literal.
 *
 *  A hand-built `RowRenderPolicy` here is how the card-tier inversion survived: the stories asserted
 *  whatever tier the literal named, so they could never disagree with `resolveRowRenderPolicy`. Feeding a
 *  synthetic participant through the actual resolver means a CT mount exercises the same security verdict
 *  production does — the same reason `speakerThemes` above runs the real `speakerThemesByName` producer. */
function storyParticipant(characterId: CharacterId, trustHtml: boolean, allowExternal: boolean): ParticipantView {
  return {
    id: castId("participant_story_author"),
    chatId: castId("chat_story"),
    kind: "character",
    userId: null,
    characterId,
    role: "member",
    activePersonaId: null,
    talkativeness: 1,
    disabled: false,
    joinedAt: 0,
    joinSeq: 0,
    leftSeq: null,
    joinHistoryVisibility: "full",
    displayName: "Story author",
    handle: null,
    avatarAssetId: null,
    avatarHash: null,
    renderPolicy: { htmlTrust: trustHtml ? "trusted" : "untrusted", forbidExternalMedia: !allowExternal },
  };
}

function storyRenderPolicy(trust: "trusted" | "untrusted", allowExternal: boolean, lenientHtmlCards: boolean): RowRenderPolicy {
  const characterId = castId<CharacterId>("char_story_author");
  return resolveRowRenderPolicy({
    role: "assistant",
    authorUserId: null,
    characterId,
    viewerUserId: null,
    participants: new Map([[characterId, storyParticipant(characterId, trust === "trusted", allowExternal)]]),
    lenientHtmlCards,
  });
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
  participants,
  narratorVoiced = false,
  lenientHtmlCards = false,
}: MessageContentSpansStoryProps): ReactElement {
  const renderContext: MessageRenderContext | undefined =
    characterName === undefined && userName === undefined
      ? undefined
      : {
          ...buildIdentityNameContext([]),
          ...(characterName === undefined ? {} : { speakerCharName: characterName }),
          ...(userName === undefined ? {} : { fallbackPersonaName: userName }),
        };
  const speakerThemes = speakerThemesByName(
    participants === undefined
      ? undefined
      : new Map(
          participants.filter((p): p is ParticipantView & { characterId: CharacterId } => p.characterId !== null).map((p) => [p.characterId, p] as const),
        ),
  );
  // Wrapped in <CtDataProviders> because `MessageContent` now reads the plugin DISPLAY-transform seam
  // (`usePluginDisplayText` → `useTRPC` + `useQuery`, #679 U6). With no registered transform the hook is
  // inert and returns its input byte-identically, but it still needs the Query + tRPC providers to mount.
  return (
    <CtDataProviders>
      <MessageContent
        content={content}
        render={storyRenderPolicy(trust, allowExternal, lenientHtmlCards)}
        renderContext={renderContext}
        speakerThemes={speakerThemes}
        narratorVoiced={narratorVoiced}
      />
    </CtDataProviders>
  );
}

export interface MessageContentChoicesStoryProps {
  /** `live` = a room-scoped send capability (clicks record); `busy` = a turn in flight (buttons disable);
   *  `none` = a provider-less mount (the CT-story/read-only-preview arm — buttons disable). */
  readonly mode?: "live" | "busy" | "none";
}

// P5 §5.2-5.4 — the `:::choices` fence rendered as clickable choice-affordances. The recorder mirrors the
// [assert-the-mutation-fired] posture: a click's `choose` call (not a UI reaction) is what the CT asserts,
// surfaced through the `sent-choices` probe text. (The send-vs-compose BRANCH lives in the provider — its
// own CT proves it; this story pins the block's click→`choose` wiring + the disabled arms.)
const CHOICES_BODY = "The corridor forks.\n:::choices\n1. Draw your blade.\n2. Slip into the shadows.\n3. Call out a greeting.\n:::";

function MessageContentChoicesStoryInner({ mode }: { readonly mode: "live" | "busy" | "none" }): ReactElement {
  const [sent, setSent] = useState<readonly string[]>([]);
  const value = mode === "none" ? null : { choose: (text: string): void => setSent((prev) => [...prev, text]), busy: mode === "busy" };
  // <CtDataProviders> for the same reason MessageContentSpansStory needs it: `MessageContent`'s
  // `usePluginDisplayText` seam (#679 U6) reads tRPC through Query, inert but provider-bound.
  return (
    <CtDataProviders>
      <ChoiceSendContext value={value}>
        <MessageContent content={CHOICES_BODY} render={storyRenderPolicy("untrusted", false, false)} />
      </ChoiceSendContext>
      <p data-testid="sent-choices">{sent.join("|")}</p>
    </CtDataProviders>
  );
}

/** The bare `<MessageContent>` over a `:::choices` body with a recording choice-send capability. */
export function MessageContentChoicesStory({ mode = "live" }: MessageContentChoicesStoryProps = {}): ReactElement {
  return <MessageContentChoicesStoryInner mode={mode} />;
}

// P5 §5.4 — the REAL `<ChoiceSendProvider>` wired to the real data layer (routeTrpc stubs `chat.getChat`
// with an engaged rpg pointer so the provider's game gate opens, + `rpg.getGame` + `chat.send`), driving
// the real choices block AND a real `<Composer>` whose value is the real
// composer-draft store. This proves the provider's send-vs-compose BRANCH end-to-end: `send` fires
// `chat.send` (the composer stays empty); `compose` seeds the composer draft (observable in the textarea)
// and fires NO send. The game knob rides `rpg.getGame.publicConfig.cyoaChoiceBehavior` (the CT stubs it).

function ChoiceProviderStoryInner(): ReactElement {
  return (
    <div>
      <ChoiceSendProvider chatId={COMPOSER_CHAT_ID}>
        <MessageContent content={CHOICES_BODY} render={storyRenderPolicy("untrusted", false, false)} />
      </ChoiceSendProvider>
      <Composer chatId={COMPOSER_CHAT_ID} />
    </div>
  );
}

/** The real choice provider + a real composer over the real draft store — proves the send/compose branch. */
export function ChoiceProviderStory(): ReactElement {
  return (
    <CtDataProviders>
      <ChoiceProviderStoryInner />
    </CtDataProviders>
  );
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

const RECALL_CHAT_ID = castId<ChatId>("chat_ct_recall_0001");

/** The header memory-recall brain-icon (#313) driven through its three states via the real `chatStream`
 *  recall axis (the `GhostRowStory` precedent — bus-store drivers, no SSE round-trip). `viewerIsHost={false}`
 *  keeps the popover to its always-present live summary (no host-only `previewAssembly` read), so the mount
 *  needs no data layer. The CT clicks a phase button, then the trigger, and asserts the summary copy per state
 *  plus the pulsing-vs-static `data-recall-phase` on the trigger. */
export function RecallIndicatorStory(): ReactElement {
  return (
    <div style={{ width: 260 }}>
      <ChatRecallIndicator chatId={RECALL_CHAT_ID} viewerIsHost={false} />
      <button type="button" data-testid="recall-idle" onClick={(): void => chatStream.resetRecall(RECALL_CHAT_ID)}>
        idle
      </button>
      <button type="button" data-testid="recall-recalling" onClick={(): void => chatStream.setRecallPhase(RECALL_CHAT_ID, "recalling", null)}>
        recalling
      </button>
      <button type="button" data-testid="recall-recalled" onClick={(): void => chatStream.setRecallPhase(RECALL_CHAT_ID, "recalled", 3)}>
        recalled
      </button>
    </div>
  );
}

const RECALL_DETAIL_CHARACTER_ID = castId<CharacterId>("character_ct_recall_detail");

const RECALL_DETAIL_SLICE: MemoryRecallSlice = {
  mode: "mixC",
  queryText: "the old observatory",
  queryEmbedded: true,
  poolSize: 9,
  candidateCount: 6,
  surfaced: 1,
  ms: 12,
  note: "one block survived reranking",
  candidates: [
    { scopedCharacterId: RECALL_DETAIL_CHARACTER_ID, tier: 0, blockIdx: 4, verdict: "admitted", rank: 0, score: 0.08, relevance: 0.82 },
    { scopedCharacterId: RECALL_DETAIL_CHARACTER_ID, tier: 0, blockIdx: 5, verdict: "below-floor" },
    { scopedCharacterId: RECALL_DETAIL_CHARACTER_ID, tier: 1, blockIdx: 2, verdict: "bridge-covered" },
    { scopedCharacterId: RECALL_DETAIL_CHARACTER_ID, tier: 0, blockIdx: 6, verdict: "mode-excluded" },
    { scopedCharacterId: RECALL_DETAIL_CHARACTER_ID, tier: 0, blockIdx: 7, verdict: "live-window" },
    { scopedCharacterId: RECALL_DETAIL_CHARACTER_ID, tier: 0, blockIdx: 8, verdict: "unwitnessed" },
  ],
};

/** The pure recall-detail readout over its three meaningful shapes: no recall, a zero-candidate recall,
 *  and a populated embedding trace carrying every verdict label. */
export function MemoryRecallDetailStory({ scenario }: { readonly scenario: "none" | "empty" | "detailed" }): ReactElement {
  let recall: MemoryRecallSlice | null = RECALL_DETAIL_SLICE;
  if (scenario === "none") {
    recall = null;
  } else if (scenario === "empty") {
    recall = { mode: "off", queryText: null, queryEmbedded: false, poolSize: 0, candidateCount: 0, surfaced: 0, ms: 1, note: "mode off", candidates: [] };
  }
  return (
    <div style={{ width: 420 }}>
      <MemoryRecallDetail recall={recall} />
    </div>
  );
}

export interface ReasoningBlockStoryProps {
  readonly reasoning: string;
  readonly thinking: boolean;
  readonly smoothStream?: boolean;
  readonly smoothStreamCps?: number;
  readonly autoCollapse?: boolean;
}

/** The bare `<ReasoningBlock>` — a pure-render leaf (no chat-store dependency), so the CT test drives
 *  its TTFT/auto-collapse/toggle behavior by mounting with props and re-`update()`-ing them, exactly
 *  like `crossfade-image.ct.tsx` drives a prop transition. */
export function ReasoningBlockStory({ reasoning, thinking, smoothStream, smoothStreamCps, autoCollapse }: ReasoningBlockStoryProps): ReactElement {
  return (
    <div style={{ width: 360 }}>
      <ReasoningBlock reasoning={reasoning} thinking={thinking} smoothStream={smoothStream} smoothStreamCps={smoothStreamCps} autoCollapse={autoCollapse} />
    </div>
  );
}

export interface ReasoningAnchorStoryProps {
  readonly reasoning: string;
  readonly thinking: boolean;
  readonly autoCollapse?: boolean;
  /** The answer-prose sibling BELOW the reasoning block — the ghost row's `<GhostBubbleBody>` analogue.
   *  Absent until the first answer token lands, exactly as the production ghost mounts it. */
  readonly showProse: boolean;
}

/** The reasoning disclosure ABOVE an answer-prose sibling, reproducing the ghost row's layout
 *  (`<ReasoningBlock>` over `<GhostBubbleBody>`) so a CT can measure the prose's top RELATIVE to the row
 *  across the auto-collapse — the `streaming-shape-churn.md` §8 metric (`firstBlock.top − row.top`). The
 *  `data-testid` anchors give the geometry probe stable handles. */
export function ReasoningAnchorStory({ reasoning, thinking, autoCollapse, showProse }: ReasoningAnchorStoryProps): ReactElement {
  return (
    <div style={{ width: 360 }} data-testid="anchor-row">
      <ReasoningBlock reasoning={reasoning} thinking={thinking} autoCollapse={autoCollapse} />
      {showProse ? <div data-testid="anchor-prose">The answer prose begins here, right under the trace.</div> : null}
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
  /** The card tier the surface would resolve for this turn (`resolveRowRenderPolicy().cardTier`). Absent ⇒
   *  the ghost's own fail-closed default (`tierA`), which is what a policy-less mount must render. */
  readonly cardTier?: CardTrust;
  /** #116/#113 — the verdict `MessageListRowMeta.exceedsViewport` carries in production for a live turn that
   *  has grown past the scrollport. Pins the ghost's name row; absent ⇒ the unpinned arm. */
  readonly stickyAttribution?: boolean;
  /** Present ⇒ the ghost mounts inside a bounded SCROLLPORT of this pixel height, so a long stream really
   *  exceeds the viewport and the sticky pin can be measured against a scroll rather than asserted from a
   *  computed style alone. Absent ⇒ the unbounded mount every other scripted CT uses. */
  readonly scrollportHeight?: number;
}

/** The ghost row driven by an explicit, test-controlled SCRIPT of raw text chunks (rather than the
 *  fixed "Hi " token `GhostRowStory` uses). Live-gated exactly like the production surface, so an ABORT
 *  unmounts the row (and anything it had mounted) rather than leaving it idling. */
export function GhostRowScriptedStory({ chunks, speakerName, cardTier, stickyAttribution, scrollportHeight }: GhostRowScriptedStoryProps): ReactElement {
  const [next, setNext] = useState(0);
  const phase = useTurnPhase(SCRIPTED_CHAT_ID);
  const attribution =
    speakerName === undefined
      ? undefined
      : { name: speakerName, kind: "character" as const, avatarAssetId: null, avatarHash: null, hueSeed: speakerName, tokens: null };
  const ghost = isLiveTurnPhase(phase) ? (
    <GhostMessageRow
      chatId={SCRIPTED_CHAT_ID}
      chatStyle="bubble"
      streaming={phase === "streaming"}
      {...(attribution === undefined ? {} : { attribution })}
      {...(cardTier === undefined ? {} : { cardTier })}
      {...(stickyAttribution === undefined ? {} : { stickyAttribution })}
    />
  ) : null;
  return (
    <div style={{ width: 360 }}>
      <div data-testid="phase">{phase}</div>
      {scrollportHeight === undefined ? (
        ghost
      ) : (
        <div data-testid="ghost-scrollport" style={{ height: scrollportHeight, overflowY: "auto" }}>
          {ghost}
        </div>
      )}
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
      <button type="button" data-testid="abort" onClick={(): void => chatStream.abortTurn(SCRIPTED_CHAT_ID, "user")}>
        abort
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

/** The app-root shape: ONE multiplexed socket, above every room hook (SSE-1). The chat bus JOINS the
 *  `chat` room on it — since S2 there is no per-chat subscription — so a story that drives the scripted
 *  stream (`routeOrbSocket`) has to mount the socket for the room to be live at all. */
function SocketHost({ children }: { readonly children: ReactNode }): ReactElement {
  useOrbSocket();
  return <>{children}</>;
}

function SurfaceHarness(): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const busDeps: ChatBusDeps = {
    stream: chatStream,
    invalidate: createInvalidation({ queryClient, trpc }).invalidate,
  };
  return (
    <div style={{ height: 480 }}>
      <MessageThreadAnchor>
        <MessageListSurface chatId={CHAT_ID} busDeps={busDeps} surfaceContributors={NO_SURFACE_CONTRIBUTORS} toolRenderers={NO_TOOL_RENDERERS} />
      </MessageThreadAnchor>
    </div>
  );
}

/** The keystone surface in a bounded box (so the message-list seal has a real scroll window). */
export function MessageListSurfaceStory(): ReactElement {
  return (
    <CtDataProviders>
      <SocketHost>
        <SurfaceHarness />
      </SocketHost>
    </CtDataProviders>
  );
}

// ── #1873: a capability WARNING raised while a turn is on screen, into the shell's real notice band ──
// The reported defect is an infinite rendering jitter of the streaming message when a `tools_unsupported`
// notice arrives mid-turn. Every hop here is the production one: a `warning` FRAME on the scripted room
// stream → `applyChatBusEvent` → the injected `onWarning` (the same two calls `chat-content.tsx`'s
// module-private `surfaceWarning` makes) → the real copy mapper → `AppToaster` into the REAL `NoticeBand`,
// which is a flow row of `.shell-main` (`shell.css`) — so raising the notice genuinely SHRINKS the
// transcript's containing block, which is the half a story with a floating overlay toast cannot produce.
//
// `columnHeight` is the knob the CT CALIBRATES: the scrollport height decides `MessageListRowMeta`'s
// `exceedsViewport`, i.e. whether the live row's attribution goes sticky, so the defect's boundary is a
// property of "the port after the band takes its height", which the test measures rather than guesses.
//
// NO COMMIT TALLY HERE, DELIBERATELY. The obvious instrument — a `<Profiler>` around the surface, the
// shape the Background section's story carried until #2412 deleted it — MEASURES NOTHING IN A CT: playwright-ct runs the
// PRODUCTION React build, whose `<Profiler>` never calls `onRender` (that is a profiling-build feature).
// Wired here first and measured: the tally sat at exactly 0 across a mount, a full scripted turn and three
// idle windows of a transcript that was visibly oscillating. The honest observable for a judder is the
// RENDERED GEOMETRY sampled per frame, which is what the CT reads.

function StreamNoticeHarness({ columnHeight }: { readonly columnHeight: number }): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const busDeps: ChatBusDeps = {
    stream: chatStream,
    invalidate: createInvalidation({ queryClient, trpc }).invalidate,
    // `surfaceWarning`'s body (chat-content.tsx) — module-private there, so the story makes the same two
    // calls. Its `custom_parameters_ignored` action arm is not in scope for a capability drop.
    onWarning: (warning): void => notify.warn(warningNotice(warning)),
  };
  return (
    <div className="shell-main" style={{ display: "flex", flexDirection: "column", height: columnHeight, minHeight: 0 }}>
      <NoticeBand />
      <main className="shell-content">
        <div className="shell-region-fill">
          <MessageThreadAnchor>
            <MessageListSurface chatId={CHAT_ID} busDeps={busDeps} surfaceContributors={NO_SURFACE_CONTRIBUTORS} toolRenderers={NO_TOOL_RENDERERS} />
          </MessageThreadAnchor>
        </div>
      </main>
    </div>
  );
}

/** #1873 — the keystone surface under the shell's real notice band, in a column whose height the CT sets
 *  (see the block comment above). */
export function MessageListNoticeBandStory({ columnHeight = 480 }: { readonly columnHeight?: number }): ReactElement {
  return (
    <CtDataProviders>
      <SocketHost>
        <CtToastSurface>
          <StreamNoticeHarness columnHeight={columnHeight} />
        </CtToastSurface>
      </SocketHost>
    </CtDataProviders>
  );
}

/** THE TRANSCRIPT'S LOADING STATE, OVER ART (#468). The same keystone surface, mounted under the shell's
 *  own `data-has-bg-image` flag over a SATURATED backdrop — pure green, so "does the art show through
 *  behind the skeleton?" is a one-channel question instead of a contrast estimate (the `_edge-fade-stories`
 *  precedent). The CT holds `chat.listMessages` so the suspense fallback is a settled, indefinitely-stable
 *  render rather than a flash. `artBackdrop={false}` is the same probe with the flag off — the planted
 *  positive control that proves the sampler can see the raw backdrop at all. */
export function MessageListOverArtStory({
  artBackdrop,
  art = "rgb(0 255 0)",
  fullWidth = false,
  palette,
}: {
  readonly artBackdrop: boolean;
  /** The wallpaper under the surface. Defaults to the loading pair's SATURATED green (its one-channel
   *  probe); #681's contrast pair passes its own worst-case art instead. */
  readonly art?: string;
  /** Span the viewport instead of the loading pair's fixed 640 — #681 measures at two real widths, and a
   *  fixed story width would make the narrow arm a lie. @defaultValue false */
  readonly fullWidth?: boolean;
  /** A CARRIED palette's base surface, wrapped around the room as the app does (#690). The CT harness
   *  paints the base DARK theme, and the over-art plate family's defects are polarity-split — the
   *  skeleton-on-plate collision is a LIGHT-arm one — so a room whose polarity the test chooses is the
   *  only way to measure the arm that fails. Omitted ⇒ the harness's own theme, byte-identical to before. */
  readonly palette?: string;
}): ReactElement {
  const room = (
    <div {...(artBackdrop ? { "data-has-bg-image": "" } : {})} style={{ background: art, width: fullWidth ? "100%" : 640 }}>
      <SurfaceHarness />
    </div>
  );
  return (
    <CtDataProviders>
      <SocketHost>{palette === undefined ? room : <ThemeScope tokens={{ background: palette }}>{room}</ThemeScope>}</SocketHost>
    </CtDataProviders>
  );
}

/** #107 TAB-BUDGET harness: the real surface between two sentinel buttons that stand in for "the control
 *  before the transcript" and "the composer". A CT focuses `walk-start`, presses Tab until `walk-end` has
 *  focus, and compares the count across thread lengths — which is the whole contract: the transcript's
 *  cost to a keyboard reader must not scale with the thread. */
export function MessageListTabWalkStory(): ReactElement {
  return (
    <CtDataProviders>
      <SocketHost>
        <button type="button" data-testid="walk-start">
          before
        </button>
        <SurfaceHarness />
        <button type="button" data-testid="walk-end">
          after
        </button>
      </SocketHost>
    </CtDataProviders>
  );
}

// ── #488: a FEATURE-CONTRIBUTED disclosure in the row's tab walk ────────────────────────────────────
// The shape of `rpgTurnToolCallsSurface` with none of its data: one `message-footer` contribution whose
// body is a `Collapsible` trigger, which is precisely the element a review reported as keyboard-
// unreachable. It is not — `row-roving.ts`'s sweep is a DOM sweep, so a control the row's own React tree
// never knew about is suppressed and restored exactly like `Edit message`. The `tabindex="-1"` it wears at
// rest is the #107 budget working, not a defect, and this harness is what keeps that distinction pinned.
const FOOTER_DISCLOSURE_CONTRIBUTORS = createContributorRegistry<ChatSurfaceContribution>("chat-surface", [
  {
    id: "ct-footer-disclosure",
    anchor: "message-footer",
    when: ({ message }) => message.role === "assistant",
    body: () => (
      <Collapsible>
        <CollapsibleTrigger>
          <Text voice="label">What this turn did</Text>
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <Text voice="gloss">the folded record</Text>
        </CollapsiblePanel>
      </Collapsible>
    ),
  },
]);

function FooterDisclosureHarness(): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const busDeps: ChatBusDeps = {
    stream: chatStream,
    invalidate: createInvalidation({ queryClient, trpc }).invalidate,
  };
  return (
    <div style={{ height: 480 }}>
      <MessageThreadAnchor>
        <MessageListSurface chatId={CHAT_ID} busDeps={busDeps} surfaceContributors={FOOTER_DISCLOSURE_CONTRIBUTORS} toolRenderers={NO_TOOL_RENDERERS} />
      </MessageThreadAnchor>
    </div>
  );
}

/** The tab-walk harness with one `message-footer` disclosure contributed into every assistant row. */
export function MessageListFooterDisclosureStory(): ReactElement {
  return (
    <CtDataProviders>
      <SocketHost>
        <button type="button" data-testid="walk-start">
          before
        </button>
        <FooterDisclosureHarness />
        <button type="button" data-testid="walk-end">
          after
        </button>
      </SocketHost>
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
        <MessageListSurface chatId={CHAT_ID} busDeps={busDeps} surfaceContributors={NO_SURFACE_CONTRIBUTORS} toolRenderers={NO_TOOL_RENDERERS} />
      </MessageThreadAnchor>
      <button
        type="button"
        data-testid="mark-stopping"
        onClick={(): void => {
          chatStream.markStopping(CHAT_ID);
        }}
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
      <SocketHost>
        <StoppingHarness />
      </SocketHost>
    </CtDataProviders>
  );
}

// ── Composer story (data layer + turn-lifecycle drivers) ───────────────────────────────────────────

export interface ComposerStoryProps {
  /** The tail turn role — `"assistant"` (+ `tailAssistantMessageId`) makes continue-on-empty eligible. */
  readonly tailRole?: MessageRole | null;
  /** The tail assistant message id continue-on-empty targets (PD-146). */
  readonly tailAssistantMessageId?: MessageId | null;
}

function ComposerStoryInner({ tailRole = null, tailAssistantMessageId = null }: ComposerStoryProps): ReactElement {
  // The composer's value IS the real composer-draft store keyed by this room's ChatId — exactly like
  // chat-room-surface. (There is no draft phase to mount: a chat row exists from the creation click.)
  // `notify` no-ops into the console in the CT harness (bindNotify is main.tsx-only), so bind it to a DOM sink
  // — the guided-impersonate failure toasts (a SUBSCRIPTION has no `meta.errorToast` seam) are observed via
  // this marker. Same shape as PersonaThisChatStory.
  const [notified, setNotified] = useState<string>("");
  useState(() => {
    const sink = (notice: NotifyInput): void => setNotified(toNotice(notice).title);
    bindNotify({ error: sink, info: sink, success: sink, warn: sink });
    return null;
  });

  return (
    <div>
      <Composer chatId={COMPOSER_CHAT_ID} tailRole={tailRole} tailAssistantMessageId={tailAssistantMessageId} />
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
      {/* The notify sink (see bindNotify above) — rendered LAST so it never shifts the composer's own layout. */}
      <p data-testid="composer-notified">{notified}</p>
      {/* The ✨ menu's SECOND image door (#623) writes the imagery INTENT store, and the store is what the
          shell's imagine modal reads. This story has no ModalHost, so the seed IS the observable — read
          through the real `useImagineSeed` selector, never a story-local mirror. */}
      <ImagineSeedProbe />
    </div>
  );
}

/** Prints the imagery intent store's current `/imagine` seed as `<mode>|<prompt>` (empty when nothing has
 *  opened the modal) — the observable for the ✨ menu's Imagine door, which fires the same `openImagine`
 *  #state action the slash runner does. */
function ImagineSeedProbe(): ReactElement {
  const seed = useImagineSeed();
  return <p data-testid="composer-imagine-seed">{seed === undefined ? "" : `${seed.mode}|${seed.prompt}`}</p>;
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
// Owns the instruction + toggle-selection state exactly as the wand does (the modal is controlled), and on
// Apply writes what the wand FIRES to a readout — the picked toggle IDS in catalog order + the instruction,
// so the CT can assert them WITHOUT a tRPC round-trip (the pure-component lane; the wand's own CT proves the
// tRPC wire). It reports IDS, not composed bytes: since the templating fork's ARM B the fragments are preset
// prose slots the SERVER joins, so composed bytes are not a thing this surface can honestly produce.
// `initialInstruction` seeds the field (the draft-preseed case).

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
      <div data-testid="fired-toggles">{fired}</div>
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
          // What the wand fires: the picked ids in CATALOG order, then the instruction — the wire shape.
          const picked = REWRITE_TOGGLES.filter((t) => selected.has(t.id)).map((t) => t.id);
          setFired([...picked, instruction].filter((part) => part.length > 0).join(" | "));
          setOpen(false);
        }}
      />
    </div>
  );
}

/** The Rewrite modal in isolation — controlled state + a fired-picks readout (`fired-toggles`). */
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
  /** Pin the LIST panel width — the row's width budget (text column vs. trailing cluster) is only
   *  observable at a real pane width. Omitted = the 320px default. */
  readonly width?: number;
  /** Publish the MOBILE viewport regime BEFORE first render (#1350 — the config-host precedent). The month
   *  bound's folded arm is chosen on the regime, and its `defaultOpen` is a FIRST-COMMIT decision, so a flag
   *  flipped in an effect afterwards would mount the desktop arm and then swap it. */
  readonly mobile?: boolean;
}

/** The Chats-section LIST surface + its anchor, wired to the real data layer (routeTrpc stubs
 *  `chat.listChats`). Records select / new-chat clicks into visible markers so a CT can assert the
 *  callbacks fire with the right id. */
export function ChatListSurfaceStory({ activeChatId = null, width = 320, mobile = false }: ChatListSurfaceStoryProps): ReactElement {
  useState(() => {
    setMobileViewport(mobile);
    return null;
  });
  return (
    <CtDataProviders>
      <ChatListInner activeChatId={activeChatId} width={width} />
    </CtDataProviders>
  );
}

/** The chat list's production header band at an explicit pane width. */
export function ChatListHeaderStory({ width }: { readonly width: number }): ReactElement {
  return (
    <CtDataProviders>
      <div>
        <header className="shell-panel-header" style={{ width }}>
          <ChatListHeader />
        </header>
      </div>
    </CtDataProviders>
  );
}

/** #490 — the chrome BAND above the pane it counts, which is the only mount where the census claim is
 *  checkable: the band feeds a different shell slot and reads the pane's narrowing through
 *  `chat-list-filter-store`, so a header-only or a surface-only story can each pass while the pair lies. */
export function ChatListBandAndSurfaceStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 360 }}>
        <header className="shell-panel-header">
          <ChatListHeader />
        </header>
        <div style={{ height: 420 }}>
          <ChatListAnchor>
            <ChatListSurface onNewChat={(): void => undefined} onSelect={(): void => undefined} />
          </ChatListAnchor>
        </div>
      </div>
    </CtDataProviders>
  );
}

function ChatListInner({ activeChatId, width }: { readonly activeChatId: string | null; readonly width: number }): ReactElement {
  const [selected, setSelected] = useState("none");
  const [newCount, setNewCount] = useState(0);
  const [deleted, setDeleted] = useState("none");
  useEffect(() => {
    if (activeChatId !== null) {
      selectChat(castId<ChatId>(activeChatId));
    }
  }, [activeChatId]);
  return (
    <div style={{ height: 480, width }}>
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

// ── Landing + HOME-TILE stories ───────────────────────────────────────────────────────────────────

/** The Chats-section NO-SELECTION state after the launcher MOVED to home (owner decision H1 = D-1): a
 *  slim empty state with the section's own primary. It reads no DATA, so there is no query layer here —
 *  but it does read the shell's LIST MODE (#446), which resolves this section's declared `panelDefaults`,
 *  so it mounts under the REAL section registry.
 *
 *  The two buttons drive that mode through FOCUS — the shell's ONE flag for "no side panel is showing"
 *  (item 20): synchronous and section-independent, where `setPanelMode` writes the ACTIVE section's
 *  override and `setActiveSection` defers its write through `withViewTransition` (measured, #434). */
export function ChatLandingSurfaceStory(): ReactElement {
  const [newCount, setNewCount] = useState(0);
  return (
    <CtRealSectionRegistry>
      <button onClick={(): void => setFocusMode(true)} type="button">
        take the list off screen
      </button>
      <button onClick={(): void => setFocusMode(false)} type="button">
        put the list back
      </button>
      <div style={{ height: 640, width: 720 }}>
        <ChatLandingSurface onNewChat={(): void => setNewCount((n) => n + 1)} />
        <p data-testid="new-count">{String(newCount)}</p>
      </div>
    </CtRealSectionRegistry>
  );
}

/** ONE chat-contributed HOME tile mounted through the REAL `HomeSurface` — so the per-tile QueryBoundary,
 *  the kicker frame, and the trailing action are the SHIPPED ones, not a test double. The `<output>`
 *  publishes the shell store's active section so a row click asserts the STORE ACTION fired. */
function HomeTileStory({ tile }: { readonly tile: HomeTileContribution }): ReactElement {
  return (
    <CtDataProviders>
      <ActiveSectionProbe />
      <div style={{ height: 640, width: 720 }}>
        <HomeSurface onNewChat={(): void => undefined} tiles={createContributorRegistry<HomeTileContribution>("home-tiles", [tile])} />
      </div>
    </CtDataProviders>
  );
}

function ActiveSectionProbe(): ReactElement {
  return <output>section={useActiveSection()}</output>;
}

/** Publishes the NEW-CHAT INTENT the launcher wrote: which modal the shell opened, and whether the picker
 *  was pre-armed with the creation-only temporary parameter. The behavioral end of the ceremony (picker →
 *  a REAL room born Temporary) is the app-root route CT, over the whole composed shell. */
function NewChatIntentProbe(): ReactElement {
  return (
    <output data-testid="new-chat-intent">
      modal={useOpenModal() ?? "none"} temporary={String(useNewChatIntent()?.temporary === true)}
    </output>
  );
}

export function ChatRecentsTileStory(): ReactElement {
  return <HomeTileStory tile={chatRecentsTile} />;
}

/** The hero pane at a PHONE width — the narrowest REAL mount home has (430x932 coarse, the shipped mobile
 *  viewport), where the hero is full-width and its own action row is the tightest. The 720px story above
 *  is a desktop half-pane and cannot reproduce a credit line that wraps, which is the whole subject of
 *  side-eye HOME H17: the pane, not the viewport, is what sizes this surface. */
export function ChatRecentsMobileStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 932, width: 430 }}>
        <HomeSurface onNewChat={(): void => undefined} tiles={createContributorRegistry<HomeTileContribution>("home-tiles", [chatRecentsTile])} />
      </div>
    </CtDataProviders>
  );
}

/** The hero pane at a DESKTOP width — the only place #205's art bleed exists. The band is
 *  `inset-inline-start: min(100%, var(--reading-measure))`, so at the 720px story pane above there is
 *  almost nothing beyond the measure and an art assertion there would be measuring a sliver. This pane is a
 *  1920-monitor's home pane (post-#226 the hearth track is half of it), i.e. the width the owner's own
 *  screens sit at and where the ruling's "fills the dead second scent-line space" is actually true. The
 *  NARROW arm is the 720px story above: same registry, and the band collapses to nothing. */
export function ChatRecentsHeroArtStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 640, width: 1860 }}>
        <HomeSurface onNewChat={(): void => undefined} tiles={createContributorRegistry<HomeTileContribution>("home-tiles", [chatRecentsTile])} />
      </div>
    </CtDataProviders>
  );
}

/** The two hearth blocks TOGETHER — the shipped pair (#102 review F6/F13 split the also-open list out of
 *  the recents body into its own tile). Mounted as one registry so the CT can assert what the split is
 *  FOR: two peer regions, two h2s, and the trailing "All chats →" on the second band. */
export function ChatRecentsPairStory(): ReactElement {
  return (
    <CtDataProviders>
      <ActiveSectionProbe />
      <div style={{ height: 640, width: 720 }}>
        <HomeSurface
          onNewChat={(): void => undefined}
          tiles={createContributorRegistry<HomeTileContribution>("home-tiles", [chatRecentsTile, chatAlsoOpenTile])}
        />
      </div>
    </CtDataProviders>
  );
}

export function ChatMastheadTileStory(): ReactElement {
  return <HomeTileStory tile={chatMastheadTile} />;
}

export function ChatQuickPicksTileStory(): ReactElement {
  return <HomeTileStory tile={chatQuickPicksTile} />;
}

/** The temp-chat tile PLUS the real chats topbar header + the new-chat intent probe — so one CT can drive
 *  the launcher and assert what it wrote: the shared picker opened with the creation-only flag preset.
 *
 *
 *  NOT wrapped in `StrictMode`, and a wrap would buy nothing: playwright-ct serves a PRODUCTION React
 *  build, where StrictMode's effect double-invoke does not run. The reaper's arm/cleanup/re-arm behaviour
 *  (#188) is therefore only observable on a dev stage — `snap --isolated`/`--dirty` — and that is where it
 *  is proven. A StrictMode wrapper here would read like coverage of a class this tier cannot reach. */
export function ChatTempChatTileStory(): ReactElement {
  return (
    <CtDataProviders>
      <ActiveSectionProbe />
      <NewChatIntentProbe />
      <div data-testid="temp-topbar">
        <ChatsTopbarHeader />
      </div>
      <div style={{ height: 640, width: 720 }}>
        <HomeSurface onNewChat={(): void => undefined} tiles={createContributorRegistry<HomeTileContribution>("home-tiles", [chatTempChatTile])} />
      </div>
    </CtDataProviders>
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

/** The picker at the NARROWEST REAL MOUNT — the mobile dialog's content box (430×932 viewport → dialog
 *  x=32…398, i.e. 366px wide; side-eye 2026-08-22 #439). The action footer's two buttons are wider than
 *  that box at desktop label lengths, and a `justify-end` overflow goes LEFT, so "Blank chat" painted
 *  outside the dialog and was clipped. A CONTENT-SIZED mount root would agree with the bug — the width is
 *  fixed here on purpose. */
export function NarrowNewChatPickerStory(): ReactElement {
  return (
    <CtDataProviders>
      <div data-testid="narrow-picker-mount" style={{ height: 560, width: 366 }}>
        <NewChatPicker />
      </div>
    </CtDataProviders>
  );
}

/** Mounts the picker only after the production temp-chat opener arms it. This catches React Strict Mode
 *  probe unmounts clearing creation intent before the user can act. */
export function TemporaryNewChatPickerStory(): ReactElement {
  const [showPicker, setShowPicker] = useState(false);
  return (
    <CtDataProviders>
      <button
        type="button"
        onClick={(): void => {
          openNewChatPicker({ temporary: true });
          setShowPicker(true);
        }}
      >
        Open temporary picker
      </button>
      <NewChatIntentProbe />
      {showPicker ? (
        <div style={{ height: 560, width: 480 }}>
          <NewChatPicker />
        </div>
      ) : null}
    </CtDataProviders>
  );
}

/** CREATE-ON-START-CLICK (chat-creation-draft-mode-replacement.md §4.1): the picker AND the chats
 *  section's real CONTENT in one mount, so a Start click can be followed all the way into the room it
 *  lands in. The room arrives through the REAL registry path (`registry.get("chats").content()`), so what
 *  the CT drives is the production composition, not a hand-wired surface. */
export function CreateOnStartClickStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <div style={{ width: 480 }}>
          <NewChatPicker />
        </div>
        <ChatContentHarness />
      </CtRealSectionRegistry>
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

/** The palette's registry: the real door set, plus one grafted contribution in the `"contributed"` arm.
 *  Module-scope + pure (D54 full-compile — manual memo is banned; the compiler caches the call site). */
function buildPaletteRegistry(commands: CommandPaletteSurfaceStoryProps["commands"], onFakeFire: () => void): ContributorRegistry<SlashCommandContribution> {
  const door = [...chatSlashCommands, ...characterSlashCommands];
  const contributions: readonly SlashCommandContribution[] =
    commands === "contributed"
      ? [
          ...door,
          {
            id: CT_PALETTE_COMMAND_ID,
            label: CT_PALETTE_COMMAND_LABEL,
            describe: "A grafted command, registered at the door",
            mount: (props): ReactElement => <CtFakeCommandMount {...props} onFire={onFakeFire} />,
          },
        ]
      : door;
  return createContributorRegistry<SlashCommandContribution>("slash-commands", contributions);
}

/** The J4 ⌘K command palette body, wired to the real data layer (routeTrpc stubs `chat.listChats`).
 *  `goToSections` is a fixed CT literal (app-root derives it from the section registry in production);
 *  the COMMAND rows come from the real slash-command registry, exactly as they do at the door. */
export function CommandPaletteSurfaceStory({ commands = "door" }: CommandPaletteSurfaceStoryProps): ReactElement {
  const [ranFake, setRanFake] = useState(false);
  const registry = buildPaletteRegistry(commands, (): void => setRanFake(true));

  const body = (
    <div style={{ height: 480, width: 560 }}>
      <CommandPaletteSurface goToSections={CT_GO_TO_SECTIONS} />
      <div data-testid="ct-palette-command-ran">{ranFake ? "ran" : ""}</div>
    </div>
  );
  return <CtDataProviders>{commands === "none" ? body : <SlashCommandRegistryProvider value={registry}>{body}</SlashCommandRegistryProvider>}</CtDataProviders>;
}

// ── Chat-room story (the composed transcript + composer pane) ────────────────────────────────────

function ChatRoomHarness({ height = 480 }: { readonly height?: number | string } = {}): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const busDeps: ChatBusDeps = {
    stream: chatStream,
    invalidate: createInvalidation({ queryClient, trpc }).invalidate,
  };
  return (
    <div style={{ height }}>
      <ChatRoomSurface busDeps={busDeps} handle={committedChat(CHAT_ID)} surfaceContributors={NO_SURFACE_CONTRIBUTORS} toolRenderers={NO_TOOL_RENDERERS} />
      {/* The clear-on-send signal: simulates the bus observing the caller's OWN user-row
          `messageCommitted`. Driven directly rather than through the SSE stub because the signal itself is
          what the send hook subscribes to, and this fires it deterministically for CHAT_ID. */}
      <button type="button" data-testid="drive-message-committed" onClick={(): void => chatStream.notifyUserMessageCommitted(CHAT_ID)}>
        commit
      </button>
      {/* The `messageEdited` arm of the room's bus, driven through the REAL reducer (`applyChatBusEvent` →
          the invalidation seam), so a CT can land a server-side canon rewrite the way production does
          without scripting the socket's attach-time frame script. Used by the seeded-greeting step's pin:
          the strip's verb is `busDriven`, so the row's new bytes must arrive from a REFETCH, never from an
          optimistic local swap. */}
      <button
        type="button"
        data-testid="drive-message-edited"
        onClick={(): void => applyChatBusEvent({ type: "messageEdited", chatId: CHAT_ID, messageId: castId<MessageId>("msg_room_seeded_greeting") }, busDeps)}
      >
        edited
      </button>
    </div>
  );
}

/** The chats CONTENT (landing ⇄ room) over the real registry, plus a driver that lands a `chatDeleted` for
 *  the OPEN room through the REAL reducer (`applyChatBusEvent` → the `onChatDeleted` seam → the landing
 *  transition). R3, the verifier's R1-3: the reap emit's whole justification is that a device sitting on the
 *  room has to leave it, and until this seam existed nothing was on the other end of the event. */
export function ChatDeletedWhileOpenStory(): ReactElement {
  useEffect(() => {
    selectChat(CHAT_ID);
  }, []);
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <ChatDeletedDriver />
        <ChatContentHarness />
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

function ChatDeletedDriver(): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // The SAME deps the room mounts with — including the feature-side `onChatDeleted` wiring, which is what is
  // under test. Built here rather than reaching into ChatContent so the driver fires the identical seam.
  const busDeps: ChatBusDeps = {
    stream: chatStream,
    invalidate: createInvalidation({ queryClient, trpc }).invalidate,
    onChatDeleted: chatDeletedFromList,
  };
  return (
    <button type="button" data-testid="drive-chat-deleted" onClick={(): void => applyChatBusEvent({ type: "chatDeleted", chatId: CHAT_ID }, busDeps)}>
      deleted
    </button>
  );
}

/** The chat room in its GREETING WINDOW (chat-creation-draft-mode-replacement.md §4.8 / F6, R3): a room
 *  whose canon is seeded greetings and whose first user turn has not happened yet. That window is what makes
 *  a greeting steppable among its card's alternates — after the first user turn `freezeGreetingVolatiles`
 *  bakes it and the server refuses. Same harness as the plain room story; the `.ct.tsx` supplies the canon
 *  (assistant rows, no user row) and the card. */
export function ChatRoomGreetingWindowStory(): ReactElement {
  return (
    <CtDataProviders>
      <SocketHost>
        <ChatRoomHarness />
      </SocketHost>
    </CtDataProviders>
  );
}

/** The composed chat-room pane (transcript + composer) over a real room (reads `listMessages`). */
export function ChatRoomSurfaceStory(): ReactElement {
  return (
    <CtDataProviders>
      <SocketHost>
        <ChatRoomHarness />
      </SocketHost>
    </CtDataProviders>
  );
}

/** THE SHARED-TRACK STAGE (#213): the same room pane, mounted inside a fixed-width box that stands in for
 *  the shell's CONTENT region at one pane state, carrying the production `--width-shell-content` expression
 *  verbatim (`app-shell.tsx` — a clamp against the VIEWPORT, which is exactly why the composer's box and the
 *  transcript's own measure disagree as the pane narrows). Without this wrapper the var is unset in CT and
 *  every `max-w-(--width-shell-content)` computes to `none`, i.e. the defect is unreachable on the stage.
 *  `chatWidthPct` is the shipped default so the clamp reads as production does. */
export function ChatRoomTrackStory({ paneWidth }: { readonly paneWidth: number }): ReactElement {
  // Typed via intersection, not an `as CSSProperties` cast on the literal (no-test-fabrication):
  // this csstype version does not admit --custom-property keys natively.
  const paneStyle: CSSProperties & { "--width-shell-content": string } = {
    width: paneWidth,
    "--width-shell-content": "clamp(var(--dimension-shell-content-floor), 50dvw, 100dvw)",
  };
  return (
    <CtDataProviders>
      <SocketHost>
        <div data-testid="room-pane" style={paneStyle}>
          <ChatRoomHarness />
        </div>
      </SocketHost>
    </CtDataProviders>
  );
}

/** THE PHONE STAGE (#511): the same room pane at the height the shell leaves it on a phone — the viewport
 *  minus the topbar and the bottom tab bar, handed in by the test so the budget is stated, not assumed.
 *
 *  The pane is the whole width here because that is what the shell gives it on a phone (both side panels
 *  resolve `collapsed` below the mobile breakpoint), so the character strip, the transcript and the composer
 *  compete for one column exactly as they do on the device. What this stage exists to measure is that
 *  competition: the chrome above the transcript is a fixed tax and the transcript is whatever survives it. */
export function ChatRoomPhoneStory({ paneHeight }: { readonly paneHeight: number }): ReactElement {
  return (
    <CtDataProviders>
      <SocketHost>
        <ChatRoomHarness height={paneHeight} />
      </SocketHost>
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

/** The chats def supplies the CONTEXT-band identity (N4), proving the definition-owned header channel
 *  carries the chat identity end-to-end through the real section → mint → `SectionContextHeader` path. */
export function ChatContextHeaderStory(): ReactElement {
  useEffect(() => {
    selectChat(CHAT_ID);
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

/** B11 — the REAL room `automationActivityTab` grafted into the chat CONTEXT strip through the SAME
 *  contributor seam the fake tab above proves, so a CT exercises the production tab (host gate + the
 *  `RoomActivityLog` body over `automation.listChatActivity`) rather than a test double. The `.ct.tsx` stubs
 *  `chat.getChat` (host vs member drives the tab's `when: isHost`) + `automation.listChatActivity` (the rows). */
export function RoomActivityTabStory(): ReactElement {
  useEffect(() => {
    selectChat(CHAT_ID);
  }, []);
  const contextContributors = createContributorRegistry<ContextTabDef<ChatContextState>>("chat-context", [automationActivityTab]);
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
  /** MOUNTED BUT SILENT: `when` passes, the BODY renders null. The real shape of a contributor whose
   *  applicability is DATA (automation's needle meter asks "does this room carry a tension score?", which a
   *  sync `when` cannot answer), and the case the flank stack's `empty:hidden` collapse exists for. */
  readonly silent?: boolean;
  /** A GREEDY contributor: the body is a long single line of prose instead of a two-word stub. The flank
   *  column's own tenants are content-small (a meter card), so an unbounded column never showed — but the
   *  seam is open to any feature and, since #679 U2, to third-party plugin surfaces whose text a plugin
   *  author writes. #776 pins that such a body cannot crush the reading column. */
  readonly greedy?: boolean;
}

const CT_SURFACE_CONTRIBUTION_ID = "ct-fake-surface-contribution";
/** One long, wrappable line — the shape of a caption a contributor is free to write. */
const CT_GREEDY_BODY =
  "This contributor writes a long single line of prose into the flank, the way a plugin caption or a wordy status readout does, and it must not be allowed to take the room away from the transcript beside it.";

/** The chat-surface-anchor contributor seam (§6c/M8) LIVE: a single fake `ChatSurfaceContribution` at the
 *  given anchor, registered at a `CtChatContributorSectionRegistry` door in place of the empty registry,
 *  mounted through the REAL `chats` section's `content()` → `ChatContent` → `ChatRoomSurface`/`MessageRow`
 *  anchor-consumer path (chat-room-surface.tsx / message-row.tsx). */
export function ChatSurfaceContributorStory({ anchor, visible, silent = false, greedy = false }: ChatSurfaceContributorStoryProps): ReactElement {
  useEffect(() => {
    selectChat(CHAT_ID);
  }, []);
  const fakeContribution: ChatSurfaceContribution =
    anchor === "message-footer"
      ? {
          id: CT_SURFACE_CONTRIBUTION_ID,
          anchor: "message-footer",
          when: () => visible,
          body: (): ReactElement | null => (silent ? null : <div data-testid="ct-fake-surface-contribution">fake footer</div>),
        }
      : {
          id: CT_SURFACE_CONTRIBUTION_ID,
          anchor,
          when: () => visible,
          body: (): ReactElement | null => (silent ? null : <div data-testid="ct-fake-surface-contribution">{greedy ? CT_GREEDY_BODY : `fake ${anchor}`}</div>),
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

export interface CommittedSettingsTabStoryProps {
  /** Gates the host-only "Group behavior" section (with `showGroup`) + the overrides read-only copy. */
  readonly isHost?: boolean;
  /** The group-level gate the section carries — host of a group chat (CP-1). @defaultValue false */
  readonly showGroup?: boolean;
  /** Seed the Field-overrides section's set-count chip (panel-redesign). @defaultValue `{}` (no chip) */
  readonly roomOverrides?: RoomOverrides;
}

/** The consolidated "This chat" CONTEXT tab (settings-context-tab.tsx, panel-redesign) mounted DIRECTLY as
 *  the component it is — the `.ct.tsx` pins its own section-composition contract (Field overrides +
 *  Injections always; Group behavior gated by `showGroup`) independent of the section-registry resolve. The
 *  `.ct.tsx` routeTrpc-stubs `chat.getGroupConfig` + `chat.setRoomOverrides` + `chat.listChatInjections`. */
export function CommittedSettingsTabStory({ isHost = true, showGroup = false, roomOverrides = {} }: CommittedSettingsTabStoryProps): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 380 }}>
        <CommittedSettingsTab chatId={CHAT_ID} roomOverrides={roomOverrides} isHost={isHost} background={null} showGroup={showGroup} />
      </div>
    </CtDataProviders>
  );
}

/** The room's REGEX section (#1742) at the REAL context-panel width, behind the SAME `QueryBoundary` the tab
 *  mounts it in — the section suspends on `chat.listEffectiveRegex` (host) or `regex.listForChat` (member),
 *  and a bare mount would send that suspension to the CT root.
 *
 *  `CtToastSurface` is the production toast outlet: the row switch's "off everywhere" notice + its Undo are
 *  BEHAVIOR of this section (§3, the row), so the toast pixels are part of what this story exists to render.
 *  Its manager is the one module-global `bindNotify` (see that component's header).
 *
 *  `data-testid="regex-section-pane"` is the CONTAINMENT ANCHOR (#1765): the section's own root
 *  (`[data-slot="regex-section"]`) is a block container that grows with its own overflowing content, so a
 *  width assertion anchored THERE is tautological (#1754 proved it live — passed green with `truncate` AND
 *  `min-w-0` both planted off). This 380px div is the real fixed-width box; `expectContainedWithin`
 *  (`tests/support/browser/contained-within.ts`) is pointed at it, never at the section's own root. */
export function RegexSectionStory({ isHost = true }: { readonly isHost?: boolean }): ReactElement {
  return (
    <CtDataProviders>
      <CtToastSurface>
        <div data-testid="regex-section-pane" style={{ width: 380 }}>
          <QueryBoundary
            fallback={<Text tone="muted">Loading this chat's regex…</Text>}
            renderError={(_error, retry): ReactElement => <QueryErrorState label="this chat's regex" onRetry={retry} />}
          >
            <RegexSection chatId={CHAT_ID} isHost={isHost} />
          </QueryBoundary>
        </div>
      </CtToastSurface>
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

/** The read-only character bar (chat-character-bar.tsx) — the roster comes from the routeTrpc `chat.getChat`
 *  stub the `.ct.tsx` sets per case (a solo roster → the bar renders `null`; a 2+ roster → chips). */
export function ChatCharacterBarStory({ overArt = false }: { readonly overArt?: boolean } = {}): ReactElement {
  return (
    <CtDataProviders>
      {/* A wrapping div so the mount `component` locator is the WRAPPER, not the character bar's own root
          element — a `component.getByTestId`/`getByText` then searches its descendants (the
          ComposerStory precedent; without it `component` IS the bar and its own testid is not a
          descendant of itself).
          `overArt` stamps the shell's OWN wallpaper flag on that wrapper (#229): the strip's backing is
          self-gated by Tailwind's `in-data-[has-bg-image]` ANCESTOR variant, so without an ancestor
          carrying the flag the class is structurally inert and the arm cannot be measured at all. */}
      <div {...(overArt ? { "data-has-bg-image": "" } : {})}>
        <ChatCharacterBar chatId={CHAT_ID} />
      </div>
    </CtDataProviders>
  );
}

/** The topbar chat-identity header LEAD (chat-header.tsx) — avatar/title + the member-count chip. The
 *  roster comes from the routeTrpc `chat.getChat` stub the `.ct.tsx` sets per case. (The ⋯ options menu
 *  moved to the composer’s left gutter — ComposerChatOptionsStory owns its coverage now.) */
export function ChatHeaderStory(): ReactElement {
  return (
    <CtDataProviders>
      <div>
        <ChatHeaderSurface chatId={CHAT_ID} />
      </div>
    </CtDataProviders>
  );
}

/** {@link ChatHeaderStory} + a shell-store readout — for pinning the Members chip's REVEAL write
 *  (`revealContextPanel`, state/shell-store.ts) at the narrow/mobile overlay regime, where a chip that
 *  only wrote `contextTab`/`panelMode` and never named the panel in `openOverlayPanel` left
 *  `resolvePanelMode` returning `collapsed` — a dead control below 64rem. */
export function ChatHeaderNarrowStory(): ReactElement {
  const contextTab = useContextTab();
  const openOverlayPanel = useOpenOverlayPanel();
  return (
    <CtDataProviders>
      <div>
        <ChatHeaderSurface chatId={CHAT_ID} />
        <output data-testid="shell-state">{`contextTab=${contextTab ?? "none"} openOverlayPanel=${openOverlayPanel ?? "none"}`}</output>
      </div>
    </CtDataProviders>
  );
}

/** The active chat's options ⋯ menu as it renders in the composer's left gutter (composer-chat-options.tsx).
 *  Drives the production path over the stubbed network: `chat.getChat` supplies the roster + the
 *  server-resolved host gate (`viewerIsHost` gates the ⋯ menu's host-only "Preview request…" item),
 *  `chat.listMessages` feeds the menu's guided turn actions. The inner `ActiveChatOptionsMenu` takes the id
 *  as a prop (the chrome wrapper's `useActiveChatId` narrowing needs no store seed here). */
export function ComposerChatOptionsStory(): ReactElement {
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
 *  PURE source-agnostic component it is: fixed People + Character rows in, every action observed via the
 *  `members-last-action` readout, no network. `withPeople` seats two humans (viewer-host Riley + member
 *  Kestrel, Kestrel pending-nominated); `memberView` is the NON-host viewer (only View character
 *  remains); `omitForceTurn` is the DRAFT case (no turn to force). */
export interface MembersPanelStoryProps {
  readonly omitForceTurn?: boolean;
  readonly withPeople?: boolean;
  readonly memberView?: boolean;
  /** Seats Kestrel at the NON-default D16 posture (`from-join`) — the state chip + the RESTORE direction. */
  readonly restrictedMember?: boolean;
  /** Fills the Characters section's header add SLOT (#162 — the roster's character-add door). The committed
   *  surface passes `AddMemberPopover`; the story passes a plain button wearing the SAME accessible name,
   *  because what this panel owes is the seat, not the picker (the picker has its own coverage). */
  readonly withAddCharacter?: boolean;
  /** A 1:1 room — the shape whose whole Characters section the old `>=2` floor hid (#162). */
  readonly soloCharacters?: boolean;
  /** A room with NO characters at all — the Characters section is then the add door's empty state. */
  readonly emptyCharacters?: boolean;
  /** #1039 — the People rows' presence state. Default `undefined` = UNKNOWN on every seat (`online: null`),
   *  which is what a surface that never asked produces and is why the pre-#1039 accessible names in this
   *  file's CTs are unchanged. `"mixed"` seats Riley ONLINE and Kestrel OFFLINE — the two rendered arms plus
   *  the two announced words in one mount. */
  readonly presence?: "mixed";
}
/** #1039 — the story's two People seats' presence, as ONE decision. Lifted out of the component because the
 *  story is already at the cognitive-complexity ceiling and two inline ternaries pushed it over. */
function membersStoryPresence(presence: "mixed" | undefined): { readonly riley: boolean | null; readonly kestrel: boolean | null } {
  return presence === undefined ? { riley: null, kestrel: null } : { riley: true, kestrel: false };
}

export function MembersPanelStory({
  omitForceTurn = false,
  withPeople = false,
  memberView = false,
  restrictedMember = false,
  withAddCharacter = false,
  soloCharacters = false,
  emptyCharacters = false,
  presence,
}: MembersPanelStoryProps): ReactElement {
  const [lastAction, setLastAction] = useState("");
  const seatPresence = membersStoryPresence(presence);
  const people: MemberPersonRow[] = withPeople
    ? [
        {
          kind: "person",
          key: "participant_riley",
          userId: castId<UserId>("user_riley"),
          displayName: "Riley",
          isHost: !memberView,
          isViewer: true,
          avatarHash: null,
          pendingNominee: false,
          historyVisibility: "full",
          online: seatPresence.riley,
        },
        {
          kind: "person",
          key: "participant_kestrel",
          userId: castId<UserId>("user_kestrel"),
          displayName: "Kestrel",
          isHost: memberView,
          isViewer: false,
          avatarHash: null,
          pendingNominee: !memberView,
          // Default `full` ⇒ the row menu offers the RESTRICT direction; `restrictedMember` flips both the
          // state chip and the item to the RESTORE direction.
          historyVisibility: restrictedMember ? "from-join" : "full",
          online: seatPresence.kestrel,
        },
      ]
    : [];
  const characterRows: MemberCharacterRow[] = [
    {
      kind: "character",
      key: "participant_aria",
      characterId: castId<CharacterId>("character_aria"),
      displayName: "Aria",
      disabled: false,
      talkativeness: 0.5,
      avatarHash: null,
      responding: true,
    },
    {
      kind: "character",
      key: "participant_bryn",
      characterId: castId<CharacterId>("character_bryn"),
      displayName: "Bryn",
      disabled: true,
      talkativeness: 0.5,
      avatarHash: null,
      responding: false,
    },
  ];
  const soloOrFull = soloCharacters ? characterRows.slice(0, 1) : characterRows;
  const seatedCharacters = emptyCharacters ? [] : soloOrFull;
  return (
    <CtDataProviders>
      <div style={{ width: 420 }}>
        <div data-testid="members-last-action">{lastAction}</div>
        <MembersPanel
          people={people}
          characters={seatedCharacters}
          {...(withAddCharacter
            ? {
                charactersAction: (
                  <button type="button" aria-label="Add a character" onClick={(): void => setLastAction("add-character")}>
                    +
                  </button>
                ),
              }
            : {})}
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
                // The recorded action carries the OFFER, because the offer IS the decision this affordance
                // exists to make: a CT that only proved "nominate fired" could not tell a gift from a drop.
                onNominateHost: (userId: UserId, offer: HandoffOffer): void =>
                  setLastAction(`nominate:${userId}:characters=${String(offer.copyCharacters)}:preset=${String(offer.copyGmPreset)}`),
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
    isHost: false,
    isViewer: false,
    avatarHash: null,
    pendingNominee: false,
    historyVisibility: "full",
    // Presence UNKNOWN (#1039): this story is about post-kick focus, and an unasked presence read renders
    // no dot and adds no word — so its accessible names are the pre-#1039 ones the focus pins match on.
    online: null,
  };
  const people: MemberPersonRow[] = [
    {
      kind: "person",
      key: "participant_riley",
      userId: castId<UserId>("user_riley"),
      displayName: "Riley",
      isHost: true,
      isViewer: true,
      avatarHash: null,
      pendingNominee: false,
      historyVisibility: "full",
      online: null,
    },
    ...(kicked ? [] : [kestrel]),
  ];
  const characterRows: MemberCharacterRow[] = [
    {
      kind: "character",
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
          characters={characterRows}
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
  /** @defaultValue false — seed one character seat (enables "New chat with the same characters" + the solo gallery). */
  readonly withCharacters?: boolean;
}

const CT_OPTIONS_CHARACTERS = [{ characterId: castId<CharacterId>("char_ct_options"), name: "Aria" }];

/** The ⋯ chat-options menu (chat-options-menu.tsx). Its turn actions (Continue/Regenerate/Impersonate)
 *  reuse `useGuidedActions` with an EMPTY steer — the `.ct.tsx` stubs `chat.listMessages` (a tail assistant
 *  enables Continue/Regenerate) and asserts each verb fires with NO `guided` object (the F2 plain-turn fix). */
export function ChatOptionsMenuStory({ withCharacters = false }: ChatOptionsMenuStoryProps = {}): ReactElement {
  return (
    <CtDataProviders>
      {/* A wrapping div so `component` is the WRAPPER (the popup renders through a Portal — item
          assertions use the PAGE locator, the composer-guided-cluster precedent). */}
      <div>
        <ChatOptionsMenu chatId={CHAT_ID} title="Test chat" characters={withCharacters ? CT_OPTIONS_CHARACTERS : []} />
      </div>
    </CtDataProviders>
  );
}

/** The ⋯ menu WITH the two shell surfaces a game-mode transition writes into (#862/#863): the app's ONE
 *  polite live region (mirroring `app-root`'s single-line wiring — the region is app-level, the menu is not)
 *  and a plain readout of the context-panel landing the shell store holds. Both are the USER-VISIBLE result
 *  of a transition, so the CT can assert what a screen-reader hears and where the panel lands without
 *  reaching into store internals. */
export function ChatGameModeMenuStory(): ReactElement {
  return (
    <CtDataProviders>
      <div>
        <ChatOptionsMenu chatId={CHAT_ID} title="Test chat" characters={[]} />
        <GameModeShellReadout />
        <GameMarkerCensus />
      </div>
    </CtDataProviders>
  );
}

/** The chats LIST's half of the same fact (#863 P2): how many rows the list read currently marks as a game.
 *  It is a SEPARATE tRPC read from the room's `chat.getChat`, which is exactly why a toggle that invalidates
 *  only the room left this census stale for the whole session. */
function GameMarkerCensus(): ReactElement {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.chat.listChats.queryOptions({ limit: 20 }));
  const marked = (data?.items ?? []).filter((item) => item.isGame).length;
  return <p>{`Game rows: ${String(marked)}`}</p>;
}

function GameModeShellReadout(): ReactElement {
  const announcement = useStatusAnnouncement();
  const contextTab = useContextTab();
  // The reveal writes the ACTIVE section's context-panel override (`revealContextPanel` writes both regime
  // channels; the docked one is what a wide viewport resolves).
  const contextPanel = usePanelOverride(useActiveSection(), "context");
  return (
    <>
      <AriaAnnouncer message={announcement} />
      <p>{`Landing: ${contextTab ?? "none"}`}</p>
      <p>{`Context panel: ${contextPanel ?? "unset"}`}</p>
    </>
  );
}

/** The chats-band transcript IMPORT dialog (chat-import-dialog.tsx) — the one home for getting a `.jsonl`
 *  into the library. Opens immediately (the band's ghost button is the only way in, and it has no other
 *  state), and records the two observable outcomes: whether the dialog asked to CLOSE (the "something
 *  landed" signal) and the NOTICE the dialog fired. The notice needs `bindNotify` here because the toast
 *  impl binds at the composition root (main.tsx) — unbound, `notify` writes to the console and no CT could
 *  see the derived message at all. */
export function ChatImportDialogStory(): ReactElement {
  const [open, setOpen] = useState(true);
  const [closes, setCloses] = useState(0);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    bindNotify({
      error: (raised): void => setNotice(`error: ${toNotice(raised).title}`),
      info: (raised): void => setNotice(`info: ${toNotice(raised).title}`),
      success: (raised): void => setNotice(`success: ${toNotice(raised).title}`),
      warn: (raised): void => setNotice(`warn: ${toNotice(raised).title}`),
    });
  }, []);
  return (
    <CtDataProviders>
      <div>
        <ChatImportDialog
          onOpenChange={(next): void => {
            setOpen(next);
            if (!next) {
              setCloses((n) => n + 1);
            }
          }}
          open={open}
        />
        <p data-testid="import-closes">{String(closes)}</p>
        <p data-testid="import-notice">{notice}</p>
      </div>
    </CtDataProviders>
  );
}

/** The host-only "Add from your bank" PICKER (add-chat-document-dialog.tsx) over the stubbed network: the
 *  `.ct.tsx` sets `databank.list` per case (a stocked bank, an empty one, a never-resolving one for the
 *  skeleton). Mounted OPEN, with `activeIds` as a PROP — the subtraction operand the picker derives its
 *  offer set from, so a CT can drive "already reaches this room" without a second stubbed read. The dialog's
 *  own close request is recorded (`picker-closes`): closing on the first pick is a RULING of this component,
 *  and a prop-driven `open` alone could not tell a pick that closed from one that silently did not. */
export function AddChatDocumentDialogStory({ activeIds = [] }: { readonly activeIds?: readonly DocumentId[] } = {}): ReactElement {
  const [open, setOpen] = useState(true);
  const [closes, setCloses] = useState(0);
  return (
    <CtDataProviders>
      <div>
        <AddChatDocumentDialog
          activeIds={activeIds}
          chatId={CHAT_ID}
          onOpenChange={(next): void => {
            setOpen(next);
            if (!next) {
              setCloses((n) => n + 1);
            }
          }}
          open={open}
        />
        <p data-testid="picker-closes">{String(closes)}</p>
      </div>
    </CtDataProviders>
  );
}

/** The host-only lorebook picker, kept open by a controlled harness so its durable-write ownership and
 *  close request are observable independently. */
export function AddChatBookDialogStory({ attachedIds = [] }: { readonly attachedIds?: readonly WorldBookId[] } = {}): ReactElement {
  const [open, setOpen] = useState(true);
  const [closes, setCloses] = useState(0);
  return (
    <CtDataProviders>
      <div>
        <AddChatBookDialog
          attachedIds={attachedIds}
          chatId={CHAT_ID}
          onOpenChange={(next): void => {
            setOpen(next);
            if (!next) {
              setCloses((n) => n + 1);
            }
          }}
          open={open}
        />
        <p data-testid="book-picker-closes">{String(closes)}</p>
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
  const characterRows: MemberCharacterRow[] = [
    {
      kind: "character",
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
        <MembersPanel people={[]} characters={characterRows} onSetDisabled={(): void => undefined} onSetTalkativeness={(): void => undefined} />
      </div>
    </CtDataProviders>
  );
}

/** A committed room's character SEAT, as the Members tab's projections read it (`toCharacterRows`). Only the fields
 *  those projections touch vary per story; the rest is one shape so a seat added here can never disagree
 *  with the wire type. */
function membersTabSeat(name: string, characterId: CharacterId): ParticipantView {
  return {
    id: castId(`participant_${name.toLowerCase()}`),
    chatId: castId("chat_members_tab"),
    kind: "character",
    userId: null,
    characterId,
    role: "member",
    activePersonaId: null,
    talkativeness: 0.5,
    disabled: false,
    joinedAt: 0,
    joinSeq: 0,
    leftSeq: null,
    joinHistoryVisibility: "full",
    displayName: name,
    handle: null,
    avatarAssetId: null,
    avatarHash: null,
    renderPolicy: { htmlTrust: "untrusted", forbidExternalMedia: true },
  };
}

export interface CommittedMembersTabStoryProps {
  /** A 1:1 room — ONE character seat. The default is the two-seat GROUP room (the counter-arm). */
  readonly soloCharacters?: boolean;
  /** Seats the room's sole character ALREADY MUTED — the state a group room could leave behind, and the
   *  reason mute keeps an exit in a solo room (committed-members-tab.tsx). */
  readonly mutedSoloSeat?: boolean;
  /** The mount's CONTENT-BOX width — what the members panel actually gets, i.e. the context pane's track
   *  less the bracket body's `px-row`. Defaults to 420. The real range is **256…464**: 256 =
   *  `--dimension-panel-context`'s 17rem clamp floor − 16, 464 = its 30rem ceiling − 16, and the phone
   *  sheet (100dvw − 16) lands inside it. The `.ct.tsx` sweeps that MATRIX rather than one width — a wide
   *  mount agrees with an overflow bug (#848) and a single width endorsed a label compression that did not
   *  even clear the overflow it was spent on (#912). The earlier "320px = `--dimension-panel`'s low clamp
   *  less padding" note here was arithmetically wrong twice over (that is the LIST pane's token, and its
   *  low clamp is 272): 320 is inside the range, not an end of it. */
  readonly width?: number;
}

/** The REAL Members tab body (committed-members-tab.tsx) — the surface that decides which seams reach the
 *  panel. Mounted with a host viewer and `multiHumanCapable:false`, so the People section is absent and the
 *  arms under test are exactly the character row's: which of the group-arbiter controls (#182) exist. */
export function CommittedMembersTabStory({ soloCharacters = false, mutedSoloSeat = false, width = 420 }: CommittedMembersTabStoryProps = {}): ReactElement {
  const aria = membersTabSeat("Aria", castId<CharacterId>("character_aria"));
  const solo = mutedSoloSeat ? { ...aria, disabled: true } : aria;
  const participants: readonly ParticipantView[] = soloCharacters ? [solo] : [aria, membersTabSeat("Bryn", castId<CharacterId>("character_bryn"))];
  return (
    <CtDataProviders>
      {/* `overflow: visible` on a FIXED width — a content-sized mount root grows to fit the cluster and
          would agree with the very overflow this width exists to catch. */}
      <div style={{ overflow: "visible", width }}>
        <CommittedMembersTab
          chatId={castId<ChatId>("chat_members_tab")}
          chat={{ participants, identities: [], viewerUserId: castId<UserId>("user_riley"), pendingHostUserId: null }}
          isHost={true}
          multiHumanCapable={false}
        />
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

/** The SAME gallery modal on the REAL app QueryClient + the production Toaster (#1563a). `CtDataProviders`'
 *  plain client has NO MutationCache error channel, so a CT asking "how many failure surfaces does one
 *  refused remove produce?" cannot see the toast half at all on that stack and would answer 1 either way. */
export function CharacterGalleryDialogToastStory(): ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <CtAppDataProviders>
      <CtToastSurface>
        <div>
          <CharacterGalleryDialog open={open} onOpenChange={setOpen} characterId={castId<CharacterId>("character_ct_gallery")} characterName="Aria" />
        </div>
      </CtToastSurface>
    </CtAppDataProviders>
  );
}

/** #1440 — a PROVIDER-DEGRADATION warning, driven the way production drives it: a `warning` bus event goes
 *  through the REAL reducer (`applyChatBusEvent`), whose injected `onWarning` is the REAL copy mapper, into
 *  the REAL production toast outlet (`CtToastSurface` mounts `AppToaster`). What the CT reads is therefore
 *  the rendered notice a user sees, not a mapper return value — the unit test already owns that.
 *
 *  Only `chat-content.tsx`'s one-line `surfaceWarning` is bypassed (it is module-private); its body is the
 *  same two calls this story makes, and its `custom_parameters_ignored` action arm is not in scope here.
 *
 *  The knob is `topP` because it is the case the toast exists for: the code alone would say "a setting was
 *  adjusted", and the whole point of the carrier is that the user reads the NAME of the setting.
 */
export function ProviderAdjustmentWarningStory(): ReactElement {
  const busDeps: ChatBusDeps = {
    stream: chatStream,
    // A warning invalidates nothing — no canon changed — so the seam is deliberately inert here.
    invalidate: (): void => undefined,
    onWarning: (warning): void => notify.warn(warningNotice(warning)),
  };
  return (
    <CtToastSurface>
      <button
        type="button"
        data-testid="raise-knob-drop"
        onClick={(): void =>
          applyChatBusEvent({ type: "warning", chatId: CHAT_ID, code: "settings_adjusted", adjustment: "sampling_knob_dropped", knob: "topP" }, busDeps)
        }
      >
        raise knob drop
      </button>
      <button
        type="button"
        data-testid="raise-budget-clamp"
        onClick={(): void =>
          applyChatBusEvent(
            { type: "warning", chatId: CHAT_ID, code: "settings_adjusted", adjustment: "reasoning_budget_clamped", appliedBudget: 1536 },
            busDeps,
          )
        }
      >
        raise budget clamp
      </button>
    </CtToastSurface>
  );
}

/** The D22 read-only, level-clamped member card-viewer (member-card-viewer.tsx). Starts OPEN so the
 *  `.ct.tsx` drives the loaded card directly; the read is `chat.getMemberCard` over routeTrpc. The CT
 *  scripts three shapes: a `sheet`-clamped card (description shown, systemPrompt section absent + the
 *  hidden-tier note), a `full` card (every section), and the transport NOT_FOUND typed gone-arm. */
export function MemberCardViewerStory(): ReactElement {
  return (
    <CtDataProviders>
      <div>
        <MemberCardViewer chatId={CHAT_ID} characterId={castId<CharacterId>("character_ct_membercard")} open={true} onOpenChange={(): void => undefined} />
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
/** A 1024×1536 PORTRAIT image (the `portrait` size preset's exact dimensions) as an SVG data URL: it carries
 *  its own intrinsic size, so the browser reports naturalWidth/naturalHeight with no network. The circle makes
 *  a stretch visible as an ellipse (#622 — every image rendered at a forced 16:9 until the fit fix). */
const CT_PORTRAIT_SVG_DATA_URL = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536"><rect width="1024" height="1536" fill="#222"/><circle cx="512" cy="512" r="400" fill="#eee"/></svg>',
)}`;
// A tiny VALID mp4 (ffmpeg lavfi black 16x16, ~1.6 KB) — the #317 video arm needs a source Chromium can
// actually open: an undecodable stub data URI flips MessageMedia into its broken fallback and the <video>
// element vanishes before the assertion.
const CT_MP4_DATA_URL =
  "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAANdbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAAXcAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAod0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAAXcAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAF3AAAQAAABAAAAAAH/bWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAGABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABqm1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAWpzdGJsAAAAvnN0c2QAAAAAAAAAAQAAAK5hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2MC4zMS4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAANGF2Y0MBZAAK/+EAF2dkAAqs2V7ARAAAAwAEAAADAEA8SJZYAQAGaOvjyyLA/fj4AAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAAD0AAAA9AAAAABhzdHRzAAAAAAAAAAEAAAADAAAIAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAKGN0dHMAAAAAAAAAAwAAAAEAABAAAAAAAQAAGAAAAAABAAAIAAAAABxzdHNjAAAAAAAAAAEAAAABAAAAAwAAAAEAAAAgc3RzegAAAAAAAAAAAAAAAwAAAsQAAAAMAAAADAAAABRzdGNvAAAAAAAAAAEAAAONAAAAYnVkdGEAAABabWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAtaWxzdAAAACWpdG9vAAAAHWRhdGEAAAABAAAAAExhdmY2MC4xNi4xMDAAAAAIZnJlZQAAAuRtZGF0AAACrQYF//+p3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NCByMzEwOCAzMWUxOWY5IC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyMyAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0zIGJfcHlyYW1pZD0yIGJfYWRhcHQ9MSBiX2JpYXM9MCBkaXJlY3Q9MSB3ZWlnaHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTI1MCBrZXlpbnRfbWluPTggc2NlbmVjdXQ9NDAgaW50cmFfcmVmcmVzaD0wIHJjX2xvb2thaGVhZD00MCByYz1jcmYgbWJ0cmVlPTEgY3JmPTIzLjAgcWNvbXA9MC42MCBxcG1pbj0wIHFwbWF4PTY5IHFwc3RlcD00IGlwX3JhdGlvPTEuNDAgYXE9MToxLjAwAIAAAAAPZYiEABD//veBvzLLZD+5AAAACEGaImxDv/7gAAAACAGeQXkO/7eB";

/** The pending composer strip creates its browser-native `File` props inside the story; `File` does not
 *  survive Playwright's node-to-browser prop serialization. */
export function ComposerAttachmentStripStory({ empty = false }: { readonly empty?: boolean }): ReactElement {
  const attachments: readonly PendingAttachment[] = empty
    ? []
    : [
        { file: new File(["image"], "portrait.png", { type: "image/png" }), url: CT_PNG_DATA_URL },
        { file: new File(["video"], "scene.mp4", { type: "video/mp4" }), url: CT_MP4_DATA_URL },
      ];
  const [removed, setRemoved] = useState<number | null>(null);
  return (
    <div style={{ width: 420 }}>
      <ComposerAttachmentStrip attachments={attachments} onRemove={setRemoved} />
      <output data-testid="removed-index">{removed ?? "none"}</output>
    </div>
  );
}

/** The #791 arg-hint strip in isolation — the offers render as an inline listbox and picking one reports the
 *  chosen offer through `onPick`. `empty` mounts the no-offers arm (the strip renders nothing). `insert`/
 *  `describe` are supplied so the fixtures are real `SlashArgOffer`s, though this leaf reads only `id`/`label`. */
export function ComposerArgHintStripStory({ empty = false }: { readonly empty?: boolean }): ReactElement {
  const offers: readonly SlashArgOffer[] = empty
    ? []
    : [
        { id: "tone", label: "tone", describe: "enum: ominous | playful", insert: "tone=" },
        { id: "count", label: "count", describe: "number (1–12)", insert: "count=" },
      ];
  const [picked, setPicked] = useState<string>("none");
  return (
    <div style={{ width: 420 }}>
      <ComposerArgHintStrip offers={offers} onPick={(offer): void => setPicked(offer.id)} />
      <output data-testid="picked-offer">{picked}</output>
    </div>
  );
}

export interface AttachmentMediaStoryProps {
  /** `true` mounts the context EMPTY (the provider-less / still-loading placeholder path); default provides
   *  the resolved data-URL blob for the asset (the render path). A boolean — not an optional url — so the
   *  empty case can't be swallowed by a default param. */
  readonly empty?: boolean;
  /** `true` resolves the asset as a VIDEO (#317 — the context carries a `video/mp4` mime, so the block must
   *  pick the native `<video>` arm off the resolved mime; the span/block projection is mime-blind). */
  readonly video?: boolean;
  /** `true` resolves the asset as a 1024×1536 PORTRAIT image — the geometry arm (#622): the rendered box must
   *  keep the image's own 2:3 ratio, never the primitive's 16:9 no-dims reservation. */
  readonly portrait?: boolean;
  /** When set, resolves the asset at THIS url carrying the stored 1024×1536 `dims` — the RESERVATION arm
   *  (#625). The CT holds the url permanently pending, so the box it measures is the pre-decode one. */
  readonly reservedSrc?: string;
}

/** The stored dimensions the #625 reservation arm resolves with — the same 1024×1536 portrait #622 uses. */
const CT_RESERVED_DIMS = { w: 1024, h: 1536 } as const;

function resolveStillImage(portrait: boolean, reservedSrc: string | undefined): ResolvedAttachment {
  if (reservedSrc !== undefined) {
    return { url: reservedSrc, mime: "image/png", dims: CT_RESERVED_DIMS };
  }
  return portrait ? { url: CT_PORTRAIT_SVG_DATA_URL, mime: "image/svg+xml" } : { url: CT_PNG_DATA_URL, mime: "image/png" };
}

/** `MessageMediaBlock`'s ASSET arm (#67/#317) over the `AttachmentUrlContext`: the resolved case provides a
 *  `{url, mime}` (renders the gated `<MessageMedia>` image, or the `<video>` arm for a video mime); `empty`
 *  provides an empty map (the `[image]` placeholder degrade). A pure-render story (no data layer — the
 *  context IS the seam). */
export function AttachmentMediaStory({ empty = false, video = false, portrait = false, reservedSrc }: AttachmentMediaStoryProps): ReactElement {
  const block = {
    kind: "media",
    media: "image",
    src: { kind: "asset", assetId: CT_ATTACH_ASSET_ID },
    alt: "an attached image",
  } as const;
  const resolved: ResolvedAttachment = video ? { url: CT_MP4_DATA_URL, mime: "video/mp4" } : resolveStillImage(portrait, reservedSrc);
  const map = new Map<AssetId, ResolvedAttachment>(empty ? [] : [[CT_ATTACH_ASSET_ID, resolved]]);
  return (
    <AttachmentUrlContext value={map}>
      <MessageMediaBlock block={block} allowExternal={false} />
    </AttachmentUrlContext>
  );
}

/** #618 — the CLICK→DETAIL path with a NON-NULL active chat, which is the arm the story above cannot reach
 *  (it mounts with no active chat, so the block takes the plain-zoom fallback). The active chat is seeded by
 *  the `.ct.tsx` into the PERSISTED store's localStorage key BEFORE the page's scripts run, never by an
 *  effect here: `useActiveChatId` is read during the media block's FIRST commit, and an effect-seeded store
 *  would land after it.
 *
 *  The mini-host is the shell's ModalHost body-swap narrowed to the imagery slots — those modals live at the
 *  shell in production precisely so they survive a virtualized row's unmount, so a story that rendered them
 *  inside the block would be proving a composition the app never uses. What the pair makes observable is the
 *  PIN: the chatId the detail body writes a background against is the one that was active AT OPEN TIME —
 *  and (#654) the whole transcript→detail→edit chain a room image actually travels, which is the only way to
 *  observe the intrinsic dims surviving each hop without reaching into the store from the test. */
function RoomImageDetailHost(): ReactElement | null {
  const openModal = useOpenModal();
  if (openModal === "imageDetail") {
    return <ImageDetailBody />;
  }
  return openModal === "imageEdit" ? <ImageEditBody /> : null;
}

/** #654 — when set, the asset resolves at THIS url carrying the stored 1024×1536 `dims`, exactly as the
 *  chat-scoped resolver returns them. The CT holds the url permanently pending, so every box it measures
 *  down the chain is the PRE-DECODE one (a reservation, not a decoded image). */
export interface RoomImageDetailStoryProps {
  readonly reservedSrc?: string;
}

export function RoomImageDetailStory({ reservedSrc }: RoomImageDetailStoryProps): ReactElement {
  const resolved: ResolvedAttachment =
    reservedSrc === undefined ? { url: CT_PNG_DATA_URL, mime: "image/png" } : { url: reservedSrc, mime: "image/png", dims: CT_RESERVED_DIMS };
  const map = new Map<AssetId, ResolvedAttachment>([[CT_ATTACH_ASSET_ID, resolved]]);
  const block = {
    kind: "media",
    media: "image",
    src: { kind: "asset", assetId: CT_ATTACH_ASSET_ID },
    alt: "an attached image",
  } as const;
  return (
    <CtDataProviders>
      <AttachmentUrlContext value={map}>
        <MessageMediaBlock block={block} allowExternal={false} />
      </AttachmentUrlContext>
      <RoomImageDetailHost />
    </CtDataProviders>
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
    tokenProvenance: "measured",
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

// WIREBTN — the wire inspector no longer has a story of its own: its trigger moved into the message kebab,
// so `MessageRowStory` (which mounts the REAL row = metadata row + action cluster together) is the honest
// mount point, and `variant-wire-viewer.ct.tsx` drives it from there. That mount is also what lets the CT
// assert BOTH halves of the move in one render: the item is in the kebab, and the metadata row is clean.

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

/** The seeded-greeting swipe strip in isolation (R3, §4.8/F6) — the component's own contract: the counter
 *  derives its position from the row's CURRENT TEXT (never from local state), the ends clamp, and a
 *  hand-EDITED greeting that matches no alternate reads "— / m" and steps to the last/first rather than
 *  going dead. The `.ct.tsx` stubs `chat.setSeededGreeting` and reads the fired INDEX. */
export function GreetingSwipeStripStory({ variants, current }: { readonly variants: readonly string[]; readonly current: string }): ReactElement {
  return (
    <CtDataProviders>
      <GreetingSwipeStrip chatId={CHAT_ID} messageId={castId<MessageId>("msg_ct_greeting")} variants={variants} current={current} />
    </CtDataProviders>
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
/** #821: the RESERVE beside the thing it reserves for. The Injections boundary's fallback and the settled
 *  section, at ONE width in ONE page, each in its own measurable box — so a CT can read both heights in a
 *  single settled frame and assert the reserve is within 10% of what arrives, at 0/1/2/5 rows and at both
 *  the desktop (367px) and mobile (411px) context-panel widths. Measuring them separately across two mounts
 *  would compare two layout passes; measuring them together is the claim itself. */
export function InjectionsReserveStory({ count, width }: { readonly count: number; readonly width: number }): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width }}>
        <div data-testid="injections-reserve">
          <InjectionsSkeleton count={count} isHost={true} />
        </div>
        <div data-testid="injections-settled">
          <QueryBoundary
            fallback={<Text tone="muted">Loading injections…</Text>}
            renderError={(_error, retry): ReactElement => <QueryErrorState label="injections" onRetry={retry} />}
          >
            <InjectionsManager chatId={CHAT_ID} isHost={true} />
          </QueryBoundary>
        </div>
      </div>
    </CtDataProviders>
  );
}

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

/** The per-chat DOCUMENTS rack (chat-documents-section.tsx, S2) at the REAL context-panel width — 320px is
 *  the pane floor the row grammar is stated at, and it is exactly where S1's own chip defect only became
 *  visible. Wrapped in the same `QueryBoundary` its production mount ("This chat" → Documents) gives it.
 *  The `.ct.tsx` stubs `databank.listActiveForChat` (+ `databank.list` for the picker) and asserts the
 *  MUTATION payload of the D85 visibility write, never a UI reaction. */
export function ChatDocumentsSectionStory({ isHost = true }: { readonly isHost?: boolean }): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 320 }}>
        <QueryBoundary
          fallback={<Text tone="muted">Loading documents…</Text>}
          renderError={(_error, retry): ReactElement => <QueryErrorState label="this chat's documents" onRetry={retry} />}
        >
          <ChatDocumentsSection chatId={CHAT_ID} isHost={isHost} />
        </QueryBoundary>
      </div>
    </CtDataProviders>
  );
}

/** The per-chat WORLD BOOKS rack (chat-books-section.tsx, #640) at the REAL context-panel width — 320px is the
 *  pane floor the row grammar is stated at, and the width a `shrink-0` trailing cluster is proven at. Same
 *  `QueryBoundary` its production mount ("This chat" → World books) gives it. The tab's own `.ct.tsx` owns the
 *  behavior pins (order, the write-reach copy, attach/detach payloads); this story exists for the geometry
 *  the 380px tab story cannot see. */
export function ChatBooksSectionStory({ isHost = true }: { readonly isHost?: boolean }): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 320 }}>
        <QueryBoundary
          fallback={<Text tone="muted">Loading world books…</Text>}
          renderError={(_error, retry): ReactElement => <QueryErrorState label="this chat's world books" onRetry={retry} />}
        >
          <ChatBooksSection chatId={CHAT_ID} isHost={isHost} />
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
        <MemorySettingsSection sectionId="chat-memory" />
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
        <DatabankSettingsSection sectionId="chat-databank" />
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
        <ImageryTemplatesSection sectionId="chat-imagery-templates" />
      </div>
    </CtDataProviders>
  );
}

/** The Prose settings SECTION (PROSE-1 S2) over the real data layer — getUserSettings +
 *  updateUserSettingsSection("prose") stubbed in the `.ct.tsx`. Proves the per-slot override write path. */
export function ProseSettingsSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 720, padding: 16 }}>
        <ProseSettingsSection sectionId="chat-prose" />
      </div>
    </CtDataProviders>
  );
}

/** The MU PICKS pane (#24) over the real data layer — `chat.getUserMacroPicks` + `chat.setUserMacroValues`
 *  stubbed in the `.ct.tsx`. Wrapped in the SAME `QueryBoundary` the "This chat" tab mounts it behind
 *  (the section suspends on its own read), so the CT drives the production composition, never a bare mount. */
export function MacroPicksSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 480, padding: 16 }}>
        <QueryBoundary
          fallback={<Text tone="muted">Loading macro picks…</Text>}
          renderError={(_error, retry): ReactElement => <QueryErrorState label="the macro picks" onRetry={retry} />}
        >
          <MacroPicksSection chatId={CHAT_ID} />
        </QueryBoundary>
      </div>
    </CtDataProviders>
  );
}

/** The SAME picks pane on the REAL app QueryClient + the production Toaster (#1582, pinned #1632 item 4).
 *  `useSetUserMacroValues` suppresses its `errorToast` for the `unknown_macro_pick` refusal because the pane
 *  says that refusal beside the knob — "one refusal, one surface". `CtDataProviders`' plain QueryClient has
 *  NO MutationCache error channel, so on that stack the toast half is invisible and the count reads zero
 *  whether the suppression works or not. A SECOND story rather than switching the shared one: the other
 *  nineteen tests in `macro-picks-section.ct.tsx` are pinned against `CtDataProviders`' deterministic
 *  defaults (`retry: false`, infinite `staleTime`), which the app client does not share. */
export function MacroPicksSectionToastStory(): ReactElement {
  return (
    <CtAppDataProviders>
      <CtToastSurface>
        <div style={{ width: 480, padding: 16 }}>
          <QueryBoundary
            fallback={<Text tone="muted">Loading macro picks…</Text>}
            renderError={(_error, retry): ReactElement => <QueryErrorState label="the macro picks" onRetry={retry} />}
          >
            <MacroPicksSection chatId={CHAT_ID} />
          </QueryBoundary>
        </div>
      </CtToastSurface>
    </CtAppDataProviders>
  );
}

// ── The three CHAT-owned appearance SECTIONS (SET-SEAMS stage 1) ──────────────────────────────────
// Each is a self-owned settings section at the `appearance` anchor: its own cache-first read, its own
// autosave form session and its own KEY-MINIMAL `updateUserSettingsSection("appearance")` write. Mounted
// bare (no `SaveStatusHostContext`) so the DEGRADED save-status arm renders inline — the pane-level story
// in the settings module drives the hosted arm.

/** The Message-style appearance section — `getUserSettings` + the appearance section-patch are stubbed
 *  per-test via routeTrpc. */
export function AppearanceMessageStyleSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 720, padding: 16 }}>
        <AppearanceMessageStyleSection sectionId="appearance-message-style" />
      </div>
    </CtDataProviders>
  );
}

/** The Message-style section at a NARROW container width (a phone-width settings modal) — proves the
 *  horizontal row grammar's fixed ~200px control column can't starve the label block to 0 (the Wave-1
 *  in-flow-squeeze class); it stacks the row so the label keeps full width. */
export function AppearanceMessageStyleNarrowStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 300, padding: 16 }}>
        <AppearanceMessageStyleSection sectionId="appearance-message-style" />
      </div>
    </CtDataProviders>
  );
}

/** The Avatars appearance section. */
export function AppearanceAvatarsSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 720, padding: 16 }}>
        <AppearanceAvatarsSection sectionId="appearance-avatars" />
      </div>
    </CtDataProviders>
  );
}

/** The Message details & actions appearance section. */
export function AppearanceMessageDetailsSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 720, padding: 16 }}>
        <AppearanceMessageDetailsSection sectionId="appearance-message-details" />
      </div>
    </CtDataProviders>
  );
}

// ── The two CHAT-owned chat-behavior SECTIONS (SET-SEAMS stage 2) ─────────────────────────────────
// Each is a self-owned settings section at the `chat-behavior` anchor: its own cache-first read, its own
// autosave form session and its own KEY-MINIMAL `updateUserSettingsSection("chat")` write. Mounted bare (no
// `SaveStatusHostContext`) so the DEGRADED save-status arm renders inline — the pane-level story in the
// settings module drives the hosted arm.

/** The Chat & message handling section — `getUserSettings` + the chat section-patch are stubbed per-test. */
export function ChatMessageHandlingSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 720, padding: 16 }}>
        <ChatMessageHandlingSection sectionId="chat-message-handling" />
      </div>
    </CtDataProviders>
  );
}

/** The Streaming section. */
export function ChatStreamingSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 720, padding: 16 }}>
        <ChatStreamingSection sectionId="chat-streaming" />
      </div>
    </CtDataProviders>
  );
}

/** The MOBILE topbar's SCREEN TITLE for the open room — `useChatsSelectionTitle`, which the shell calls
 *  through `SectionDefinition.useSelectionTitle`, printed as bare text beside the desktop cluster's own
 *  answer. The two surfaces are one statement at two widths; this is what lets a CT put them side by side.
 *  (Its pre-send DRAFT twin went with draft mode — a room has a title source from the creation click.) */
export function ChatsSelectionTitleStory(): ReactElement {
  useEffect(() => {
    selectChat(CHAT_ID);
  }, []);
  return (
    <CtDataProviders>
      <ChatsSelectionTitleProbe />
    </CtDataProviders>
  );
}

function ChatsSelectionTitleProbe(): ReactElement {
  const title = useChatsSelectionTitle();
  return <p data-testid="selection-title">{title ?? "(null)"}</p>;
}

// ── S1: the in-chat CONTROL band (interaction-direction-spec.md §3-S1) ─────────────────────────────
// The seam mounted EXACTLY as the door mounts it: a `chat-controls` source registry → the real
// `makeChatControlsContribution` → the chat-surface registry → the real `ChatRoomSurface`'s
// `above-composer` anchor. `source="none"` is the ACCEPTANCE arm (zero sources ⇒ the room renders with no
// band at all); the fake source publishes from its OWN fiber the way a real one will.

/** Which control set the fake source publishes — one per row of the CT mount matrix. */
const CHAT_CONTROLS_FIXTURES = [
  "empty",
  "chips",
  "chips-over-cap",
  "card",
  "card-unstyled-detail",
  "cards-stacked",
  "mixed",
  "execute",
  "execute-pending",
  "republish",
] as const;
// NOT exported: the CT names its fixture with a string literal, so an exported alias is dead wire
// (`deps:knip` reds it). The tuple + the derived type stay — the axis is still declared once.
type ChatControlsFixture = (typeof CHAT_CONTROLS_FIXTURES)[number];

export interface ChatControlsStoryProps {
  /** `none` = an EMPTY source registry (the byte-identical arm). @defaultValue "fake" */
  readonly source?: "none" | "fake";
  /** @defaultValue "chips" */
  readonly fixture?: ChatControlsFixture;
  /** #883 test-only worst art; stamps the shell flag on the REAL room only, excluding story drivers. */
  readonly worstArt?: string;
}

const CT_CONTROL_SOURCE_ID = "ct-fake-control-source";

/** What the fake source's controls call back into. `run` carries an AMOUNT so the `republish` fixture can
 *  change a control's BEHAVIOUR while leaving every rendered field identical — the exact case the band's
 *  publish guard decides (an ignored publish keeps the OLD closure, so the old amount lands). */
interface CtControlDeps {
  readonly dismiss: (id: string) => void;
  readonly run: (amount: number) => void;
  /** Bumped by the story's drivers; `1` = same rendered fields as `0`, `2` = a changed label. */
  readonly epoch: number;
}

/** Builds the fixture's controls. `dismiss`/`run` are the source's OWN handlers — the band never invents
 *  either, so clicking through them proves the wiring, not a story shortcut. */
function buildCtControls(fixture: ChatControlsFixture, deps: CtControlDeps): readonly ChatControl[] {
  const chip = (id: string, label: string, mode: QuickReplyMode, text: string): ChatControl => ({
    kind: "chip",
    id,
    action: { id: `${id}-action`, label, mode, text },
  });
  const runOnce = (): void => deps.run(1);
  switch (fixture) {
    case "empty": {
      return [];
    }
    case "chips": {
      return [chip("chip-send", "Draw your blade", "send", "I draw my blade."), chip("chip-compose", "Time skip", "compose", "Some hours later,")];
    }
    case "chips-over-cap": {
      // SIX chips against the band's display cap of four (one rule's arm caps at 4; N rules do not).
      return ["one", "two", "three", "four", "five", "six"].map((n, i) => chip(`chip-${n}`, `Chip ${n}`, "send", `I say ${i}`));
    }
    case "card": {
      return [
        {
          kind: "card",
          id: "card-recap",
          title: "Recap where we left off?",
          detail: <Text voice="gloss">A short catch-up on the last scene.</Text>,
          actions: [{ id: "card-recap-do", label: "Do it", mode: "execute", run: runOnce, pending: false }],
          dismiss: (): void => deps.dismiss("card-recap"),
        },
      ];
    }
    case "card-unstyled-detail": {
      // #684 P3 — THE INHERITED-INK SPECIMEN. `detail` is an arbitrary `ReactNode` a SOURCE supplies, and a
      // source outside chat has no reason to know the band's surface: this one renders a bare `<span>` that
      // sets NO colour of its own, so what it paints is whatever the band's box hands down. The CT mounts it
      // under a deliberately hostile inherited ink (the theme-scope boundary case the probe measured at
      // 1.1:1) — the band must land it on its own reading surface's ink regardless.
      return [
        {
          kind: "card",
          id: "card-unstyled",
          title: "An unstyled detail",
          detail: <span data-testid="ct-unstyled-detail">inherited ink</span>,
          actions: [{ id: "card-unstyled-do", label: "Do it", mode: "execute", run: runOnce, pending: false }],
          dismiss: (): void => deps.dismiss("card-unstyled"),
        },
      ];
    }
    case "mixed": {
      // The stacking law's specimen: a chip published BEFORE a card, so DOM order alone cannot produce
      // "cards above chips" — only the band's kind-ordered stack can.
      return [
        chip("chip-mixed", "Draw your blade", "send", "I draw my blade."),
        {
          kind: "card",
          id: "card-mixed",
          title: "Recap where we left off?",
          actions: [{ id: "card-mixed-do", label: "Do it", mode: "execute", run: runOnce, pending: false }],
          dismiss: (): void => deps.dismiss("card-mixed"),
        },
      ];
    }
    case "cards-stacked": {
      // Arrival order, oldest first — the band shows the NEWEST and counts the rest.
      return (["older", "newer"] as const).map((age) => ({
        kind: "card" as const,
        id: `card-${age}`,
        title: `The ${age} ask`,
        actions: [{ id: `card-${age}-do`, label: "Do it", mode: "execute" as const, run: runOnce, pending: false }],
        dismiss: (): void => deps.dismiss(`card-${age}`),
      }));
    }
    case "republish": {
      // THE PUBLISH-GUARD SPECIMEN. Epoch 0 and 1 render IDENTICALLY (same kind/id/label/mode/pending) and
      // differ only in the closure's amount; epoch 2 changes the label. So: after a same-content republish
      // the band must still be holding the epoch-0 control (a click adds 1), and after a changed-content
      // one it must have adopted the new control (the label changes).
      return [
        {
          kind: "chip",
          id: "chip-republish",
          action: {
            id: "chip-republish-action",
            label: deps.epoch >= 2 ? "Roll 2d20" : "Roll 1d20",
            mode: "execute",
            run: (): void => deps.run(deps.epoch === 0 ? 1 : 10),
            pending: false,
          },
        },
      ];
    }
    default: {
      // execute / execute-pending. The SEND chip rides along so a test can barrier on the turn actually
      // being in flight (the send control visibly blocked) before asserting the execute control is not.
      return [
        chip("chip-send", "Draw your blade", "send", "I draw my blade."),
        {
          kind: "chip",
          id: "chip-execute",
          action: { id: "chip-execute-action", label: "Roll 1d20", mode: "execute", run: runOnce, pending: fixture === "execute-pending" },
        },
      ];
    }
  }
}

/** The fake CONTROL SOURCE. It REBUILDS its control objects on every render — fresh closures, fresh array,
 *  the natural bus-driven shape — and publishes them from an effect with no equality of its own. That is
 *  deliberate: the band's publish guard is the only thing standing between this shape and a render loop, so
 *  the guard is exercised here rather than dodged. Renders `null`: a source is a publish-only fiber (its
 *  receipts live in the story, outside the room). */
function CtControlSource({
  publish,
  fixture,
  epoch,
  onRan,
  onDismissed,
  dismissed,
}: ChatControlSourceMountProps & {
  readonly fixture: ChatControlsFixture;
  readonly epoch: number;
  readonly onRan: (amount: number) => void;
  readonly onDismissed: (id: string) => void;
  readonly dismissed: readonly string[];
}): null {
  const controls = buildCtControls(fixture, { dismiss: onDismissed, run: onRan, epoch }).filter((control) => !dismissed.includes(control.id));
  useEffect(() => {
    publish(controls);
  }, [publish, controls]);
  return null;
}

/** The room + the turn driver: `drive-turn-begin` opens a pending turn slot for this chat — the exact call
 *  the chat-bus reducer makes on `turnStarted` — so the send-mode busy arm is driven, never simulated. */
function ChatControlsRoom({
  surfaceContributors,
  worstArt,
}: {
  readonly surfaceContributors: ContributorRegistry<ChatSurfaceContribution>;
  readonly worstArt?: string;
}): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const busDeps: ChatBusDeps = {
    stream: chatStream,
    invalidate: createInvalidation({ queryClient, trpc }).invalidate,
  };
  const room = (
    <ChatRoomSurface busDeps={busDeps} handle={committedChat(CHAT_ID)} surfaceContributors={surfaceContributors} toolRenderers={NO_TOOL_RENDERERS} />
  );
  if (worstArt === undefined) {
    return <div style={{ height: 480 }}>{room}</div>;
  }
  // The contrast census must reach every declared text node in one bounded frame. The ordinary 480px
  // interaction fixture deliberately scrolls its first message offscreen; this palette-only arm is taller
  // so both seeded messages, their attribution, and the controls are simultaneously measurable.
  return (
    <div data-has-bg-image="" style={{ background: worstArt, height: 720, isolation: "isolate", position: "relative" }}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-backdrop" style={{ opacity: BACKGROUND_DIM_MIN }} />
      <div data-slot="worst-art-room" style={{ height: "100%", position: "relative" }}>
        {room}
      </div>
    </div>
  );
}

/** The room with the S1 band wired the door's way, plus the drivers and receipts the matrix reads. */
export function ChatControlsStory({ source = "fake", fixture = "chips", worstArt }: ChatControlsStoryProps): ReactElement {
  const [ran, setRan] = useState(0);
  const [epoch, setEpoch] = useState(0);
  const [dismissed, setDismissed] = useState<readonly string[]>([]);
  const sources = createContributorRegistry<ChatControlSource>(
    "chat-controls",
    source === "none"
      ? []
      : [
          {
            id: CT_CONTROL_SOURCE_ID,
            // The MOUNT ELEMENT is a component element; the COMPONENT renders null (the contract).
            mount: (props): ReactElement => (
              <CtControlSource
                {...props}
                dismissed={dismissed}
                epoch={epoch}
                fixture={fixture}
                onDismissed={(id): void => setDismissed((prev) => (prev.includes(id) ? prev : [...prev, id]))}
                onRan={(amount): void => setRan((n) => n + amount)}
              />
            ),
          },
        ],
  );
  const surfaceContributors = createContributorRegistry<ChatSurfaceContribution>("chat-surface", [makeChatControlsContribution(sources)]);
  return (
    <CtDataProviders>
      <SocketHost>
        <ChatControlsRoom surfaceContributors={surfaceContributors} {...(worstArt === undefined ? {} : { worstArt })} />
        {/* Receipts + drivers, OUTSIDE the room (a source mount renders null by contract). */}
        <div data-testid="ct-control-source-ran">{ran}</div>
        <button
          type="button"
          data-testid="drive-turn-begin"
          onClick={(): void => chatStream.beginTurn(CHAT_ID, { intent: "send", speakerCharacterId: null, targetMessageId: null })}
        >
          begin turn
        </button>
        <button type="button" data-testid="drive-source-republish" onClick={(): void => setEpoch(1)}>
          republish, same content
        </button>
        <button type="button" data-testid="drive-source-relabel" onClick={(): void => setEpoch(2)}>
          republish, changed content
        </button>
      </SocketHost>
    </CtDataProviders>
  );
}

// ── B3: the REAL automation quick-reply CHIP source, wired the door's way (interaction-direction-spec §7 B3)
// The band CT above proves the SEAM with a synthetic source; this story proves the FIRST REAL member-visible
// consumer — `automationQuickReplySource` from `features/automation`, appended to the `chat-controls` registry
// exactly as `authed-app.tsx` does it, then rendered blind through the one `above-composer` mount. Its chips
// come from a HAND-FIRED `quickReplySurfaced` frame on the automation room (the CT scripts the socket), so this
// is the end-to-end proof the arm's `sendText`/`mode` reach a member's click. Full room (not a bare band) so
// the compose-mode assertion can read THIS room's real composer draft.
export function AutomationChipsStory(): ReactElement {
  const sources = createContributorRegistry<ChatControlSource>("chat-controls", [automationQuickReplySource]);
  const surfaceContributors = createContributorRegistry<ChatSurfaceContribution>("chat-surface", [makeChatControlsContribution(sources)]);
  return (
    <CtDataProviders>
      <SocketHost>
        <div style={{ height: 480 }}>
          <ChatControlsRoom surfaceContributors={surfaceContributors} />
        </div>
      </SocketHost>
    </CtDataProviders>
  );
}

// ── C3: the REAL automation SUGGESTION-CARD source, wired the door's way (interaction-direction-spec §7 C3)
// The twin of the chips story one seam over: `automationSuggestionSource` from `features/automation`, in the
// SAME registry `authed-app.tsx` builds, rendered blind through the one `above-composer` mount. Its card comes
// from a hand-fired `suggestionRaised` frame carrying C3's rewrite DETAIL, so this is the end-to-end proof
// that the host-only bus payload becomes a collapsed `@orb/ui/diff` body a host can open.
export function AutomationSuggestionCardStory(): ReactElement {
  const sources = createContributorRegistry<ChatControlSource>("chat-controls", [automationSuggestionSource]);
  const surfaceContributors = createContributorRegistry<ChatSurfaceContribution>("chat-surface", [makeChatControlsContribution(sources)]);
  return (
    <CtDataProviders>
      <SocketHost>
        <div style={{ height: 480 }}>
          <ChatControlsRoom surfaceContributors={surfaceContributors} />
        </div>
      </SocketHost>
    </CtDataProviders>
  );
}

// ── B8: the REAL rpg dice ASK source, wired the door's way (interaction-direction-spec §7 B8) ──────────────
// The GAME-ARM twin of the automation chips story: `rpgDiceAskSource` from `features/rpg`, in the SAME registry
// `authed-app.tsx` builds, rendered blind through the one `above-composer` mount. The source gates on
// `isRpgEngaged` off `chat.getChat.rpg`, so the CT presents an ENGAGED pointer to open it (a plain chat gets no
// chips — that acceptance arm rides the CT). Full room (not a bare band) so the CT can read THIS room's real
// composer draft: an `execute` chip rolls `rpg.rollDice` and appends the baked stamp for the member to send.
export function RpgDiceAskStory(): ReactElement {
  const sources = createContributorRegistry<ChatControlSource>("chat-controls", [rpgDiceAskSource]);
  const surfaceContributors = createContributorRegistry<ChatSurfaceContribution>("chat-surface", [makeChatControlsContribution(sources)]);
  return (
    <CtDataProviders>
      <SocketHost>
        <div style={{ height: 480 }}>
          <ChatControlsRoom surfaceContributors={surfaceContributors} />
        </div>
      </SocketHost>
    </CtDataProviders>
  );
}

// ── B8: the REAL rpg in-thread dice RESULT renderer (interaction-direction-spec §7 B8) ─────────────────────
// The `tool-renderers` half: `rpgDiceToolRenderer` claims the exact `roll_dice` wire name, and `MessageToolCalls`
// (chat's real tool-block seam) resolves it for a persisted `roll_dice` `ToolCallRecord`. The registry is built
// HERE (post-mount, in the browser) because a registry instance does NOT survive the Playwright CT prop wire —
// only the plain `record` data crosses it. A record whose result is malformed/absent falls back to the generic
// `ToolCallBlock` (the canon-preserving null state), which the CT drives with a second record.
export function RpgDiceToolResultStory({ record }: { readonly record: ToolCallRecord }): ReactElement {
  const renderers = createContributorRegistry<ToolRenderer>("tool-renderers", [rpgDiceToolRenderer]);
  return <MessageToolCalls records={[record]} renderers={renderers} />;
}

// ── #1153: the This-chat tab's DISCLOSURE SECTION, in isolation ────────────────────────────────────────
/** The chat CONTEXT tab's `DisclosureSection` (chat-context-disclosure-section.tsx) with the four arms the
 *  tab actually mounts: an open-by-default section, a closed-by-default one, and the two GRAFT shapes —
 *  `keepMounted` + the silent-contributor collapse selector, over an EMPTY body wrapper and over a live one.
 *  The ids are story-local so the persisted posture store can never collide with a real section's.
 *
 *  IT CAN REMOUNT ITSELF. The component's whole reason to exist is that the open/closed answer is remembered
 *  per host in `chat-context-section-open-store.ts` rather than held in the tab's render — which is only
 *  observable ACROSS a mount. The button re-keys the subtree, so the CT drives a real unmount/remount
 *  without a page reload (a reload would take the store's in-memory state with it and prove nothing about
 *  the seam). */
export function ChatContextDisclosureSectionStory(): ReactElement {
  const [generation, setGeneration] = useState(0);
  return (
    <div style={{ width: 380 }}>
      <button
        onClick={(): void => {
          setGeneration((current) => current + 1);
        }}
        type="button"
      >
        remount the pane
      </button>
      <Stack gap="section" key={generation}>
        <DisclosureSection defaultOpen={true} kicker="Field overrides" sectionId="ct-open-by-default">
          <Text>the open section's body</Text>
        </DisclosureSection>
        <DisclosureSection defaultOpen={false} kicker="Host controls" sectionId="ct-closed-by-default">
          <Text>the closed section's body</Text>
        </DisclosureSection>
        <DisclosureSection
          className="has-[[data-slot=chat-settings-graft-body]:empty]:hidden"
          defaultOpen={false}
          keepMounted={true}
          kicker="Silent plugin"
          sectionId="graft:ct-silent"
        >
          <Stack className="contents" data-slot="chat-settings-graft-body" />
        </DisclosureSection>
        <DisclosureSection
          className="has-[[data-slot=chat-settings-graft-body]:empty]:hidden"
          defaultOpen={false}
          keepMounted={true}
          kicker="Loud plugin"
          sectionId="graft:ct-loud"
        >
          <Stack className="contents" data-slot="chat-settings-graft-body">
            <Text>a contribution that renders something</Text>
          </Stack>
        </DisclosureSection>
      </Stack>
    </div>
  );
}

/** The COMMITTED Group tab — `CommittedGroupConfigTab`, i.e. the adapter that wires the real
 *  `chat.setGroupConfig` mutation into the shared autosave form (#1501). Distinct from
 *  `GroupConfigFormStory`, which mounts the pure form with a local `save` and therefore cannot see the
 *  adapter at all. The unmount button is the observable: the form's ONE teardown flush re-sends an edit that
 *  has not been persisted, so whether a rejected save was recorded as a FAILURE is visible on the wire. */
export function CommittedGroupConfigTabStory(): ReactElement {
  const [mounted, setMounted] = useState(true);
  return (
    <CtDataProviders>
      <div style={{ width: 380 }}>
        <button onClick={(): void => setMounted(false)} type="button">
          Leave the tab
        </button>
        {mounted ? (
          <QueryBoundary
            fallback={<Text tone="muted">Loading the group settings…</Text>}
            renderError={(_error, retry): ReactElement => <QueryErrorState label="the group settings" onRetry={retry} />}
          >
            <CommittedGroupConfigTab chatId={CHAT_ID} />
          </QueryBoundary>
        ) : null}
      </div>
    </CtDataProviders>
  );
}
