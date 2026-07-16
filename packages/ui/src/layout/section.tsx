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
      {heading === undefined ? null : <h2 className={slots.heading()}>{heading}</h2>}
      {children}
    </section>
  );
}
