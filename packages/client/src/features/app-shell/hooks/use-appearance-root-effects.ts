// useAppearanceRootEffects: writes every root-carried appearance setting onto <html> through the manifest's
// channel, so it reaches portals, the boot veil and the route splash, plus the selected theme. The boot replay
// (`compose/stamp-appearance-boot-hint.ts`) writes the same names through the same function before React mounts.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { useLayoutEffect } from "react";
import { APPEARANCE_CHANNEL_ROWS, clearAppearanceChannel, writeAppearanceChannel } from "#lib";
import type { SeedThemeName } from "#state";
import { DATA_THEME_ATTR } from "#state";

// The OS preferences stay on the root after the shell unmounts, so the route splash that replaces it honours them.
const KEPT_AFTER_UNMOUNT: ReadonlySet<keyof AppearanceSettings> = new Set<keyof AppearanceSettings>([
  "reducedMotion",
  "reducedTransparency",
  "increasedContrast",
]);
const CLEARED_ON_UNMOUNT = APPEARANCE_CHANNEL_ROWS.map((row) => row.key).filter((key) => !KEPT_AFTER_UNMOUNT.has(key));

export function useAppearanceRootEffects(appearance: AppearanceSettings, dataTheme: SeedThemeName | null): void {
  useLayoutEffect((): (() => void) => {
    const root = document.documentElement;
    // The pending block carries the boot hint's values (`useAppearance`), so this write never un-stamps the replay.
    writeAppearanceChannel(root, appearance);
    if (dataTheme === null) {
      root.removeAttribute(DATA_THEME_ATTR);
    } else {
      root.setAttribute(DATA_THEME_ATTR, dataTheme);
    }
    return (): void => {
      clearAppearanceChannel(root, CLEARED_ON_UNMOUNT);
      root.removeAttribute(DATA_THEME_ATTR);
    };
  }, [appearance, dataTheme]);
}
