import type { ComponentProps, ReactElement, ReactNode } from "react";
import { HintTrigger } from "#primitives/hint-trigger";
import { Separator } from "#primitives/separator";
import { Heading } from "#primitives/text";
import { sectionVariants } from "./variants.ts";

const HEADING_TAGS = { 2: "h2", 3: "h3", 4: "h4" } as const;
type SectionLevel = keyof typeof HEADING_TAGS;

export interface SectionProps extends ComponentProps<"section"> {
  heading?: ReactNode;
  /**
   * The INSTRUMENT-tier form of `heading` (UI-Density-Law.md §2.3/§4.3): the section's name in the
   * `kicker` voice — micro caps, muted — followed by a hairline rule to the edge. This is what a read-only
   * grouping gets INSTEAD of a border+radius+bg box (chrome diet CD1). Still a real `<h3>`, so the document
   * outline survives. Wins over `heading` if both are passed (they are two skins of one slot).
   */
  kicker?: ReactNode;
  /**
   * How the `kicker` grouping is SPELLED. @defaultValue "stacked"
   *
   * `stacked` — the kicker on its own line, a hairline rule running to the edge beside it. The literal
   * CD1 reading, and the right one wherever the group is a block of rows.
   *
   * `inline` — the rule becomes this section's own top edge and the kicker LEADS the group's first (and
   * usually only) control line. Same two marks, ~17px per group cheaper; for a dense chrome rail where
   * the group is one wrapping line of controls and a stacked kicker would spend a chip row on saying so
   * (the characters pane's View/Filters rail, program #102 variant B). Ignored without `kicker`.
   */
  kickerLayout?: "stacked" | "inline";
  /** Render a hairline under the heading (UIP-404 settings panes). @defaultValue false */
  divider?: boolean;
  /** Short explainer surfaced as an info-icon hover tooltip beside the heading (the Field `hint` idiom,
   *  no vertical-space cost) — for the insider terms a section's rows can't self-explain. */
  hint?: ReactNode;
  /**
   * The heading's RANK, in either arm. @defaultValue 3
   *
   * h3 is right for the common case and stated below: a Section is normally a SUB-grouping of a surface
   * that already spent an h2 (a dialog title, a settings pane). It is WRONG where the Section IS a
   * top-level block of the page — home's "Not yet" band sits beside six h2 blocks and rendered h3, so the
   * outline stepped down a level for two of its seven peer blocks and they announced as children of
   * nothing (side-eye 2026-08-16 F6). h4 is a Section nested inside another Section's body. The skin does not
   * move with the rank: hierarchy is carried by the element, never by a size step.
   */
  level?: SectionLevel;
}

/**
 * Block-spacing wrapper with an optional heading slot (ui-package-design §6.1).
 *
 * Usage: `<Section heading="Sampling">…fields…</Section>` · `<Section heading="Effects" divider>…`.
 */
export function Section({
  className,
  heading,
  kicker,
  kickerLayout = "stacked",
  divider = false,
  hint,
  level = 3,
  children,
  ...props
}: SectionProps): ReactElement {
  const slots = sectionVariants({ divider, kickerLayout });
  const hasHint = hint !== undefined && hint !== null;
  // h3 by default, not h2: a Section is normally a SUB-heading of its hosting surface (a dialog's Title and a
  // drawer's Title render h2), so h2 here flattened e.g. the settings modal's whole hierarchy to one level.
  const HeadingTag = HEADING_TAGS[level];
  const headingNode = <HeadingTag className={slots.heading()}>{heading}</HeadingTag>;

  let headingBlock: ReactNode = null;
  if (kicker !== undefined) {
    // The rule is the Separator PRIMITIVE (flex-1 to fill the row), never a hand-styled raw element — the
    // rpg `Kicker` precedent, now homed in the primitive so every surface's band is one anatomy.
    headingBlock = (
      <div className={slots.kickerRow()}>
        <Heading level={level} voice="kicker">
          {kicker}
        </Heading>
        {/* The INLINE spelling draws no rule element: its hairline is the section's own `border-top`, so a
            Separator here would be the same mark twice — and a `flex-1` one would eat the control line the
            kicker is supposed to be leading. */}
        {/* DECORATIVE (a11y #199): the `<h3>` kicker beside it already carries the section NAME and the
            document outline, so the trailing hairline conveys nothing a screen reader needs. Left as a bare
            `role="separator"` it announced as an anonymous divider on every surface that renders a kicker
            band. `aria-hidden` drops the orphan from the a11y tree while the rule still paints. */}
        {kickerLayout === "stacked" ? <Separator aria-hidden={true} className="flex-1" /> : null}
      </div>
    );
  } else if (heading !== undefined) {
    headingBlock = hasHint ? (
      // The hint trigger is a SIBLING of the <h3>, never a descendant — nesting it would leak "More
      // info" into the heading's accessible name (W3C accname subtree concatenation).
      <span className={slots.headingRow()}>
        {headingNode}
        {/* size="icon" here (vs. Field's "inline") is a pre-existing drift, not unified in this
            consolidation — that's a rendered-height change belonging to its own reviewed pass. */}
        <HintTrigger className={slots.hintTrigger()} hint={hint} size="icon" subject={heading} />
      </span>
    ) : (
      headingNode
    );
  }

  return (
    <section {...props} className={slots.root({ className })}>
      {headingBlock}
      {children}
    </section>
  );
}
