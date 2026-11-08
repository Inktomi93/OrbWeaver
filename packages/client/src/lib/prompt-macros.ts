// The macro catalog every macro surface reads: the `{{ }}` completion popover of each PROMPT-TEXT field, and the
// macro browser. Homed in lib/ (not a feature) because it has several authoring homes: the preset's
// sections/guided templates, the GAME's own user macros, and the plugin macros the caller's plugins register —
// a feature-local copy would be a sideways import between features, and a second list would drift. Its own
// module so the assembly view-model stays DOM-free (the `@orb/ui/macro-textarea` type surface drags browser TSX
// into the dom-less typecheck:graph — the persona/character precedent).
//
// DERIVED, NEVER AUTHORED. The ONE macro catalog is the kit registry+metadata PAIR (`createDefaultRegistry` ×
// `BUILTIN_MACRO_METADATA`, drift-proofed by D51's composed `volatile`). Every consumer is a DERIVATION with a
// stated lens: the macro BROWSER lists `MacroCatalog.macros` verbatim (the whole registry, user macros
// included), and the AUTOCOMPLETE is those same macros put through the CURATION below.
//
// THE CURATION IS THE PRODUCT CHOICE — it lives in the named consts below (`ALIAS_SPELLINGS`,
// `BLOCK_OR_LITERAL_FORMS`, `BLOCK_INSERTIONS`) plus one ordering const (`LEAD_MACROS`), so a taste pass
// reads ONE place. It is deliberately an EXCLUDE list, not an include list: a macro added to the registry
// tomorrow shows up in the popover automatically (fail-open), which is the property the old hand list could
// never have.
//
// ONE CATALOG, ONE DERIVATION: `macroCatalog(...)` — that curation run over a registry that ALSO carries
// the calling surface's macro planes (the surface's own authored plane, then the planes it can only read:
// another preset's names, plugin macros), composed exactly as the turn composes them (`createDefaultRegistry`
// + `registerUserMacros`). Every plane carries its `MacroSourceRef`, so the completion row and the macro browser
// name where each macro lives. A function, not a second list: the planes are form state and query data. The
// builtin-only catalog is one shared array with one shared fuzzy index — what a plane-less call gets back, and
// what `BUILTIN_MACRO_SUGGESTIONS` exports for a field that renders where no plane is registered.
//
// DELIBERATELY UNANNOTATED (no `: readonly MacroSuggestion[]`): this module rides the `#lib` barrel, which
// node-side `.ts` tests import — and `@orb/ui/macro-textarea` re-exports its type FROM the browser `.tsx`, so
// even a type-only import drags that component into the DOM-LESS type programs (`tsconfig.json` /
// `tsconfig.tests-dom.json`) and it fails there for want of lib.dom. The shape stays pinned where it is
// consumed: every call site hands this to a `suggestions` prop typed `readonly MacroSuggestion[]`, in a
// program that HAS dom. `@orb/kit/macro` carries no such hazard — kit is isomorphic by law.

import type { PluginMacroView } from "@orb/contracts/plugin";
import type { PresetId } from "@orb/kit/ids";
import type { MacroCategory, MacroMetadata, MacroSourceKind, MacroSourceRef, RejectedUserMacro, UserMacroDef } from "@orb/kit/macro";
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
 *  exported: callers read it through `MacroCatalog.suggestions`. */
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
  /** Where the macro lives (`macroSourceLabel`); absent on a builtin. */
  readonly source?: string;
}

/** One authoring home's macros, with the source ref every macro of it carries. The surface's own editable plane
 *  is `current`; the rest are planes the surface can only read. */
export interface MacroPlane {
  readonly source: MacroSourceRef;
  /** What the person calls this home (a preset's or a plugin's name). Absent when the surface does not know it. */
  readonly name?: string | undefined;
  /** The plane this surface edits: the row says "This preset" and the browser offers no link to where the
   *  reader already is. */
  readonly current?: true;
  readonly defs: readonly UserMacroDef[];
}

/** A catalog macro with the plane it came from; `plane` is absent for a builtin. */
export interface CatalogMacro {
  readonly meta: MacroMetadata;
  readonly plane?: MacroPlane;
}

/** The kind word each source row and badge uses; a total Record, so a new source kind fails `tsc` here. */
const SOURCE_KIND_WORDS: Record<MacroSourceKind, string> = {
  preset: "preset",
  game: "game",
  plugin: "plugin",
};

