import { appearanceBackgroundSection } from "@orb/client/features/app-shell";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";

const ANCHOR_ID = "appearance-background-anchor";

/** The production Background settings section, mounted over the CT runtime that seeds minted ids. */
export function BackgroundSectionStory(): ReactElement {
  return <CtClientProviders>{appearanceBackgroundSection.body(ANCHOR_ID)}</CtClientProviders>;
}
