// The streaming ghost row — the ONLY component in the tree that subscribes to token text (UI-Gates
// §11.1 ghost-isolation). `useGhostText`/`useGhostReasoning`/`useGhostThinking` mirror the live turn's
// tokens via the render-free store subscription, so a delta re-renders THIS row alone; the list,
// composer, and canon rows stay still. The answer body is paced through `@orb/ui/stream
// useSmoothText` (grapheme-safe, reduced-motion passthrough), passed through `repairStreamingTail`
// (`@orb/kit/fix-markdown` — the #402/#473 streaming code-fence/torn-markup guard, UI-Gates §11.6)
// while still streaming, then fed to `@orb/ui/markdown` as `trusted` (own AI output). Before the first
// answer token (pending, or the first streaming frame) it shows the TTFT `StreamShimmer`.
//
// TASK #20 additions: the `<ReasoningBlock>` disclosure (rendered above the answer body, when there's
// reasoning) owns its own "Thinking… Ns" → "Thought for Ns" TTFT affordance + the same repair guard for
// the reasoning trace. It wears the assistant skin so the ghost reads as an in-progress assistant
// message that swaps to the canonical row on turn-complete.
//
// MACRO DISPLAY PASS (optional, additive — mirrors message-row.tsx's roster threading): `renderContext`
// is undefined until a caller wires the room's roster/persona names down to the ghost; when present,
// `{{char}}`/`{{user}}` resolve on EACH accumulated delta via the SAME `#lib/message-render` pipeline
// the settled row uses (one engine) — cheap and pure, run before pacing so the paced reveal shows
// already-substituted text.
//
// PHASE 4b GAP-FIX (b) — immersive decoration DURING streaming, not just after settle: the surface
// resolves the live turn's `RowAttribution` (§A.8 KIND-READY — the SAME `resolveRowAttribution` the
// settled row calls, keyed off `useTurnSpeakerCharacterId`, a chrome-safe id-stable selector that never
// re-renders on a text/reasoning delta) and threads it in as `attribution`. This row then reads the
// SAME three skin fields `message-row.tsx` does (`avatarTreatment`/`bubbleDecoration`/attribution
// `ThemeScope`) and reuses `renderRowAvatar` from `message-row-parts.tsx` — so Echo's bled edge,
// Whisper's banner+stripe, Hush's stripe, and Ripple's sticky portrait all paint on the ghost the
// instant a turn starts, and the row swaps to the byte-identical canonical structure on turn-complete
// with zero visual pop-in. `attribution === undefined` (a caller that hasn't wired it) degrades to the
// pre-fix render: no sibling avatar, no decoration — unchanged.

import { blobUrl } from "@orb/contracts/assets";
import { holdTornSpeaker } from "@orb/kit/fix-markdown";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { Row, Stack } from "@orb/ui/layout";
import { Markdown } from "@orb/ui/markdown";
import { StreamShimmer, useSmoothText } from "@orb/ui/stream";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement } from "react";
import type { MessageRenderContext } from "#lib";
import { cn, renderMessageForDisplay } from "#lib";
import { useGhostReasoning, useGhostText, useGhostThinking } from "../hooks/use-ghost-stream";
import type { RowAttribution } from "../lib/attribution";
import { MESSAGE_ROW_SKINS } from "../lib/message-row-variants";
import { renderRowAvatar } from "./message-row-parts";
import { ReasoningBlock } from "./reasoning-block";

/** The paced-reveal trickle floor (chars/sec) — a calm cadence while a stream is live. */
const GHOST_CPS = 40;

export interface GhostMessageRowProps {
  readonly chatId: ChatId;
  /** The active appearance — the ghost wears the assistant skin of this style. */
  readonly chatStyle: keyof typeof MESSAGE_ROW_SKINS;
  /** True while the turn is in the `streaming` phase — pacing runs only then (pending = shimmer). */
  readonly streaming: boolean;
  /** The room-level macro DATA — absent means the streamed text/reasoning render UNCHANGED. */
  readonly renderContext?: MessageRenderContext | undefined;
  /** The turn's voiced speaker — retargets `{{char}}`; ignored when `renderContext` is absent. */
  readonly rowCharacterId?: CharacterId | null | undefined;
  /** Phase 4b gap-fix (b) — the live turn's resolved identity (§A.8), the SAME shape
   *  `resolveRowAttribution` produces for the settled row. `undefined` ⇒ no sibling avatar, no
   *  immersive decoration (the pre-fix render). */
  readonly attribution?: RowAttribution | undefined;
  /** Attribution avatar chrome (appearance prefs, §12.1/§B.3) — mirrors `MessageRow`'s own props;
   *  meaningless without `attribution`. */
  readonly avatarSize?: "sm" | "md" | "lg" | undefined;
  readonly avatarShape?: "round" | "square" | "rounded" | undefined;
  readonly avatarAspect?: "square" | "portrait" | undefined;
  readonly avatarRing?: "none" | "accent" | undefined;
  readonly showInChatAvatars?: boolean | undefined;
  /** Phase 4b §B.5.5 appearance.showLLMReasoningIcon — threaded straight to `<ReasoningBlock>`. */
  readonly showLLMReasoningIcon?: boolean | undefined;
}

