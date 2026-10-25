import { APPEARANCE_CHANNEL_ROWS, clearAppearanceChannel, writeAppearanceChannel } from "@orb/client/lib";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { CtIsolation } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { useLayoutEffect } from "react";

export interface AppearanceChannelStoryProps {
  /** Settings over the schema defaults; `null` writes nothing, so the registered initial values show. */
  readonly settings: Partial<AppearanceSettings> | null;
}

/** The shell's root write, alone: the registered properties and attributes the production writer stamps on the document. */
export function AppearanceChannelStory({ settings }: AppearanceChannelStoryProps): ReactElement {
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (settings !== null) {
      writeAppearanceChannel(root, { ...appearanceSettingsSchema.parse({}), ...settings });
    }
    // The gallery keeps one page per worker, so the root must not carry this story's values into the next test.
    return (): void => {
      clearAppearanceChannel(
        root,
        APPEARANCE_CHANNEL_ROWS.map((row) => row.key),
      );
    };
  }, [settings]);
  return (
    <CtIsolation subject="Appearance channel" isolates="The root channel write against the registered properties, without the shell's data or markup">
      <p>Channel probe</p>
    </CtIsolation>
  );
}
