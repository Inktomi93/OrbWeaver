// The seal's OWNED blockquote, taken the way `rule-component.tsx` took the thematic break. Streamdown's own
// blockquote is one `jsx` call with a class string (`my-4 border-l-4 pl-4 …`) whose vendor dist is not a Tailwind
// source, so its margin, border and padding compiled to nothing and showed as dead classes on every quote.
// The ink and the rule are house tokens here, so the element carries only classes a stylesheet defines. The
// separation is padding, not a margin: the seal root's `space-y-0` trim out-specifies a margin on a direct child.
import type { ComponentPropsWithoutRef, ReactElement } from "react";
import type { StreamdownProps } from "streamdown";
import { cn } from "#lib";

/** react-markdown passes the source hast node alongside the DOM props; it is not a DOM attribute. */
type BlockquoteProps = ComponentPropsWithoutRef<"blockquote"> & { readonly node?: unknown };

function Blockquote({ node: _node, className, ...rest }: BlockquoteProps): ReactElement {
  return (
    <blockquote
      className={cn("border-s-heavy border-muted-foreground py-row ps-block text-muted-foreground italic", className)}
      data-streamdown="blockquote"
      {...rest}
    />
  );
}

/** The seal's always-on `components` override for the blockquote. A module-level constant: Streamdown's Block memo
 *  reference-compares the `components` map key by key, so a fresh object per render would re-render settled blocks. */
export const MARKDOWN_BLOCKQUOTE_COMPONENTS: NonNullable<StreamdownProps["components"]> = { blockquote: Blockquote };
