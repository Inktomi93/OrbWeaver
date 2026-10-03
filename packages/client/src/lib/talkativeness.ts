// The TALKATIVENESS readout — one spelling of one datum, for the two surfaces that render it (tier 4, the
// `message-role-labels` class of display seam). A saved ROSTER and the room it came from show the SAME seat
// knob, and before this file they spelled it two ways (a labeled dial in the room, a bare `0.5` in the roster
// editor). It lives HERE because a feature may never import another feature (`client-features-no-cross`),
// and the ROOM edits the value while the SAVED ROSTER only displays it.
//
// THE NUMBER IS A PERCENT. `talkativeness` is each character's own chance to reply unprompted in a `natural`
// round (`selectSpeakers` rolls it per character), so "50%" is literally what happens. This supersedes the
// earlier no-percent-sign ruling (#490), made while the value was a relative sampling weight and a percent
// read as a share of the room. Every percent here says what it is a chance OF, so three characters at 50%
// read as three independent chances, never as a total.

const PERCENT = 100;

/** The weight as a percent: "50%". */
export function talkativenessPercent(weight: number): string {
  return `${Math.round(weight * PERCENT)}%`;
}

/** The full readout: "50% chance to reply unprompted". */
export function talkativenessReadout(weight: number): string {
  return `${talkativenessPercent(weight)} chance to reply unprompted`;
}

/** The chip's accessible name (WCAG 2.5.3 Label in Name: the visible chip reads "Talks 50%", so "talks 50%"
 *  is IN the name). The stable identity leads so a role+name lookup on the prefix survives every value change. */
export function talkativenessAccessibleName(who: string, weight: number): string {
  return `Talkativeness: ${who} — talks ${talkativenessReadout(weight)}`;
}
