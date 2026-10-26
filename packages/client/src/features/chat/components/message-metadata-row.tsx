// Metadata is data-only, outside prose; creation time sits beside the speaker, while showModelIcon credit and actions belong in the reveal cluster.
// Cache economics follows showTokenCount; TTFT follows showGenerationTimer. Absent data and disabled toggles add no empty metadata row.
// Never infer an outcome notice from finish reason or edits; only persisted output-cap receipts explain continuation beyond the requested limit.

import type { MessageView } from "@orb/contracts/chat";
import type { AppearanceSettings } from "@orb/contracts/settings";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { Fragment } from "react";
import { timeLib } from "#lib";
import { durationLabel, genDurationLabel } from "../lib/gen-duration.ts";
import { cacheTokensLabel, canRevealGenerationCost } from "../lib/message-readout.ts";
import { MessageCostReadout } from "./message-cost-readout.tsx";

export type MessageMetadataVisibility = Pick<
  AppearanceSettings,
  "showTimestamps" | "showMessageId" | "showModelIcon" | "showTokenCount" | "showGenerationTimer" | "showGenerationCost"
>;

export interface MessageMetadataRowProps {
  readonly message: MessageView;
  readonly visibility: MessageMetadataVisibility;
}

/** The message timestamp as quiet inline micro-mono text (D66 P5) — rendered beside the speaker name in
 *  the name row, not in the metadata footer. Null when `showTimestamps` is off, so the name row shows
 *  nothing extra. Keeps the `message-metadata-timestamp` slot (rule 0.7). */
export function MessageTimestamp({ message, show }: { readonly message: MessageView; readonly show: boolean }): ReactElement | null {
  if (!show) {
    return null;
  }
  return (
    <Text as="span" tone="muted" voice="code" data-slot="message-metadata-timestamp">
      {timeLib.formatTime(message.createdAt)}
    </Text>
  );
}

/** The token count shown per message — output tokens (the generated length, ST parity) falling back
 *  to input tokens when a variant has no output (never fabricates a sum that double-counts a resend). */
function tokenCount(message: MessageView): number | null {
  return message.tokensOut ?? message.tokensIn ?? null;
}

/** A quiet muted-mono metadata datum (the P5 voice). These are machine facts about the row, never the reply
 *  you came to read, so they take the `code` voice in the muted tone (and are NOT the `datum` voice,
 *  despite being numbers). */
function metadatum(slot: string, text: string): ReactElement {
  return (
    <Text as="span" tone="muted" voice="code" data-slot={slot}>
      {text}
    </Text>
  );
}

/** The opt-in per-message metadata row. Renders nothing when every gated datum is absent (a draft
 *  greeting row, or every toggle off) — never an empty `<Row>` shell. Timestamps are handled by
 *  `MessageTimestamp` in the name row, not here. */
export function MessageMetadataRow({ message, visibility }: MessageMetadataRowProps): ReactElement | null {
  const tokens = tokenCount(message);
  const items: ReactElement[] = [];

  // Essential provenance, not an appearance preference: the persisted output number can exceed the
  // requested cap because the runtime continued the same reply after reaching it. State that distinction
  // wherever the selected swipe carries the provider receipt, even when optional metadata is hidden.
  if (message.outputCapReached) {
    items.push(
      <Fragment key="output-cap">
        {metadatum("message-metadata-output-cap", "Output cap reached; the runtime continued this reply beyond the requested limit.")}
      </Fragment>,
    );
  }

  if (visibility.showTokenCount && tokens !== null && message.tokenProvenance !== "unrecorded") {
    const prefix = message.tokenProvenance === "estimated" ? "~" : "";
    items.push(<Fragment key="tokens">{metadatum("message-metadata-tokens", `${prefix}${tokens} tok`)}</Fragment>);
  }
  // Cache economics ride the TOKEN toggle (they are what explains the token number) and gate
  // independently on presence: a backend that reported no cache columns adds nothing, and a turn that
  // neither read nor wrote cache has no economics to state.
  const cacheLabel = visibility.showTokenCount ? cacheTokensLabel(message.cacheReadTokens, message.cacheWriteTokens) : null;
  if (cacheLabel !== null) {
    items.push(<Fragment key="cache">{metadatum("message-metadata-cache", cacheLabel)}</Fragment>);
  }
  if (visibility.showMessageId) {
    items.push(<Fragment key="id">{metadatum("message-metadata-id", message.id)}</Fragment>);
  }
  const genLabel = visibility.showGenerationTimer ? genDurationLabel(message.genStartedAt, message.genFinishedAt) : null;
  if (genLabel !== null) {
    items.push(<Fragment key="gen-duration">{metadatum("message-metadata-gen-duration", genLabel)}</Fragment>);
  }
  // Time to FIRST token, beside the duration and in the same `durationLabel` shape. It is the half
  // of the timer a reader actually feels (how long the reply sat blank), and it is recorded per variant.
  if (visibility.showGenerationTimer && message.ttftMs !== null) {
    items.push(<Fragment key="ttft">{metadatum("message-metadata-ttft", `${durationLabel(message.ttftMs)} to first token`)}</Fragment>);
  }
  // The on-demand settled-cost readout; the paid fetch fires only on the user's reveal click,
  // never here. The slot gate is the readout's OWN predicate rather than a second spelling of it: since
  // `generationId` became the provider's response id on every hosted wire (inference audit B7), the id's
  // presence no longer means "this swipe can be settled" and a row-side id check would push an item whose
  // child renders null — a `·` separator with nothing after it.
  if (visibility.showGenerationCost && canRevealGenerationCost(message)) {
    items.push(
      <Fragment key="gen-cost">
        <MessageCostReadout message={message} />
      </Fragment>,
    );
  }

  if (items.length === 0) {
    return null;
  }
  return (
    // Below the bubble in every skin, outside any fill, so over a wallpaper it takes the chrome plate.
    <Row gap="field" align="center" data-slot="message-metadata-row" plate="chrome" className="flex-wrap">
      {items.map((item, index) => (
        <Fragment key={item.key}>
          {index > 0 ? (
            <Text as="span" voice="gloss" aria-hidden="true">
              ·
            </Text>
          ) : null}
          {item}
        </Fragment>
      ))}
    </Row>
  );
}
