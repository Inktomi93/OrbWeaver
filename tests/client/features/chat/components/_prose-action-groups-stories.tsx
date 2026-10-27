import { proseSettingsSection } from "@orb/client/features/chat";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import { CtAppearanceChannels, CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";

/** The registered prose editor with its actual stale-override actions, isolated from sibling sections. */
export function ProseActionGroupsStory({ width, appearance }: { readonly width: number; readonly appearance: AppearanceSettings }): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={appearance}>
        <Container role="group" aria-label="Prose action host" style={{ inlineSize: width }}>
          {proseSettingsSection.body("prose-action-subject")}
        </Container>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}
