// THE APPEARANCE BOOT HINT — this device's remembered answer to the few synced appearance axes the app
// must be able to answer SYNCHRONOUSLY, at boot, instead of ~1.2s into it: `reducedMotion`, `fontScale`,
// `density`, and the selected theme's `[data-theme]` value.
//
// WHY IT EXISTS (measured; #188 N-1 minted the reduced-motion half, #231 the rest). These are SYNCED
// settings (the `user_settings` blob) and stay so: this store is a CACHE over the server rows, never
// their home. But the only writers of the root appearance state are `useAppearanceRootEffects` and the
// shell's own render, which cannot run until the shell mounts and cannot be RIGHT until
// `settings.getUserSettings` (and, for the theme, the SECOND chained `settings.getTheme`) resolves.
// Receipts:
//   • reduced motion (#188 N-1): an app-pref-ON landing dropped two over-budget frames from the boot
//     veil ~1.2s before the stamp landed, while the same drive with the OS media query set dropped none.
//   • font scale (#231, home-delta 2026-08-18): `--font-scale` sets the ROOT font size and every shell
//     dimension is rem-derived, so the setting's arrival RESIZES THE WHOLE SHELL — html 16→20px, rail
//     56→70px, topbar 48→60px — for a non-virtualized boot CLS of 0.1963–0.3398 on the reading arm
//     (2–3.4× the budget), landing 209ms AFTER `data-app-ready`, i.e. after the boot veil has already
//     lifted. Density is the same class one layer in (`[data-density]` on `.shell-grid`).
//   • theme (#231): `data-theme` arrives from a chained query, so a Light user cold-loads the DARK
//     palette and then swaps — a colour transition on `color`/`background-color`/`border-*-color` with
//     measured 100–167ms frame gaps, on the first screen of every visit.
//
// SO THE ANSWER IS PERSISTED HERE AND REPLAYED BEFORE REACT MOUNTS. `stampAppearanceBootHint()` runs from
// the composition root (`main.tsx`) ahead of `createRoot(...).render`; there is no inline pre-hydration
// script to do this in `index.html`, because the strict CSP forbids one — the entry module IS the
// pre-paint window. `useAppearance`/`useSelectedTheme` seed the same values into the PENDING arm of their
// reads so the shell's own first commit cannot CLOBBER the replay back to the schema default (that
// clobber is the bug the #188 home-repass fixed, and it is re-armed here for every axis this store
// carries).
//
// THE SERVER ALWAYS WINS. The hint answers only while the authoritative read is unresolved; the instant
// the read lands, its value is both what the app renders from and what is written back here
// (`rememberAppearanceBootHint` / `rememberDataThemeHint`, called from the one seam per axis that knows
// the value is authoritative). Durable-local staleness is a real class, so the hint is never consulted
// beside a resolved read, and a device that has never been told an axis stamps NOTHING for it: absent ⇒
// unstamped ⇒ the pre-existing floor (the OS motion query, the 1.0 root scale, the Hearth palette), which
// is the honest default for a fresh device.
//
// VALIDATION IS THE CONTRACT'S, NOT A SECOND COPY: a persisted blob is untrusted input, and the bounds
// for these axes already live in `appearanceSettingsSchema` (every key `.catch()`es, so parsing is
// TOTAL). `dataTheme` is checked against the SEED value-set names the `[data-theme]` blocks are generated
// from, so a stale/hand-edited value can never stamp an attribute no stylesheet defines.
//
// ONE ATTRIBUTE, ONE SPELLING: `REDUCED_MOTION_ATTR` / `DATA_THEME_ATTR` / `FONT_SCALE_VAR` are imported
// by the root-effects hook rather than re-spelled, because two writers of one DOM name must not drift.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { appearanceSettingsSchema } from "@orb/contracts/settings";
import { isPlainObject } from "@orb/kit/guards";
import { SEED_THEME_VALUE_SETS } from "@orb/ui/tokens";
import { createPersistedStore } from "./create-persisted-store.ts";

/** The root flag the `[data-reduced-motion="true"] *` floor in the ui package's globals.css selects on. */
export const REDUCED_MOTION_ATTR = "data-reduced-motion";
/** The root attribute the generated `[data-theme="…"]` palette blocks in the ui package's theme.css select on. */
export const DATA_THEME_ATTR = "data-theme";
/** The root custom property `:root { font-size: calc(100% * var(--font-scale, 1)) }` reads. */
export const FONT_SCALE_VAR = "--font-scale";

/** The appearance axes a boot needs before the shell can render one — the hint's whole surface. */
export type AppearanceBootAxes = Pick<AppearanceSettings, "reducedMotion" | "fontScale" | "density">;

/** This device's whole remembered answer: the appearance axes plus the resolved `[data-theme]` value. */
export interface AppearanceBootHintState extends AppearanceBootAxes {
  /** The `[data-theme]` value the shell would stamp (a SEED palette's lowercased name), or null for the base Hearth palette. */
  readonly dataTheme: string | null;
}

/** The schema's own defaults — what a device that has never been told anything replays (i.e. nothing). */
const DEFAULT_AXES: AppearanceBootAxes = appearanceSettingsSchema.parse({});

const DEFAULT_STATE: AppearanceBootHintState = { ...DEFAULT_AXES, dataTheme: null };

const PERSIST_VERSION = 1;

/** The `[data-theme]` names the ui package actually generates a palette block for — anything else stamps nothing. */
const SEED_THEME_NAMES: ReadonlySet<string> = new Set(Object.keys(SEED_THEME_VALUE_SETS));

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
    dataTheme: typeof dataTheme === "string" && SEED_THEME_NAMES.has(dataTheme) ? dataTheme : null,
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
export function rememberDataThemeHint(dataTheme: string | null): void {
  if (useAppearanceBootHintStore.getState().dataTheme === dataTheme) {
    return;
  }
  useAppearanceBootHintStore.setState({ dataTheme }, false, "appearanceBootHint/rememberTheme");
}

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
  const { reducedMotion, fontScale, dataTheme } = useAppearanceBootHintStore.getState();
  const root = document.documentElement;
  if (reducedMotion) {
    root.setAttribute(REDUCED_MOTION_ATTR, "true");
  }
  if (fontScale !== DEFAULT_AXES.fontScale) {
    root.style.setProperty(FONT_SCALE_VAR, String(fontScale));
  }
  if (dataTheme !== null) {
    root.setAttribute(DATA_THEME_ATTR, dataTheme);
  }
  // `density` is deliberately NOT stamped here: it is rendered as `[data-density]` on `.shell-grid`, an
  // element that does not exist until React commits. Its hint exists for the PENDING ARM (useAppearance),
  // so the first grid React paints already carries the right density instead of reflowing into it.
}

/** Test seam: forget the remembered answers (a CT/unit run must not inherit another test's device). */
export function __resetAppearanceBootHint(): void {
  useAppearanceBootHintStore.setState({ ...DEFAULT_STATE }, false, "appearanceBootHint/__reset");
}
