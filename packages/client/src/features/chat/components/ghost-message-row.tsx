// The streaming ghost row — the only component that subscribes to token text, so a delta re-renders
// this row alone. Stream content is UNTRUSTED (live model output; indirect prompt-injection can emit
// exfil-shaped markup that a paced reveal would fetch before commit-time sanitization runs) — always
// rendered `untrusted` regardless of the settled row's per-message trust resolution.

import { holdTornSpeaker } from "@orb/kit/fix-markdown";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { speakerTagsToPlain } from "@orb/kit/speaker-label";
import { Row, Stack } from "@orb/ui/layout";
import { Markdown } from "@orb/ui/markdown";
import { StreamShimmer, useSmoothText } from "@orb/ui/stream";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement } from "react";
import type { MessageRenderContext } from "#lib";
import { cn, renderMessageForDisplay } from "#lib";
import { useEnterMotion } from "../hooks/use-enter-motion";
import { useGhostReasoning, useGhostText, useGhostThinking } from "../hooks/use-ghost-stream";
import type { RowAttribution } from "../lib/attribution";
import { MESSAGE_ROW_SKINS } from "../lib/message-row-variants";
import { renderRowAvatar } from "./message-row-parts";
import { ReasoningBlock } from "./reasoning-block";

const GHOST_CPS = 40;

// Module scope so the ghost component stays under the cognitive-complexity ceiling.
function ghostFallbackTile(attribution: RowAttribution | undefined): {
  readonly hueSeed: string;
  readonly initial: string;
} {
  if (attribution === undefined || attribution.name === null) {
    return { hueSeed: attribution?.hueSeed ?? "", initial: "" };
  }
  return { hueSeed: attribution.hueSeed, initial: initialsFor(attribution.name) };
}

export interface GhostMessageRowProps {
  readonly chatId: ChatId;
  readonly chatStyle: keyof typeof MESSAGE_ROW_SKINS;
  /** Pacing runs only while true; pending shows the TTFT shimmer instead. */
  readonly streaming: boolean;
  readonly renderContext?: MessageRenderContext | undefined;
  readonly rowCharacterId?: CharacterId | null | undefined;
  /** The live turn's resolved identity, the same shape resolveRowAttribution produces for the settled
   *  row. Undefined ⇒ no sibling avatar, no immersive decoration. */
  readonly attribution?: RowAttribution | undefined;
  readonly avatarSize?: "sm" | "md" | "lg" | undefined;
  readonly avatarShape?: "round" | "square" | "rounded" | undefined;
  readonly avatarAspect?: "square" | "portrait" | undefined;
  readonly avatarRing?: "none" | "accent" | undefined;
  readonly showInChatAvatars?: boolean | undefined;
  readonly showLLMReasoningIcon?: boolean | undefined;
  /** True only on the render the ghost genuinely appears; a mid-stream scrollback remount gets false. */
  readonly enterMotion?: boolean;
}

export function GhostMessageRow({
  chatId,
  chatStyle,
  streaming,
  renderContext,
  rowCharacterId,
  attribution,
  avatarSize = "md",
  avatarShape = "round",
  avatarAspect = "square",
  avatarRing = "none",
  showInChatAvatars = true,
  showLLMReasoningIcon = false,
  enterMotion = false,
}: GhostMessageRowProps): ReactElement {
  const enterClasses = useEnterMotion(enterMotion);
  const rawText = useGhostText(chatId);
  const rawReasoning = useGhostReasoning(chatId);
  const thinking = useGhostThinking(chatId);
  const text = renderContext === undefined ? rawText : renderMessageForDisplay(rawText, renderContext, rowCharacterId);
  const reasoning = renderContext === undefined ? rawReasoning : renderMessageForDisplay(rawReasoning, renderContext, rowCharacterId);
  const paced = useSmoothText(text, { enabled: streaming, cps: GHOST_CPS });
  // Streamdown repairs the streaming markdown tail itself; the only pre-pass still needed here is
  // holding a torn <speaker> tag, then converting a complete one to a plain "Name:" prefix (the
  // untrusted seal drops the <speaker> element and its name child otherwise).
  const held = speakerTagsToPlain(streaming ? holdTornSpeaker(paced) : paced);
  const skin = MESSAGE_ROW_SKINS[chatStyle];

  const kind = attribution?.kind ?? null;
  const avatarTreatment = skin.avatarTreatment(kind);
  const decorationAvatarHash = attribution === undefined ? null : attribution.avatarHash;
  const decoration =
    skin.bubbleDecoration?.({
      kind,
      avatarHash: decorationAvatarHash,
      ...ghostFallbackTile(attribution),
    }) ?? null;
  const avatarNode =
    attribution === undefined
      ? null
      : renderRowAvatar({
          attribution,
          avatarTreatment,
          role: "assistant",
          showInChatAvatars,
          avatarSize,
          avatarShape,
          avatarAspect,
          avatarRing,
        });

  const bubble = (
    // w-full so the shimmer/streaming-markdown children have a sized parent (the assistant skin is
    // otherwise shrink-to-fit).
    <Stack gap="row" data-slot="message-bubble" className={cn(skin.inner("assistant"), "w-full", decoration?.className)} style={decoration?.style}>
      {reasoning.length > 0 ? <ReasoningBlock reasoning={reasoning} thinking={thinking} showIcon={showLLMReasoningIcon} /> : null}
      {held.length === 0 ? (
        <StreamShimmer label="Generating a reply…" />
      ) : (
        <Markdown trust="untrusted" mode={streaming ? "streaming" : "static"}>
          {held}
        </Markdown>
      )}
    </Stack>
  );
  const decoratedBubble =
    attribution === undefined || attribution.tokens === null ? (
      bubble
    ) : (
      <ThemeScope tokens={attribution.tokens} className="contents">
        {bubble}
      </ThemeScope>
    );

  return (
    <Stack
      gap="row"
      data-slot="ghost-message-row"
      data-role="assistant"
      data-kind={attribution?.kind ?? undefined}
      className={cn(skin.outer("assistant"), enterClasses)}
    >
      <Row align="start" gap="row" data-slot="message-row-body" className="w-full">
        {avatarNode}
        <Stack gap="row" data-slot="message-content-column" className="min-w-0 flex-1">
          {decoratedBubble}
        </Stack>
      </Row>
    </Stack>
  );
}
