// The per-message METADATA row (WS3, D44 §12.1) — each datum gated by its OWN appearance toggle
// (`showTokenCount`/`showMessageId`/`showGenerationTimer`/`showGenerationCost`) and rendered only when its
// datum is actually present on the `MessageView` (a draft/greeting row has null tokens/gen-window — no
// datum, no gap).
//
// THE MODEL CREDIT IS NOT HERE ANY MORE (#167, owner ruling 2026-08-18). `showModelIcon` still gates it,
// but it prints in the row's REVEAL cluster (`MessageActionsRow`) through `@orb/kit/model-name` — an
// attribution about the reply, revealed on hover/focus, instead of a raw 106-character weights path parked
// under every message at 1.59:1 over background art. The `MessageMetadataVisibility` shape keeps the flag
// (it is the appearance section's own key set); this row simply no longer reads it.
//
// D66 P5 (north-star ui-cohesion — quiet metadata): the old `@orb/ui/badge` pills (Clock/Cpu/Coins/Hash)
// are replaced by inline `--text-micro` `--font-mono` `--color-muted-foreground` text, `·`-separated —
// no pills, no leading glyphs. The TIMESTAMP moved OUT of this row up beside the speaker name in the
// name row (`MessageTimestamp`, rendered by `message-row.tsx`); the `data-slot="message-metadata-*"`
// values are preserved on the semantically-equivalent elements (rule 0.7), and the row still renders
// nothing when every gated datum is absent.
//
// THIS ROW IS DATA ONLY — it holds no ACTIONS (WIREBTN, owner nit 2026-08-03). RAWVIEW originally grafted
// the host-only wire-trace trigger here (it was the only per-VARIANT surface that existed), which left a lone
// button sitting under every message. Its home is the message kebab with the other row actions (D62 §12: the
// ⋯ menu IS the action home), so `MessageActionsRow` owns the item, the host gate, and the dialog now. If a
// future datum needs the `viewerIsHost` bit, it comes back as its own prop — the AUTHORITY-vs-appearance
// distinction that prop encoded was real; it just wasn't an argument for keeping an action in a data row.
//
// PD-130 (generation timer): the turn engine writes `message_variants.gen_started_at`/`gen_finished_at`
// on the real turn path (live since eb5d6b3c) and the read seam surfaces them as `genStartedAt`/
// `genFinishedAt`. Its readout was already quiet micro-mono text — untouched here.
//
// #1032 (the viewgap WIRE batch) — THREE MORE READS, ON THE EXISTING TOGGLES, NO NEW APPEARANCE KEY.
// `MessageView` served `cacheReadTokens`/`cacheWriteTokens`/`ttftMs`/`finishReason`/`stopReason`/
// `terminalReason`/`editedAt` and no client file spelled any of them. Each new datum joins the toggle whose
// SUBJECT it already shares rather than minting a seventh appearance key (a new key is ten coupled sites
// across the settings section, the carrier manifest and the registry — it is a settings change, not a wire
// change, and this row is not the place to spend one):
//   · CACHE ECONOMICS → `showTokenCount`. It is the number that explains the token number beside it.
//   · TIME-TO-FIRST-TOKEN → `showGenerationTimer`. Same subject as the duration, same `durationLabel` shape.
//   · The EDITED marker → `showTimestamps`, in the NAME ROW beside the timestamp ({@link MessageTimestamp}) —
//     it is a fact about WHEN this text became what it is.
// The outcome notice ("cut off — length cap") was KILLED (#1876, owner ruling): the badge caused confusion
// (not role-gated, an edit triggered it, unreadable on some themes). The `messageOutcomeNotice` export and
// its types were removed from `message-readout.ts` in the same commit.
//
// EVERYTHING HERE STAYS OFF THE PROSE BLOCK (the reading-surface law). These are chrome data in the metadata
// footer and the name row; not one of them touches the message body.

import type { MessageView } from "@orb/contracts/chat";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { Fragment } from "react";
import { cn, timeLib } from "#lib";
import { durationLabel, genDurationLabel } from "../lib/gen-duration.ts";
import { cacheTokensLabel, canRevealGenerationCost } from "../lib/message-readout.ts";
import { MessageCostReadout } from "./message-cost-readout.tsx";

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
  /** #106 — the wallpaper legibility backing the ROW owns (`BG_PHOTO_CHROME_PLATE`), threaded rather
   *  than imported here so the one home for the row's backings stays `message-row-backing.ts` and this
   *  component keeps knowing nothing about the shell's wallpaper flag. */
  readonly backingClass?: string | undefined;
}

/** The message timestamp as quiet inline micro-mono text (D66 P5) — rendered beside the speaker name in
 *  the name row, not in the metadata footer. Null when `showTimestamps` is off, so the name row shows
 *  nothing extra. Keeps the `message-metadata-timestamp` slot (rule 0.7). */
export function MessageTimestamp({ message, show }: { readonly message: MessageView; readonly show: boolean }): ReactElement | null {
  if (!show) {
    return null;
  }
  return (
    <>
      <Text as="span" voice="gloss" className="font-mono" data-slot="message-metadata-timestamp">
        {timeLib.formatTime(message.createdAt)}
      </Text>
      {/* #1032 — the EDITED marker. `editedAt` was stamped by the edit verb and read by nobody, so a
          rewritten reply was indistinguishable from the one the model actually produced. The word is the
          load-bearing part; the exact edit time rides the `title` as detail. */}
      {message.editedAt === null ? null : (
        <Text as="span" voice="gloss" data-slot="message-metadata-edited" title={`Edited at ${timeLib.formatTime(message.editedAt)}`}>
          edited
        </Text>
      )}
    </>
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
function metadatum(slot: string, text: string, title?: string): ReactElement {
  return (
    <Text as="span" voice="gloss" className="font-mono" data-slot={slot} {...(title === undefined ? {} : { title })}>
      {text}
    </Text>
  );
}

/** The opt-in per-message metadata row. Renders nothing when every gated datum is absent (a draft
 *  greeting row, or every toggle off) — never an empty `<Row>` shell. Timestamps are handled by
 *  `MessageTimestamp` in the name row, not here. */
export function MessageMetadataRow({ message, visibility, backingClass }: MessageMetadataRowProps): ReactElement | null {
  const tokens = tokenCount(message);
  const items: ReactElement[] = [];

  if (visibility.showTokenCount && tokens !== null && message.tokenProvenance !== "unrecorded") {
    const prefix = message.tokenProvenance === "estimated" ? "~" : "";
    items.push(<Fragment key="tokens">{metadatum("message-metadata-tokens", `${prefix}${tokens} tok`)}</Fragment>);
  }
  // #1032 — cache economics ride the TOKEN toggle (they are what explains the token number) and gate
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
  // #1032 — time to FIRST token, beside the duration and in the same `durationLabel` shape. It is the half
  // of the timer a reader actually feels (how long the reply sat blank), and it is recorded per variant.
  if (visibility.showGenerationTimer && message.ttftMs !== null) {
    items.push(<Fragment key="ttft">{metadatum("message-metadata-ttft", `${durationLabel(message.ttftMs)} to first token`)}</Fragment>);
  }
  // PD-137 — the on-demand settled-cost readout; the paid fetch fires only on the user's reveal click,
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
    <Row gap="field" align="center" data-slot="message-metadata-row" className={cn("flex-wrap", backingClass)}>
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
