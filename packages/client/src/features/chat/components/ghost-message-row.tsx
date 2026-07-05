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

import { holdTornSpeaker } from "@orb/kit/fix-markdown";
import type { ChatId } from "@orb/kit/ids";
import { Stack } from "@orb/ui/layout";
import { Markdown } from "@orb/ui/markdown";
import { StreamShimmer, useSmoothText } from "@orb/ui/stream";
import type { ReactElement } from "react";
import { cn } from "#lib";
import { useGhostReasoning, useGhostText, useGhostThinking } from "../hooks/use-ghost-stream";
import { MESSAGE_ROW_SKINS } from "../lib/message-row-variants";
import { ReasoningBlock } from "./reasoning-block";

/** The paced-reveal trickle floor (chars/sec) — a calm cadence while a stream is live. */
const GHOST_CPS = 40;

export interface GhostMessageRowProps {
  readonly chatId: ChatId;
  /** The active appearance — the ghost wears the assistant skin of this style. */
  readonly chatStyle: keyof typeof MESSAGE_ROW_SKINS;
  /** True while the turn is in the `streaming` phase — pacing runs only then (pending = shimmer). */
  readonly streaming: boolean;
}

/** The in-progress assistant row, streaming paced markdown (or a TTFT shimmer before first token). */
export function GhostMessageRow({
  chatId,
  chatStyle,
  streaming,
}: GhostMessageRowProps): ReactElement {
  const text = useGhostText(chatId);
  const reasoning = useGhostReasoning(chatId);
  const thinking = useGhostThinking(chatId);
  const paced = useSmoothText(text, { enabled: streaming, cps: GHOST_CPS });
  // #38: Streamdown 2.5 (inside `@orb/ui/markdown` with `mode="streaming"`) repairs the streaming
  // markdown tail itself (unterminated fences / torn emphasis) — so the only pre-pass the seal still
  // needs is holding a TORN `<speaker>` tag (Streamdown does not). Applies only while streaming; once
  // settled the canonical row takes over via the separate settled pipeline.
  const held = streaming ? holdTornSpeaker(paced) : paced;
  const skin = MESSAGE_ROW_SKINS[chatStyle];
  return (
    <Stack
      gap="row"
      data-slot="ghost-message-row"
      data-role="assistant"
      className={skin.outer("assistant")}
    >
      {/* The ghost bubble fills width (w-full) so the shimmer's + streaming markdown's w-full children
          have a sized parent (the assistant skin is otherwise shrink-to-fit, collapsing them to zero).
          It swaps to the shrink-to-fit canonical MessageRow on turn-complete. */}
      <Stack gap="row" data-slot="message-bubble" className={cn(skin.inner("assistant"), "w-full")}>
        {reasoning.length > 0 ? <ReasoningBlock reasoning={reasoning} thinking={thinking} /> : null}
        {held.length === 0 ? (
          <StreamShimmer label="Generating a reply…" />
        ) : (
          <Markdown trust="trusted" mode={streaming ? "streaming" : "static"}>
            {held}
          </Markdown>
        )}
      </Stack>
    </Stack>
  );
}
