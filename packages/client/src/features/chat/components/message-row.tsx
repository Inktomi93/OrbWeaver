// One canonical message row — the ONE surface behind every chatStyle (bubble|flat|document, §12.1):
// it looks up its skin from the exhaustive `MESSAGE_ROW_SKINS` table by the active chatStyle and paints
// through @orb/ui layout primitives (never a raw intrinsic — the compose-only keystone). Auto-memoized
// by the React Compiler (§4a — no hand-written `memo`), so the windowed list re-renders a row only when
// its props change. The streaming ghost is a SEPARATE component (ghost-message-row) — this row is
// canon-only and holds no per-token subscription.
//
// ATTRIBUTION (#21, §12.4): name/avatar/color resolve from the row's SERVER-STAMPED `characterId`
// (assistant) or `message.personaId` (user) against the roster/persona maps threaded from the surface
// (`lib/attribution` — pure, unit-tested there) — NEVER parsed from body text. `participants`/
// `personas` are OPTIONAL: a caller that hasn't wired the roster yet (or a solo chat with no roster)
// gets the pre-#21 no-chrome render, so this is additive, not a breaking prop. Trust is `trusted` (own
// AI output / own input) — other-participant `untrusted` routing lands with the multi-human wave
// (§11.6). SEAM (#31): `chatStyle` flows from the surface's `useChatStyle`.

import type { MessageView, ParticipantView } from "@orb/contracts/chat";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { Avatar } from "@orb/ui/avatar";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement } from "react";
import type { PersonaAttribution } from "../lib/attribution";
import { initialsForAttribution, resolveRowAttribution } from "../lib/attribution";
import { MESSAGE_ROW_SKINS } from "../lib/message-row-variants";
import { MessageContent } from "./message-content";
import { SwipeStrip } from "./swipe-strip";

export interface MessageRowProps {
  readonly message: MessageView;
  /** The active appearance — keyed off the skin table so only a painted style is accepted. */
  readonly chatStyle: keyof typeof MESSAGE_ROW_SKINS;
  /** The surface passes true ONLY for the tail assistant message (the swipe-eligible row). */
  readonly showSwipes?: boolean;
  /** The character roster, keyed by id — threaded from the surface (multi-character rooms only). */
  readonly participants?: ReadonlyMap<CharacterId, ParticipantView> | undefined;
  /** The persona library, keyed by id — resolves a USER row's historical author. */
  readonly personas?: ReadonlyMap<PersonaId, PersonaAttribution> | undefined;
  /** The chat's currently active persona — the fallback for legacy USER rows with a null `personaId`. */
  readonly activePersonaId?: PersonaId | null | undefined;
}

/** Render one canonical message (slot ⋈ selected variant) in the active chatStyle. */
export function MessageRow({
  message,
  chatStyle,
  showSwipes = false,
  participants,
  personas,
  activePersonaId,
}: MessageRowProps): ReactElement {
  const skin = MESSAGE_ROW_SKINS[chatStyle];
  const role = message.role;
  const attribution = resolveRowAttribution({
    role,
    characterId: message.characterId,
    personaId: message.personaId,
    participants,
    personas,
    activePersonaId,
  });
  const content = <MessageContent content={message.content} trust="trusted" />;

  return (
    <Stack gap="row" data-slot="message-row" data-role={role} className={skin.outer(role)}>
      {attribution.name === null ? null : (
        <Row gap="field" align="center" data-slot="message-attribution">
          <Avatar size="sm" fallbackDelay={0}>
            {initialsForAttribution(attribution.name)}
          </Avatar>
          <Text as="span" size="label" weight="medium" tone="muted">
            {attribution.name}
          </Text>
        </Row>
      )}
      <Stack gap="row" data-slot="message-bubble" className={skin.inner(role)}>
        {attribution.tokens === null ? (
          content
        ) : (
          <ThemeScope tokens={attribution.tokens}>{content}</ThemeScope>
        )}
      </Stack>
      {showSwipes && role === "assistant" ? <SwipeStrip message={message} /> : null}
    </Stack>
  );
}
