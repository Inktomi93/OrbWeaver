import type { ReactElement } from "react";
import type { SectionProps } from "../section.tsx";
import { Section } from "../section.tsx";
import { focalSectionVariants } from "./variants.ts";

interface FocalSectionProps extends SectionProps {
  /** The region's one focal treatment is on this section now. A lane that hands the focal over keeps its element. @defaultValue true */
  readonly focal?: boolean;
}

/**
 * A Section that wears the region's one focal treatment (CD3) while `focal` is on. It is the same element either way, so
 * a surface that moves the focal between sections changes no DOM and relays out nothing.
 */
export function FocalSection({ focal = true, className, ...rest }: FocalSectionProps): ReactElement {
  return <Section {...rest} className={focalSectionVariants({ focal, className })} />;
}
