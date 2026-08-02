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
// THE CURATION IS THE PRODUCT CHOICE — it lives in the named consts below (`ALIAS_SPELLINGS`,
// `BLOCK_OR_LITERAL_FORMS`, `BLOCK_INSERTIONS`) plus one ordering const (`LEAD_MACROS`), so a taste pass
// reads ONE place. It is deliberately an EXCLUDE list, not an include list: a macro added to the registry
// tomorrow shows up in the popover automatically (fail-open), which is the property the old hand list could
// never have.
//
// ONE EXPORT, ONE DERIVATION: `withUserMacros(...)` — that curation run over a registry that ALSO carries
// the calling surface's user-macro plane, composed exactly as the macro browser and the turn compose it
// (`createDefaultRegistry` + `registerUserMacros`). A function, not a second list: the plane is form state.
// The builtin-only catalog stays module-private — it is what a plane-less call gets back (one shared array,
// one shared fuzzy index), and every authoring surface in the app has a plane in scope.
//
// DELIBERATELY UNANNOTATED (no `: readonly MacroSuggestion[]`): this module rides the `#lib` barrel, which
// node-side `.ts` tests import — and `@orb/ui/macro-textarea` re-exports its type FROM the browser `.tsx`, so
// even a type-only import drags that component into the DOM-LESS type programs (`tsconfig.json` /
// `tsconfig.tests-dom.json`) and it fails there for want of lib.dom. The shape stays pinned where it is
// consumed: every call site hands this to a `suggestions` prop typed `readonly MacroSuggestion[]`, in a
// program that HAS dom. `@orb/kit/macro` carries no such hazard — kit is isomorphic by law.

import type { MacroMetadata, MacroRegistry, MacroSourceRef, UserMacroDef } from "@orb/kit/macro";
import { createDefaultRegistry, queryMacros, registerUserMacros } from "@orb/kit/macro";

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

/** Macros the popover must not offer as a bare call. Two kinds now, one reason each:
 *  · WHITESPACE/NO-OP LITERALS (`newline`, `space`, `noop`, `banned`) are typing shortcuts, not prompt
 *    vocabulary — in a textarea the author just presses the key.
 *  · `else` is not a macro an author reaches for on its own: it is the second half of an `{{if}}`, and the
 *    `{{if}}` entry below inserts the branch structure that gives it a place to be.
 *  Every one of them stays fully supported by the engine; this is an advertising decision, not a capability
 *  one, and the macro browser still documents the whole set.
 *
 *  BLOCK FORMS ARE NO LONGER HERE (the taste-flag resolution): `if`/`trim*`/`uppercase`/`lowercase` were
 *  excluded because a bare `{{if}}` with no `{{/if}}` reads as a broken macro — that was a limit of the
 *  INSERTION, not of the vocabulary. They now ride {@link BLOCK_INSERTIONS} and insert the whole pair. */
const BLOCK_OR_LITERAL_FORMS = new Set(["else", "newline", "space", "noop", "banned"]);

/** The block-form macros, keyed to the FULL text picking one inserts (`MacroSuggestion.insertTemplate`,
 *  `$0` = where the caret lands). A block macro's body arrives as its last unnamed arg (block capability is
 *  universal — kit `builtin-metadata.ts`), so the pair IS the call: inserting only the opening tag is what
 *  used to make these unofferable. `{{if}}` puts the caret at the PREDICATE (the part only the author can
 *  supply); the text transforms put it in the BODY (their predicate-free form is complete as written). */
const BLOCK_INSERTIONS: Readonly<Record<string, string>> = {
  if: "{{if::$0}}{{/if}}",
  trim: "{{trim}}$0{{/trim}}",
  trimStart: "{{trimStart}}$0{{/trimStart}}",
  trimEnd: "{{trimEnd}}$0{{/trimEnd}}",
  uppercase: "{{uppercase}}$0{{/uppercase}}",
  lowercase: "{{lowercase}}$0{{/lowercase}}",
};

/** Appended to a block form's registry description so the ROW says what picking it does — the label still
 *  reads `{{if}}` (the macro's name is its name), but what lands is a pair. */
const BLOCK_INSERT_NOTE = " Picking it inserts the whole block.";

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
  /** Present ONLY on a block form — the full `{{name}}…{{/name}}` text picking the row inserts, `$0`
   *  marking the caret. Absent ⇒ the textarea's default `{{name}}` / `{{name::}}` insertion. */
  readonly insertTemplate?: string;
}

function toSuggestion(meta: MacroMetadata): DerivedSuggestion {
  const args = argLabels(meta);
  const block = BLOCK_INSERTIONS[meta.name];
  return {
    name: suggestionName(meta),
    category: meta.category,
    description: block === undefined ? meta.description : `${meta.description}${BLOCK_INSERT_NOTE}`,
    ...(args.length > 0 ? { args } : {}),
    ...(block === undefined ? {} : { insertTemplate: block }),
  };
}

/** The curation, applied to whatever registry it is handed (builtins alone, or builtins + a user plane).
 *
 *  THE USER PLANE LEADS. A user macro is the author's OWN vocabulary and the most specific thing in the
 *  registry, and the bare-`{{` popover only shows eight rows — behind the builtin lead it would be
 *  invisible on the very surfaces that exist to author it. The builtins it displaces stay one keystroke of
 *  fuzzy search away, which is the same argument the lead const already makes for every non-lead builtin. */
