// The elements a frame document draws as their own tags. Streamdown swaps two raw HTML elements for its own
// renderings: `strong` becomes a `span`, and `img` becomes a wrapper with a fallback and an overlay. A display
// script's stylesheet selects the tags it wrote (`.hud strong`, `.card > img`), so inside a frame each keeps its
// tag and its attributes; `strong` keeps the seal's weight class beside them. The seal's own `font` swap is undone
// here for the same reason.
import type { ComponentPropsWithoutRef, ReactElement } from "react";
import { createElement } from "react";
import type { StreamdownProps } from "streamdown";
import { cn } from "#lib";

/** react-markdown passes the source hast node alongside the DOM props; it is not a DOM attribute. */
type WithNode<Tag extends "strong" | "img"> = ComponentPropsWithoutRef<Tag> & { readonly node?: unknown };

function FrameStrong({ node: _node, className, ...rest }: WithNode<"strong">): ReactElement {
  return <strong className={cn("font-semibold", className)} {...rest} />;
}

function FrameImage({ node: _node, alt, ...rest }: WithNode<"img">): ReactElement {
  return <img alt={alt ?? ""} {...rest} />;
}

// The seal draws a colour `font` as a span in the main document; a frame document keeps the tag a script may select.
function FrameFont({ node: _node, ...rest }: Readonly<Record<string, unknown>>): ReactElement {
  return createElement("font", rest);
}

/** The frame document's element overrides, merged over the seal's. A module-level constant for the reason the
 *  seal's maps are: Streamdown's Block memo compares the map key by key. */
export const FRAME_ELEMENT_COMPONENTS: NonNullable<StreamdownProps["components"]> = { strong: FrameStrong, img: FrameImage, font: FrameFont };
