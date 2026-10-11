// The settings-section CTs assert on the last `settings.updateUserSettingsSection` patch. One typed reader, so a
// renamed section or input field fails to compile instead of each CT re-casting the recorded input.

import type { TrpcInput, TrpcRecorder } from "./route-trpc.ts";

export const UPDATE_USER_SETTINGS_SECTION = "settings.updateUserSettingsSection";

type SettingsSectionInput = TrpcInput<typeof UPDATE_USER_SETTINGS_SECTION>;

/** The most recent patch sent for `section`, or undefined when the last write targeted another section. */
export function lastSettingsPatch(trpc: TrpcRecorder, section: SettingsSectionInput["section"]): SettingsSectionInput["patch"] | undefined {
  const input = trpc.lastInput(UPDATE_USER_SETTINGS_SECTION);
  return input?.section === section ? input.patch : undefined;
}
