// The TALKATIVENESS dial — one spelling of one datum, for the two surfaces that render it (tier 4, the
// `message-role-labels` class of display seam). A saved ROSTER and the room it came from show the SAME seat
// knob, and until this file existed they spelled it two ways: the room's Members tab said "Talks 50" with
// an accessible name of "talks at level 50 of 100", while the roster editor printed a bare `0.5` with no
// label at all (side-eye 2026-08-29 P2-5). One concept, two scales, two vocabularies — a user cannot map
// `0.5` onto "level 50 of 100" without being told, and nothing told them.
//
// It lives HERE and not in either feature because a feature may never import another feature
// (`client-features-no-cross`), and the ROOM is where the value is edited while the SAVED ROSTER only displays it.
//
// THE NUMBER IS A RELATIVE WEIGHT, AND IT MUST NOT WEAR A PERCENT SIGN (#490). `talkativeness` feeds
// `selectSpeakers`' weighted sample — a relative weight over the eligible pool, not a probability and not a
// share of the room. Rendered as "Talks 50%" it read as a share, so a three-character room showed 50% ·
// 50% · 50% and invited arithmetic that sums to 150 and means nothing. The dial keeps its familiar 0–100
// domain (it IS the slider's own position) and loses the sign.

/** Display factor for the 0–1 weight — the slider's position on a 0–100 dial, NOT a percentage. Deliberately
 *  module-private: both readings of the dial are functions here, so no consumer multiplies it themselves. */
const DIAL_SCALE = 100;

/** The weight as the dial reads it: an integer 0–100. */
export function talkativenessLevel(weight: number): number {
  return Math.round(weight * DIAL_SCALE);
}

/** The unit spelled out for a control's accessible name (WCAG 2.5.3 Label in Name: the visible chip reads
 *  "Talks 50", so "talks" has to be IN the name). The stable identity leads so a role+name lookup on the
 *  prefix survives every value change. */
export function talkativenessAccessibleName(who: string, weight: number): string {
  return `Talkativeness: ${who} — talks at level ${talkativenessLevel(weight)} of ${DIAL_SCALE}`;
}
