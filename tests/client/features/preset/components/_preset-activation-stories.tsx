import { presetsSection } from "@orb/client/features/preset";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import { CtAppearanceChannels, CtClientProviders, CtUserBus } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";

/** The production Presets library and editor on the user bus, so the settings write that activates a preset reaches the rows and the header it changes. */
export function PresetActivationStory({ width, appearance }: { readonly width: number; readonly appearance: AppearanceSettings }): ReactElement {
  const { list, content } = presetsSection;
  if (typeof list !== "function" || typeof content !== "function") {
    throw new Error("The production Presets section must provide its library and editor");
  }
  return (
    <CtClientProviders>
      <CtUserBus>
        <CtAppearanceChannels settings={appearance}>
          <Container aria-label="Preset activation host" className="h-screen" role="group" style={{ inlineSize: width }}>
            {list()}
            {content()}
          </Container>
        </CtAppearanceChannels>
      </CtUserBus>
    </CtClientProviders>
  );
}
