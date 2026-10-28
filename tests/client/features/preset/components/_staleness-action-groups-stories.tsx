import { PresetEditorSurface } from "@orb/client/features/preset";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import type { PresetId } from "@orb/kit/ids";
import { CtAppearanceChannels, CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";

/** Isolate the real preset editor and writer; app-root's user-bus freshness is outside this component mount. */
export function StalenessActionGroupsStory({
  width,
  appearance,
  presetId,
}: {
  readonly width: number;
  readonly appearance: AppearanceSettings;
  readonly presetId: PresetId;
}): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={appearance}>
        <Container aria-label="Preset action host" className="h-screen" role="group" style={{ inlineSize: width }}>
          <PresetEditorSurface presetId={presetId} />
        </Container>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}
