// The Share card's sentences: the gloss voice at its readable prose step, capped at the prose measure so a wide
// pane never runs a security sentence across the whole screen. A server refusal can carry an unbroken URL, so a
// sentence may wrap inside a word rather than push past the card's edge.

import { Kbd } from "@orb/ui/kbd";
import type { TextProps } from "@orb/ui/text";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

const PROSE_MEASURE = "max-w-(--reading-measure-prose) wrap-anywhere";

/** One explanatory sentence or short paragraph on the card. */
export function ShareProse(props: Pick<TextProps, "children" | "id" | "role">): ReactElement {
  return <Text voice="gloss" prose={true} className={PROSE_MEASURE} {...props} />;
}

/** The card's warnings and the lead line of a notice: body size, capped at the same measure as the prose. */
export function ShareWarningText(props: Pick<TextProps, "children" | "role">): ReactElement {
  return <Text voice="reading" className={PROSE_MEASURE} {...props} />;
}

/** A command, key or file named inside a sentence: code, in the type of the copyable command chips beside it. */
export function ShareCode({ children }: { readonly children: string }): ReactElement {
  return <Kbd size="command">{children}</Kbd>;
}