/** The in-progress assistant row, streaming paced markdown (or a TTFT shimmer before first token). */
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
}: GhostMessageRowProps): ReactElement {
  const rawText = useGhostText(chatId);
  const rawReasoning = useGhostReasoning(chatId);
  const thinking = useGhostThinking(chatId);
  const text =
    renderContext === undefined
      ? rawText
      : renderMessageForDisplay(rawText, renderContext, rowCharacterId);
  const reasoning =
    renderContext === undefined
      ? rawReasoning
      : renderMessageForDisplay(rawReasoning, renderContext, rowCharacterId);
  const paced = useSmoothText(text, { enabled: streaming, cps: GHOST_CPS });
  // #38: Streamdown 2.5 (inside `@orb/ui/markdown` with `mode="streaming"`) repairs the streaming
  // markdown tail itself (unterminated fences / torn emphasis) — so the only pre-pass the seal still
  // needs is holding a TORN `<speaker>` tag (Streamdown does not). Applies only while streaming; once
  // settled the canonical row takes over via the separate settled pipeline.
  const held = streaming ? holdTornSpeaker(paced) : paced;
  const skin = MESSAGE_ROW_SKINS[chatStyle];

  // §B.2/gap-fix (b) — the SAME kind-aware resolution the settled row does (message-row.tsx), keyed
  // off the live turn's attribution instead of a committed MessageView.
  const kind = attribution?.kind ?? null;
  const avatarTreatment = skin.avatarTreatment(kind);
  const characterAvatarUrl =
    attribution === undefined || attribution.avatarHash === null
      ? null
      : blobUrl(attribution.avatarHash);
  const decoration = skin.bubbleDecoration?.({ kind, avatarUrl: characterAvatarUrl }) ?? null;
  const avatarNode =
    attribution === undefined
      ? null
      : renderRowAvatar({
          attribution,
          avatarTreatment,
          // The ghost row always wears the assistant skin (file header) — a live turn is never the
          // viewer's own row, so this is never the role==="user" mirrored-weld case.
          role: "assistant",
          showInChatAvatars,
          avatarSize,
          avatarShape,
          avatarAspect,
          avatarRing,
        });

  const bubble = (
    // The ghost bubble fills width (w-full) so the shimmer's + streaming markdown's w-full children
    // have a sized parent (the assistant skin is otherwise shrink-to-fit, collapsing them to zero). It
    // swaps to the shrink-to-fit canonical MessageRow structure on turn-complete.
    <Stack
      gap="row"
      data-slot="message-bubble"
      className={cn(skin.inner("assistant"), "w-full", decoration?.className)}
      style={decoration?.style}
    >
      {reasoning.length > 0 ? (
        <ReasoningBlock reasoning={reasoning} thinking={thinking} showIcon={showLLMReasoningIcon} />
      ) : null}
      {held.length === 0 ? (
        <StreamShimmer label="Generating a reply…" />
      ) : (
        <Markdown trust="trusted" mode={streaming ? "streaming" : "static"}>
          {held}
        </Markdown>
      )}
    </Stack>
  );
  // Attribution `ThemeScope` (character theme override — §12.4 Layer 3), same as the settled row's
  // `renderRowBubble`: makes `var(--color-speaker)` resolve the character's own override for Hush's/
  // Whisper's stripe DURING streaming too, not just after settle.
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
      className={skin.outer("assistant")}
    >
      <Row align="start" gap="row" data-slot="message-row-body">
        {avatarNode}
        <Stack gap="row" data-slot="message-content-column" className="min-w-0 flex-1">
          {decoratedBubble}
        </Stack>
      </Row>
    </Stack>
  );
}
