// One canonical message row — the ONE surface behind every chatStyle (bubble|flat|document, §12.1):
// it looks up its skin from the exhaustive `MESSAGE_ROW_SKINS` table by the active chatStyle and paints
// through @orb/ui layout primitives (never a raw intrinsic — the compose-only keystone). Auto-memoized
// by the React Compiler (§4a — no hand-written `memo`), so the windowed list re-renders a row only when
// its props change. The streaming ghost is a SEPARATE component (ghost-message-row) — this row is
// canon-only and holds no per-token subscription.
//
// ATTRIBUTION (#21, §12.4): name/avatar/color resolve from the row's SERVER-STAMPED `characterId`
// (assistant) or `message.personaId` (user) against the roster + the per-chat macro-name PRODUCER
// threaded from the surface (`lib/attribution` — pure, unit-tested there) — NEVER parsed from body
// text. `participants` is OPTIONAL: a caller that hasn't wired the roster yet (or a solo chat with no
// roster) gets the pre-#21 no-chrome render, so this is additive, not a breaking prop.
//
// RENDER TRUST (#25, D44 §12.0 — UNTRUSTED BY DEFAULT): the row resolves its render policy via
// `resolveRowRenderPolicy` (`lib/render-trust`, pure) — `trusted` ONLY for the viewer's OWN input
// (role==="user" AND `authorUserId` === `viewerUserId`) OR a character/global that opted in (the resolved
// `ParticipantView.renderPolicy.trustHtml`); everything else — assistant/LLM, other participant, system —
// is `untrusted`. This replaced the pre-#25 hardcoded `trust="trusted"` (which rendered LLM/imported
// content as trusted — the indirect-prompt-injection hole). `viewerUserId` is the first-human-seat proxy
// (`resolveViewerUserId`) until real auth (#50). SEAM (#31): `chatStyle` flows from the surface's `useChatStyle`; the
// avatar chrome (`avatarSize`/`avatarShape`/`showInChatAvatars`) flows from `useMessageAppearance`
// (both read the synced `UserSettings.appearance` blob, D44 §12.1 — live-swappable). `showInChatAvatars`
// hides the avatar IMAGE only; the speaker NAME stays (ST "show avatars in chat" parity).
//
// MACRO DISPLAY PASS: the SAME `characterNamesById`/`personaNamesById` producer this row already
// threads for attribution ALSO builds the `MessageRenderContext` `<MessageContent>` needs to resolve
// `{{char}}`/`{{user}}` (`lib/message-render-context` — pure data-shaping, reusing this resolution
// rather than a second lookup). `rowCharacterId`/`rowPersonaId` are this row's own
// `message.characterId`/`message.personaId` — the SAME stamps `resolveRowMacros` (`@orb/kit/macro`)
// resolves against the producer, so the attribution badge and the macro subject agree by construction
// (Chat-Macro-Resolution.md §0/§6).

import { blobUrl } from "@orb/contracts/assets";
import type { MessageView, ParticipantView } from "@orb/contracts/chat";
import type { CharacterId, ChatId, PersonaId, UserId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { Avatar } from "@orb/ui/avatar";
import { Checkbox } from "@orb/ui/checkbox";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement, ReactNode } from "react";
import { cn } from "#lib";
import {
  setDraftGreeting,
  toggleMessageSelected,
  useIsEditingMessage,
  useIsMessageSelected,
  useSelectionActive,
} from "#state";
import {
  initialsForAttribution,
  resolveRowAttribution,
  speakerThemesByName,
} from "../lib/attribution";
import { resolveMessageRenderContext } from "../lib/message-render-context";
import { MESSAGE_ROW_SKINS } from "../lib/message-row-variants";
import { resolveRowRenderPolicy } from "../lib/render-trust";
import type { GreetingBinding } from "../lib/synth-greeting-row";
import { GreetingActionsRow } from "./greeting-actions-row";
import { GreetingSwipeStrip } from "./greeting-swipe-strip";
import { MessageActionsRow } from "./message-actions-row";
import { MessageContent } from "./message-content";
import { MessageEditTextarea } from "./message-edit-textarea";
import type { MessageMetadataVisibility } from "./message-metadata-row";
import { MessageMetadataRow } from "./message-metadata-row";
import { SwipeStrip } from "./swipe-strip";

