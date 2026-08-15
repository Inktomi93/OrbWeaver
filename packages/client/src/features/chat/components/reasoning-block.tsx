// The TTFT reasoning disclosure: "Thinking... Ns" while the turn has reasoning tokens but no answer
// token yet, force-open and ticking; auto-collapses to the frozen "Thought for Ns" the instant the
// first answer token lands. A user click sets a permanent override that the auto force-open/collapse
// never fights again. The elapsed count is a plain tick counter (render scope bans Date.now/wall-clock
// reads), and the trace renders untrusted for the same live-model-output reason the ghost answer body
// does.
//
// TWO KNOBS on the auto arm (both live-ghost only — the settled mount is `thinking={false}`):
//   • `autoCollapse` (`UserSettings.chat.reasoningAutoCollapse`, default ON, ST parity) — OFF holds the
//     trace open after the answer, so the disclosure never collapses on its own and the prose is never
//     flung; the reader closes it by hand.
//   • The auto open/close is INSTANT (`CollapsiblePanel instant` — the reduced-motion-mirroring 0.01ms
//     snap), so the answer prose paints at its final position in ONE commit instead of travelling the whole
//     trace height as a smooth fold drags it up (the measured 350–677px prose
//     fling). A MANUAL toggle (`override` non-null) restores the smooth Base UI fold.
//
// TWO MOUNTS, one component. The LIVE mount is the streaming ghost (`ghost-message-row.tsx`) — it owns the
// ticking label. The SETTLED mount is the committed transcript row (`message-row.tsx`), reading the durable
// `MessageView.reasoning` a completed turn persisted: it mounts with `thinking={false}` (collapsed by default,
// host-expandable) and passes an explicit `label`, because a row rehydrated from canon never measured the
// think window — the ticker would render a fabricated "Thought for 0s" (D41 no-silent-degrade). The trace it
// shows is whatever the SERVER handed this viewer: the §3.6 reasoning strip nulls the field for a member of a
// deception-active game, so a stripped row simply has nothing to mount (this component never gates access).

import { holdTornSpeaker } from "@orb/kit/fix-markdown";
import { speakerTagsToPlain } from "@orb/kit/speaker-label";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { BrainCircuit, ChevronDown, ChevronRight, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Markdown } from "@orb/ui/markdown";
import { StreamShimmer, useSmoothText } from "@orb/ui/stream";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

const TICK_MS = 1000;
// Fallback pace when smooth-streaming is on but no explicit cps was passed (matches the contract default,
// same as the ghost body's DEFAULT_SMOOTH_STREAM_CPS). The `UserSettings.chat.smoothStreamCps` pref
// overrides it via the `smoothStreamCps` prop; `smoothStream` off ⇒ pacing is skipped entirely.
const DEFAULT_SMOOTH_STREAM_CPS = 80;

export interface ReasoningBlockProps {
  readonly reasoning: string;
  /** True while the turn has reasoning but no answer token yet; flips false on the auto-collapse trigger. */
  readonly thinking: boolean;
  /** Overrides the ticking "Thinking…/Thought for Ns" label — the SETTLED (committed-row) mount passes it,
   *  because a canon-rehydrated row never measured the think window and must not invent one. */
  readonly label?: string | undefined;
  readonly showIcon?: boolean | undefined;
  /** PD-146 — the `UserSettings.chat.smoothStream` pref: pace the reasoning reveal. The PREF ships ON
   *  (owner ruling 2026-08-09); the prop's own fallback stays OFF because an ABSENT prop means "this mount
   *  never resolved the pref" (a story/anchor), not "the user wants pacing" — the surface always passes the
   *  resolved value, so the contract keeps the ONE home of the default. */
  readonly smoothStream?: boolean | undefined;
  /** PD-146 — the `UserSettings.chat.smoothStreamCps` pref: the trickle floor when `smoothStream` is on. */
  readonly smoothStreamCps?: number | undefined;
  /** The `UserSettings.chat.reasoningAutoCollapse` pref — fold the trace on the first answer token. Default
   *  ON (today's behavior). Off ⇒ the trace stays open after the answer until the reader closes it, so the
   *  disclosure never auto-collapses and the prose is never flung. The SETTLED (committed-row) mount leaves
   *  it default ON, which is inert there — that mount is `thinking={false}`, already collapsed and
   *  host-expandable, so the auto arm is never the deciding factor. */
  readonly autoCollapse?: boolean | undefined;
}

export function ReasoningBlock({
  reasoning,
  thinking,
  label: labelOverride,
  showIcon = false,
  smoothStream = false,
  smoothStreamCps = DEFAULT_SMOOTH_STREAM_CPS,
  autoCollapse = true,
}: ReasoningBlockProps): ReactElement {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  // null = no manual toggle yet; once clicked this pins to the user's choice for this row's life.
  const [override, setOverride] = useState<boolean | null>(null);

  useEffect(() => {
    if (!thinking) {
      return;
    }
    const id = setInterval(() => setElapsedSeconds((seconds) => seconds + 1), TICK_MS);
    return (): void => clearInterval(id);
  }, [thinking]);

  // The auto arm: open while thinking, and — when the user has NOT turned auto-collapse off — collapse the
  // instant the answer lands (`thinking` false). `autoCollapse` OFF holds the trace open after the answer
  // (`thinking || true`), leaving the close to a manual click. A manual toggle (`override` non-null) pins the
  // user's choice for the row's life and beats both.
  const expanded = override ?? (thinking || !autoCollapse);
  // SNAP the AUTO open/close (no manual toggle yet) so the answer prose paints at its final position in one
  // commit rather than travelling the trace's height as the panel folds. Once
  // the user has clicked, `override` is non-null and the smooth Base UI fold returns.
  const instant = override === null;
  const label = labelOverride ?? (thinking ? `Thinking… ${elapsedSeconds}s` : `Thought for ${elapsedSeconds}s`);
  const paced = useSmoothText(reasoning, { enabled: thinking && smoothStream, cps: smoothStreamCps });
  const held = speakerTagsToPlain(thinking ? holdTornSpeaker(paced) : paced);

  return (
    <Collapsible open={expanded} onOpenChange={(next): void => setOverride(next)}>
      <CollapsibleTrigger chevron={false}>
        <Row gap="field" align="center">
          <Icon icon={expanded ? ChevronDown : ChevronRight} size="sm" />
          {/* Decorative — the adjacent label text already names the disclosure. */}
          {showIcon ? <Icon icon={BrainCircuit} size="sm" /> : null}
          {/* The disclosure names the channel it opens — the `label` voice (§2.3), at reading size
              because it is the row you click, not a footnote about it. */}
          <Text voice="label">{label}</Text>
        </Row>
      </CollapsibleTrigger>
      <CollapsiblePanel instant={instant}>
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
