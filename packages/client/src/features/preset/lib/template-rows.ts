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

import type { GuidedActionKind, PromptConfig, TemplateClusterId, TemplateDef, TemplateDefId, TemplateKind } from "@orb/contracts/preset";
import { GUIDED_ACTION_KINDS, TEMPLATE_CLUSTERS, TEMPLATE_DEFS, TEMPLATE_KINDS } from "@orb/contracts/preset";
import type { ProseSlotId } from "@orb/contracts/prose";
import { isPresetProseSlotId, PROSE_SLOTS } from "@orb/contracts/prose";

/** One registry row, resolved for the client: the def plus which slot shape it edits. */
export interface TemplateRow {
  readonly def: TemplateDef;
  /** A guided action carries role/depth beside its prompt; a format string is a bare string. */
  readonly guidedKind: GuidedActionKind | undefined;
  /** The THIRD form path (2026-08-07): a turn-wire framing, stored as `prose[<id>]` — a `{text, baseVersion}`
   *  record rather than a bare string, so its write re-stamps the version the edit was authored against. */
  readonly proseSlotId: ProseSlotId | undefined;
  /** The PROSE-1 default bytes this row ghosts. */
  readonly factoryDefault: string;
}

/** One disclosure-banded SUB-CLUSTER inside a group (the Actions-tab IA §2.1) — the registry's own
 *  `cluster` declarations, banded in `TEMPLATE_CLUSTERS` tuple order, rows in registry order within. */
export interface TemplateRowCluster {
  readonly id: TemplateClusterId;
  readonly label: string;
  readonly rows: readonly TemplateRow[];
}

/** One kicker-headed group in the Actions list, in `TEMPLATE_KINDS` order. `rows` are the FLAT
 *  (cluster-less) members; `clusters` are the banded ones — a kind has one or the other in practice, but
 *  the shape permits both so a kind can grow its first band without a shape change. */
export interface TemplateGroup {
  readonly kind: TemplateKind;
  readonly rows: readonly TemplateRow[];
  readonly clusters: readonly TemplateRowCluster[];
}

const GUIDED_KIND_SET: ReadonlySet<string> = new Set<string>(GUIDED_ACTION_KINDS);

/** Which ARM of `TemplateDefId` an id is — the one derivation the whole file's form-path split rides. */
function isGuidedActionKind(id: TemplateDefId): id is GuidedActionKind {
  return GUIDED_KIND_SET.has(id);
}

/** The GROUP HEADING for one registry kind. The enum member is a code identifier (`steer`, `voice`) — the
 *  kicker over a group of rows is a heading a person reads, so it gets a human plural (side-eye F-30 /
 *  ARIA rec 10). Keyed by the union, so a new kind is a `tsc` error here until it has a label — the D117
 *  registration cost, unchanged. The raw member survives as a taxonomy chip ONLY in the drill-in header
 *  (the LIST dropped it with the IA — under a kind-titled kicker it discriminated nothing on any row). */
export const TEMPLATE_KIND_LABEL: Record<TemplateKind, string> = {
  steer: "Steers",
  voice: "Voice",
  studio: "Studio",
  format: "Format",
  nudge: "Nudges",
  // The F4 re-home (2026-08-08). The kicker names the SURFACE: every row here reaches the model only on a
  // MULTI-character round, and that — not "chat" — is what a preset author needs told.
  group: "Group rounds",
  // The rpg re-home (2026-08-08). The kicker names the SURFACE, not the domain enum: every row in this group
  // reaches the model only on a game turn, and that — not "rpg" — is what a preset author needs told.
  teach: "Game teaches",
  // The WRITE-surface twin (PROSE-1 S4). Same rule as `teach`: the kicker names the SURFACE a preset author
  // is actually tuning — these rows reach the model on the STATE ROUND that reads the beat back into the
  // panel, which is a different call from the one the game teaches shape.
  extract: "State tracking",
};

/** The BAND label over one sub-cluster (the Actions-tab IA §2.1) — keyed by the contracts union, so a new
 *  cluster id fails `tsc` HERE until labeled: the `TEMPLATE_KIND_LABEL` registration shape, one level down.
 *  Kicker-voiced copy a person reads (the bands are the map; the rows inside no longer re-say these nouns —
 *  X-7 anti-echo). Owner-vetoable chrome copy, deliberately ALL in this one file.
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export const TEMPLATE_CLUSTER_LABEL: Record<TemplateClusterId, string> = {
  round: "Round framing",
  scene: "The scene plane",
  party: "Party & trackers",
  planes: "Inventory, quests & journal",
  tools: "Tool descriptions",
  refs: "The ref block",
};

/** The tab's teaching sentence (the Actions-tab IA §2.5). Its predecessor taught `{{input}}` steering —
 *  true for 9 of 67 rows; the `{{input}}` teaching lives where it is true per-row (the drill-in's token
 *  vocabulary and its missing-`{{input}}` warning). Homed HERE with the other reword-able chrome copy. */
export const ACTIONS_TAB_TEACH = "Every prompt template this preset authors — select a row to see where it lands, drill in to edit it.";

