// The per-message METADATA row (WS3, D44 §12.1) — each datum gated by its OWN appearance toggle
// (`showModelIcon`/`showTokenCount`/`showMessageId`/`showGenerationTimer`/`showGenerationCost`) and
// rendered only when its datum is actually present on the `MessageView` (a draft/greeting row has null
// model/tokens/gen-window — no datum, no gap).
//
// D66 P5 (north-star ui-cohesion — quiet metadata): the old `@orb/ui/badge` pills (Clock/Cpu/Coins/Hash)
// are replaced by inline `--text-micro` `--font-mono` `--color-muted-foreground` text, `·`-separated —
// no pills, no leading glyphs. The TIMESTAMP moved OUT of this row up beside the speaker name in the
// name row (`MessageTimestamp`, rendered by `message-row.tsx`); the `data-slot="message-metadata-*"`
// values are preserved on the semantically-equivalent elements (rule 0.7), and the row still renders
// nothing when every gated datum is absent.
//
// PD-130 (generation timer): the turn engine writes `message_variants.gen_started_at`/`gen_finished_at`
// on the real turn path (live since eb5d6b3c) and the read seam surfaces them as `genStartedAt`/
// `genFinishedAt`. Its readout was already quiet micro-mono text (P5) — untouched here.

import type { MessageView } from "@orb/contracts/chat";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { Fragment } from "react";
import { timeLib } from "#lib";
import { genDurationLabel } from "../lib/gen-duration";
import { MessageCostReadout } from "./message-cost-readout";
import { MessageWireTrigger } from "./message-wire-trigger";

/** The metadata-datum subset of the appearance prefs (mirrors `useMessageAppearance`'s row-display
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
  /** RAWVIEW — the viewer holds the room HOST role (`ChatDetail.viewerIsHost`), the one datum here that is
   *  an AUTHORITY fact rather than an appearance preference (hence its own prop, not a `visibility` key).
   *  Gates the per-variant wire trigger: the read is `requireHost` server-side, so a member is never shown
   *  an affordance that would refuse — and never shown that the plane exists. Absent ⇒ NOT host (fail-closed:
   *  a caller that forgets to thread it hides the trigger rather than exposing it). */
  readonly viewerIsHost?: boolean | undefined;
}

/** The message timestamp as quiet inline micro-mono text (D66 P5) — rendered beside the speaker name in
 *  the name row, not in the metadata footer. Null when `showTimestamps` is off, so the name row shows
 *  nothing extra. Keeps the `message-metadata-timestamp` slot (rule 0.7). */
export function MessageTimestamp({ message, show }: { readonly message: MessageView; readonly show: boolean }): ReactElement | null {
  if (!show) {
    return null;
  }
  return (
    <Text as="span" voice="gloss" className="font-mono" data-slot="message-metadata-timestamp">
      {timeLib.formatTime(message.createdAt)}
    </Text>
  );
}

/** The token count shown per message — output tokens (the generated length, ST parity) falling back
 *  to input tokens when a variant has no output (never fabricates a sum that double-counts a resend). */
function tokenCount(message: MessageView): number | null {
  return message.tokensOut ?? message.tokensIn ?? null;
}

/** A quiet micro-mono-muted metadata datum (the P5 voice, replacing the old badge pill). The four-voice
 *  grammar name for that is `gloss` — the quiet second line — and the mono family is the P5 ruling this
 *  row keeps: these are machine facts about the row, never the reply you came to read (which is why they
 *  are NOT the `datum` voice, despite being numbers). */
function metadatum(slot: string, text: string): ReactElement {
  return (
    <Text as="span" voice="gloss" className="font-mono" data-slot={slot}>
      {text}
    </Text>
  );
}

/** The opt-in per-message metadata row. Renders nothing when every gated datum is absent (a draft
 *  greeting row, or every toggle off) — never an empty `<Row>` shell. Timestamps are handled by
 *  `MessageTimestamp` in the name row, not here. */
export function MessageMetadataRow({ message, visibility, viewerIsHost = false }: MessageMetadataRowProps): ReactElement | null {
  const tokens = tokenCount(message);
  const items: ReactElement[] = [];

  if (visibility.showModelIcon && message.model !== null) {
    items.push(<Fragment key="model">{metadatum("message-metadata-model", message.model)}</Fragment>);
  }
  if (visibility.showTokenCount && tokens !== null) {
    items.push(<Fragment key="tokens">{metadatum("message-metadata-tokens", `${tokens} tok`)}</Fragment>);
  }
  if (visibility.showMessageId) {
    items.push(<Fragment key="id">{metadatum("message-metadata-id", message.id)}</Fragment>);
  }
  const genLabel = visibility.showGenerationTimer ? genDurationLabel(message.genStartedAt, message.genFinishedAt) : null;
  if (genLabel !== null) {
    items.push(<Fragment key="gen-duration">{metadatum("message-metadata-gen-duration", genLabel)}</Fragment>);
  }
  // PD-137 — the on-demand settled-cost readout (renders its own null-guard for a non-OR row); the paid
  // fetch fires only on the user's reveal click, never here.
  if (visibility.showGenerationCost && message.generationId !== null) {
    items.push(
      <Fragment key="gen-cost">
        <MessageCostReadout message={message} />
      </Fragment>,
    );
  }

  // RAWVIEW — the HOST-only per-variant wire inspector. Gated on the host bit ONLY (not on an appearance
  // toggle): it is a diagnostic the room owner reaches for when a turn goes wrong, not a chip they curate.
  // Its query fires only on the click (the `MessageCostReadout` gate), so an unopened row costs nothing.
  if (viewerIsHost) {
    items.push(
      <Fragment key="wire">
        <MessageWireTrigger message={message} />
      </Fragment>,
    );
  }

  if (items.length === 0) {
    return null;
  }
  return (
    <Row gap="field" align="center" data-slot="message-metadata-row" className="flex-wrap">
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
