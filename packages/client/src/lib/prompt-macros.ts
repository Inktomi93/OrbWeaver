// The macro catalog every PROMPT-TEXT authoring field completes against (the `{{ }}` trigger). Homed in
// lib/ (not a feature) because it has two authoring homes now: the preset's sections/guided templates AND the
// GAME's own user macros (owner ruling #20's two definition homes) — a feature-local copy would be a sideways
// import from rpg into preset, and a second list would drift. Its own module so the assembly view-model stays
// DOM-free (the `@orb/ui/macro-textarea` type surface drags browser TSX into the dom-less typecheck:graph —
// the persona/character precedent).
//
// DERIVED, NEVER AUTHORED (the three-home collapse, 2026-08-02). The ONE macro catalog is the kit
// registry+metadata PAIR (`createDefaultRegistry` × `BUILTIN_MACRO_METADATA`, drift-proofed by the
// completeness test at tests/kit/macro/metadata.test.ts and by D51's composed `volatile`). Every consumer is
// a DERIVATION with a stated lens: the macro BROWSER is `queryMacros(registry, {})` verbatim (it documents
// the whole registry, user macros included), and this AUTOCOMPLETE is that same query put through the
// CURATION below. A hand-maintained third list is what this module used to be — seven names, drifting, with
// no `{{getvar}}` in a product that has ten variable macros. The contracts-side `PROMPT_MACROS` catalog (a
// fourth spelling, orphaned) was deleted in the same change.
//
// THE CURATION IS THE PRODUCT CHOICE — it lives in exactly two named consts below (`ALIAS_SPELLINGS`,
// `BLOCK_OR_LITERAL_FORMS`) plus one ordering const (`LEAD_MACROS`), so a taste pass reads ONE place. It is
// deliberately an EXCLUDE list, not an include list: a macro added to the registry tomorrow shows up in the
// popover automatically (fail-open), which is the property the old hand list could never have.
//
// DELIBERATELY UNANNOTATED (no `: readonly MacroSuggestion[]`): this module rides the `#lib` barrel, which
// node-side `.ts` tests import — and `@orb/ui/macro-textarea` re-exports its type FROM the browser `.tsx`, so
// even a type-only import drags that component into the DOM-LESS type programs (`tsconfig.json` /
// `tsconfig.tests-dom.json`) and it fails there for want of lib.dom. The shape stays pinned where it is
// consumed: every call site hands this to a `suggestions` prop typed `readonly MacroSuggestion[]`, in a
// program that HAS dom. `@orb/kit/macro` carries no such hazard — kit is isomorphic by law.

import type { MacroMetadata } from "@orb/kit/macro";
import { createDefaultRegistry, queryMacros } from "@orb/kit/macro";

// ── the curation ─────────────────────────────────────────────────────────────────────────────────────

/** Alternate registered SPELLINGS of a macro this list already offers (`{{charName}}` is `{{char}}`; the
 *  registry carries both so imported ST content resolves either way). Offering both would double every
 *  identity/card row in an eight-row popover for zero new vocabulary — the alias still RESOLVES, it just
 *  isn't advertised. Left of the arrow is what the popover keeps. */
const ALIAS_SPELLINGS = new Set([
  "charName", // ← char
  "userName", // ← user
  "charDescription", // ← description
  "charPersonality", // ← personality
  "charScenario", // ← scenario
  "mesExamples", // ← example
  "get", // ← getvar
  "charIfNotGroup", // ← group
]);

/** Macros the popover CANNOT insert correctly, so it must not offer them. Two kinds, one reason:
 *  · BLOCK-FORM (`if`/`else`, `trim*`, `uppercase`/`lowercase`) need a `{{name}}…{{/name}}` pair around a
 *    body; the popover inserts a bare call, which for these renders nothing and reads as a broken macro.
 *  · WHITESPACE/NO-OP LITERALS (`newline`, `space`, `noop`, `banned`) are typing shortcuts, not prompt
 *    vocabulary — in a textarea the author just presses the key.
 *  Every one of them stays fully supported by the engine; this is an advertising decision, not a capability
 *  one, and the macro browser still documents the whole set. */
const BLOCK_OR_LITERAL_FORMS = new Set(["if", "else", "trim", "trimStart", "trimEnd", "uppercase", "lowercase", "newline", "space", "noop", "banned"]);

/** The bare-`{{` popover shows the first eight matches, so these eight ARE the popover a new author meets:
 *  the core prompt-writing vocabulary, in reading order (who is speaking → to whom → about what → the turn).
 *  Everything else follows name-sorted and is one keystroke of fuzzy search away. */
const LEAD_MACROS = ["char", "user", "persona", "scenario", "description", "personality", "example", "input"];

// ── the derivation ───────────────────────────────────────────────────────────────────────────────────

const EXCLUDED = new Set([...ALIAS_SPELLINGS, ...BLOCK_OR_LITERAL_FORMS].map((n) => n.toLowerCase()));

/** `{{getvar::key}}` rather than `{{getvar}}`: `MacroSuggestion` treats a `:` in the name as the
 *  PARAMETERIZED form — the row reads with its argument and the insert leaves the caret inside the braces,
 *  ready for it. Only a REQUIRED first arg earns this (an all-optional macro like `{{random}}` is complete
 *  as written). */
function suggestionName(meta: MacroMetadata): string {
  const first = meta.args[0];
  return first !== undefined && !first.optional ? `${meta.name}::${first.name}` : meta.name;
}

/** The arg signature the popover shows once a macro is picked — `key, value?`, plus `…` for a variadic tail. */
function argLabels(meta: MacroMetadata): string[] {
  const named = meta.args.map((a) => (a.optional ? `${a.name}?` : a.name));
  return meta.variadic ? [...named, "…"] : named;
}

/** The suggestion shape, spelled STRUCTURALLY rather than imported as `@orb/ui/macro-textarea`'s
 *  `MacroSuggestion` — see the dom-less note in the header (the `user-macro-editor-dialog` precedent). A
 *  subset of `MacroSuggestion`, so the hand-off to every `suggestions` prop still typechecks. Local, not
 *  exported: `PROMPT_MACRO_SUGGESTIONS` stays deliberately unannotated at the export boundary. */
interface DerivedSuggestion {
  readonly name: string;
  readonly category: string;
  readonly description: string;
  // Mutable `string[]` (not `readonly string[]`): `MacroSuggestion.args` is mutable, and a readonly array
  // is not assignable to it — the hand-off at every call site would stop typechecking.
  readonly args?: string[];
}

function toSuggestion(meta: MacroMetadata): DerivedSuggestion {
  const args = argLabels(meta);
  return {
    name: suggestionName(meta),
    category: meta.category,
    description: meta.description,
    ...(args.length > 0 ? { args } : {}),
  };
}

function buildSuggestions(): readonly DerivedSuggestion[] {
  const offered = queryMacros(createDefaultRegistry(), {}).filter((meta) => !EXCLUDED.has(meta.name.toLowerCase()));
  const lead = LEAD_MACROS.flatMap((name) => offered.filter((meta) => meta.name === name));
  const rest = offered.filter((meta) => !LEAD_MACROS.includes(meta.name));
  return [...lead, ...rest].map(toSuggestion);
}

/** The macro catalog a prompt-text field (preset section, guided template, user-macro body) completes
 *  against — the curated projection of the ONE builtin registry. A module-level constant on purpose:
 *  `<MacroTextarea>` memoizes its fuzzy index by the array's IDENTITY, so one stable reference means one
 *  index shared by every authoring field in the app. */
export const PROMPT_MACRO_SUGGESTIONS = buildSuggestions();
