// THE REDUCED-MOTION BOOT HINT — this device's remembered answer to `appearance.reducedMotion`, so the
// preference is answerable SYNCHRONOUSLY at boot instead of ~1.2s into it.
//
// WHY IT EXISTS (measured, #188 N-1). The pref is a SYNCED setting (the `user_settings` blob) and stays
// one: this store is a CACHE over the server row, never its home. But the only writer of the
// `data-reduced-motion` root flag is `useAppearanceRootEffects`, which cannot run until the shell mounts
// and cannot be RIGHT until `settings.getUserSettings` resolves — and the boot veil weaves, animates and
// drops frames a full beat before either. Receipt: an app-pref-ON landing dropped two over-budget frames
// from the veil ~1.2s before the stamp landed, while the same drive with the OS media query set dropped
// none. The user asked for no motion and got the app's most animated screen.
//
// SO THE ANSWER IS PERSISTED HERE AND REPLAYED BEFORE REACT MOUNTS. `stampReducedMotionHint()` runs from
// the composition root (`main.tsx`) ahead of `createRoot(...).render`, and `useAppearance` seeds the same
// value into the pending arm of the settings read so the shell's own stamp cannot CLOBBER it back to the
// schema default the moment it mounts.
//
// THE SERVER ALWAYS WINS. The hint answers only while the authoritative read is unresolved; the instant
// `getUserSettings` lands, its value is both what the app renders from and what is written back here
// (`rememberReducedMotionHint`, called from `useAppearance` — the one seam that knows the value is
// authoritative). Durable-local staleness is a real class, so the hint is never consulted alongside a
// resolved read, and a device that has never seen the pref ON stamps NOTHING: absent ⇒ unstamped ⇒ the
// OS media query alone, which is the pre-existing floor and the honest default for a fresh device.
//
// ONE ATTRIBUTE, ONE SPELLING: `REDUCED_MOTION_ATTR` is imported by the root-effects hook rather than
// re-spelled, because two writers of one DOM attribute must not be able to drift apart.

import { isPlainObject } from "@orb/kit/guards";
import { createPersistedStore } from "./create-persisted-store.ts";

/** The root flag the `[data-reduced-motion="true"] *` floor in the ui package's globals.css selects on. */
export const REDUCED_MOTION_ATTR = "data-reduced-motion";

interface ReducedMotionHintState {
  /** What the server said last time this device asked. */
  readonly reducedMotion: boolean;
}

const DEFAULT_STATE: ReducedMotionHintState = { reducedMotion: false };

const PERSIST_VERSION = 1;

/** TOTAL: anything that is not an explicit remembered `true` is "this device has no reason to think so". */
function migrate(persisted: unknown): ReducedMotionHintState {
  if (!isPlainObject(persisted)) {
    return DEFAULT_STATE;
  }
  return { reducedMotion: (persisted as { reducedMotion?: unknown }).reducedMotion === true };
}

const useReducedMotionHintStore = createPersistedStore<ReducedMotionHintState>("reduced-motion", (): ReducedMotionHintState => DEFAULT_STATE, {
  version: PERSIST_VERSION,
  migrate,
  partialize: (s): ReducedMotionHintState => ({ reducedMotion: s.reducedMotion }),
});

/** The remembered answer, as a subscribed read — `useAppearance`'s pending arm. */
export function useReducedMotionHint(): boolean {
  return useReducedMotionHintStore((s) => s.reducedMotion);
}

/** Record what the SERVER said. Only ever called with an authoritative value (see the header). */
export function rememberReducedMotionHint(reducedMotion: boolean): void {
  if (useReducedMotionHintStore.getState().reducedMotion === reducedMotion) {
    return;
  }
  useReducedMotionHintStore.setState({ reducedMotion }, false, "reducedMotionHint/remember");
}

/**
 * Replay the hint onto `<html>` BEFORE React mounts (called from `main.tsx`, ahead of `createRoot`).
 * localStorage is synchronous, so this lands in the same tick the document does — ahead of the boot veil's
 * first frame, which is the whole point. Only the ON arm stamps: an absent/false hint leaves the attribute
 * alone so a fresh device boots unstamped rather than asserting a preference nobody has expressed yet.
 */
export function stampReducedMotionHint(): void {
  if (useReducedMotionHintStore.getState().reducedMotion) {
    document.documentElement.setAttribute(REDUCED_MOTION_ATTR, "true");
  }
}

/** Test seam: forget the remembered answer (a CT/unit run must not inherit another test's device). */
export function __resetReducedMotionHint(): void {
  useReducedMotionHintStore.setState({ reducedMotion: false }, false, "reducedMotionHint/__reset");
}
