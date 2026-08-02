// The Actions view's ROW MODEL (preset-surface-redesign.md §6.1/§6.6) — pure, node-safe. Everything the
// list and the drill-in render is DERIVED from `TEMPLATE_DEFS` (the contracts registry): the groups, the
// row copy, the kind badge, the ghost bytes, and which capability fields the editor offers.
//
// This file adds exactly ONE thing the registry cannot carry: WHICH FORM PATH a def edits. A def's `id` is
// either a `GuidedActionKind` (→ `guidedActions.<kind>.{prompt,role,depth}`) or a format-string key (→ the
// plain string at `formatStrings.<key>`), and only the client knows the form shape. The split is derived
// from `GUIDED_ACTION_KINDS`, never a second list of names.
//
// WHY IT IS PURE: the registration cost for a new template stays "one enum member + one def row" (the D117
// shape). Nothing here enumerates templates — it maps over whatever the registry holds.

import type { GuidedActionKind, PromptConfig, TemplateDef, TemplateDefId, TemplateKind } from "@orb/contracts/preset";
import { GUIDED_ACTION_KINDS, PRESET_PROSE_SLOTS, TEMPLATE_DEFS, TEMPLATE_KINDS } from "@orb/contracts/preset";

/** One registry row, resolved for the client: the def plus which slot shape it edits. */
export interface TemplateRow {
  readonly def: TemplateDef;
  /** A guided action carries role/depth beside its prompt; a format string is a bare string. */
  readonly guidedKind: GuidedActionKind | undefined;
  /** The PROSE-1 default bytes this row ghosts. `""` where the slot ships none (`newChatMarker`: blank
   *  IS the shipped behavior, so there is nothing to ghost — the row says "off" instead of lying). */
  readonly factoryDefault: string;
}

/** One kicker-headed group in the Actions list, in `TEMPLATE_KINDS` order. */
export interface TemplateGroup {
  readonly kind: TemplateKind;
  readonly rows: readonly TemplateRow[];
}

const GUIDED_KIND_SET: ReadonlySet<string> = new Set<string>(GUIDED_ACTION_KINDS);

/** Which ARM of `TemplateDefId` an id is — the one derivation the whole file's form-path split rides. */
function isGuidedActionKind(id: TemplateDefId): id is GuidedActionKind {
  return GUIDED_KIND_SET.has(id);
}

/** The GROUP HEADING for one registry kind. The enum member is a code identifier (`steer`, `voice`) — the
 *  kicker over a group of rows is a heading a person reads, so it gets a human plural (side-eye F-30 /
 *  ARIA rec 10). Keyed by the union, so a new kind is a `tsc` error here until it has a label — the D117
 *  registration cost, unchanged. The per-row KIND CHIP deliberately keeps the raw member: it is a
 *  taxonomy tag echoing the registry's own vocabulary, and the mock draws it that way. */
export const TEMPLATE_KIND_LABEL: Record<TemplateKind, string> = {
  steer: "Steers",
  voice: "Voice",
  studio: "Studio",
  format: "Format",
  nudge: "Nudges",
};

/** The ONE place a def's id becomes a form shape. */
function templateRow(def: TemplateDef): TemplateRow {
  const slot = def.defaultSlot;
  return {
    def,
    guidedKind: isGuidedActionKind(def.id) ? def.id : undefined,
    factoryDefault: slot === undefined ? "" : PRESET_PROSE_SLOTS[slot].text,
  };
}

/** The whole list, grouped by the registry's own `kind` in tuple order. A kind with no defs yields no
 *  group (an empty kicker over nothing is chrome). */
export function templateGroups(): readonly TemplateGroup[] {
  return TEMPLATE_KINDS.map((kind) => ({ kind, rows: TEMPLATE_DEFS.filter((def) => def.kind === kind).map(templateRow) })).filter(
    (group) => group.rows.length > 0,
  );
}

/** The row for one def id, or `undefined` when the id is stale (a drilled row whose def vanished). */
export function templateRowById(id: string): TemplateRow | undefined {
  const def = TEMPLATE_DEFS.find((entry) => entry.id === id);
  return def === undefined ? undefined : templateRow(def);
}

/** The bytes a preset STORES for one template id — the same "which form path" answer this file already owns,
 *  applied to a saved config instead of a live form. The readout's unbound preview reads through here so it
 *  and the Actions row can never print two different templates for one row. `""` = nothing stored, which
 *  means "the shipped default rides" (the storage semantic everywhere in this schema) — the caller ghosts it
 *  through {@link templatePreview}, exactly as the row does. */
export function templateStoredText(config: PromptConfig, id: string): string {
  const row = templateRowById(id);
  if (row === undefined) {
    return "";
  }
  const defId = row.def.id;
  // `TemplateDefId` has exactly two arms, so the guided predicate IS the split — the else branch is a
  // `FormatStringKey` by narrowing rather than by a second assertion.
  return isGuidedActionKind(defId) ? (config.guidedActions?.[defId].prompt ?? "") : (config.formatStrings?.[defId] ?? "");
}

/** Default / Customized — the state chip's derivation, shared by the row and the drill-in. EMPTY IS THE
 *  DEFAULT (the landed `guidedFooterState` semantic, §16 row 24): clearing the field IS the reset, so an
 *  empty template reads "Default" exactly like an untouched one. */
export function isCustomized(value: string | undefined, factoryDefault: string): boolean {
  const text = value ?? "";
  return text.trim() !== "" && text !== factoryDefault;
}

/** The row's one-line mono preview: the author's text when they wrote one, else the ghosted default —
 *  and, where the slot ships no bytes at all, the honest "(blank — off)". */
export function templatePreview(value: string | undefined, factoryDefault: string): string {
  const text = value ?? "";
  if (text.trim() !== "") {
    return text;
  }
  return factoryDefault === "" ? "(blank — off)" : factoryDefault;
}
