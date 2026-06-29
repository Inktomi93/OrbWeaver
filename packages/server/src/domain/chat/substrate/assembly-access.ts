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

import { assemblePrompt, previewSection as previewSectionImpl } from "../assembly/assemble";
import { buildAssembleContext as buildAssembleContextImpl } from "../assembly/context";
import { fitHistoryToWindow } from "../assembly/history-budget";
import { buildTurnMacroContext as buildTurnMacroContextImpl } from "../assembly/macros";
import { shape } from "../assembly/shape";

/** RESOLVE→GATHER→BUILD: produce the IMMUTABLE per-turn `AssembleContext` (the turn ctx the SHAPE phase + the
 *  round driver consume per speaker). The turn-running verbs build this ONCE per round through HERE — a direct
 *  `verbs/ → assembly/` import is `domain-no-cross-subsystem`-illegal; this substrate wrapper is the legal
 *  bridge for the same coupling. */
export function buildAssembleContext(
  ...args: Parameters<typeof buildAssembleContextImpl>
): ReturnType<typeof buildAssembleContextImpl> {
  return buildAssembleContextImpl(...args);
}

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

/** Build the turn-stage `MacroContext` for regex find/replace templates (the RECEIVE AI_OUTPUT/REASONING
 *  author-side macro pass — chat.md §2; macros run on the TEMPLATE, never on the model output). The legal
 *  `engine/ → assembly/` bridge (a direct import is `domain-no-cross-subsystem`-illegal). */
export function buildTurnMacroContext(
  ...args: Parameters<typeof buildTurnMacroContextImpl>
): ReturnType<typeof buildTurnMacroContextImpl> {
  return buildTurnMacroContextImpl(...args);
}

/** BUILD (one section): render ONE preset section against an immutable assemble ctx → its `SectionPreview`
 *  (the `previewSection` read verb / the COMPOSER editor surface). Side-effect free (the variable map is
 *  cloned inside). The legal bridge for the same `verbs/ → assembly/` coupling. */
export function previewSection(
  ...args: Parameters<typeof previewSectionImpl>
): ReturnType<typeof previewSectionImpl> {
  return previewSectionImpl(...args);
}

/** FIT: the §8 history-budget tail (drop oldest turns to fit the window; offset-from-end survives). */
export function fitHistory(
  ...args: Parameters<typeof fitHistoryToWindow>
): ReturnType<typeof fitHistoryToWindow> {
  return fitHistoryToWindow(...args);
}
