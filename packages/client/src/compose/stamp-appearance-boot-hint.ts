// The entry module's pre-paint DOM replay. Keep its state import narrow so boot does not load the full state barrel.
import { DATA_THEME_ATTR, DEFAULT_APPEARANCE_FONT_SCALE, FONT_SCALE_VAR, REDUCED_MOTION_ATTR, readAppearanceBootHint } from "../state/appearance-boot-hint.ts";

/**
 * Replay the hint onto `<html>` BEFORE React mounts (called from `main.tsx`, ahead of `createRoot`).
 * localStorage is synchronous, so this lands in the same tick the document does — ahead of the boot
 * veil's first frame and ahead of the first shell layout, which is the whole point.
 *
 * Each axis stamps only when this device has actually been told something OTHER than the shipped floor:
 * an absent/default hint leaves the attribute or property alone, so a fresh device boots exactly as it
 * does today rather than asserting a preference nobody has expressed.
 */
export function stampAppearanceBootHint(): void {
  const { reducedMotion, fontScale, dataTheme } = readAppearanceBootHint();
  const root = document.documentElement;
  if (reducedMotion) {
    root.setAttribute(REDUCED_MOTION_ATTR, "true");
  }
  if (fontScale !== DEFAULT_APPEARANCE_FONT_SCALE) {
    root.style.setProperty(FONT_SCALE_VAR, String(fontScale));
  }
  if (dataTheme !== null) {
    root.setAttribute(DATA_THEME_ATTR, dataTheme);
  }
  // `density` is deliberately NOT stamped here: it is rendered as `[data-density]` on the shell's
  // `ThemeScope`, which does not exist until React commits. Its hint exists for the PENDING ARM
  // (useAppearance), so the first shell and portal carrier React paints already has the right density.
}
