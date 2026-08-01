// The Data view's REFERENCE SCAN (preset-surface-redesign.md §7) — pure, node-safe. For each variable
// (ChoiceBlock) and user macro this preset declares, WHERE inside this same preset is `{{name}}` written?
//
// The decision it informs: "is this safe to rename or delete, and where do I look first?" — which is
// exactly the question an editor with no reference view answers by making you grep your own prompt.
//
// HONESTLY SCOPED, and the scoping is the whole point: a ZERO count means "no references in THIS preset",
// never "dead". A macro can legitimately be consumed at chat time by a surface outside the preset (a room
// override, an rpg view, a message the user types), and none of that is visible from here — so the panel
// says what it counted, and claims nothing else.
//
// It is a client derivation over the SAVED config: no server read, no new query, no freshness row.

import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import { MARKER_COPY } from "../components/prompt-assembly/marker-copy";

/** One place a name is written. `sectionId` is present only for a SECTION consumer — it is the key the
 *  panel's selection echo needs (§16 row 19); a template/nudge consumer has no rack row to select. */
export interface ReferenceSite {
  readonly label: string;
  readonly sectionId?: string | undefined;
}

/** One declared name + everywhere this preset writes it. */
export interface ReferenceCount {
  readonly name: string;
  readonly kind: "variable" | "macro";
  readonly sites: readonly ReferenceSite[];
}

/** One `{{…}}` occurrence, capturing its inner text. Mirrors the engine's own display grammar
 *  (`kit/macro/parser.ts` `DISPLAY_MACRO_RE`), so `{{ pov }}` is counted exactly as the engine resolves
 *  it. Case-insensitive, like the engine's lookup. */
const MACRO_OCCURRENCE_RE = /\{\{\s*([^{}]+?)\s*\}\}/gi;
/** The head ends at the first argument/filter separator — `{{pov:upper}}` and `{{pov first}}` are both
 *  references to `pov`. */
const MACRO_HEAD_SPLIT_RE = /[:|\s]/u;

/** Every macro NAME referenced by `text`, lower-cased — the head of each `{{…}}` occurrence. */
function referencedNames(text: string): ReadonlySet<string> {
  const names = new Set<string>();
  for (const match of text.matchAll(MACRO_OCCURRENCE_RE)) {
    const head = match[1]?.split(MACRO_HEAD_SPLIT_RE)[0];
    if (head !== undefined && head !== "") {
      names.add(head.toLowerCase());
    }
  }
  return names;
}

/** The author-facing name of a section (its own name, else its marker's copy). */
function sectionLabel(section: PromptSection): string {
  if (section.name.trim() !== "") {
    return section.name;
  }
  return section.type === "marker" ? MARKER_COPY[section.marker].label : "Literal text";
}

/** The text a section contributes for scanning — a literal's content or a templated marker's CUSTOM
 *  template. A carrier has no author text, and the factory default is not the author's writing, so
 *  neither is scanned (a reference the user cannot see in their own editor is not a reference they can act
 *  on). */
function sectionText(section: PromptSection): string {
  if (section.type === "literal") {
    return section.content;
  }
  return ("template" in section ? section.template : undefined) ?? "";
}

/** One scannable place in the preset, paired with the names it references. Built ONCE per scan (not once
 *  per declared name), so the whole panel costs one pass over the config rather than N. */
interface ScannedSite extends ReferenceSite {
  readonly names: ReadonlySet<string>;
  /** A macro body never counts as a reference to ITSELF — that is recursion, not a consumer. */
  readonly ownName?: string | undefined;
}

/** Every place in this preset that can reference a macro, with what each one references. */
function scannedSites(config: PromptConfig): readonly ScannedSite[] {
  const sections = config.sections.map((section) => ({
    label: sectionLabel(section),
    sectionId: section.id,
    names: referencedNames(sectionText(section)),
  }));
  const guided = Object.entries(config.guidedActions ?? {}).map(([kind, action]) => ({
    label: `${kind} template`,
    names: referencedNames(action.prompt),
  }));
  const formats = Object.entries(config.formatStrings ?? {}).map(([key, value]) => ({
    label: key,
    names: referencedNames(typeof value === "string" ? value : ""),
  }));
  const macros = config.userMacros.map((macro) => ({
    label: `${macro.name} macro body`,
    names: referencedNames(macro.body),
    ownName: macro.name.toLowerCase(),
  }));
  return [...sections, ...guided, ...formats, ...macros];
}

/** Every variable + user macro this preset declares, with their in-preset reference sites. Declaration
 *  order (variables then macros) — the same order the Data view lists them, so the eye maps one to one. */
export function scanReferences(config: PromptConfig): readonly ReferenceCount[] {
  const sites = scannedSites(config);
  const sitesFor = (name: string): readonly ReferenceSite[] => {
    const needle = name.toLowerCase();
    return sites.filter((site) => site.ownName !== needle && site.names.has(needle)).map((site) => ({ label: site.label, sectionId: site.sectionId }));
  };
  const variables: ReferenceCount[] = config.variables.map((variable) => ({ name: variable.name, kind: "variable", sites: sitesFor(variable.name) }));
  const macros: ReferenceCount[] = config.userMacros.map((macro) => ({ name: macro.name, kind: "macro", sites: sitesFor(macro.name) }));
  return [...variables, ...macros];
}