/** The word the macro browser badge shows for a category; total, so a new category fails `tsc`. The completion list keeps the raw category, its grouping key. */
export const MACRO_CATEGORY_WORDS: Readonly<Record<MacroCategory, string>> = {
  identity: "Identity",
  card: "Card",
  conversation: "Conversation",
  variables: "Variables",
  time: "Time",
  random: "Random",
  expression: "Expression",
  system: "System",
  user: "User",
};

/** What the completion row and the browser badge say about a plane: "This preset", "Plugin: Oracle Deck", or the
 *  bare kind when the surface knows no name. */
export function macroSourceLabel(plane: MacroPlane): string {
  const word = SOURCE_KIND_WORDS[plane.source.kind];
  if (plane.current === true) {
    return `This ${word}`;
  }
  const capitalized = `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`;
  return plane.name === undefined ? capitalized : `${capitalized}: ${plane.name}`;
}

/** What a preset macro reachable from a GAME's editor can honestly say about itself. The game console reads
 *  the preset plane as NAMES ONLY (`RpgConfigView.presetMacroNames` — "never the preset's bodies", the
 *  picks-view least-privilege posture), so the row states the one true thing: the name resolves, and it
 *  comes from the preset. No description is invented and no arg hint is guessed. */
const FOREIGN_PLANE_GLOSS = "From your active preset.";

/** The preset plane a game editor sees: names only. `presetId` is the preset those names were read from, so the
 *  browser can link to its editor; `null` when the host runs the built-in default, which has none. */
export function presetNamesPlane(names: readonly string[], presetId: PresetId | null): MacroPlane {
  return {
    source: { kind: "preset", id: presetId },
    defs: names.map((name): UserMacroDef => ({ name, description: FOREIGN_PLANE_GLOSS, args: [], body: "", inputs: [], strict: false })),
  };
}

const pluginPlanesCache = new WeakMap<readonly PluginMacroView[], readonly MacroPlane[]>();

/** One plane per plugin out of `plugin.listMacros`. Plugin macros take no arguments and resolve once per turn,
 *  so the name and description are the whole record; the body is the server's. Keyed by the query data's
 *  identity (TanStack keeps it across refetches that change nothing). */
export function pluginMacroPlanes(views: readonly PluginMacroView[]): readonly MacroPlane[] {
  const cached = pluginPlanesCache.get(views);
  if (cached !== undefined) {
    return cached;
  }
  const byPlugin = new Map<string, { readonly plane: Omit<MacroPlane, "defs">; readonly defs: UserMacroDef[] }>();
  for (const view of views) {
    const entry = byPlugin.get(view.pluginId) ?? { plane: { source: { kind: "plugin", id: view.pluginId }, name: view.pluginName }, defs: [] };
    entry.defs.push({ name: view.name, description: view.description, args: [], body: "", inputs: [], strict: false });
    byPlugin.set(view.pluginId, entry);
  }
  const planes = [...byPlugin.values()].map(({ plane, defs }): MacroPlane => ({ ...plane, defs }));
  pluginPlanesCache.set(views, planes);
  return planes;
}

function toSuggestion({ meta, plane }: CatalogMacro): DerivedSuggestion {
  const args = argLabels(meta);
  const block = BLOCK_INSERTIONS[meta.name];
  return {
    name: suggestionName(meta),
    category: meta.category,
    description: block === undefined ? meta.description : `${meta.description}${BLOCK_INSERT_NOTE}`,
    ...(args.length > 0 ? { args } : {}),
    ...(block === undefined ? {} : { insertTemplate: block }),
    ...(plane === undefined ? {} : { source: macroSourceLabel(plane) }),
  };
}

/** The curation, applied to a catalog's macros (builtins alone, or builtins + the surface's planes).
 *
 *  THE AUTHORED PLANES LEAD. A preset's or game's macro is the author's OWN vocabulary and the most specific
 *  thing in the registry, and the bare-`{{` popover only shows eight rows — behind the builtin lead it would be
 *  invisible on the very surfaces that exist to author it. The builtins it displaces stay one keystroke of
 *  fuzzy search away, which is the same argument the lead const already makes for every non-lead builtin.
 *
 *  PLUGIN MACROS FOLLOW THE LEAD. They are installed vocabulary, not authored here, and sixteen of them per
 *  plugin would push `{{char}}` and `{{user}}` out of the eight rows a new author meets. */
