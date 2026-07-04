// The streaming ghost row — the ONLY component in the tree that subscribes to token text (UI-Gates
// §11.1 ghost-isolation). `useGhostText` mirrors the live turn's tokens via the render-free store
// subscription, so a delta re-renders THIS row alone; the list, composer, and canon rows stay still.
// The reveal is paced through `@orb/ui/stream useSmoothText` (grapheme-safe, reduced-motion passthrough)
// and fed to `@orb/ui/markdown` as `trusted` (own AI output). Before the first token (pending, or the
// first streaming frame) it shows the TTFT `StreamShimmer`.
//
// SCOPE (#17): a minimal "Generating…" shimmer. The full TTFT reasoning-block ("Thinking… Ns" →
// "Thought for Ns") + streaming code-fence golden tests are task #20. It wears the assistant skin so
// the ghost reads as an in-progress assistant message that swaps to the canonical row on turn-complete.

import type { ChatId } from "@orb/kit/ids";
import { Stack } from "@orb/ui/layout";
import { Markdown } from "@orb/ui/markdown";
import { StreamShimmer, useSmoothText } from "@orb/ui/stream";
import type { ReactElement } from "react";
import { cn } from "#lib";
import { useGhostText } from "../hooks/use-ghost-stream";
import { MESSAGE_ROW_SKINS } from "../lib/message-row-variants";

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
  const paced = useSmoothText(text, { enabled: streaming, cps: GHOST_CPS });
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
        {paced.length === 0 ? (
          <StreamShimmer label="Generating a reply…" />
        ) : (
          <Markdown trust="trusted">{paced}</Markdown>
        )}
      </Stack>
    </Stack>
  );
}
