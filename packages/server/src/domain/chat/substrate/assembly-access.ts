// domain/chat/substrate/assembly-access — the substrate DI seam between the `engine/` and `assembly/` named
// subsystems (structure.md §4 / dep-cruiser `domain-no-cross-subsystem`). The two subsystems stay
// independent: a file in `engine/` may NOT import `assembly/` directly — cross-subsystem coordination goes
// THROUGH `substrate/` (the exempt seam). This module wraps the pure BUILD + SHAPE + FIT entrypoints the
// engine's turn pipeline orchestrates, so `engine/pipeline.ts` calls them via HERE, not from `assembly/`.
//
// Thin pass-through WRAPPERS (not bare re-exports — `noBarrelFile`): each forwards to the assembly engine,
// typed off the target's own signature so the seam can't drift. (The `assembly/shape.ts` header anticipates
// "the engine's pipeline imports shape from here" — that DIRECT cross-subsystem import is gate-illegal; this
// substrate bridge is the legal form of the same coupling.)

import { assemblePrompt } from "../assembly/assemble";
import { fitHistoryToWindow } from "../assembly/history-budget";
import { shape } from "../assembly/shape";

/** BUILD: render the prompt config against the immutable assemble ctx → the static/dynamic halves + splices. */
export function buildPrompt(
  ...args: Parameters<typeof assemblePrompt>
): ReturnType<typeof assemblePrompt> {
  return assemblePrompt(...args);
}

/** SHAPE: scope→splice→squash→name-stamp the wire history + compute the §8 breakpoint. */
export function shapeTurn(...args: Parameters<typeof shape>): ReturnType<typeof shape> {
  return shape(...args);
}

/** FIT: the §8 history-budget tail (drop oldest turns to fit the window; offset-from-end survives). */
export function fitHistory(
  ...args: Parameters<typeof fitHistoryToWindow>
): ReturnType<typeof fitHistoryToWindow> {
  return fitHistoryToWindow(...args);
}
