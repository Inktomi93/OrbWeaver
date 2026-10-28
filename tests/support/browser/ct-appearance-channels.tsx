import { APPEARANCE_CHANNEL_ROWS, clearAppearanceChannel, writeAppearanceChannel } from "@orb/client/lib";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { ReactNode } from "react";
import { useLayoutEffect } from "react";

/** Apply the production root-channel writer for explicit component isolation, without mounting or replacing AppShell. */
export function CtAppearanceChannels({ settings, children }: { readonly settings: Partial<AppearanceSettings>; readonly children: ReactNode }): ReactNode {
  useLayoutEffect(() => {
    const root = document.documentElement;
    writeAppearanceChannel(root, { ...appearanceSettingsSchema.parse({}), ...settings });
    return (): void =>
      clearAppearanceChannel(
        root,
        APPEARANCE_CHANNEL_ROWS.map((row) => row.key),
      );
  }, [settings]);
  return children;
}