/** WHERE a kind's bytes reach the model — the readout's DELIVERY PATH dispatch (the Actions-tab IA §2.3,
 *  derived from the LIVE assembly code, receipts in the design doc §1). `marker` renders the standing
 *  `guided_instruction` cluster (health · position · role · cross-link); `static` renders the kind's own
 *  truth. Exhaustive over `TemplateKind`, so a new kind fails `tsc` here until its delivery is stated —
 *  which is precisely how the teach/extract rows shipped a FALSE marker cluster for a night.
 *
 *  The alias is UNEXPORTED on purpose (no-inline-types: a feature `lib/` is not a type home): every consumer
 *  reads the exported VALUE below and narrows on `.kind` structurally — nothing needs the name. */
type TemplateDelivery =
  | { readonly kind: "marker" }
  | {
      readonly kind: "static";
      /** The channel datum ("The game turn") — the static arm's answer to the marker arm's name row. */
      readonly channel: string;
      /** The delivery sentence. The selected row's own `fires` line renders beneath it as the specific. */
      readonly body: string;
    };

export const TEMPLATE_KIND_DELIVERY: Record<TemplateKind, TemplateDelivery> = {
  // The guided family: a `system`-role steer rides the `{{guided_instruction}}` marker (loud injection
  // fallback when the preset lacks it); user/assistant roles ride a depth-N injection. The marker cluster
  // stays the load-bearing "will my steer LAND" fact for all three kinds.
  steer: { kind: "marker" },
  voice: { kind: "marker" },
  studio: { kind: "marker" },
  nudge: {
    kind: "static",
    channel: "The next user turn",
    body: "Appended to the history as the newest user-role turn when its action fires with nothing typed. It rides the turn itself — the Guided instruction marker plays no part.",
  },
  format: {
    kind: "static",
    channel: "The outgoing wire",
    body: "Applied by the assembler wherever the wire's shape calls for it — wrapping an injection, marking the history's start, or cueing a continuation.",
  },
  group: {
    kind: "static",
    channel: "The group round",
    body: "Applied by the assembler on a MULTI-character round — the co-speaker card headings into the card walk, the round and narrator nudges as the round's trailing user turn. Fires only while this preset drives a group or narrator room.",
  },
  teach: {
    kind: "static",
    channel: "The game turn",
    body: "Composed into the steering reminder — one system note near the prompt's tail, rebuilt every game turn. Fires only while this preset drives a chat with a game running.",
  },
  extract: {
    kind: "static",
    channel: "The state round",
    body: "A separate extraction call after each beat records the tracked state (a folded game mounts it on the turn's terminal tools). These bytes never enter the chat prompt itself.",
  },
};

/** The UNBOUND preview's trailing gloss, per kind — its predecessor claimed "every macro here resolves in
 *  chat" for all 67 rows, false for the game rows (extract tokens are DATA the seam splices; the chat macro
 *  engine passes them through untouched — `kit/macro/evaluator.ts`'s passthrough). */
export const TEMPLATE_KIND_UNBOUND_GLOSS: Record<TemplateKind, string> = {
  steer: "Every macro here resolves in chat — open a chat and this readout binds to it, showing what the model actually receives.",
  voice: "Every macro here resolves in chat — open a chat and this readout binds to it, showing what the model actually receives.",
  studio: "Every macro here resolves in chat — open a chat and this readout binds to it, showing what the model actually receives.",
  nudge: "Every macro here resolves in chat — open a chat and this readout binds to it, showing what the model actually receives.",
  format: "Macros here fill when the assembler applies this row to a real turn — a frame's {{note}} is the wrapped injection's own content.",
  group:
    "The {{name}}/{{names}} tokens here are spliced from the round's characters per member when the assembler builds a group round — they are not chat macros.",
  teach: "{{user}} and {{char}} resolve through the chat's identity registry on each game turn — open a game chat and this readout binds to it.",
  extract:
    "Braced tokens here are spliced from the game's own data at the state round — they are not chat macros. Binding a chat resolves only the identity names.",
};

/** The BOUND gloss's fire-time tail, per kind — the phrase after the surviving-token list. Its predecessor
 *  said "they fill in when you click" for every row; only the guided family fires on a click. */
export const TEMPLATE_KIND_FIRE_TIME: Record<TemplateKind, string> = {
  steer: "they fill in when you fire the action",
  voice: "they fill in when you fire the action",
  studio: "they fill in when you fire the action",
  nudge: "they fill in when the nudge fires",
  format: "they fill at assembly, per turn",
  group: "they are spliced per member each group round",
  teach: "they resolve on each game turn",
  extract: "they are spliced from game data at the state round",
};

/** The ONE place a def's id becomes a form shape. */
function templateRow(def: TemplateDef): TemplateRow {
  return {
    def,
    guidedKind: isGuidedActionKind(def.id) ? def.id : undefined,
    proseSlotId: isPresetProseSlotId(def.id) ? def.id : undefined,
    factoryDefault: PROSE_SLOTS[def.defaultSlot].text,
  };
}

