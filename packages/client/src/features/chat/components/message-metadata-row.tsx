// The per-message METADATA chip row (WS3, D44 §12.1) — each chip gated by its OWN appearance toggle
// (`showTimestamps`/`showMessageId`/`showModelIcon`/`showTokenCount`/`showGenerationTimer`), rendered
// only when its datum is actually present on the `MessageView` (a draft/greeting row has null
// model/tokens/gen-window — no chip, no gap). The datum chips reuse the existing `@orb/ui/badge`
// primitive (no new primitive, per the WS3 spec) — a quiet muted-intent pill per datum, `Icon` composed
// as the leading glyph (ui-package-design §6.1 pattern, the same convention `StatusChip` uses).
//
// PD-130 (generation timer): the turn engine DOES write `message_variants.gen_started_at`/`gen_finished_at`
// on the real turn path (`engine.ts` → `canon-write.ts`; live since eb5d6b3c), and the read seam now
// surfaces them on `MessageView` (`genStartedAt`/`genFinishedAt`). The gen-duration readout renders per
// north-star P5 as QUIET METADATA (inline `--text-micro` `--font-mono` `--color-muted-foreground`), not a
// pill — so N3's pending pills→micro-text conversion leaves it as-is.

import type { MessageView } from "@orb/contracts/chat";
import { Badge } from "@orb/ui/badge";
// biome-ignore lint/correctness/noUnresolvedImports: biome can't follow @orb/ui/icons' lucide-react re-export barrel (external .d.ts); tsc/vite resolve it fine (the swipe-strip.tsx precedent).
import { Clock, Coins, Cpu, Hash, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { timeLib } from "#lib";
import { genDurationLabel } from "../lib/gen-duration";
import { MessageCostReadout } from "./message-cost-readout";

/** The metadata-chip subset of the appearance prefs (mirrors `useMessageAppearance`'s row-display
 *  shape) — threaded from the surface, never a per-row query (rows stay prop-driven). */
export interface MessageMetadataVisibility {
  readonly showTimestamps: boolean;
  readonly showMessageId: boolean;
  readonly showModelIcon: boolean;
  readonly showTokenCount: boolean;
  readonly showGenerationTimer: boolean;
  readonly showGenerationCost: boolean;
}

export interface MessageMetadataRowProps {
  readonly message: MessageView;
  readonly visibility: MessageMetadataVisibility;
}

/** The token count shown per message — output tokens (the generated length, ST parity) falling back
 *  to input tokens when a variant has no output (never fabricates a sum that double-counts a resend). */
function tokenCount(message: MessageView): number | null {
  return message.tokensOut ?? message.tokensIn ?? null;
}

/** The always-hidden-until-opted-in per-message chip strip. Renders nothing when every gated datum is
 *  absent (a draft greeting row, or every toggle off) — never an empty `<Row>` shell. */
export function MessageMetadataRow({
  message,
  visibility,
}: MessageMetadataRowProps): ReactElement | null {
  const tokens = tokenCount(message);
  const chips: ReactElement[] = [];

  if (visibility.showTimestamps) {
    chips.push(
      <Badge key="timestamp" data-slot="message-metadata-timestamp">
        <Icon icon={Clock} size="xs" />
        {timeLib.formatTime(message.createdAt)}
      </Badge>,
    );
  }
  if (visibility.showModelIcon && message.model !== null) {
    chips.push(
      <Badge key="model" data-slot="message-metadata-model">
        <Icon icon={Cpu} size="xs" />
        {message.model}
      </Badge>,
    );
  }
  if (visibility.showTokenCount && tokens !== null) {
    chips.push(
      <Badge key="tokens" data-slot="message-metadata-tokens">
        <Icon icon={Coins} size="xs" />
        {tokens} tok
      </Badge>,
    );
  }
  if (visibility.showMessageId) {
    chips.push(
      <Badge key="id" data-slot="message-metadata-id">
        <Icon icon={Hash} size="xs" />
        {message.id}
      </Badge>,
    );
  }
  // PD-130 — quiet metadata (north-star P5): the gen duration is inline micro-mono muted text, NOT a
  // pill, and appears only when the turn recorded a complete gen window.
  const genLabel = visibility.showGenerationTimer
    ? genDurationLabel(message.genStartedAt, message.genFinishedAt)
    : null;
  if (genLabel !== null) {
    chips.push(
      <Text
        key="gen-duration"
        size="micro"
        tone="muted"
        className="font-mono"
        data-slot="message-metadata-gen-duration"
      >
        {genLabel}
      </Text>,
    );
  }
  // PD-137 — the on-demand settled-cost readout (renders its own null-guard for a non-OR row); the paid
  // fetch fires only on the user's reveal click, never here.
  if (visibility.showGenerationCost && message.generationId !== null) {
    chips.push(<MessageCostReadout key="gen-cost" message={message} />);
  }

  if (chips.length === 0) {
    return null;
  }
  return (
    <Row gap="field" align="center" data-slot="message-metadata-row" className="flex-wrap">
      {chips}
    </Row>
  );
}
