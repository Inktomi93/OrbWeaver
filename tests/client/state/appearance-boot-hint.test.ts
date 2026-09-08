import { afterEach, beforeEach } from "vitest";
import {
  __resetAppearanceBootHint,
  readAppearanceBootHint,
  rememberAppearanceBootHint,
  rememberDataThemeHint,
} from "../../../packages/client/src/state/appearance-boot-hint.ts";
import { expect, test } from "../../support/fixtures.ts";

beforeEach(__resetAppearanceBootHint);
afterEach(__resetAppearanceBootHint);

test("pre-paint reads synchronously retain the other authoritative appearance axes", () => {
  rememberDataThemeHint("light");
  rememberAppearanceBootHint({ reducedMotion: true, fontScale: 1.25, density: "compact" });
  const loud = readAppearanceBootHint();
  expect(loud).toMatchObject({ reducedMotion: true, fontScale: 1.25, density: "compact", dataTheme: "light" });

  rememberAppearanceBootHint({ reducedMotion: false, fontScale: 1, density: "comfortable" });
  expect(readAppearanceBootHint()).toMatchObject({ reducedMotion: false, fontScale: 1, density: "comfortable", dataTheme: "light" });
  expect(loud).toMatchObject({ reducedMotion: true, fontScale: 1.25, density: "compact", dataTheme: "light" });

  rememberDataThemeHint(null);
  expect(readAppearanceBootHint()).toMatchObject({ reducedMotion: false, fontScale: 1, density: "comfortable", dataTheme: null });
});