/** Does a row match the tab's filter? Over the two strings a reader can SEE (label + fires) — matching
 *  hidden fields would make rows appear for no visible reason. `""` matches everything (no filter).
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function templateRowMatches(row: TemplateRow, filter: string): boolean {
  const needle = filter.trim().toLowerCase();
  if (needle === "") {
    return true;
  }
  return row.def.label.toLowerCase().includes(needle) || row.def.fires.toLowerCase().includes(needle);
}

/** The whole list, grouped by the registry's own `kind` in tuple order, filtered by the tab's filter box
 *  (`""` = everything). Within a group, rows DECLARING a cluster band under it (in `TEMPLATE_CLUSTERS` tuple
 *  order, registry order within); the rest render flat above the bands. A kind — or a cluster — with no
 *  matching rows yields no group/band (an empty kicker over nothing is chrome; a band with zero matches
 *  while filtering would be a door onto nothing). */
export function templateGroups(filter = ""): readonly TemplateGroup[] {
  return TEMPLATE_KINDS.map((kind): TemplateGroup => {
    const members = TEMPLATE_DEFS.filter((def) => def.kind === kind)
      .map(templateRow)
      .filter((row) => templateRowMatches(row, filter));
    return {
      kind,
      rows: members.filter((row) => row.def.cluster === undefined),
      clusters: TEMPLATE_CLUSTERS.map((id) => ({
        id,
        label: TEMPLATE_CLUSTER_LABEL[id],
        rows: members.filter((row) => row.def.cluster === id),
      })).filter((cluster) => cluster.rows.length > 0),
    };
  }).filter((group) => group.rows.length > 0 || group.clusters.length > 0);
}

/** The row for one def id, or `undefined` when the id is stale (a drilled row whose def vanished). */
export function templateRowById(id: string): TemplateRow | undefined {
  const def = TEMPLATE_DEFS.find((entry) => entry.id === id);
  return def === undefined ? undefined : templateRow(def);
}

/** WHICH row the Actions surface is INSPECTING, from the raw store id — the selected row, else the registry's
 *  first (which is also the row at the top of the list, so the default is what the eye already lands on). A
 *  STALE id takes the same fallback rather than blanking the panel.
 *
 *  ONE HOME, and that is the whole point (side-eye 2026-08-08 P2). The readout owned this fallback privately,
 *  so with nothing selected it printed row 1's delivery path and resolved preview as authoritative CONTEXT
 *  while the list beside it highlighted NOTHING — the reader was given a specific answer with no way to see
 *  which question it answered. Both panes derive the inspected row from here now, so "the highlighted row"
 *  and "the row the readout describes" cannot disagree, at open or ever.
 *
 *  `TEMPLATE_DEFS` is a non-empty const tuple, so the fallback always resolves — there is no empty-registry
 *  arm to fake, and the return type says so. */
export function inspectedTemplateRow(selectedId: string | null): TemplateRow {
  const picked = selectedId === null ? undefined : templateRowById(selectedId);
  return picked ?? templateRow(TEMPLATE_DEFS[0]);
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
  // `TemplateDefId` has three arms, each with its own predicate — the last one narrows to `FormatStringKey`
  // by elimination rather than by an assertion.
  if (isGuidedActionKind(defId)) {
    return config.guidedActions?.[defId].prompt ?? "";
  }
  if (isPresetProseSlotId(defId)) {
    return config.prose[defId]?.text ?? "";
  }
  return config.formatStrings?.[defId] ?? "";
}

/** The next whole `prose` record after ONE KEYSTROKE in a framing template. The preset form's values are a
 *  `PromptConfig`, and a slot id contains DOTS — which TanStack Form reads as a value PATH — so a framing row
 *  cannot be bound with an `AppField` on a `prose.<id>.text` name; it writes the record wholesale at the
 *  single-segment path `prose`, the same way the delivery cluster writes role/depth. Storage keeps the
 *  canonical slot-id key (an id is the key a host's override is stored under — never a dashed alias here,
 *  where the value IS the stored blob).
 *
 *  THE TEXT IS STORED VERBATIM — no trim, no delete-on-blank. This is a DRAFT write feeding a CONTROLLED
 *  textarea, so anything this function refuses to keep, React hands straight back to the field on the next
 *  render: an earlier version trimmed here and the editor became untypeable — every space and newline the
 *  author pressed was erased on the very next keystroke (`Note x` → `Notex`, `a⏎b` → `ab`), so multi-word
 *  text could only arrive by PASTE. Normalization is a SAVE-boundary act and lives in
 *  `preset-editor-model`'s `normalizePresetProse`, exactly where the empty-compaction strip already lives.
 *  This is also how the `formatStrings` rows have always behaved (a plain `AppField` stores what you type);
 *  the framing rows now match them instead of inventing a stricter keystroke.
 *
 *  `baseVersion` is stamped on every draft: any save re-stamps, which is what "keep mine" means (§4.4). */
export function proseTemplateDraft(config: PromptConfig, id: ProseSlotId, value: string): PromptConfig["prose"] {
  return { ...config.prose, [id]: { text: value, baseVersion: PROSE_SLOTS[id].version } };
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
