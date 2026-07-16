// domain/chat/substrate/assembly-access — the substrate DI seam between the `engine/` and `assembly/` named
// subsystems (core/Core-0-Architecture-and-Structure.md §4 / dep-cruiser `domain-no-cross-subsystem`). The two subsystems stay
// independent: a file in `engine/` may NOT import `assembly/` directly — cross-subsystem coordination goes
// THROUGH `substrate/` (the exempt seam). This module wraps the pure BUILD + SHAPE + FIT entrypoints the
// engine's turn pipeline orchestrates, so `engine/pipeline.ts` calls them via HERE, not from `assembly/`.
//
// Thin pass-through WRAPPERS (not bare re-exports — `noBarrelFile`): each forwards to the assembly engine,
// typed off the target's own signature so the seam can't drift. (The `assembly/shape.ts` header anticipates
// "the engine's pipeline imports shape from here" — that DIRECT cross-subsystem import is gate-illegal; this
// substrate bridge is the legal form of the same coupling.)

import { assemblePrompt, previewSection as previewSectionImpl } from "../assembly/assemble";
import { fitHistoryToWindow } from "../assembly/history-budget";
import {
  buildTurnMacroContext as buildTurnMacroContextImpl,
  freezeVolatileMacros as freezeVolatileMacrosImpl,
  renderHistoryMacros as renderHistoryMacrosImpl,
  resolveGuidedActionText as resolveGuidedActionTextImpl,
} from "../assembly/macros";
import { shape } from "../assembly/shape";
import { shapeContextForSpeaker as shapeContextForSpeakerImpl } from "../assembly/speaker-card";

/** BUILD: render the prompt config against the immutable assemble ctx → the static/dynamic halves + splices. */
export function buildPrompt(...args: Parameters<typeof assemblePrompt>): ReturnType<typeof assemblePrompt> {
  return assemblePrompt(...args);
}

/** SHAPE: scope→splice→squash→name-stamp the wire history + compute the §8 breakpoint. */
export function shapeTurn(...args: Parameters<typeof shape>): ReturnType<typeof shape> {
  return shape(...args);
}

/** The per-speaker CARD-SECTION shape (the two-axis `shape(ctx, speaker)`): pick the active
 *  speaker's card + co-speakers off the immutable ctx (D60). The legal `engine/ → assembly/` bridge. */
export function shapeContextForSpeaker(...args: Parameters<typeof shapeContextForSpeakerImpl>): ReturnType<typeof shapeContextForSpeakerImpl> {
  return shapeContextForSpeakerImpl(...args);
}

/** Build the turn-stage `MacroContext` for regex find/replace templates (the RECEIVE AI_OUTPUT/REASONING
 *  author-side macro pass — macros run on the TEMPLATE, never on the model output). The legal
 *  `engine/ → assembly/` bridge (a direct import is `domain-no-cross-subsystem`-illegal). */
export function buildTurnMacroContext(...args: Parameters<typeof buildTurnMacroContextImpl>): ReturnType<typeof buildTurnMacroContextImpl> {
  return buildTurnMacroContextImpl(...args);
}

/** SHAPE (canon pre-pass): resolve `{{…}}` in a stored history row's body (resolve-on-READ; D26/D51 keep
 *  storage raw). `{{char}}` binds to the row's OWN speaker (or the cast for a user/narrator row),
 *  `{{user}}`/`{{persona}}` to the row's own persona — falling back to the chat ANCHOR for a null stamp
 *  (never the reader) — the client DISPLAY parity split. The legal `engine/ → assembly/` bridge. */
export function renderHistoryMacros(...args: Parameters<typeof renderHistoryMacrosImpl>): ReturnType<typeof renderHistoryMacrosImpl> {
  return renderHistoryMacrosImpl(...args);
}

/** FREEZE the VOLATILE (nondeterministic clock/PRNG) macros in `text` at COMMIT (Chat-Macro-Resolution.md
 *  §0): the exact inverse of `renderHistoryMacros`' names-only pass. Used by the SEND path (composer text) and
 *  the greeting FIRST-USER-TURN freeze (Task #77 / D51) — a verb reaches assembly ONLY through this bridge. */
export function freezeVolatileMacros(...args: Parameters<typeof freezeVolatileMacrosImpl>): ReturnType<typeof freezeVolatileMacrosImpl> {
  return freezeVolatileMacrosImpl(...args);
}

/** Resolve a guided-action TEMPLATE against the turn ctx (the guided steering resolver; PD-63).
 *  The legal `verbs/ → assembly/` bridge for the `opening` action, whose resolved template IS the turn prompt
 *  (it rides `appendUserTurn`, not a placement — `start-chat.ts`'s generate opening). */
export function resolveGuidedActionText(...args: Parameters<typeof resolveGuidedActionTextImpl>): ReturnType<typeof resolveGuidedActionTextImpl> {
  return resolveGuidedActionTextImpl(...args);
}

/** BUILD (one section): render ONE preset section against an immutable assemble ctx → its `SectionPreview`
 *  (the `previewSection` read verb / the COMPOSER editor surface). Side-effect free (the variable map is
 *  cloned inside). The legal bridge for the same `verbs/ → assembly/` coupling. */
export function previewSection(...args: Parameters<typeof previewSectionImpl>): ReturnType<typeof previewSectionImpl> {
  return previewSectionImpl(...args);
}

/** FIT: the §8 history-budget tail (drop oldest turns to fit the window; offset-from-end survives). */
export function fitHistory(...args: Parameters<typeof fitHistoryToWindow>): ReturnType<typeof fitHistoryToWindow> {
  return fitHistoryToWindow(...args);
}