function curate(macros: readonly CatalogMacro[]): readonly DerivedSuggestion[] {
  const offered = macros.filter(({ meta }) => !EXCLUDED.has(meta.name.toLowerCase()));
  const isPlugin = ({ plane }: CatalogMacro): boolean => plane?.source.kind === "plugin";
  const authored = offered.filter((entry) => entry.meta.category === "user" && !isPlugin(entry));
  const plugin = offered.filter(isPlugin);
  const builtin = offered.filter((entry) => entry.meta.category !== "user");
  const lead = LEAD_MACROS.flatMap((name) => builtin.filter(({ meta }) => meta.name === name));
  const rest = builtin.filter(({ meta }) => !LEAD_MACROS.includes(meta.name));
  return [...authored, ...lead, ...plugin, ...rest].map(toSuggestion);
}

/** Everything one surface offers an author about macros: the `{{` completion rows, the whole browsable
 *  list, and the definitions registration refused. */
export interface MacroCatalog {
  readonly suggestions: readonly DerivedSuggestion[];
  readonly macros: readonly CatalogMacro[];
  readonly rejected: readonly RejectedUserMacro[];
}

/** Compose a catalog the way a turn composes its registry: the default registry, then each plane in order. Kit
 *  refuses a name already taken, so plane order IS precedence. */
function composeCatalog(planes: readonly MacroPlane[]): MacroCatalog {
  const registry = createDefaultRegistry();
  // A name an EARLIER plane already holds is the ruled specific-over-general shadow, not an authoring error: the
  // server drops the later def without a word, so the catalog does not report it as refused either.
  const rejected = planes.flatMap((plane, index) => {
    const earlier = new Set(planes.slice(0, index).flatMap((p) => p.defs.map((def) => def.name.toLowerCase())));
    return registerUserMacros(registry, plane.defs, { source: plane.source }).rejected.filter((r) => !earlier.has(r.name.toLowerCase()));
  });
  const planeOf = (name: string): MacroPlane | undefined => planes.find((plane) => plane.defs.some((def) => def.name.toLowerCase() === name.toLowerCase()));
  const macros = queryMacros(registry).map((meta): CatalogMacro => {
    const plane = meta.source === undefined ? undefined : planeOf(meta.name);
    return plane === undefined ? { meta } : { meta, plane };
  });
  return { suggestions: curate(macros), macros, rejected };
}

/** The builtin-only catalog. A module-level constant on purpose: `<MacroTextarea>` memoizes its fuzzy index by
 *  the suggestions array's IDENTITY, so one stable reference means one index shared by every authoring field in
 *  the app. */
const BUILTIN_CATALOG = composeCatalog([]);

/** The builtin macros alone, for a field that renders where no preset, game or plugin macro is registered. */
export const BUILTIN_MACRO_SUGGESTIONS = BUILTIN_CATALOG.suggestions;

/** Keyed by the AUTHORED defs array's identity (a form's `userMacros`, a query's preset config), then by the rest
 *  of the composition — the memo `<MacroTextarea>`'s identity-keyed fuzzy index needs to pay off: a fresh array
 *  every render would rebuild the whole MiniSearch index on every keystroke. */
const catalogCache = new WeakMap<readonly UserMacroDef[], Map<string, MacroCatalog>>();

/** The planes' content, as the cache key. The context planes arrive off query views and fresh per render, so
 *  their bytes — not their array identity — are the honest key. */
function compositionKey(authored: MacroPlane, context: readonly MacroPlane[]): string {
  const plane = (p: MacroPlane): unknown => [p.source.kind, p.source.id, p.name, p.current === true, p.defs.map((def) => [def.name, def.description])];
  return JSON.stringify([authored.source.kind, authored.source.id, authored.name, authored.current === true, context.map(plane)]);
}

/** The catalog for a surface: its `authored` plane first, then the `context` planes it can read. Precedence
 *  mirrors the resolver: when a game's def and a preset's share a name the GAME's wins, the outcome the server
 *  reaches by dropping the preset def (`shadowPresetUserMacros`), so the popover never advertises a definition
 *  the turn will not use. A name that collides with a builtin is absent for exactly the reason it will not
 *  resolve. */
export function macroCatalog(authored: MacroPlane, context: readonly MacroPlane[] = []): MacroCatalog {
  // No macro in scope ⇒ hand back the shared constant, so the app-wide fuzzy index is reused verbatim.
  if (authored.defs.length === 0 && context.every((plane) => plane.defs.length === 0)) {
    return BUILTIN_CATALOG;
  }
  const byKey = catalogCache.get(authored.defs) ?? new Map<string, MacroCatalog>();
  catalogCache.set(authored.defs, byKey);
  const key = compositionKey(authored, context);
  const cached = byKey.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const built = composeCatalog([authored, ...context]);
  byKey.set(key, built);
  return built;
}