export interface MessageRowProps {
  readonly message: MessageView;
  /** The active appearance — keyed off the skin table so only a painted style is accepted. */
  readonly chatStyle: keyof typeof MESSAGE_ROW_SKINS;
  /** Attribution avatar size (appearance pref, §12.1). Default `md` (the schema default). */
  readonly avatarSize?: "sm" | "md" | "lg" | undefined;
  /** Attribution avatar shape (appearance pref, §12.1). Default `round`. */
  readonly avatarShape?: "round" | "square" | undefined;
  /** Show the attribution avatar image (appearance pref, §12.1). Default `true`; false keeps the
   *  speaker name and drops only the avatar. */
  readonly showInChatAvatars?: boolean | undefined;
  /** The surface passes true ONLY for the tail assistant message (the swipe-eligible row). */
  readonly showSwipes?: boolean;
  /** The character roster, keyed by id — threaded from the surface (assistant-row avatar/color chrome
   *  + the solo/multi-character count; multi-character rooms only). */
  readonly participants?: ReadonlyMap<CharacterId, ParticipantView> | undefined;
  /** The per-chat macro-name producer (Chat-Macro-Resolution.md §1) — the ONE source for BOTH the
   *  attribution badge's name and the row's `{{char}}`/`{{user}}` macro subject. */
  readonly characterNamesById: ReadonlyMap<CharacterId, RowCharacterName>;
  readonly personaNamesById: ReadonlyMap<PersonaId, RowPersonaName>;
  /** The persona AVATAR-chrome producer (`lib/attribution` — separate from `personaNamesById`, §1
   *  names-only) — the USER-row avatar image source. */
  readonly personaAvatarsById?: ReadonlyMap<PersonaId, string | null> | undefined;
  /** The viewing participant's currently active persona id — the fallback subject for legacy USER rows
   *  with a null `personaId` (§4; never the chat's `anchorPersonaId` pin). */
  readonly activePersonaId?: PersonaId | null | undefined;
  /** The VIEWING principal's user id (D44 §12.0 render-trust — the "own input" comparand). Threaded from
   *  the surface (`resolveViewerUserId`, the first-human-seat proxy until #50). Absent/null ⇒ no row can be
   *  "own input", so everything stays untrusted (the fail-closed safe floor). */
  readonly viewerUserId?: UserId | null | undefined;
  /** Navigate to a forked chat (threaded to the row's Fork action) — the route maps it to `selectChat`. */
  readonly onChatForked?: ((chatId: ChatId) => void) | undefined;
  /** DRAFT greeting binding (decision #2 — handler-level, NOT a visual "mode"): when present this row is
   *  a pre-commit greeting, so Edit routes to `setDraftGreeting`, Swipe steps over the card's `greetings[]`,
   *  and Fork/Delete/Hide are suppressed (no server row). The BODY + attribution render identically to a
   *  committed row — only the action seam differs. Absent ⇒ a normal committed row. */
  readonly greeting?: GreetingBinding | undefined;
  /** ST `auto_fix_generated_markdown` parity (the appearance pref, threaded from the surface) — flows into
   *  the render context so the display pipeline's `fixMarkdown` auto-fix is gated (default OFF: a settled
   *  body renders as-authored, so a censoring `f*ck` isn't auto-closed into a stray italic run). */
  readonly autoFixMarkdown?: boolean | undefined;
  /** The per-message metadata-chip visibility (WS3, D44 §12.1) — each field its own toggle. Undefined ⇒
   *  every chip hidden (a caller that hasn't wired appearance yet keeps today's chip-less render). */
  readonly metadataVisibility?: MessageMetadataVisibility | undefined;
  /** The `messageActions` appearance pref (D44 §12.1) — threaded to the action row (committed or
   *  draft-greeting). Undefined ⇒ `"hover"` (the schema default, today's behavior). */
  readonly messageActions?: "expanded" | "hover" | undefined;
}

