// The TTFT reasoning disclosure: "Thinking... Ns" while the turn has reasoning tokens but no answer
// token yet, force-open and ticking; auto-collapses to the frozen "Thought for Ns" the instant the
// first answer token lands. A user click sets a permanent override that the auto force-open/collapse
// never fights again. The elapsed count is a plain tick counter (render scope bans Date.now/wall-clock
// reads), and the trace renders untrusted for the same live-model-output reason the ghost answer body
// does.
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
  /** PD-146 — the `UserSettings.chat.smoothStream` pref: pace the reasoning reveal (default off ⇒ raw). */
  readonly smoothStream?: boolean | undefined;
  /** PD-146 — the `UserSettings.chat.smoothStreamCps` pref: the trickle floor when `smoothStream` is on. */
  readonly smoothStreamCps?: number | undefined;
}

export function ReasoningBlock({
  reasoning,
  thinking,
  label: labelOverride,
  showIcon = false,
  smoothStream = false,
  smoothStreamCps = DEFAULT_SMOOTH_STREAM_CPS,
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

  const expanded = override ?? thinking;
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
