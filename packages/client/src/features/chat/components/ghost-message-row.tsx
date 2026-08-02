// The streaming ghost row — the only component that subscribes to token text, so a delta re-renders
// this row alone. Stream content is UNTRUSTED (live model output; indirect prompt-injection can emit
// exfil-shaped markup that a paced reveal would fetch before commit-time sanitization runs) — always
// rendered `untrusted` regardless of the settled row's per-message trust resolution.

import { scanGhostContent } from "@orb/kit/content";
import { holdTornSpeaker } from "@orb/kit/fix-markdown";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { speakerTagsToPlain, stripLeadingSpeakerName } from "@orb/kit/speaker-label";
import { Card } from "@orb/ui/card";
import { Row, Stack } from "@orb/ui/layout";
import { Markdown } from "@orb/ui/markdown";
import { Skeleton } from "@orb/ui/skeleton";
import { TypingDots, useSmoothText } from "@orb/ui/stream";
import { Text } from "@orb/ui/text";
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

// The §4.5 FORMING-CARD placeholder (parity-plus P4, ghost arm only): once a `:::card` OPEN line completes
// in the ghost text, the accumulating raw HTML is suppressed behind a pretty building-state chip (skeleton
// shimmer + the title); the real card mounts only at commit (chip → card, one hard cut — NO iframe, NO
// partial HTML ever renders mid-stream). An aborted stream drops with the ghost row (no false card).
function FormingCardChip({ title }: { readonly title: string | null }): ReactElement {
  return (
    // DENSITY S6: the chip is the placeholder ISLAND for the card it becomes, so it stays a box — but a
    // `<Card>`, whose padding + `--radius-base` the room's instrument tier resolves. It was the largest
    // radius step (D6 reserved that for the floating bubble it streams inside).
    <Card aria-busy={true}>
      <Stack gap="row" data-slot="forming-card-chip">
        <Text voice="gloss">✦ {title !== null && title !== "" ? title : "Immersive card"} — forming…</Text>
        <Skeleton className="h-control-md w-full" />
        <Skeleton variant="text" className="h-control-sm" />
      </Stack>
    </Card>
  );
}

// The bubble's streamed body: typing dots before the first token, else the paced Markdown. Extracted to
// module scope so `GhostMessageRow` stays under the cognitive-complexity ceiling. The streaming caret is
// Streamdown's own `caret: "block"` (`mode="streaming"`) `::after` at the true text insertion point;
// `styles/globals.css` retints it to a 2px `--color-primary` blinking bar within the `ghost-stream-body`
// scope (see the header). The wrapper is a data-slot marker only (no className — feature paint law).
function GhostBubbleBody({
  held,
  streaming,
  colorQuotes,
}: {
  readonly held: string;
  readonly streaming: boolean;
  readonly colorQuotes: boolean;
}): ReactElement {
  if (held.length === 0) {
    return <TypingDots label="Generating a reply…" />;
  }
  // §4.5: split the accumulating text on completed `:::card` opens — text streams as markdown, a forming
  // card shows the chip (its body bytes accumulate invisibly behind it). The common no-card path is one
  // text segment (byte-identical to the pre-P4 render).
  const segments = scanGhostContent(held);
  return (
    <div data-slot="ghost-stream-body" data-streaming={streaming ? "" : undefined}>
      <Stack gap="row">
        {segments.map((segment, index) =>
          segment.kind === "forming-card" ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional within one accumulating stream render — no ids exist mid-stream, and the list only ever appends (the recentBeats positional precedent).
            <FormingCardChip key={index} title={segment.title} />
          ) : (
            // Only the TAIL segment is live (the caret + incomplete-markdown repair); earlier segments are settled text.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above — positional, append-only mid-stream.
            <Markdown key={index} trust="untrusted" mode={streaming && index === segments.length - 1 ? "streaming" : "static"} colorQuotes={colorQuotes}>
              {segment.text}
            </Markdown>
          ),
        )}
      </Stack>
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
  /** The `appearance.colorQuotedSpeech` pref — the live half of the settled row's identical tint. Absent ⇒ ON. */
  readonly colorQuotedSpeech?: boolean | undefined;
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
  colorQuotedSpeech = true,
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
      {reasoning.length > 0 ? (
        <ReasoningBlock
          reasoning={reasoning}
          thinking={thinking}
          showIcon={showLLMReasoningIcon}
          smoothStream={smoothStream}
          smoothStreamCps={smoothStreamCps}
        />
      ) : null}
      <GhostBubbleBody held={held} streaming={streaming} colorQuotes={colorQuotedSpeech} />
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
