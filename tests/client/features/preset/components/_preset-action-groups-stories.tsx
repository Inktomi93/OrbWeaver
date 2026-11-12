import { PresetEditorSurface, presetsSection } from "@orb/client/features/preset";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import type { PresetId } from "@orb/kit/ids";
import { CtAppearanceChannels, CtClientProviders } from "@orb/testkit/browser";
import { Container, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

type PresetActionProps = { readonly width: number; readonly appearance: AppearanceSettings } & (
  | { readonly subject: "editor"; readonly presetId: PresetId }
  | { readonly subject: "list" }
  | { readonly subject: "section" }
);

export function PresetActionGroupsStory(props: PresetActionProps): ReactElement {
  const { list, content } = presetsSection;
  if (typeof list !== "function" || typeof content !== "function") {
    throw new Error("The production Presets section must provide its library and editor");
  }
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={props.appearance}>
        <Container aria-label="Preset action host" className="h-screen" role="group" style={{ inlineSize: props.width }}>
          {props.subject === "editor" ? (
            <Stack className="block-full min-block-0" paddingInline="section">
              <PresetEditorSurface presetId={props.presetId} />
            </Stack>
          ) : null}
          {props.subject === "editor" ? null : list()}
          {props.subject === "section" ? content() : null}
        </Container>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}
