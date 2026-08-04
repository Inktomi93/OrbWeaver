// One canonical message row behind every chatStyle — looks up its skin from `MESSAGE_ROW_SKINS` and
// never branches on chatStyle itself. The streaming ghost is a separate component (ghost-message-row);
// this row is canon-only and holds no per-token subscription. Render trust (untrusted by default):
// `resolveRowRenderPolicy` trusts ONLY the viewer's own input or an opted-in character — never
// assistant/LLM/imported content by default (the indirect-prompt-injection boundary).

import type { MessageView, ParticipantView } from "@orb/contracts/chat";
import type { RegexScriptRow } from "@orb/contracts/regex";
import type { CharacterId, ChatId, PersonaId, UserId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import type { MessageRole } from "@orb/kit/message-role";
import { Checkbox } from "@orb/ui/checkbox";
import { Row, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { Fragment } from "react";
import type { ChatMessageSurfaceState, ChatSurfaceContribution, ContributorRegistry, ToolRenderer } from "#lib";
import { cn, resolveRowRenderPolicy } from "#lib";
import { toggleMessageSelected, useIsEditingMessage, useIsMessageSelected, useSelectionActive } from "#state";
import { AttachmentUrlProvider } from "../hooks/attachment-url-provider.tsx";
import { useEnterMotion } from "../hooks/use-enter-motion.ts";
import { resolveRowAttribution, speakerThemesByName } from "../lib/attribution.ts";
import { resolveMessageRenderContext } from "../lib/message-render-context.ts";
import { MESSAGE_ROW_SKINS } from "../lib/message-row-variants.ts";
import { splitIntoTrainParagraphs } from "../lib/split-paragraphs.ts";
import type { GreetingBinding } from "../lib/synth-greeting-row.ts";
import type { MessageMetadataVisibility } from "./message-metadata-row.tsx";
import { MessageMetadataRow } from "./message-metadata-row.tsx";
import {
  renderContextBoundaryDivider,
  renderRowActions,
  renderRowAvatar,
  renderRowBubble,
  renderRowIdentity,
  renderRowReasoning,
  renderRowSwipe,
  resolveRowContent,
} from "./message-row-parts.tsx";
import { MessageToolCalls } from "./message-tool-calls.tsx";

export interface MessageRowProps {
  readonly message: MessageView;
  readonly chatStyle: keyof typeof MESSAGE_ROW_SKINS;
  readonly avatarSize?: "sm" | "md" | "lg" | undefined;
  readonly avatarShape?: "round" | "square" | "rounded" | undefined;
  readonly avatarAspect?: "square" | "portrait" | undefined;
  readonly avatarRing?: "none" | "accent" | undefined;
  /** Hides the avatar image only; the speaker name stays. */
  readonly showInChatAvatars?: boolean | undefined;
  /** True only for the tail assistant message (the swipe-eligible row). */
  readonly showSwipes?: boolean;
  readonly participants?: ReadonlyMap<CharacterId, ParticipantView> | undefined;
  /** The per-chat macro-name producer — one source for both the attribution badge and `{{char}}`/`{{user}}`. */
  readonly characterNamesById: ReadonlyMap<CharacterId, RowCharacterName>;
  readonly personaNamesById: ReadonlyMap<PersonaId, RowPersonaName>;
  readonly personaAvatarsById?: ReadonlyMap<PersonaId, string | null> | undefined;
  /** The assistant-row portrait floor — a character removed from the room keeps its historical avatar
   *  from this producer (its `ParticipantView` is gone; `participants` no longer carries the hash). */
  readonly characterAvatarsById?: ReadonlyMap<CharacterId, string | null> | undefined;
  readonly activePersonaId?: PersonaId | null | undefined;
  /** The chat's anchor persona id — the null-stamp `{{user}}`/`{{persona}}` macro fallback (distinct
   *  from `activePersonaId`, the badge fallback). */
  readonly anchorPersonaId?: PersonaId | null | undefined;
  /** The viewing principal's user id (render-trust "own input" comparand). Absent/null ⇒ everything
   *  stays untrusted (fail-closed). */
  readonly viewerUserId?: UserId | null | undefined;
  /** The chat-level §4.8 lenient naked-HTML card-wrap verdict (game chat + `features.immersiveHtml`) —
   *  resolved once by the surface, folded into this row's render policy. Absent ⇒ off. */
  readonly lenientHtmlCards?: boolean | undefined;
  readonly onChatForked?: ((chatId: ChatId) => void) | undefined;
  /** Present ⇒ this row is a pre-commit draft greeting: Edit/Swipe route to the greeting card, and
   *  Fork/Delete/Hide are suppressed (no server row). Body/attribution render identically to committed. */
  readonly greeting?: GreetingBinding | undefined;
  readonly autoFixMarkdown?: boolean | undefined;
  /** D121-E/F1: the VIEWER's own enabled DISPLAY-placement scripts, resolved ONCE by the list surface
   *  (never per row — one query, N rows). Absent ⇒ the display leg is a no-op, exactly as before. */
  readonly displayScripts?: readonly RegexScriptRow[] | undefined;
  /** The `appearance.colorQuotedSpeech` pref, folded into this row's render policy. Absent ⇒ ON. */
  readonly colorQuotedSpeech?: boolean | undefined;
  /** This room's group grammar is NARRATOR (`ChatDetail.group.output`) — one generation voices the whole
   *  cast in one row. Gates the plain-`Name:` half of the speaker-span split AND the adaptive outer label
   *  below. Absent ⇒ off (every other grammar, and every mount with no room behind it). */
  readonly narratorRoom?: boolean | undefined;
  /** Phase 4b §B.5.5 — the reasoning-disclosure glyph pref, threaded to the SETTLED reasoning block exactly
   *  as the surface threads it to the live ghost row. */
  readonly showLLMReasoningIcon?: boolean | undefined;
  /** Undefined ⇒ every metadata chip hidden. */
  readonly metadataVisibility?: MessageMetadataVisibility | undefined;
  /** RAWVIEW/WIREBTN — the viewer holds the room HOST role (`ChatDetail.viewerIsHost`). Threaded to the
   *  ACTION cluster, whose kebab gates the host-only per-variant wire inspector on it (it used to reach the
   *  metadata row; that row is data-only now). Absent ⇒ not host (fail-closed). */
  readonly viewerIsHost?: boolean | undefined;
  readonly messageActions?: "expanded" | "hover" | undefined;
  /** True for the one row that is the "last-in-context" boundary; renders a quiet divider above it. */
  readonly contextBoundary?: boolean;
  /** The present-tense fit budget label ("N of M used · R reserved") shown on the boundary divider when the
   *  previewFit query has resolved; absent ⇒ the bare "In context from here" line (PD-#7). */
  readonly contextBoundaryLabel?: string | undefined;
  /** The LINEAR-tier compaction summary covering the span ABOVE the boundary (previewFit `compactSummary`),
   *  or null. Non-null ⇒ the divider reports older messages are compacted into a summary + offers a peek at
   *  this text; null ⇒ the plain cutoff line. */
  readonly contextBoundaryCompactSummary?: string | null | undefined;
  /** True only when this mount is a genuinely-new arrival, never "the row mounted" (a windowed row
   *  remounts on scrollback). Latched at mount by `useEnterMotion`. */
  readonly enterMotion?: boolean;
  /** The §6c/M8 message-footer seam — omitted for a pre-commit draft-greeting row (no server row to
   *  attach a footer to); the committed transcript always supplies it. */
  readonly surfaceContributors?: ContributorRegistry<ChatSurfaceContribution> | undefined;
  /** The §6c per-tool-name renderer registry — omitted for a pre-commit draft-greeting row (it has no
   *  persisted tool records); absent ⇒ every record renders through the generic `ToolCallBlock`. */
  readonly toolRenderers?: ContributorRegistry<ToolRenderer> | undefined;
}

/** Resolves the `when`-filtered `message-footer` contributions for one row (§6c/M8) — a bare helper
 *  (not inlined) so the component body stays under the cognitive-complexity ceiling. */
function resolveMessageFooter(
  registry: ContributorRegistry<ChatSurfaceContribution> | undefined,
  message: MessageView,
): readonly Extract<ChatSurfaceContribution, { anchor: "message-footer" }>[] {
  const state: ChatMessageSurfaceState = { message };
  return (registry?.list() ?? []).filter(
    (c): c is Extract<ChatSurfaceContribution, { anchor: "message-footer" }> => c.anchor === "message-footer" && (c.when?.(state) ?? true),
  );
}

/** A narrator row is the only place ONE body carries more than one speaker — so it is the only place the
 *  plain-`Name:` span grammar may fire. Assistant-only: a USER row's leading `Alice:` is that member's own
 *  prose, and letting it attribute would be a display-tier forge of the label the SHAPE name-stamp owns. */
function isNarratorVoiced(narratorRoom: boolean, role: MessageRole): boolean {
  return narratorRoom && role === "assistant";
}

const NO_METADATA_VISIBLE: MessageMetadataVisibility = {
  showTimestamps: false,
  showMessageId: false,
  showModelIcon: false,
  showTokenCount: false,
  showGenerationTimer: false,
  showGenerationCost: false,
};

export function MessageRow({
  message,
  chatStyle,
  avatarSize = "md",
  avatarShape = "round",
  avatarAspect = "square",
  avatarRing = "none",
  showInChatAvatars = true,
  showSwipes = false,
  participants,
  characterNamesById,
  personaNamesById,
  personaAvatarsById,
  characterAvatarsById,
  activePersonaId,
  anchorPersonaId,
  viewerUserId,
  lenientHtmlCards,
  onChatForked,
  greeting,
  autoFixMarkdown,
  displayScripts,
  colorQuotedSpeech,
  narratorRoom = false,
  showLLMReasoningIcon = false,
  metadataVisibility = NO_METADATA_VISIBLE,
  viewerIsHost = false,
  messageActions,
  contextBoundary = false,
  contextBoundaryLabel,
  contextBoundaryCompactSummary,
  enterMotion = false,
  surfaceContributors,
  toolRenderers,
}: MessageRowProps): ReactElement {
  const enterClasses = useEnterMotion(enterMotion);
  const skin = MESSAGE_ROW_SKINS[chatStyle];
  const role = message.role;
  // ONE binding for both the attribution ownership test and the render-policy own-input comparand.
  const viewer = viewerUserId ?? null;
  const attribution = resolveRowAttribution({
    role,
    characterId: message.characterId,
    personaId: message.personaId,
    participants,
    characterNamesById,
    personaNamesById,
    personaAvatarsById,
    characterAvatarsById,
    activePersonaId,
    // The pair that scopes the legacy activePersonaId fallback to the viewer's OWN row — without it a
    // member's null-persona message renders under the viewer's persona (live 2026-08-03).
    authorUserId: message.authorUserId,
    viewerUserId: viewer,
    narratorRoom,
  });
  const render = resolveRowRenderPolicy({
    role,
    authorUserId: message.authorUserId,
    characterId: message.characterId,
    viewerUserId: viewer,
    participants,
    lenientHtmlCards,
    colorQuotedSpeech,
  });
  // Edit mode lives in the external draft store, not local useState — a windowed row unmounts on
  // scroll and would silently drop mid-edit state.
  const editing = useIsEditingMessage(message.id);
  const selecting = useSelectionActive();
  const selected = useIsMessageSelected(message.id);
  const renderContext = resolveMessageRenderContext({
    participants,
    characterNamesById,
    personaNamesById,
    anchorPersonaId,
    autoFixMarkdown,
    displayScripts,
  });
  const trainParagraphs = !editing && skin.bubbleLayout === "trains" ? splitIntoTrainParagraphs(message.content) : null;
  const speakerThemes = speakerThemesByName(participants);
  const narratorVoiced = isNarratorVoiced(narratorRoom, role);
  // The narrator row's outer name is UNCONDITIONAL, like every other row's. Suppressing it once the body
  // resolved speaker spans was considered and REVERSED (owner, 2026-08-03): the narrator narrates — the
  // unattributed prose between the character spans is its OWN voice, and the row label is that voice's
  // attribution, not a redundant repeat of the in-block labels. Do not re-propose it as an improvement.
  const content = resolveRowContent({
    editing,
    message,
    greeting,
    trainParagraphs,
    render,
    renderContext,
    speakerThemes,
    narratorVoiced,
  });

  const avatarTreatment = skin.avatarTreatment(attribution.kind);
  const decoration =
    skin.bubbleDecoration?.({
      kind: attribution.kind,
      avatarHash: attribution.avatarHash,
      hueSeed: attribution.hueSeed,
      initial: attribution.name === null ? "" : initialsFor(attribution.name),
    }) ?? null;
  const avatarNode = renderRowAvatar({
    attribution,
    avatarTreatment,
    role,
    showInChatAvatars,
    avatarSize,
    avatarShape,
    avatarAspect,
    avatarRing,
  });
  const weldedAvatar = avatarTreatment === "sticky-portrait" ? avatarNode : null;
  const leadingAvatar = weldedAvatar !== null || role === "user" ? null : avatarNode;
  const trailingAvatar = weldedAvatar !== null || role !== "user" ? null : avatarNode;

  // §6c/M8 message-footer: absent for a pre-commit draft-greeting row (no `surfaceContributors` passed).
  const footerContributions = resolveMessageFooter(surfaceContributors, message);

  return (
    // The boundary divider is a sibling before the article, never nested inside role="article".
    <AttachmentUrlProvider chatId={message.chatId} content={message.content}>
      {renderContextBoundaryDivider(contextBoundary, contextBoundaryLabel, contextBoundaryCompactSummary)}
      <Stack
        role="article"
        aria-label={attribution.name ?? undefined}
        data-message-id={message.id}
        gap="row"
        data-slot="message-row"
        data-role={role}
        data-kind={attribution.kind}
        className={cn("group", skin.outer(role), enterClasses)}
      >
        {selecting ? <Checkbox aria-label="Select message" checked={selected} onCheckedChange={(): void => toggleMessageSelected(message.id)} /> : null}
        <Row align="start" gap="row" data-slot="message-row-body">
          {leadingAvatar}
          <Stack gap="row" data-slot="message-content-column" className="min-w-0 flex-1">
            <Row justify="between" align="center" gap="field" data-slot="message-name-row" className={skin.chromeBacking}>
              {renderRowIdentity({ attribution, message, showTimestamp: metadataVisibility.showTimestamps })}
              {renderRowActions({
                editing,
                selecting,
                greeting,
                message,
                onChatForked,
                messageActions,
                viewerIsHost,
              })}
            </Row>
            {renderRowBubble({
              role,
              message,
              content,
              reasoning: renderRowReasoning({ editing, message, renderContext, showLLMReasoningIcon }),
              trainParagraphs,
              skin,
              decoration,
              weldedAvatar,
              attributionTokens: attribution.tokens,
              render,
              renderContext,
              speakerThemes,
              narratorVoiced,
            })}
            {editing ? null : <MessageToolCalls records={message.toolCalls} renderers={toolRenderers} />}
            {editing ? null : <MessageMetadataRow message={message} visibility={metadataVisibility} />}
            {renderRowSwipe({ editing, showSwipes, role, greeting, message })}
            {footerContributions.length === 0 ? null : (
              <Stack gap="field" data-slot="message-footer">
                {footerContributions.map((c) => (
                  <Fragment key={c.id}>{c.body({ message })}</Fragment>
                ))}
              </Stack>
            )}
          </Stack>
          {trailingAvatar}
        </Row>
      </Stack>
    </AttachmentUrlProvider>
  );
}
