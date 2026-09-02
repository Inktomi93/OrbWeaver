// The seal's OWNED thematic break (side-eye HOME 2026-09-02 H19) — the FOURTH case of the family
// `markdown.tsx` states in full (#238 blockquote · #490 inline code · #1085 lists), and the same arm
// #1085 took, for the same two reasons.
//
// THE DEFECT, measured live: a message containing `---` rendered
// `[css] dead class — no rule defines it, so the style never applied · .my-6` in the chat transcript.
// Streamdown's own `MarkdownHr` is `jsx("hr", { className: cn("my-6 border-border", className) })`, and
// its dist is deliberately NOT a Tailwind source (markdown.tsx states that ruling: the vendor's raw
// spacing scale would fight `--reading-paragraph-spacing`, which OWNS prose spacing on this surface), so
// `my-6` generated nothing — and Tailwind's preflight zeroes margins. The rule therefore painted flush
// against the prose on either side of it, which is the one thing a thematic break exists not to do.
//
// WHY OWNING THE ELEMENT rather than out-painting it from the seal root, and why that is not a reversal:
// the reason #238/#490 stayed descendant variants was that taking the CODE element over meant
// re-implementing its whole fenced branch (highlighter dispatch, mermaid, the control cluster) to own one
// inline span. An `hr` has NO vendor branch — it is one `jsx` call with a class string — so owning it is
// cheap AND total: our classes are the only ones on the element, so the dead class leaves the DOM instead
// of merely being out-painted, which is the difference the flagger (and the reader) can see. The
// unscanned-dist ruling is untouched: the value below is a house SPACING TOKEN, never the vendor's rem.
//
// THE SEPARATION IS A MARGIN HERE, and that is the one place this diverges from #238's "padding, not
// margin" note — deliberately, because the reason behind that note does not reach a rule. Padding on an
// `hr` cannot centre it: preflight draws the line as the element's BORDER-TOP, so padding puts the whole
// gap on one side of it. `mx`-free `my-*` is the only symmetric spelling, and it is applied through the
// seal root's descendant variant (markdown.tsx) rather than as a utility on this element, because the
// root's own spacing trim (`space-y-0`, the compiled replacement for the vendor's 1rem block gap) governs
// every direct child's block margins and would otherwise decide this one. Pinned by rendered GEOMETRY in
// tests/ui/markdown/markdown.ct.tsx, never by class string.
import type { ComponentPropsWithoutRef, ReactElement } from "react";
import type { StreamdownProps } from "streamdown";
import { cn } from "#lib";

/** react-markdown passes the source hast node alongside the DOM props; it is not a DOM attribute. */
type RuleProps = ComponentPropsWithoutRef<"hr"> & { readonly node?: unknown };

function ThematicBreak({ node: _node, className, ...rest }: RuleProps): ReactElement {
  return <hr className={cn("border-border", className)} data-streamdown="horizontal-rule" {...rest} />;
}

/** The seal's always-on `components` override for the thematic break. A module-level constant, and that
 *  is load-bearing: Streamdown's Block memo reference-compares the `components` map key by key, so a fresh
 *  object per render would re-render every settled block on every commit. */
export const MARKDOWN_RULE_COMPONENTS: NonNullable<StreamdownProps["components"]> = { hr: ThematicBreak };
