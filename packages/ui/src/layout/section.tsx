import type { ComponentProps, ReactElement, ReactNode } from "react";
import { sectionVariants } from "./variants";

export interface SectionProps extends ComponentProps<"section"> {
  /** Optional heading rendered above the content in the section's heading slot. */
  heading?: ReactNode;
}

/**
 * Block-spacing wrapper — a `py-section` region with an optional heading slot
 * (ui-package-design §6.1). Groups a block of content on the section rhythm.
 *
 * Usage: `<Section heading="Sampling">…fields…</Section>`.
 */
export function Section({ className, heading, children, ...props }: SectionProps): ReactElement {
  const slots = sectionVariants();
  return (
    <section {...props} className={slots.root({ className })}>
      {heading === undefined ? null : <h2 className={slots.heading()}>{heading}</h2>}
      {children}
    </section>
  );
}
