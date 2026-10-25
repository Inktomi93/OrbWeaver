import { writeAppearanceChannel } from "@orb/client/lib";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { CtIsolation, storyTestId } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { useLayoutEffect } from "react";

export interface AppearanceChannelStoryProps {
  /** Settings over the schema defaults; `null` writes nothing, so the registered initial values show. */
  readonly settings: Partial<AppearanceSettings> | null;
}

/** The shell's root write over the surfaces the channel's CSS reads: a shell grid, a glass pane and a bubble. */
export function AppearanceChannelStory({ settings }: AppearanceChannelStoryProps): ReactElement {
  useLayoutEffect(() => {
    if (settings !== null) {
      writeAppearanceChannel(document.documentElement, { ...appearanceSettingsSchema.parse({}), ...settings });
    }
  }, [settings]);
  return (
    <CtIsolation subject="Appearance channel" isolates="The root channel write against the served CSS, without the shell's data">
      <div className="shell-grid" data-testid={storyTestId("channelGrid")}>
        <aside className="shell-panel" data-testid={storyTestId("channelPanel")}>
          Pane
        </aside>
        <div data-role="assistant">
          <div data-slot="message-bubble" data-testid={storyTestId("channelBubble")}>
            <p>First paragraph of prose.</p>
            <p>Second paragraph of prose.</p>
          </div>
        </div>
      </div>
    </CtIsolation>
  );
}
