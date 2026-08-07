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

import { assemblePrompt, assemblePromptWithSlices, previewSection as previewSectionImpl } from "../assembly/assemble.ts";
import { buildAssemblyBudget as buildAssemblyBudgetImpl } from "../assembly/budget.ts";
import {
  buildHistoryBudget as buildHistoryBudgetImpl,
  fitHistoryToWindow,
  materializeOutputReserve as materializeOutputReserveImpl,
} from "../assembly/history-budget.ts";
import {
  buildTurnMacroContext as buildTurnMacroContextImpl,
  freezeVolatileMacros as freezeVolatileMacrosImpl,
  previewActionText as previewActionTextImpl,
  renderMacros as renderMacrosImpl,
  resolveGuidedActionText as resolveGuidedActionTextImpl,
  resolveNudgeText as resolveNudgeTextImpl,
} from "../assembly/macros.ts";
import { shape, toShapeCanon as toShapeCanonImpl } from "../assembly/shape.ts";
import { shapeContextForSpeaker as shapeContextForSpeakerImpl } from "../assembly/speaker-card.ts";
import { buildShapeTrace as buildShapeTraceImpl } from "../assembly/trace.ts";
import { buildTurnUserMacros as buildTurnUserMacrosImpl } from "../assembly/user-macros.ts";
import { loadCharacterCardLore as loadCharacterCardLoreImpl } from "../assembly/world-info/pool.ts";

/** BUILD: render the prompt config against the immutable assemble ctx → the static/dynamic halves + splices. */
export function buildPrompt(...args: Parameters<typeof assemblePrompt>): ReturnType<typeof assemblePrompt> {
  return assemblePrompt(...args);
}

/** BUILD + the per-source budget attribution (the host `previewAssembly` read; byte-identical prompt). */
export function buildPromptWithSlices(...args: Parameters<typeof assemblePromptWithSlices>): ReturnType<typeof assemblePromptWithSlices> {
  return assemblePromptWithSlices(...args);
}

/** BUDGET: group the BUILD slices + the fitted history into the host preview's per-source breakdown. */
export function buildAssemblyBudget(...args: Parameters<typeof buildAssemblyBudgetImpl>): ReturnType<typeof buildAssemblyBudgetImpl> {
  return buildAssemblyBudgetImpl(...args);
}

/** SHAPE: scope→splice→squash→name-stamp the wire history + compute the §8 breakpoint. */
export function shapeTurn(...args: Parameters<typeof shape>): ReturnType<typeof shape> {
  return shape(...args);
}

/** SHAPE (canon pre-pass): map the loaded canon (`MessageView[]`) → SHAPE wire input rows, macro-resolved
 *  per row. The legal `engine/` + `verbs/` → `assembly/` bridge for the ONE canon→shape mapping (shared by
 *  the turn pipeline and the host/admin shape-trace preview). */
export function toShapeCanon(...args: Parameters<typeof toShapeCanonImpl>): ReturnType<typeof toShapeCanonImpl> {
  return toShapeCanonImpl(...args);
}

/** SHAPE (content-free trace): project shape()'s stage snapshots + the resolved breakpoint offset → the
 *  host/admin `ShapeTrace` (`chat.getShapeTrace`; PD-132). The legal `verbs/` → `assembly/` bridge. */
export function buildShapeTrace(...args: Parameters<typeof buildShapeTraceImpl>): ReturnType<typeof buildShapeTraceImpl> {
  return buildShapeTraceImpl(...args);
}

/** The per-turn CARD-SECTION shape (the three-axis `shape(ctx, speaker)`, output × cardScope × ref): pick the
 *  active speaker's card + co-speakers off the immutable ctx under `per-speaker`, or the WHOLE cast's under
 *  `narrator` (D60). The legal `engine/ → assembly/` bridge. */
export function shapeContextForSpeaker(...args: Parameters<typeof shapeContextForSpeakerImpl>): ReturnType<typeof shapeContextForSpeakerImpl> {
  return shapeContextForSpeakerImpl(...args);
}

/** Build the turn-stage `MacroContext` for regex find/replace templates (the RECEIVE AI_OUTPUT/REASONING
 *  author-side macro pass — macros run on the TEMPLATE, never on the model output). The legal
 *  `engine/ → assembly/` bridge (a direct import is `domain-no-cross-subsystem`-illegal). */
export function buildTurnMacroContext(...args: Parameters<typeof buildTurnMacroContextImpl>): ReturnType<typeof buildTurnMacroContextImpl> {
  return buildTurnMacroContextImpl(...args);
}

