// Tide's bubble train for one settled reply. The display pass, the plugin seam and the speaker split run ONCE over the
// whole reply (`useDrawnMessage`), and the train cuts what they drew at its paragraph breaks (`trainParagraphs`), so a
// display script whose match spans a blank line still matches, and a speaker's span runs on across the bubbles it
// covers.
//
// ONE BUBBLE WHEN THE REPLY IS ONE UNIT. A reply the frame draws (D354) is one bubble, because its frame runs share one
// cascade and a cut would split a panel from the stylesheet it carries. A reply whose scripts have not answered is one
// bubble too, laid out and hidden like every other skin's body: its paragraphs are the unscripted text's, and drawing
// them as pills would flash boxes the answer then reshapes. A styled reply on the inert path trains, and each unit
// the paragraph reader keeps whole (a stylesheet, an HTML block, a card, a code block) stays in one bubble.
//
// The display queue observes the whole train, the one body on screen or not.

import type { MessageView } from "@orb/contracts/chat";
import type { SpeakerSpan } from "@orb/kit/speaker-label";
import { Stack } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { RowTrustScope } from "#components";
import type { DrawnMessage, MessageDrawProps } from "../hooks/use-drawn-message.ts";
import { drawnLayout, useDrawnMessage } from "../hooks/use-drawn-message.ts";
import { bodyDisplayRow } from "../lib/display-row.ts";
import type { MessageBoxFacts } from "../lib/message-box-facts.ts";
import { trainParagraphs } from "../lib/split-paragraphs.ts";
import { MessageBox } from "./message-box.tsx";
import { MessageBody, RowNotices } from "./message-content.tsx";

export interface MessageTrainProps extends Omit<MessageDrawProps, "display" | "cardOrigin" | "pluginDisplayRow" | "displayOrder"> {
  readonly message: MessageView;
  /** The row's display depth (`displayDepthsOf`). */
  readonly displayDepth: number | undefined;
  readonly facts: MessageBoxFacts;
  readonly header: ReactNode;
  readonly reasoning: ReactNode;
}

// The spans of `spans` that fall in `[start, end)` of the text they were parsed from, cut to it.
function spansWithin(spans: readonly SpeakerSpan[], start: number, end: number): readonly SpeakerSpan[] {
  return spans.flatMap((span) => {
    const from = Math.max(start, span.start);
    const to = Math.min(end, span.start + span.text.length);
    return from < to ? [{ speaker: span.speaker, text: span.text.slice(from - span.start, to - span.start), start: from }] : [];
  });
}

// The bodies the train draws, one per bubble: the whole reply when it is one unit, else one per paragraph that holds
// any span text. A `<speaker>` tag alone in a paragraph is markup with no text of its own, so it makes no bubble.
function trainBodies(drawn: Omit<DrawnMessage, "observeBody">, framed: boolean): readonly DrawnMessage[] {
  const ranges = drawn.pending || framed ? null : trainParagraphs(drawn.text);
  if (ranges === null) {
    return [{ ...drawn, observeBody: undefined }];
  }
  return ranges.flatMap(({ start, end }) => {
    const spans = spansWithin(drawn.spans, start, end);
    return spans.some((span) => span.text.trim() !== "") ? [{ ...drawn, spans, observeBody: undefined }] : [];
  });
}

export function MessageTrain({ message, displayDepth, facts, header, reasoning, ...draw }: MessageTrainProps): ReactElement {
  const props: MessageDrawProps = {
    ...draw,
    display: bodyDisplayRow(message, displayDepth),
    cardOrigin: { chatId: message.chatId, characterId: message.characterId },
    pluginDisplayRow: { chatId: message.chatId, messageId: message.id },
    displayOrder: message.seq,
  };
  // The body observer is a ref callback, so it is read out once and only handed to the train's own `ref`.
  const { observeBody, ...drawn } = useDrawnMessage(message.content, props);
  const layout = drawnLayout(drawn, props);
  const framed = layout?.kind === "framed";
  const bubbles = trainBodies(drawn, framed).map((body, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: ordinal paragraphs belong to the keyed immutable message snapshot; replacement expires descendant state.
    <MessageBox key={index} {...facts} shape="stack" positioned={false}>
      <MessageBody drawn={body} layout={framed ? layout : undefined} notices={false} {...props} />
    </MessageBox>
  ));
  return (
    // A train has no single container, so an `inside` header would have nowhere to be inside — `tide` is declared
    // `outside` for exactly that reason and never reaches this with a header. Rendering it at the head of the stack
    // anyway keeps the slot TOTAL: a future trains skin that chose `inside` would paint a header above its pills,
    // never silently drop the speaker.
    // A reply too heavy to frame trains on the plain path, and the train says why for the notice that names it.
    <Stack gap="field" data-slot="message-bubble-train" data-plain-reason={layout?.kind === "plain" ? layout.reason : undefined} ref={observeBody}>
      {header}
      {reasoning}
      {/* The bubbles' frames report to the row's one trust notice. */}
      <RowTrustScope>
        {bubbles}
        <RowNotices drawn={drawn} layout={layout} render={props.render} />
      </RowTrustScope>
    </Stack>
  );
}
