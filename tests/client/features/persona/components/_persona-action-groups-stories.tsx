import { personaListSection } from "@orb/client/features/persona";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import { CtAppearanceChannels, CtClientProviders, CtConfigGroupBody, isolationRegistry } from "@orb/testkit/browser";
import { Container, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

const sections = isolationRegistry("configSections", "isolates the registered persona list and its actual expanded editor", [personaListSection]);

export function PersonaActionGroupsStory({ width, appearance }: { readonly width: number; readonly appearance: AppearanceSettings }): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={appearance}>
        <Container aria-label="Persona action host" className="h-screen" role="group" style={{ inlineSize: width }}>
          <Stack className="overflow-y-auto overscroll-contain px-section py-section block-full min-block-0">
            <CtConfigGroupBody anchor={personaListSection.anchor} sections={sections} />
          </Stack>
        </Container>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}
