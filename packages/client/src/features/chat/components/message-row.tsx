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
// roster) gets the pre-#21 no-chrome render, so this is additive, not a breaking prop. Trust is
// `trusted` (own AI output / own input) — other-participant `untrusted` routing lands with the
// multi-human wave (§11.6). SEAM (#31): `chatStyle` flows from the surface's `useChatStyle`; the
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

import type { MessageView, ParticipantView } from "@orb/contracts/chat";
import type { CharacterId, ChatId, PersonaId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { Avatar } from "@orb/ui/avatar";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement } from "react";
import { cn } from "#lib";
import { useIsEditingMessage } from "#state";
import { initialsForAttribution, resolveRowAttribution } from "../lib/attribution";
import { resolveMessageRenderContext } from "../lib/message-render-context";
import { MESSAGE_ROW_SKINS } from "../lib/message-row-variants";
import { MessageActionsRow } from "./message-actions-row";
import { MessageContent } from "./message-content";
import { MessageEditTextarea } from "./message-edit-textarea";
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
  /** The viewing participant's currently active persona id — the fallback subject for legacy USER rows
   *  with a null `personaId` (§4; never the chat's `anchorPersonaId` pin). */
  readonly activePersonaId?: PersonaId | null | undefined;
  /** Navigate to a forked chat (threaded to the row's Fork action) — the route maps it to `selectChat`. */
  readonly onChatForked?: ((chatId: ChatId) => void) | undefined;
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
  activePersonaId,
  onChatForked,
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
    activePersonaId,
  });
  // Edit-in-place (PD-119): the mode flag lives in the EXTERNAL draft store, keyed by message id — a
  // component-local `useState` here would silently drop mid-edit when the windowed message-list
  // unmounts this row on scroll. While editing, the textarea REPLACES the read-only body; the
  // attribution chrome + swipe strip stay put (only the content slot swaps).
  const editing = useIsEditingMessage(message.id);
  const renderContext = resolveMessageRenderContext({
    participants,
    characterNamesById,
    personaNamesById,
    viewerActivePersonaId: activePersonaId,
  });
  const content = editing ? (
    <MessageEditTextarea message={message} />
  ) : (
    <MessageContent
      content={message.content}
      trust="trusted"
      renderContext={renderContext}
      rowCharacterId={message.characterId}
      rowPersonaId={message.personaId}
    />
  );

  return (
    <Stack gap="row" data-slot="message-row" data-role={role} className={skin.outer(role)}>
      {attribution.name === null ? null : (
        <Row gap="field" align="center" data-slot="message-attribution">
          {showInChatAvatars ? (
            <Avatar size={avatarSize} shape={avatarShape} fallbackDelay={0}>
              {initialsForAttribution(attribution.name)}
            </Avatar>
          ) : null}
          <Text as="span" size="label" weight="medium" tone="muted">
            {attribution.name}
          </Text>
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
      {editing ? null : <MessageActionsRow message={message} onChatForked={onChatForked} />}
      {showSwipes && role === "assistant" && !editing ? <SwipeStrip message={message} /> : null}
    </Stack>
  );
}
