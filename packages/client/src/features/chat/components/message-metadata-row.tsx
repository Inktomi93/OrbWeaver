// The per-message METADATA chip row (WS3, D44 §12.1) — each chip gated by its OWN appearance toggle
// (`showTimestamps`/`showMessageId`/`showModelIcon`/`showTokenCount`), rendered only when its datum is
// actually present on the `MessageView` (a draft/greeting row has null model/tokens — no chip, no
// gap). Reuses the existing `@orb/ui/badge` primitive (no new primitive, per the WS3 spec) — a quiet
// muted-intent pill per datum, `Icon` composed as the leading glyph (ui-package-design §6.1 pattern,
// the same convention `StatusChip` uses).
//
// FLAG[PD-130]: `showGenerationTimer` has NO consumer. The `message_variants.gen_started_at`/
// `gen_finished_at` columns exist (read by `domain/stats`) but are NEVER WRITTEN by the turn engine
// for a real generation (only nulled at genesis-message seeding, `verbs/start-chat.ts`) — populating
// them needs per-backend turn-engine plumbing across every provider (the same shape as `ttftMs`'s
// existing wiring in `infra/providers/backends/*`), not a field-plumb. Per the WS3 spec's own carve-out
// ("flag it rather than destabilize the engine, ship the chips whose data exists"), this toggle is left
// OUT of the appearance pane entirely (schema-only, same posture WS2 left it in) rather than shipped as
// an always-empty control. Debt registry: `Core-Audits-and-Debt.md` PD-130.

import type { MessageView } from "@orb/contracts/chat";
import { Badge } from "@orb/ui/badge";
// biome-ignore lint/correctness/noUnresolvedImports: biome can't follow @orb/ui/icons' lucide-react re-export barrel (external .d.ts); tsc/vite resolve it fine (the swipe-strip.tsx precedent).
import { Clock, Coins, Cpu, Hash, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { timeLib } from "#lib";

/** The metadata-chip subset of the appearance prefs (mirrors `useMessageAppearance`'s row-display
 *  shape) — threaded from the surface, never a per-row query (rows stay prop-driven). */
export interface MessageMetadataVisibility {
  readonly showTimestamps: boolean;
  readonly showMessageId: boolean;
  readonly showModelIcon: boolean;
  readonly showTokenCount: boolean;
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

  if (chips.length === 0) {
    return null;
  }
  return (
    <Row gap="field" align="center" data-slot="message-metadata-row" className="flex-wrap">
      {chips}
    </Row>
  );
}
