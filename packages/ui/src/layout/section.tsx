import type { ComponentProps, ReactElement, ReactNode } from "react";
import { sectionVariants } from "./variants";

export interface SectionProps extends ComponentProps<"section"> {
  heading?: ReactNode;
  /** Render a hairline under the heading (UIP-404 settings panes). @defaultValue false */
  divider?: boolean;
}

/**
 * Block-spacing wrapper with an optional heading slot (ui-package-design §6.1).
 *
 * Usage: `<Section heading="Sampling">…fields…</Section>` · `<Section heading="Effects" divider>…`.
 */
export function Section({ className, heading, divider = false, children, ...props }: SectionProps): ReactElement {
  const slots = sectionVariants({ divider });
  return (
    <section {...props} className={slots.root({ className })}>
      {/* h3, not h2: a Section is always a SUB-heading of its hosting surface (a dialog's Title and a
          drawer's Title render h2), so h2 here flattened e.g. the settings modal's whole hierarchy to
          one level. The skin is unchanged — hierarchy is carried by weight, not size. */}
      {heading === undefined ? null : <h3 className={slots.heading()}>{heading}</h3>}
      {children}
    </section>
  );
}
