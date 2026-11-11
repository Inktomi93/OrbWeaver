import { appearanceAvatarsSection, appearanceMessageDetailsSection, appearanceMessageStyleSection } from "@orb/client/features/chat";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";

const ANCHOR_ID = "appearance-setting-names-anchor";
const SECTIONS = { avatars: appearanceAvatarsSection, messageDetails: appearanceMessageDetailsSection, messageStyle: appearanceMessageStyleSection } as const;

/** One of the chat feature's production Appearance sections, mounted over the CT runtime. */
export function ChatAppearanceSectionStory({ section }: { readonly section: keyof typeof SECTIONS }): ReactElement {
  return <CtClientProviders>{SECTIONS[section].body(ANCHOR_ID)}</CtClientProviders>;
}