const NO_METADATA_VISIBLE: MessageMetadataVisibility = {
  showTimestamps: false,
  showMessageId: false,
  showModelIcon: false,
  showTokenCount: false,
};

/** The omit-don't-pass-undefined `<Avatar src>` idiom (`exactOptionalPropertyTypes`), split out to keep
 *  the row's render below the cognitive-complexity ceiling. */
function avatarSrcProp(avatarHash: string | null): { src?: string } {
  return avatarHash === null ? {} : { src: blobUrl(avatarHash) };
}

/** Render one canonical message (slot ⋈ selected variant) in the active chatStyle. */
export function MessageRow({
  message,
  chatStyle,
  avatarSize = "md",
  avatarShape = "round",
  showInChatAvatars = true,
  showSwipes = false,
  participants,
  characterNamesById,
  personaNamesById,
  personaAvatarsById,
  activePersonaId,
  viewerUserId,
  onChatForked,
  greeting,
  autoFixMarkdown,
  metadataVisibility = NO_METADATA_VISIBLE,
  messageActions,
}: MessageRowProps): ReactElement {
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
  // D44 §12.0 — the RESOLVED render policy (untrusted by default). This is THE per-message trust decision:
  // own-user input OR an opted-in character → trusted; else untrusted. Replaces the pre-#25 `trust="trusted"`.
  const render = resolveRowRenderPolicy({
    role,
    authorUserId: message.authorUserId,
    characterId: message.characterId,
    viewerUserId: viewerUserId ?? null,
    participants,
  });
  // Edit-in-place (PD-119): the mode flag lives in the EXTERNAL draft store, keyed by message id — a
  // component-local `useState` here would silently drop mid-edit when the windowed message-list
  // unmounts this row on scroll. While editing, the textarea REPLACES the read-only body; the
  // attribution chrome + swipe strip stay put (only the content slot swaps).
  const editing = useIsEditingMessage(message.id);
  // Bulk-select mode (J6): while active, each row shows a leading checkbox and hides its per-row action
  // cluster — the selection bar (pinned above the composer) owns the destructive action.
  const selecting = useSelectionActive();
  const selected = useIsMessageSelected(message.id);
  const renderContext = resolveMessageRenderContext({
    participants,
    characterNamesById,
    personaNamesById,
    viewerActivePersonaId: activePersonaId,
    autoFixMarkdown,
  });
  const content = editing ? (
    <MessageEditTextarea
      message={message}
      onSave={
        greeting === undefined
          ? undefined
          : (text): void => setDraftGreeting(greeting.draftKey, greeting.characterId, text)
      }
    />
  ) : (
    <MessageContent
      content={message.content}
      render={render}
      renderContext={renderContext}
      rowCharacterId={message.characterId}
      rowPersonaId={message.personaId}
      speakerThemes={speakerThemesByName(participants)}
    />
  );

  return (
    // `group` is the hover/focus hook UIP-305's message-actions-row reveals off (group-hover /
    // group-focus-within) — the actions cluster is opacity-0 at rest until this row is hovered/focused.
    <Stack
      // `article` makes each message a countable/navigable unit (AT + Playwright `getByRole("article")`
      // + agent nav); `data-message-id` is the stable per-message targeting handle (tests/automation
      // address a specific message without scraping text). `aria-label` names the article by its speaker
      // when the attribution shows one (grouped consecutive messages omit it — they inherit visually).
      role="article"
      aria-label={attribution.name ?? undefined}
      data-message-id={message.id}
      gap="row"
      data-slot="message-row"
      data-role={role}
      className={cn("group", skin.outer(role))}
    >
      {selecting ? (
        <Checkbox
          aria-label="Select message"
          checked={selected}
          onCheckedChange={(): void => toggleMessageSelected(message.id)}
        />
      ) : null}
      {attribution.name === null ? null : (
        <Row gap="field" align="center" data-slot="message-attribution">
          {showInChatAvatars ? (
            <Avatar
              size={avatarSize}
              shape={avatarShape}
              fallbackDelay={0}
              {...avatarSrcProp(attribution.avatarHash)}
            >
              {initialsForAttribution(attribution.name)}
            </Avatar>
          ) : null}
          {/* UIP-304 speaker-name accent: a CHARACTER name (tokens present) is tinted with the per-speaker
              ThemeScope color (`--color-speaker` → `text-speaker`) so speakers are scannable; a USER/"You"
              row (tokens null) stays muted. `display: contents` on the scope div keeps the vars inheriting
              with zero layout box. */}
          {attribution.tokens === null ? (
            <Text as="span" size="label" weight="medium" tone="muted">
              {attribution.name}
            </Text>
          ) : (
            <ThemeScope tokens={attribution.tokens} className="contents">
              <Text as="span" size="label" weight="medium" className="text-speaker">
                {attribution.name}
              </Text>
            </ThemeScope>
          )}
        </Row>
      )}
      <Stack
        gap="row"
        data-slot="message-bubble"
        // Hide-from-AI dims the row (still user-visible, per §12.4 — the toggle holds it out of
        // assembly, it does not hide it from the reader) — the standard Tailwind opacity utility
        // (the same `opacity-50` scale every disabled-state variant in @orb/ui already uses), never a
        // raw inline-style value.
        className={cn(skin.inner(role), message.excludedFromPrompt && "opacity-50")}
      >
        {attribution.tokens === null ? (
          content
        ) : (
          <ThemeScope tokens={attribution.tokens}>{content}</ThemeScope>
        )}
      </Stack>
      {editing ? null : <MessageMetadataRow message={message} visibility={metadataVisibility} />}
      {renderRowActions({ editing, selecting, greeting, message, onChatForked, messageActions })}
      {renderRowSwipe({ editing, showSwipes, role, greeting, message })}
    </Stack>
  );
}

