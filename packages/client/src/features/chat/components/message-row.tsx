// One canonical message row behind every chatStyle — looks up its skin from `MESSAGE_ROW_SKINS` and
// never branches on chatStyle itself. The streaming ghost is a separate component (ghost-message-row);
// this row is canon-only and holds no per-token subscription. Render trust (untrusted by default):
// `resolveRowRenderPolicy` trusts ONLY the viewer's own input or an opted-in character — never
// assistant/LLM/imported content by default (the indirect-prompt-injection boundary).

import type { MessageView, ParticipantView } from "@orb/contracts/chat";
import { isNarratorVoiced } from "@orb/contracts/chat";
import type { RegexScriptRow } from "@orb/contracts/regex";
import type { CharacterId, ChatId, PersonaId, UserId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { Checkbox } from "@orb/ui/checkbox";
import { Row, Stack } from "@orb/ui/layout";
import type { CSSProperties, ReactElement } from "react";
import { Fragment, useEffect } from "react";
import type { ChatMessageSurfaceState, ChatSurfaceContribution, ContributorRegistry, ToolRenderer } from "#lib";
import { cn, resolveRowRenderPolicy } from "#lib";
import { toggleMessageSelected, useIsEditingMessage, useIsMessageSelected, useMessageEditReservedInlineSize, useSelectionActive } from "#state";
import { appearanceMessageRegistryEnabled, registerAppearanceMessageSnapshot } from "../../../lib/appearance-message-registry.ts";
import { AttachmentUrlProvider } from "../hooks/attachment-url-provider.tsx";
import { useEnterMotion } from "../hooks/use-enter-motion.ts";
import { resolveRowAttribution, speakerThemesByName } from "../lib/attribution.ts";
import type { GreetingBinding } from "../lib/greeting-window.ts";
import { resolveMessageRenderContext } from "../lib/message-render-context.ts";
import { BG_PHOTO_CHROME_PLATE } from "../lib/message-row-backing.ts";
import { columnClassFor, gutterRailFor, MESSAGE_ROW_SKINS, rowBodyClassFor } from "../lib/message-row-variants.ts";
import { splitIntoTrainParagraphs } from "../lib/split-paragraphs.ts";
import type { MessageMetadataVisibility } from "./message-metadata-row.tsx";
import { MessageMetadataRow } from "./message-metadata-row.tsx";
import { renderContextBoundaryDivider } from "./message-row-divider.tsx";
import { placeRowHeader, renderRowActions, renderRowNameRow } from "./message-row-header.tsx";
import { renderRowAvatar, renderRowBubble, renderRowReasoning, renderRowSwipe, resolveRowContent } from "./message-row-parts.tsx";
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
  /** #113 — the virtualizer MEASURED this row as taller than the scrollport, so the reader can be deep
   *  inside the turn with the speaker's name scrolled off. Pins the name row to the top of the scrollport
   *  and gives it a backing chip. Absent/false ⇒ byte-identical to before (no sticky, no chip). */
  readonly stickyAttribution?: boolean | undefined;
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
  /** Present ⇒ this row is a SEEDED GREETING still inside its malleability window: the swipe slot pages the
   *  card's alternates through `chat.setSeededGreeting` instead of the row's own generated variants
   *  (chat-creation-draft-mode-replacement.md §4.8/F6). Absent ⇒ the ordinary variant strip. */
  readonly greeting?: GreetingBinding | undefined;
  readonly autoFixMarkdown?: boolean | undefined;
  /** D121-E/F1: the VIEWER's own enabled DISPLAY-placement scripts, resolved ONCE by the list surface
   *  (never per row — one query, N rows). Absent ⇒ the display leg is a no-op, exactly as before. */
  readonly displayScripts?: readonly RegexScriptRow[] | undefined;
  /** The `appearance.colorQuotedSpeech` pref, folded into this row's render policy. Absent ⇒ ON. */
  readonly colorQuotedSpeech?: boolean | undefined;
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
  /** The §6c/M8 message-footer seam; absent ⇒ no footer. */
  readonly surfaceContributors?: ContributorRegistry<ChatSurfaceContribution> | undefined;
  /** The §6c per-tool-name renderer registry; absent ⇒ every record renders through the generic
   *  `ToolCallBlock`. */
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

/** THE MODEL CREDIT RIDES THE ACTION CLUSTER NOW (#167, owner ruling 2026-08-18), not the metadata row: it
 *  is an attribution ABOUT the reply, and at rest the transcript owes the reader prose — a raw weights path
 *  sat under every message as the loudest low-contrast thing on an art background. Same gate as before
 *  (`showModelIcon`, the "Show model" appearance toggle, default off); a row with no model (a
 *  greeting/draft) credits nothing. A bare helper, not inlined, so the row body stays under the
 *  cognitive-complexity ceiling. */
function resolveModelCredit(message: MessageView, visibility: MessageMetadataVisibility): string | null {
  return visibility.showModelIcon ? message.model : null;
}

/** #245 — the content column's style: the skin's own width override (echo's art pane) plus, while this row
 *  is being EDITED, the read-mode width the Edit action measured. A bare helper, not inlined, so the row
 *  body stays under the cognitive-complexity ceiling. */
function resolveColumnStyle(skinStyle: CSSProperties | undefined, reservedInlineSize: number | null): CSSProperties | undefined {
  return reservedInlineSize === null ? skinStyle : { ...skinStyle, minInlineSize: reservedInlineSize };
}

const NO_METADATA_VISIBLE: MessageMetadataVisibility = {
  showTimestamps: false,
  showMessageId: false,
  showModelIcon: false,
  showTokenCount: false,
  showGenerationTimer: false,
  showGenerationCost: false,
};

/** THE ROW HAS EXACTLY ONE AVATAR SLOT: the identity GUTTER, a SIBLING of the content column (§B.1 — a law
 *  with its own pins, not this file's to reverse), placed leading for a non-user row and trailing for a user
 *  one. This docblock used to describe a second, narrow `inline` slot in the name row and a `@container`
 *  query that CHOSE between them; no such slot and no such gate exist (`inlineAvatar` has zero definitions
 *  on the tree — it survived only as this comment's own dangling self-reference), and reading it as live
 *  anatomy is what makes "the reading column is inset on the left" look like a leak.
 *
 *  WHAT THE `@container` QUERY ACTUALLY DOES IS SCALE THE SLOT, NEVER HIDE IT (the `@max-md:` pair on the
 *  row body below): at a phone-width column the chip steps DOWN from `avatar-md` 32px to `size-6` 24px and
 *  the gap from `row` 8px to `field` 6px, so the gutter the content column is offset by is 40px at a desktop
 *  and 30px at a phone one. Both numbers are RATIFIED, not incidental: `dimension.shell-content-floor`'s
 *  derivation (tokens.json, #1204) spends "a 32px `md` avatar chip + its 8px gap" as a term, so removing or
 *  centring the gutter would invalidate the chat-width dial's own floor.
 *
 *  THE SLOT'S ABSENT ARM COSTS NOTHING, by construction: `renderRowAvatar` returns null when
 *  `showInChatAvatars` is off or the row resolved no name, and a null child is no flex item — `gap` applies
 *  only BETWEEN adjacent items, so there is no phantom inset to remove on that arm. */
export function MessageRow({
  message,
  chatStyle,
  avatarSize = "md",
  avatarShape = "round",
  avatarAspect = "square",
  avatarRing = "none",
  showInChatAvatars = true,
  showSwipes = false,
  stickyAttribution = false,
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
  useEffect(() => {
    if (!appearanceMessageRegistryEnabled()) {
      return;
    }
    return registerAppearanceMessageSnapshot(message.id, {
      avatarAspect,
      avatarRing,
      avatarShape,
      avatarSize,
      autoFixMarkdown: autoFixMarkdown ?? false,
      chatStyle,
      colorQuotedSpeech: colorQuotedSpeech ?? true,
      messageActions: messageActions ?? "hover",
      metadataVisibility,
      showInChatAvatars,
      showLLMReasoningIcon,
    });
  }, [
    avatarAspect,
    avatarRing,
    avatarShape,
    avatarSize,
    autoFixMarkdown,
    chatStyle,
    colorQuotedSpeech,
    message.id,
    messageActions,
    metadataVisibility,
    showInChatAvatars,
    showLLMReasoningIcon,
  ]);
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
    // The row's DECLARED purpose (D129) — never the room's current output dial.
    kind: message.kind,
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
  // #245 — the footprint the Edit action measured off the read-mode bubble. Read from the same external
  // store as the mode flag so a row windowed out and back mid-edit re-renders at the SAME width.
  const reservedInlineSize = useMessageEditReservedInlineSize(message.id);
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
  const narratorVoiced = isNarratorVoiced(message.kind);
  // The narrator row's outer name is UNCONDITIONAL, like every other row's. Suppressing it once the body
  // resolved speaker spans was considered and REVERSED (owner, 2026-08-03): the narrator narrates — the
  // unattributed prose between the character spans is its OWN voice, and the row label is that voice's
  // attribution, not a redundant repeat of the in-block labels. Do not re-propose it as an improvement.
  const content = resolveRowContent({
    editing,
    message,
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
      showInChatAvatars,
    }) ?? null;
  // #1728 arm B. `Grid` and `Row` are both `div`s taking `className`/`gap`/`data-*` and each ignores the
  // other's variant prop, so ONE element spelling serves both arms and the body's markup is not written
  // twice; the two placement facts are single-homed beside the skin table that decides them.
  const gutterRail = gutterRailFor(skin, role);
  const columnClass = columnClassFor(skin);
  const avatarNode = renderRowAvatar({
    attribution,
    avatarTreatment,
    role,
    showInChatAvatars,
    avatarSize,
    avatarShape,
    avatarAspect,
    avatarRing,
    alignToInsideHeader: skin.headerPlacement === "inside",
    gutterRail,
  });
  const weldedAvatar = avatarTreatment === "sticky-portrait" ? avatarNode : null;
  const leadingAvatar = weldedAvatar !== null || role === "user" ? null : avatarNode;
  const trailingAvatar = weldedAvatar !== null || role !== "user" ? null : avatarNode;
  // THE GUTTER COSTS LESS ON A PHONE (side-eye leg-4 P2 — "stop treating a phone as a narrow desktop").
  // Measured beside the bubble at 320px: the avatar column took 76px, one paragraph ran 22 CHARACTERS over
  // 12 lines, and the speaker name wrapped to two lines in an 88px box. This row is its own `@container`
  // now, so at a phone-width column the portrait steps down and the gap tightens — the reading measure
  // gets the difference back, and the row's ANATOMY is untouched (§B.1: the avatar is a SIBLING of the
  // content column, never a descendant of the name row — a law with its own pins, not mine to reverse).
  // ⚑ The review asked for the gutter to FOLD INTO the name row, which §B.1 forbids; the fork is reported
  // rather than taken, with this as the anatomy-preserving half.

  // §6c/M8 message-footer: absent for a pre-commit draft-greeting row (no `surfaceContributors` passed).
  const footerContributions = resolveMessageFooter(surfaceContributors, message);
  const modelCredit = resolveModelCredit(message, metadataVisibility);
  // #288 — THE HEADER IS BUILT ONCE AND PLACED ONCE. `inside` (seven of the eight skins) hands it to the
  // bubble, which renders it as the container's own header row; `outside` (tide, whose train of pills has
  // no single container to be inside) keeps the pre-#288 sibling above the box. Splitting the node from
  // its placement is what makes "one header" structural rather than a convention two branches must agree
  // on — see `HeaderPlacement` in message-row-variants.ts for the two-plate defect it closes.
  const header = placeRowHeader(
    renderRowNameRow({
      attribution,
      message,
      role,
      showTimestamp: metadataVisibility.showTimestamps,
      stickyAttribution,
      placement: skin.headerPlacement,
      // B7 — the picker's segment-target parse keys the SAME character-name set the span renderer uses
      // (`speakerThemesByName`'s keys); the actions row narrator-gates it against `message.kind` itself.
      actions: renderRowActions({
        editing,
        selecting,
        message,
        onChatForked,
        messageActions,
        viewerIsHost,
        modelCredit,
        characterNames: [...speakerThemes.keys()],
      }),
    }),
    skin.headerPlacement,
  );

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
        className={cn("group @container", skin.outer(role), enterClasses)}
      >
        {selecting ? <Checkbox aria-label="Select message" checked={selected} onCheckedChange={(): void => toggleMessageSelected(message.id)} /> : null}
        {/* #1728 arm B — flex for `anchored`, a three-rail GRID for `gutterCentred`, whose rails centre the
            READING COLUMN on its own: with the chip inside the centred unit the prose measured 285px from a
            1280px row's left and 245px from its right, and snapped to 265/265 the moment avatars were
            toggled off — a 20px slide caused by an unrelated setting. Below `@4xl` the grid arm resolves to
            the same in-flow two-track gutter: arm B applies where a margin exists, and where the track IS
            the viewport it cannot, which is a fact of the ruling's input rather than a deviation from it.
            The avatar stays a SIBLING of the column in both arms — §B.1 intact, placement only. */}
        <Row
          align="start"
          className={cn(rowBodyClassFor(skin), "@max-md:gap-field @max-md:*:data-[slot=avatar-root]:size-6")}
          gap="row"
          data-slot="message-row-body"
        >
          {leadingAvatar}
          {/* #245 — THE ROW HOLDS ITS OWN BOX OPEN WHILE IT IS EDITED. The column is content-sized (the
              row body shrink-wraps inside the track), and its max-content is usually the NAME ROW — whose
              action cluster is suppressed while editing, deliberately (the editor carries its own
              Save/Cancel). Measured on the shared-track stage: a two-word reply's column went 221px → 114px
              the instant the reader clicked Edit, and in `flat` it slid 42px sideways as well. The
              suppression is kept; what it vacates is reserved. `minInlineSize` (not a fixed size) so a
              longer draft can still grow the box out to the column's own cap. */}
          <Stack gap="row" data-slot="message-content-column" className={columnClass} style={resolveColumnStyle(skin.columnStyle, reservedInlineSize)}>
            {header.above}
            {renderRowBubble({
              role,
              message,
              header: header.inside,
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
              editing,
            })}
            {editing ? null : <MessageToolCalls records={message.toolCalls} renderers={toolRenderers} />}
            {/* #106 — the two chrome bands BELOW the bubble. Unlike the name row they are outside any
                bubble fill in EVERY mode, so their scrim is mode-independent (the skin's `chromeBacking`
                is not consulted here). Both self-gate on `data-has-bg-image`: no wallpaper, no chip. */}
            {editing ? null : <MessageMetadataRow message={message} visibility={metadataVisibility} backingClass={BG_PHOTO_CHROME_PLATE} />}
            {renderRowSwipe({ editing, showSwipes, role, greeting, message })}
            {/* `empty:hidden` on the footer is LOAD-BEARING, caught on a live drive: a contribution can be
                REGISTERED and still render nothing (TurnToolCallsDisclosure returns null for a turn with no
                records), so `footerContributions.length > 0` does not mean anything paints. Before the
                scrim that left an invisible empty box; with it, every ordinary reply grew a full-width
                chrome bar under the bubble. No CT saw it — a rendered drive did. */}
            {footerContributions.length === 0 ? null : (
              <Stack gap="field" data-slot="message-footer" className={cn("empty:hidden", BG_PHOTO_CHROME_PLATE)}>
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
