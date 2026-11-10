/** A RECEDED ELEMENT: the whole box at the `opacity.receded` step, for the `receded` prop on Text, Icon, Row, Stack and
 *  ListRow. It dims ink, fill and glyphs together, which is why it is one prop and not a muted colour per part. */
export const RECEDED = "opacity-receded";

/** A MUTED SEAT: the `opacity.muted-seat` step, for `Row`'s `receded="mutedSeat"`. Receded, but held high enough that the
 *  seat's initials (text on a pigment tile) keep the 4.5:1 text floor the receded step dims them below. */
export const RECEDED_MUTED_SEAT = "opacity-muted-seat";
