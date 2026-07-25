// The streaming ghost row — the only component that subscribes to token text, so a delta re-renders
// this row alone. Stream content is UNTRUSTED (live model output; indirect prompt-injection can emit
// exfil-shaped markup that a paced reveal would fetch before commit-time sanitization runs) — always
// rendered `untrusted` regardless of the settled row's per-message trust resolution.

import { holdTornSpeaker } from "@orb/kit/fix-markdown";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { speakerTagsToPlain, stripLeadingSpeakerName } from "@orb/kit/speaker-label";
import { Row, Stack } from "@orb/ui/layout";
import { Markdown } from "@orb/ui/markdown";
import { TypingDots, useSmoothText } from "@orb/ui/stream";
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

// Fallback pace when smooth-streaming is on but the surface passed no explicit cps (matches the contract
// default). The pref (`UserSettings.chat.smoothStreamCps`) overrides it via the `smoothStreamCps` prop.
const DEFAULT_SMOOTH_STREAM_CPS = 80;

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

// The bubble's streamed body: typing dots before the first token, else the paced Markdown. Extracted to
// module scope so `GhostMessageRow` stays under the cognitive-complexity ceiling. The streaming caret is
// Streamdown's own `caret: "block"` (`mode="streaming"`) `::after` at the true text insertion point;
// `styles/globals.css` retints it to a 2px `--color-primary` blinking bar within the `ghost-stream-body`
// scope (see the header). The wrapper is a data-slot marker only (no className — feature paint law).
function GhostBubbleBody({ held, streaming }: { readonly held: string; readonly streaming: boolean }): ReactElement {
  if (held.length === 0) {
    return <TypingDots label="Generating a reply…" />;
  }
  return (
    <div data-slot="ghost-stream-body" data-streaming={streaming ? "" : undefined}>
      <Markdown trust="untrusted" mode={streaming ? "streaming" : "static"}>
        {held}
      </Markdown>
    </div>
  );
}

export interface GhostMessageRowProps {
  readonly chatId: ChatId;
  readonly chatStyle: keyof typeof MESSAGE_ROW_SKINS;
  /** Pacing (and the streaming caret) run only while true; pending shows the typing dots instead. */
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
  /** PD-146 — the `UserSettings.chat.smoothStream` pref: pace the reveal (default off ⇒ raw chunks). */
  readonly smoothStream?: boolean | undefined;
  /** PD-146 — the `UserSettings.chat.smoothStreamCps` pref: the trickle floor when `smoothStream` is on. */
  readonly smoothStreamCps?: number | undefined;
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
  smoothStream = false,
  smoothStreamCps = DEFAULT_SMOOTH_STREAM_CPS,
  enterMotion = false,
}: GhostMessageRowProps): ReactElement {
  const enterClasses = useEnterMotion(enterMotion);
  const rawText = useGhostText(chatId);
  const rawReasoning = useGhostReasoning(chatId);
  const thinking = useGhostThinking(chatId);
  const text = renderContext === undefined ? rawText : renderMessageForDisplay(rawText, renderContext, rowCharacterId);
  const reasoning = renderContext === undefined ? rawReasoning : renderMessageForDisplay(rawReasoning, renderContext, rowCharacterId);
  const paced = useSmoothText(text, { enabled: streaming && smoothStream, cps: smoothStreamCps });
  // The live speaker's own name (the same value the server's per-speaker clean strips against). In a
  // speakerTags group turn the model, trained on the `Name:`-prefixed transcript, echoes its own `JFC: `
  // prefix at the START of the stream — the server strips it at finalize, so without this the raw prefix
  // would flash in the bubble for the whole turn (P1 leaked-implementation-detail). Progressive leading
  // strip here mirrors the persist-side `cleanPerSpeakerReply` so the display matches what canon will hold.
  const speakerName = attribution?.name ?? null;
  const deLabelled = speakerName === null ? paced : stripLeadingSpeakerName(paced, speakerName);
  // Streamdown repairs the streaming markdown tail itself; the only pre-pass still needed here is
  // holding a torn <speaker> tag, then converting a complete one to a plain "Name:" prefix (the
  // untrusted seal drops the <speaker> element and its name child otherwise).
  const held = speakerTagsToPlain(streaming ? holdTornSpeaker(deLabelled) : deLabelled);
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
      <GhostBubbleBody held={held} streaming={streaming} />
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
