import type { ComponentProps, ReactElement, ReactNode } from "react";
import { Button } from "#primitives/button";
import { Icon, Info } from "#primitives/icons";
import { Separator } from "#primitives/separator";
import { Heading } from "#primitives/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "#primitives/tooltip";
import { sectionVariants } from "./variants";

export interface SectionProps extends ComponentProps<"section"> {
  heading?: ReactNode;
  /**
   * The INSTRUMENT-tier form of `heading` (density-pass-spec.md §2.3/§4.3): the section's name in the
   * `kicker` voice — micro caps, muted — followed by a hairline rule to the edge. This is what a read-only
   * grouping gets INSTEAD of a border+radius+bg box (chrome diet CD1). Still a real `<h3>`, so the document
   * outline survives. Wins over `heading` if both are passed (they are two skins of one slot).
   */
  kicker?: ReactNode;
  /** Render a hairline under the heading (UIP-404 settings panes). @defaultValue false */
  divider?: boolean;
  /** Short explainer surfaced as an info-icon hover tooltip beside the heading (the Field `hint` idiom,
   *  no vertical-space cost) — for the insider terms a section's rows can't self-explain. */
  hint?: ReactNode;
}

/**
 * Block-spacing wrapper with an optional heading slot (ui-package-design §6.1).
 *
 * Usage: `<Section heading="Sampling">…fields…</Section>` · `<Section heading="Effects" divider>…`.
 */
export function Section({ className, heading, kicker, divider = false, hint, children, ...props }: SectionProps): ReactElement {
  const slots = sectionVariants({ divider });
  const hasHint = hint !== undefined && hint !== null;
  // Derive the trigger's accessible name from the heading so multiple hinted sections don't share one name.
  let hintAriaLabel = "More info";
  if (typeof heading === "string" && heading.trim().length > 0) {
    const headingString: string = heading;
    hintAriaLabel = `More info about ${headingString}`;
  }
  // h3, not h2: a Section is always a SUB-heading of its hosting surface (a dialog's Title and a drawer's
  // Title render h2), so h2 here flattened e.g. the settings modal's whole hierarchy to one level. The
  // skin is unchanged — hierarchy is carried by weight, not size.
  const headingNode = <h3 className={slots.heading()}>{heading}</h3>;

  let headingBlock: ReactNode = null;
  if (kicker !== undefined) {
    // The rule is the Separator PRIMITIVE (flex-1 to fill the row), never a hand-styled raw element — the
    // rpg `Kicker` precedent, now homed in the primitive so every surface's band is one anatomy.
    headingBlock = (
      <div className={slots.kickerRow()}>
        <Heading level={3} voice="kicker">
          {kicker}
        </Heading>
        <Separator className="flex-1" />
      </div>
    );
  } else if (heading !== undefined) {
    headingBlock = hasHint ? (
      // The hint trigger is a SIBLING of the <h3>, never a descendant — nesting it would leak "More
      // info" into the heading's accessible name (W3C accname subtree concatenation).
      <span className={slots.headingRow()}>
        {headingNode}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button aria-label={hintAriaLabel} className={slots.hintTrigger()} intent="ghost" size="icon" type="button">
                <Icon icon={Info} size="xs" />
              </Button>
            }
          />
          <TooltipPopup side="top">{hint}</TooltipPopup>
        </Tooltip>
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
