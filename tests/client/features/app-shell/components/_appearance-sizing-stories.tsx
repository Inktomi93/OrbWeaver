import { appearanceSizingSection } from "@orb/client/features/app-shell";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";

const ANCHOR_ID = "appearance-sizing-anchor";

/** The production Sizing & motion settings section, mounted over the CT runtime. */
export function SizingSectionStory(): ReactElement {
  return <CtClientProviders>{appearanceSizingSection.body(ANCHOR_ID)}</CtClientProviders>;
}