/** The per-row ACTION cluster (module-scope so its branches don't load the row's complexity budget):
 *  suppressed in edit/select mode; the draft-greeting subset for a greeting row; else the committed set. */
function renderRowActions(args: {
  readonly editing: boolean;
  readonly selecting: boolean;
  readonly greeting: GreetingBinding | undefined;
  readonly message: MessageView;
  readonly onChatForked: ((chatId: ChatId) => void) | undefined;
  readonly messageActions: "expanded" | "hover" | undefined;
}): ReactNode {
  if (args.editing || args.selecting) {
    return null;
  }
  if (args.greeting !== undefined) {
    return <GreetingActionsRow message={args.message} messageActions={args.messageActions} />;
  }
  return (
    <MessageActionsRow
      message={args.message}
      onChatForked={args.onChatForked}
      messageActions={args.messageActions}
    />
  );
}

/** The per-row SWIPE strip (module-scope, see `renderRowActions`): a draft greeting steps over the card's
 *  `greetings[]` (≥2 alternates only); a committed row shows the variant swipe on the tail assistant row. */
function renderRowSwipe(args: {
  readonly editing: boolean;
  readonly showSwipes: boolean;
  readonly role: MessageView["role"];
  readonly greeting: GreetingBinding | undefined;
  readonly message: MessageView;
}): ReactNode {
  if (args.editing) {
    return null;
  }
  if (args.greeting !== undefined) {
    return args.greeting.variants.length > 1 ? (
      <GreetingSwipeStrip
        draftKey={args.greeting.draftKey}
        characterId={args.greeting.characterId}
        variants={args.greeting.variants}
        current={args.message.content}
      />
    ) : null;
  }
  return args.showSwipes && args.role === "assistant" ? (
    <SwipeStrip message={args.message} />
  ) : null;
}
