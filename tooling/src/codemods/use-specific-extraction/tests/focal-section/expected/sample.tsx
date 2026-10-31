import { Section, Stack } from "@orb/ui/layout";
import { FocalSection } from "@orb/ui/focal-section";
import type { ReactElement } from "react";

declare const focal: boolean;

// A literal `focal={true}` moves; a computed value and a section that names no focal stay Sections.
export function Sample(): ReactElement {
  return (
    <Stack>
      <FocalSection heading="Literal">
        moves
      </FocalSection>
      <Section heading="Computed" focal={focal}>
        stays
      </Section>
      <Section heading="Plain">stays</Section>
    </Stack>
  );
}
