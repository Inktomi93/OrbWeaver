// One canonical message row behind every chatStyle — looks up its skin from `MESSAGE_ROW_SKINS` and
// never branches on chatStyle itself. The streaming ghost is a separate component (ghost-message-row);
// this row is canon-only and holds no per-token subscription. Render trust (untrusted by default):
// `resolveRowRenderPolicy` trusts ONLY the viewer's own input or an opted-in character — never
// assistant/LLM/imported content by default (the indirect-prompt-injection boundary).

import type { MessageView, ParticipantView } from "@orb/contracts/chat";
import type { CharacterId, ChatId, PersonaId, UserId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { Checkbox } from "@orb/ui/checkbox";
import { Row, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { Fragment } from "react";
import type { ChatMessageSurfaceState, ChatSurfaceContribution, ContributorRegistry } from "#lib";
import { cn } from "#lib";
import {
  toggleMessageSelected,
  useIsEditingMessage,
  useIsMessageSelected,
  useSelectionActive,
} from "#state";
import { AttachmentUrlProvider } from "../hooks/attachment-url-provider";
import { useEnterMotion } from "../hooks/use-enter-motion";
import { resolveRowAttribution, speakerThemesByName } from "../lib/attribution";
import { resolveMessageRenderContext } from "../lib/message-render-context";
import { MESSAGE_ROW_SKINS } from "../lib/message-row-variants";
import { resolveRowRenderPolicy } from "../lib/render-trust";
import { splitIntoTrainParagraphs } from "../lib/split-paragraphs";
import type { GreetingBinding } from "../lib/synth-greeting-row";
import type { MessageMetadataVisibility } from "./message-metadata-row";
import { MessageMetadataRow } from "./message-metadata-row";
import {
  renderAttributionName,
  renderContextBoundaryDivider,
  renderRowActions,
  renderRowAvatar,
  renderRowBubble,
  renderRowSwipe,
  resolveRowContent,
} from "./message-row-parts";

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
  readonly activePersonaId?: PersonaId | null | undefined;
  /** The chat's anchor persona id — the null-stamp `{{user}}`/`{{persona}}` macro fallback (distinct
   *  from `activePersonaId`, the badge fallback). */
  readonly anchorPersonaId?: PersonaId | null | undefined;
  /** The viewing principal's user id (render-trust "own input" comparand). Absent/null ⇒ everything
   *  stays untrusted (fail-closed). */
  readonly viewerUserId?: UserId | null | undefined;
  readonly onChatForked?: ((chatId: ChatId) => void) | undefined;
  /** Present ⇒ this row is a pre-commit draft greeting: Edit/Swipe route to the greeting card, and
   *  Fork/Delete/Hide are suppressed (no server row). Body/attribution render identically to committed. */
  readonly greeting?: GreetingBinding | undefined;
  readonly autoFixMarkdown?: boolean | undefined;
  /** Undefined ⇒ every metadata chip hidden. */
  readonly metadataVisibility?: MessageMetadataVisibility | undefined;
  readonly messageActions?: "expanded" | "hover" | undefined;
  /** True for the one row that is the "last-in-context" boundary; renders a quiet divider above it. */
  readonly contextBoundary?: boolean;
  /** True only when this mount is a genuinely-new arrival, never "the row mounted" (a windowed row
   *  remounts on scrollback). Latched at mount by `useEnterMotion`. */
  readonly enterMotion?: boolean;
  /** The §6c/M8 message-footer seam — omitted for a pre-commit draft-greeting row (no server row to
   *  attach a footer to); the committed transcript always supplies it. */
  readonly surfaceContributors?: ContributorRegistry<ChatSurfaceContribution> | undefined;
}

/** Resolves the `when`-filtered `message-footer` contributions for one row (§6c/M8) — a bare helper
 *  (not inlined) so the component body stays under the cognitive-complexity ceiling. */
function resolveMessageFooter(
  registry: ContributorRegistry<ChatSurfaceContribution> | undefined,
  message: MessageView,
): readonly Extract<ChatSurfaceContribution, { anchor: "message-footer" }>[] {
  const state: ChatMessageSurfaceState = { message };
  return (registry?.list() ?? []).filter(
    (c): c is Extract<ChatSurfaceContribution, { anchor: "message-footer" }> =>
      c.anchor === "message-footer" && (c.when?.(state) ?? true),
  );
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
  activePersonaId,
  anchorPersonaId,
  viewerUserId,
  onChatForked,
  greeting,
  autoFixMarkdown,
  metadataVisibility = NO_METADATA_VISIBLE,
  messageActions,
  contextBoundary = false,
  enterMotion = false,
  surfaceContributors,
}: MessageRowProps): ReactElement {
  const enterClasses = useEnterMotion(enterMotion);
  const skin = MESSAGE_ROW_SKINS[chatStyle];
  const role = message.role;
  const attribution = resolveRowAttribution({
    role,
    characterId: message.characterId,
    personaId: message.personaId,
    participants,
    characterNamesById,
    personaNamesById,
    personaAvatarsById,
    activePersonaId,
  });
  const render = resolveRowRenderPolicy({
    role,
    authorUserId: message.authorUserId,
    characterId: message.characterId,
    viewerUserId: viewerUserId ?? null,
    participants,
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
  });
  const trainParagraphs =
    !editing && skin.bubbleLayout === "trains" ? splitIntoTrainParagraphs(message.content) : null;
  const speakerThemes = speakerThemesByName(participants);
  const content = resolveRowContent({
    editing,
    message,
    greeting,
    trainParagraphs,
    render,
    renderContext,
    speakerThemes,
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
      {renderContextBoundaryDivider(contextBoundary)}
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
        {selecting ? (
          <Checkbox
            aria-label="Select message"
            checked={selected}
            onCheckedChange={(): void => toggleMessageSelected(message.id)}
          />
        ) : null}
        <Row align="start" gap="row" data-slot="message-row-body">
          {leadingAvatar}
          <Stack gap="row" data-slot="message-content-column" className="min-w-0 flex-1">
            <Row
              justify="between"
              align="center"
              gap="field"
              data-slot="message-name-row"
              className={skin.chromeBacking}
            >
              {attribution.name === null ? null : (
                <Row gap="field" align="baseline" data-slot="message-attribution">
                  {renderAttributionName(attribution)}
                </Row>
              )}
              {renderRowActions({
                editing,
                selecting,
                greeting,
                message,
                onChatForked,
                messageActions,
              })}
            </Row>
            {renderRowBubble({
              role,
              message,
              content,
              trainParagraphs,
              skin,
              decoration,
              weldedAvatar,
              attributionTokens: attribution.tokens,
              render,
              renderContext,
              speakerThemes,
            })}
            {editing ? null : (
              <MessageMetadataRow message={message} visibility={metadataVisibility} />
            )}
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