/** FREEZE the VOLATILE (nondeterministic clock/PRNG) macros in `text` at COMMIT (Chat-Macro-Resolution.md
 *  §0): the exact inverse of `renderHistoryMacros`' names-only pass. Used by the SEND path (composer text) and
 *  the greeting FIRST-USER-TURN freeze (Task #77 / D51) — a verb reaches assembly ONLY through this bridge. */
export function freezeVolatileMacros(...args: Parameters<typeof freezeVolatileMacrosImpl>): ReturnType<typeof freezeVolatileMacrosImpl> {
  return freezeVolatileMacrosImpl(...args);
}

/** RENDER `{{macros}}` in `text` against a card + section-appropriate persona (the per-section render). The
 *  legal `verbs/ → assembly/` bridge for the D22 member-card DISPLAY read (`getMemberCard`), which renders the
 *  surviving card fields against the anchor persona exactly as the assemble binds them for card-derived sections. */
export function renderMacros(...args: Parameters<typeof renderMacrosImpl>): ReturnType<typeof renderMacrosImpl> {
  return renderMacrosImpl(...args);
}

/** LOAD one character's OWN world-info entry contents (the `sheet+lore` slice of the D22 member card). The legal
 *  `verbs/ → assembly/world-info/` bridge for `getMemberCard` — the card's lore is a world-info subsystem read,
 *  reached through this substrate seam like every other assembly touch. */
export function loadCharacterCardLore(...args: Parameters<typeof loadCharacterCardLoreImpl>): ReturnType<typeof loadCharacterCardLoreImpl> {
  return loadCharacterCardLoreImpl(...args);
}

/** Resolve a guided-action TEMPLATE against the turn ctx (the guided steering resolver; PD-63).
 *  The legal `verbs/ → assembly/` bridge for the `opening` action, whose resolved template IS the turn prompt
 *  (it rides `appendUserTurn`, not a placement — `start-chat.ts`'s generate opening). */
export function resolveGuidedActionText(...args: Parameters<typeof resolveGuidedActionTextImpl>): ReturnType<typeof resolveGuidedActionTextImpl> {
  return resolveGuidedActionTextImpl(...args);
}

/** Render an unsteered trailing-user NUDGE template's macros (`{{user}}`/`{{char}}`/`{{person}}`) — the same
 *  macro path the steered guided template rides, so `verbs/turn.ts`'s `nudgeOf` substitutes instead of shipping
 *  literal braces. The legal `verbs/ → assembly/` bridge for the impersonate/continue/response nudges. */
export function resolveNudgeText(...args: Parameters<typeof resolveNudgeTextImpl>): ReturnType<typeof resolveNudgeTextImpl> {
  return resolveNudgeTextImpl(...args);
}

/** Render an ACTION template against a BOUND chat for DISPLAY (D8 / §7.1 — the preset readout's resolved
 *  preview). Same resolver as a real fire, fire-time policy: `{{input}}`/`{{person}}` survive as tokens.
 *  The legal `verbs/ → assembly/` bridge for `previewActionTemplates`. */
export function previewActionText(...args: Parameters<typeof previewActionTextImpl>): ReturnType<typeof previewActionTextImpl> {
  return previewActionTextImpl(...args);
}

/** Build the per-turn user-macro registries + draw record (WAVE MU delivery). The legal `verbs/ → assembly/`
 *  bridge: `verbs/turn.ts` builds the per-turn registry once here (registry closures never touch the
 *  serializable `AssembleContext` — they ride `TurnPrep`). Returns `null` for the empty-defs fast path. */
export function buildTurnUserMacros(...args: Parameters<typeof buildTurnUserMacrosImpl>): ReturnType<typeof buildTurnUserMacrosImpl> {
  return buildTurnUserMacrosImpl(...args);
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

/** FIT (budget): the ONE `HistoryBudget` derivation (window/soft-cap/output-reserve/system) both the engine
 *  turn and previewFit read, so their fit boundaries can't drift. The legal `engine|verbs → assembly` bridge. */
export function buildHistoryBudget(...args: Parameters<typeof buildHistoryBudgetImpl>): ReturnType<typeof buildHistoryBudgetImpl> {
  return buildHistoryBudgetImpl(...args);
}

/** FIT (reserve): the materialized output reserve = the runner's effective `max_tokens` = the fit's
 *  reserved output. The legal `engine|verbs → assembly` bridge for the ONE materialize home. */
export function materializeOutputReserve(...args: Parameters<typeof materializeOutputReserveImpl>): ReturnType<typeof materializeOutputReserveImpl> {
  return materializeOutputReserveImpl(...args);
}
