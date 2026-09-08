// Device-local cache of authoritative appearance values. The server wins once its read resolves;
// pending reads and the composition root use this synchronous hint to avoid boot motion/layout flashes.
// Import the appearance schema directly: the settings barrel pulls unrelated schema construction into boot.
// Validation and defaults belong to the contract; dataTheme must name a generated seed palette.

import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { isPlainObject } from "@orb/kit/guards";
import type { SeedThemeName } from "#lib";
import { isSeedThemeName } from "#lib";
import { createPersistedStore } from "./create-persisted-store.ts";

/** The root flag the `[data-reduced-motion="true"] *` floor in the ui package's globals.css selects on. */
export const REDUCED_MOTION_ATTR = "data-reduced-motion";
/** The root attribute the generated `[data-theme="…"]` palette blocks in the ui package's theme.css select on. */
export const DATA_THEME_ATTR = "data-theme";
/** The root custom property `:root { font-size: calc(100% * var(--font-scale, 1)) }` reads. */
export const FONT_SCALE_VAR = "--font-scale";

/** The appearance axes a boot needs before the shell can render one — the hint's whole surface. */
export type AppearanceBootAxes = Pick<AppearanceSettings, "reducedMotion" | "fontScale" | "density">;

/** The generated seed palettes that own a `[data-theme]` block — re-exported from its ONE home beside the
 *  theme-scope resolver (`#lib`), which owns both halves of "what does this theme paint from". */
export type { SeedThemeName } from "#lib";

/** This device's whole remembered answer: the appearance axes plus the resolved `[data-theme]` value. */
export interface AppearanceBootHintState extends AppearanceBootAxes {
  /** The `[data-theme]` value the shell would stamp (a SEED palette's lowercased name), or null for the base Hearth palette. */
  readonly dataTheme: SeedThemeName | null;
}

/** The schema's own defaults — what a device that has never been told anything replays (i.e. nothing). */
const DEFAULT_AXES: AppearanceBootAxes = appearanceSettingsSchema.parse({});
export const DEFAULT_APPEARANCE_FONT_SCALE = DEFAULT_AXES.fontScale;

const DEFAULT_STATE: AppearanceBootHintState = { ...DEFAULT_AXES, dataTheme: null };

const PERSIST_VERSION = 1;

/** TOTAL: any shape that is not a valid remembered answer degrades to "this device knows nothing". */
function migrate(persisted: unknown): AppearanceBootHintState {
  if (!isPlainObject(persisted)) {
    return DEFAULT_STATE;
  }
  // The contract owns the bounds (min/max/enum) AND the fallbacks — every key catches, so this cannot throw.
  const axes = appearanceSettingsSchema.parse(persisted);
  const dataTheme = (persisted as { dataTheme?: unknown }).dataTheme;
  return {
    reducedMotion: axes.reducedMotion,
    fontScale: axes.fontScale,
    density: axes.density,
    dataTheme: typeof dataTheme === "string" && isSeedThemeName(dataTheme) ? dataTheme : null,
  };
}

const useAppearanceBootHintStore = createPersistedStore<AppearanceBootHintState>("appearance-boot", (): AppearanceBootHintState => DEFAULT_STATE, {
  version: PERSIST_VERSION,
  migrate,
  partialize: (s): AppearanceBootHintState => ({ reducedMotion: s.reducedMotion, fontScale: s.fontScale, density: s.density, dataTheme: s.dataTheme }),
});

/** The whole remembered answer, as a subscribed read — the pending arm of `useAppearance`/`useSelectedTheme`.
 *  Selects the state OBJECT (a stable reference) rather than building a fresh slice per render, which a
 *  `useSyncExternalStore`-backed store would re-render forever on. */
export function useAppearanceBootHint(): AppearanceBootHintState {
  return useAppearanceBootHintStore((s) => s);
}

/** Record what the SERVER said about the appearance axes. Only ever called with authoritative values. */
export function rememberAppearanceBootHint(axes: AppearanceBootAxes): void {
  const current = useAppearanceBootHintStore.getState();
  if (current.reducedMotion === axes.reducedMotion && current.fontScale === axes.fontScale && current.density === axes.density) {
    return;
  }
  useAppearanceBootHintStore.setState({ ...axes }, false, "appearanceBootHint/rememberAxes");
}

/** Record the RESOLVED `[data-theme]` value (null = the base palette). Only ever called authoritatively. */
export function rememberDataThemeHint(dataTheme: SeedThemeName | null): void {
  if (useAppearanceBootHintStore.getState().dataTheme === dataTheme) {
    return;
  }
  useAppearanceBootHintStore.setState({ dataTheme }, false, "appearanceBootHint/rememberTheme");
}

/** Synchronous read for the composition root's pre-paint replay. */
export function readAppearanceBootHint(): AppearanceBootHintState {
  return useAppearanceBootHintStore.getState();
}

/** Test seam: forget the remembered answers (a CT/unit run must not inherit another test's device). */
export function __resetAppearanceBootHint(): void {
  useAppearanceBootHintStore.setState({ ...DEFAULT_STATE }, false, "appearanceBootHint/__reset");
}
