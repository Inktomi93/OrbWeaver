import { appearanceAccessibilitySection, appearanceSizingSection } from "@orb/client/features/app-shell";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";

const ANCHOR_ID = "appearance-sizing-anchor";

/** The production Sizing settings section, mounted over the CT runtime. */
export function SizingSectionStory(): ReactElement {
  return <CtClientProviders>{appearanceSizingSection.body(ANCHOR_ID)}</CtClientProviders>;
}

/** The production Accessibility settings section, mounted over the CT runtime. */
export function AccessibilitySectionStory(): ReactElement {
  return <CtClientProviders>{appearanceAccessibilitySection.body(ANCHOR_ID)}</CtClientProviders>;
}
