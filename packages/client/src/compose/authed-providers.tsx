import type { ReactElement, ReactNode } from "react";
import {
  ChromeRegistryProvider,
  CommandPaletteSourceRegistryProvider,
  ConfigSectionRegistryProvider,
  MessageToolsRendererRegistryProvider,
  ModalRegistryProvider,
  SectionRegistryProvider,
  SlashCommandRegistryProvider,
} from "#state";
import type { createAuthedComposition } from "./authed-composition.tsx";

/** The authenticated provider order is shared by the route and isolated component mounts. */
export function AuthedProviders({
  composition,
  children,
}: {
  readonly composition: ReturnType<typeof createAuthedComposition>;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <SectionRegistryProvider value={composition.sections}>
      <ModalRegistryProvider value={composition.modals}>
        <ChromeRegistryProvider value={composition.chrome}>
          <ConfigSectionRegistryProvider value={composition.configSections}>
            <MessageToolsRendererRegistryProvider value={composition.messageToolsRenderers}>
              <SlashCommandRegistryProvider value={composition.slashCommands}>
                <CommandPaletteSourceRegistryProvider value={composition.commandPaletteSources}>{children}</CommandPaletteSourceRegistryProvider>
              </SlashCommandRegistryProvider>
            </MessageToolsRendererRegistryProvider>
          </ConfigSectionRegistryProvider>
        </ChromeRegistryProvider>
      </ModalRegistryProvider>
    </SectionRegistryProvider>
  );
}
