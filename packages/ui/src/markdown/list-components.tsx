// The seal's OWNED list elements (#1085). Streamdown renders `ul`/`ol`/`li` with its own Tailwind
// utilities, and its dist is deliberately NOT a Tailwind source (markdown.tsx states the ruling: the
// vendor's raw spacing would fight `--reading-paragraph-spacing`), so those utilities generated
// NOTHING — and Tailwind's preflight zeroes list-style, margin and padding on `ul`/`ol`. Every rendered
// markdown list therefore painted as flat, unmarked, unindented text: a chat reply's bullets and its
// prose were the same rendering, on a surface whose whole voice system is typographic.
//
// WHY OWNING THE ELEMENT HERE, when the blockquote and the inline-code halves of the same family
// (#238/#490) were paid as descendant variants off the seal root instead: the reason those stayed the
// vendor's was that taking the code element over meant re-implementing its whole fenced-code branch
// (highlighter dispatch, diagrams, the control cluster) to own one inline span. A list element has NO
// vendor branch — it is one `jsx` call with a class string — so owning it is cheap AND total: our
// classes are the only ones on the element, which is the difference between a rule that merely
// out-paints the vendor's residue and one that leaves NO uncompiled class in the DOM for the dead-class
// flagger (and the reader) to trip over. Nothing here reaches for the vendor dist as a Tailwind source;
// that ruling is untouched.
//
// The values are house SPACING TOKENS, never the vendor's raw rems, for the same reason as #238: the
// dist stays unscanned precisely so its scale cannot leak in.
import type { ComponentPropsWithoutRef, ReactElement } from "react";
import type { StreamdownProps } from "streamdown";
import { cn } from "#lib";

/** react-markdown passes the source hast node alongside the DOM props; it is not a DOM attribute. */
type ListProps<T extends "ul" | "ol" | "li"> = ComponentPropsWithoutRef<T> & { readonly node?: unknown };

// The shared list box. `list-outside` is a DESIGN call, not the vendor's: a marker inside the content
// box pushes the item's first line right and lets wrapped lines run back under the bullet, which reads
// as broken prose in a reading column — outside gives the hanging indent every reading surface wants,
// and the box's own left padding is what keeps that marker inside the bubble instead of clipped by it.
// That padding is the SECTION step (1.5rem) rather than the smaller block step, and the difference is a
// RANGE property, not taste: an outside marker is drawn in the padding, and a two-digit ordered marker
// ("10.") is ~1.3× the prose font — at the block step it would spill past the list's own left edge on
// any list that reaches ten items. The step is rem-backed, so it scales with a reader's type.
// The vertical separation is PADDING, not a margin: the seal root's own spacing trim out-specifies any
// sibling margin a descendant could set (the #238 mechanism). A list NESTED inside an item drops that
// separation — the parent item's own rhythm already spaces it, and paying twice reads as a gap.
const LIST_BOX = "list-outside py-row pl-section [li_&]:py-0";

function UnorderedList({ node: _node, className, ...rest }: ListProps<"ul">): ReactElement {
  return <ul className={cn(LIST_BOX, "list-disc", className)} data-streamdown="unordered-list" {...rest} />;
}

function OrderedList({ node: _node, className, ...rest }: ListProps<"ol">): ReactElement {
  return <ol className={cn(LIST_BOX, "list-decimal", className)} data-streamdown="ordered-list" {...rest} />;
}

// Inter-item rhythm, the tight step — a list is denser than the paragraph flow around it, and this is
// the same token the seal's inline code already pays for its vertical padding.
function ListItem({ node: _node, className, ...rest }: ListProps<"li">): ReactElement {
  return <li className={cn("py-tight", className)} data-streamdown="list-item" {...rest} />;
}

/** The seal's always-on `components` override for the three list elements. A module-level constant, and
 *  that is load-bearing: Streamdown's Block memo reference-compares the `components` map key by key, so
 *  a fresh object per render would re-render every settled block on every commit. */
export const MARKDOWN_LIST_COMPONENTS: NonNullable<StreamdownProps["components"]> = { ul: UnorderedList, ol: OrderedList, li: ListItem };
