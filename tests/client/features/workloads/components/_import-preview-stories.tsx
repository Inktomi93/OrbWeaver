import { useOrbSocket } from "@orb/client/data";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import { CtAppearanceChannels, CtClientProviders, CtConfigGroupBody, configSections, isolationRegistry } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";

// The authed root mounts the socket; the import section's run tracker needs it to hear the dry run end.
function OrbSocket(): null {
  useOrbSocket();
  return null;
}

export function ImportPreviewStory({ width, appearance }: { readonly width: number; readonly appearance: AppearanceSettings }): ReactElement {
  const section = configSections.get("backup-import");
  const sections = isolationRegistry("configSections", "isolates the import section from unrelated settings sections", [section]);
  return (
    <CtClientProviders>
      <OrbSocket />
      <CtAppearanceChannels settings={appearance}>
        <Container role="group" aria-label="Import preview host" style={{ inlineSize: width }}>
          <CtConfigGroupBody anchor={section.anchor} sections={sections} />
        </Container>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}
