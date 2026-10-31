// The seal's OWNED inline code, the fifth owned element beside the lists and the thematic break. Streamdown lets a
// caller replace only the inline `code` through its `inlineCode` slot and leaves the fenced branch (highlighter,
// controls) untouched, so our classes are the only ones on the element and no uncompiled vendor utility
// (`rounded`, `px-1.5`, `py-0.5`, `text-sm`) reaches the DOM. Padding and size stay the seal root's
// descendant variants in `markdown.tsx`, in house tokens.
import type { ComponentPropsWithoutRef, ReactElement } from "react";
import type { StreamdownProps } from "streamdown";
import { cn } from "#lib";

/** react-markdown passes the source hast node alongside the DOM props; it is not a DOM attribute. */
type InlineCodeProps = ComponentPropsWithoutRef<"code"> & { readonly node?: unknown };

function InlineCode({ node: _node, className, ...rest }: InlineCodeProps): ReactElement {
  return <code className={cn("bg-muted font-mono", className)} data-streamdown="inline-code" {...rest} />;
}

/** The seal's always-on `components` override for inline code. A module-level constant: Streamdown's Block memo
 *  reference-compares the `components` map key by key, so a fresh object per render would re-render settled blocks. */
export const MARKDOWN_INLINE_CODE_COMPONENTS: NonNullable<StreamdownProps["components"]> = { inlineCode: InlineCode };
