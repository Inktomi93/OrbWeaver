// The COUNTER a character-capped text field owes its author, in one home so the surfaces that carry a cap
// cannot draw it three different ways (the prose settings cards, the preset template drill-in, the
// format-string rows — three editors, one grammar). The threshold + the geometry ceiling live beside it in
// `capped-field-model.ts` (a JSX module exports components only).
//
// WHY A SHARED HOME AND NOT THREE LOCAL SPELLINGS: the cap's whole job is to stop text from being written
// that the wire will destroy, and it only does that job if the author can SEE it coming and SEE it bite. The
// counter was hand-rolled twice already and the two copies had drifted into disagreeing about tone (both
// stayed muted grey while sitting beside their own red refusal — side-eye PROSE-LIMIT P3).

import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { DEFAULT_COUNTER_AT, showsCappedFieldCounter } from "../capped-field-model.ts";

export interface CappedFieldCounterProps {
  /** The RAW field length — the counter mirrors what the box holds, keystroke for keystroke (a save-time
   *  trim is the save's business; an author watching a number must see it move on every keystroke). */
  readonly length: number;
  /** The cap, from the contract that enforces it — never a re-spelled literal. */
  readonly max: number;
  /** The fraction of `max` at which the counter appears. @defaultValue 0.8 */
  readonly counterAt?: number;
}

/** The quiet near-cap character counter — nothing until `counterAt` of the cap, then a live `n/max`, and
 *  DANGER-TONED once it is past it. The over arm matters because the only way to be over a native
 *  `maxLength` is text that arrived that way (an import, an older blob), i.e. exactly the state whose save is
 *  being refused: the number is part of the refusal, so it may not read as quiet chrome beside it. */
export function CappedFieldCounter({ length, max, counterAt = DEFAULT_COUNTER_AT }: CappedFieldCounterProps): ReactElement | null {
  if (!showsCappedFieldCounter(length, max, counterAt)) {
    return null;
  }
  const over = length > max;
  return (
    <Text className={over ? "tabular-nums text-destructive" : "tabular-nums"} voice="gloss">
      {length}/{max}
    </Text>
  );
}
