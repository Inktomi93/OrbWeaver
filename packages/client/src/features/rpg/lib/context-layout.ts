// The rpg context pane's layout constants, read by the panel state hook and by the Waystone budget test.

/** THE TYPE SCALE AT WHICH THE ORBS LEAVE THE BAND (#878 F7, owner-ruled 2026-08-30).
 *
 *  MEASURED at the `reading` appearance preset, 1280×800, the game room: band 299 + rails 256 = 555 of the
 *  pane's 740px, leaving the viewport 184px — 24.9%, against the ≥40% the review asked for. The band is
 *  where the budget goes, and the satellite row is the one part of it that is a GLANCE rather than the
 *  artifact's identity — so at a large type scale it moves into the tab body and scrolls with the content
 *  instead of standing permanently over it. The Waystone (dial · sky · weather · the when-line · the cues)
 *  stays in the band, untouched, per the same ruling.
 *
 *  KEYED ON `fontScale`, WHICH IS THE CAUSE, NOT ON A MEASUREMENT OF THE BAND. A measured "is the band too
 *  tall" condition would be circular — moving the row shrinks the band, which un-trips the condition, which
 *  moves it back — and a layout oscillation is a worse defect than the one being fixed. `fontScale` is a
 *  user knob that does not depend on the band's own layout, and it is what the `reading` preset moves
 *  (1.25, the only preset that touches it; the schema's range is 0.8-1.5, default 1). So the rule states
 *  itself honestly: at a large type scale, the pane spends its height on the reading, not on the glance. */
export const SATELLITES_TO_BODY_FONT_SCALE = 1.25;
