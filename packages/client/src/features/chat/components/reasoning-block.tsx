// The TTFT reasoning disclosure: "Thinking... Ns" while the turn has reasoning tokens but no answer
// token yet, force-open and ticking; auto-collapses to the frozen "Thought for Ns" the instant the
// first answer token lands. A user click sets a permanent override that the auto force-open/collapse
// never fights again. The elapsed count is a plain tick counter (render scope bans Date.now/wall-clock
// reads), and the trace renders untrusted for the same live-model-output reason the ghost answer body
// does.

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
  readonly showIcon?: boolean | undefined;
  /** PD-146 — the `UserSettings.chat.smoothStream` pref: pace the reasoning reveal (default off ⇒ raw). */
  readonly smoothStream?: boolean | undefined;
  /** PD-146 — the `UserSettings.chat.smoothStreamCps` pref: the trickle floor when `smoothStream` is on. */
  readonly smoothStreamCps?: number | undefined;
}

export function ReasoningBlock({
  reasoning,
  thinking,
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
  const label = thinking ? `Thinking… ${elapsedSeconds}s` : `Thought for ${elapsedSeconds}s`;
  const paced = useSmoothText(reasoning, { enabled: thinking && smoothStream, cps: smoothStreamCps });
  const held = speakerTagsToPlain(thinking ? holdTornSpeaker(paced) : paced);

  return (
    <Collapsible open={expanded} onOpenChange={(next): void => setOverride(next)}>
      <CollapsibleTrigger chevron={false}>
        <Row gap="field" align="center">
          <Icon icon={expanded ? ChevronDown : ChevronRight} size="sm" />
          {/* Decorative — the adjacent label text already names the disclosure. */}
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