function curate(registry: MacroRegistry): readonly DerivedSuggestion[] {
  const offered = queryMacros(registry, {}).filter((meta) => !EXCLUDED.has(meta.name.toLowerCase()));
  const user = offered.filter((meta) => meta.category === "user");
  const builtin = offered.filter((meta) => meta.category !== "user");
  const lead = LEAD_MACROS.flatMap((name) => builtin.filter((meta) => meta.name === name));
  const rest = builtin.filter((meta) => !LEAD_MACROS.includes(meta.name));
  return [...user, ...lead, ...rest].map(toSuggestion);
}

/** The macro catalog a prompt-text field (preset section, guided template, user-macro body) completes
 *  against — the curated projection of the ONE builtin registry. A module-level constant on purpose:
 *  `<MacroTextarea>` memoizes its fuzzy index by the array's IDENTITY, so one stable reference means one
 *  index shared by every authoring field in the app. */
const PROMPT_MACRO_SUGGESTIONS = curate(createDefaultRegistry());

// ── the user-macro union ─────────────────────────────────────────────────────────────────────────────

/** What a preset macro reachable from a GAME's editor can honestly say about itself. The game console reads
 *  the preset plane as NAMES ONLY (`RpgConfigView.presetMacroNames` — "never the preset's bodies", the
 *  picks-view least-privilege posture), so the row states the one true thing: the name resolves, and it
 *  comes from the preset. No description is invented and no arg hint is guessed. */
const FOREIGN_PLANE_GLOSS = "From your active preset.";

/** `registerUserMacros` demands a source ref; a SUGGESTION has no such field — {@link toSuggestion} projects
 *  name/category/description/args and nothing else, so this never leaves the composition. That is why
 *  {@link withUserMacros} does not ask its callers for one: an id threaded through four components to be
 *  dropped here is ceremony, and on the game console the preset's id is not even knowable (the names-only
 *  view). Attribution has ONE display home and it is the macro browser, which composes its own registry. */
const COMPOSITION_ONLY_SOURCE: MacroSourceRef = { kind: "preset", id: "" };

/** Keyed by the DEFS array's identity (a form's `userMacros`), then by the rest of the composition — the
 *  memo `<MacroTextarea>`'s identity-keyed fuzzy index needs to pay off: a fresh array every render would
 *  rebuild the whole MiniSearch index on every keystroke. */
const unionCache = new WeakMap<readonly UserMacroDef[], Map<string, readonly DerivedSuggestion[]>>();

/** The completion catalog for a surface that has a USER-MACRO PLANE in scope: the same curation, run over a
 *  registry composed the way evaluation composes it (`createDefaultRegistry` + `registerUserMacros`, the
 *  macro-browser precedent) — so a macro the author just defined completes like any builtin, and one that
 *  collides with a builtin is absent here for exactly the reason it will not resolve there.
 *
 *  PRECEDENCE MIRRORS THE RESOLVER. `userMacros` registers FIRST and kit refuses a name already taken, so
 *  when a game's def and a preset's share a name the GAME's wins — the same outcome the server reaches by
 *  dropping the preset def (`shadowPresetUserMacros`, the ruled specific-over-general collision policy).
 *  Registering in that order is how the popover is kept from advertising a definition the turn will not use.
 *
 *  @param userMacros - the plane this surface AUTHORS (full defs, full metadata).
 *  @param foreignPlaneNames - the OTHER plane's names when the surface can only see names (a game editor's
 *         view of the preset's macros). They still resolve in this surface's prompts, so omitting them would
 *         be a lie of a different kind; see {@link FOREIGN_PLANE_GLOSS}. */
export function withUserMacros(userMacros: readonly UserMacroDef[], foreignPlaneNames: readonly string[] = []): readonly DerivedSuggestion[] {
  // No plane in scope ⇒ hand back the shared constant, so the app-wide fuzzy index is reused verbatim.
  if (userMacros.length === 0 && foreignPlaneNames.length === 0) {
    return PROMPT_MACRO_SUGGESTIONS;
  }
  const byKey = unionCache.get(userMacros) ?? new Map<string, readonly DerivedSuggestion[]>();
  unionCache.set(userMacros, byKey);
  // The foreign plane keys by CONTENT, not identity: it arrives off a query view (whose array identity is
  // not this surface's to rely on), and a short name list's bytes are the honest key.
  const key = foreignPlaneNames.join(" ");
  const cached = byKey.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const registry = createDefaultRegistry();
  registerUserMacros(registry, userMacros, { source: COMPOSITION_ONLY_SOURCE });
  if (foreignPlaneNames.length > 0) {
    const foreign = foreignPlaneNames.map((name): UserMacroDef => ({ name, description: FOREIGN_PLANE_GLOSS, args: [], body: "", inputs: [], strict: false }));
    registerUserMacros(registry, foreign, { source: COMPOSITION_ONLY_SOURCE });
  }
  const built = curate(registry);
  byKey.set(key, built);
  return built;
}
