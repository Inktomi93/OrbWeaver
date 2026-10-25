// The entry module's pre-paint DOM replay. Keep its imports narrow so boot does not load the full state or lib barrel.
import { writeAppearanceChannel } from "../lib/appearance-carrier-manifest.ts";
import { DATA_THEME_ATTR, readAppearanceBootHint } from "../state/appearance-boot-hint.ts";

/**
 * Replay the hint onto `<html>` BEFORE React mounts (called from `main.tsx`, ahead of `createRoot`).
 * localStorage is synchronous, so this lands in the same tick the document does, ahead of the boot
 * veil's first frame and ahead of the first shell layout.
 *
 * It writes through the same channel as the shell's root effects, so both writers use one set of names.
 * A device that was never told anything replays the schema defaults, which match the generated initial values.
 */
export function stampAppearanceBootHint(): void {
  const { reducedMotion, fontScale, dataTheme } = readAppearanceBootHint();
  const root = document.documentElement;
  writeAppearanceChannel(root, { reducedMotion, fontScale });
  if (dataTheme !== null) {
    root.setAttribute(DATA_THEME_ATTR, dataTheme);
  }
  // `density` is not stamped here: it is rendered as `[data-density]` on the shell's `ThemeScope`, which does
  // not exist until React commits. Its hint exists for the pending block (useAppearance), so the first shell
  // and portal carrier React paints already has the right density.
}
