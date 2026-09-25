// The Share card's sentences: the gloss voice at its readable prose step, capped at the prose measure so a wide
// pane never runs a security sentence across the whole screen.

import type { TextProps } from "@orb/ui/text";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

const PROSE_MEASURE = "max-w-(--reading-measure-prose)";

/** One explanatory sentence or short paragraph on the card. */
export function ShareProse(props: Pick<TextProps, "children" | "id" | "role">): ReactElement {
  return <Text voice="gloss" prose={true} className={PROSE_MEASURE} {...props} />;
}

/** The card's one warning: body size, capped at the same measure as the prose around it. */
export function ShareWarningText(props: Pick<TextProps, "children">): ReactElement {
  return <Text voice="reading" className={PROSE_MEASURE} {...props} />;
}
