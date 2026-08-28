// The composer's ARG-hint strip (#791) — the typed-arg half of the slash affordance. While the person is typing
// `/<id> <args…>` for a command that declared a typed-arg grammar (today: `/plugin <slug> <cmd> name=value`), this
// shows the declared args as hints and, when mid-typing an enum value, its accepted values — click to complete.
// It renders IN FLOW below the token strip (the `ComposerSlashStrip` precedent) and the two are mutually
// exclusive by construction: the token strip shows only while the command token is unfinished (no space), this
// only once the draft has moved into arguments.
//
// It is a click-to-complete strip (no keyboard type-ahead yet — that would extend the composer's combobox key
// handling, tracked as a follow-up). An OFFER's pick replaces the draft with the completer-reconstructed line, so
// the composer stays a dumb `/<id> <insert>` setter.

import type { OptionStripItem } from "@orb/ui/option-strip";
import { OptionStrip } from "@orb/ui/option-strip";
import type { ReactElement } from "react";
import type { SlashArgOffer } from "#lib";
import { CHAT_TRACK } from "../lib/chat-track.ts";

/** The listbox id the arg strip carries — distinct from the token strip's, so the two never collide. */
export const SLASH_ARG_LISTBOX_ID = "composer-slash-arg-listbox";

export interface ComposerArgHintStripProps {
  /** The command's arg offers for the current partial args (arg-name hints, or enum values). Empty ⇒ nothing. */
  readonly offers: readonly SlashArgOffer[];
  /** Complete the draft to this offer (the composer sets `/<id> <offer.insert>` and returns focus). */
  readonly onPick: (offer: SlashArgOffer) => void;
}

export function ComposerArgHintStrip({ offers, onPick }: ComposerArgHintStripProps): ReactElement | null {
  if (offers.length === 0) {
    return null;
  }
  const items: readonly OptionStripItem[] = offers.map((offer) => ({
    id: `composer-arg-option-${offer.id}`,
    label: offer.label,
    description: offer.describe,
  }));
  const pick = (item: OptionStripItem): void => {
    const offer = offers.find((candidate) => `composer-arg-option-${candidate.id}` === item.id);
    if (offer !== undefined) {
      onPick(offer);
    }
  };
  return <OptionStrip aria-label="Command arguments" className={CHAT_TRACK} id={SLASH_ARG_LISTBOX_ID} items={items} onSelect={pick} />;
}
