// A `<font color>` dialogue line drawn as a `span` carrying only its colour.
//
// THE COLOUR IS CHECKED HERE, NOT ONLY IN THE SANITIZER: Streamdown's schema admits `color` on every element through
// its `*` attributes, and an attribute a tag's own rule refuses falls back to that one. So the sanitizer keeps any
// `color` value on `font`, and this is the step that turns it into a style, under `FONT_COLOUR_RE` alone.
import type { ReactElement, ReactNode } from "react";
import type { StreamdownProps } from "streamdown";
import { FONT_COLOUR_RE } from "./policy.ts";

function ColourFont({ color, children }: Readonly<Record<string, unknown>> & { readonly children?: ReactNode }): ReactElement {
  return <span style={typeof color === "string" && FONT_COLOUR_RE.test(color) ? { color } : undefined}>{children}</span>;
}

/** The seal's `font` element. A module-level constant: Streamdown's Block memo compares the map key by key. */
export const MARKDOWN_COLOUR_FONT_COMPONENTS: NonNullable<StreamdownProps["components"]> = { font: ColourFont };
