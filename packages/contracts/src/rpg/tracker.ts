// @orb/contracts/rpg/tracker — THE tracked-field unification (`docs/design/tracked-field-unification.md`
// §5, owner-approved 2026-07-31; noun = TRACKER). ONE def replaces the four names the panel used to carry for
// the same concept — pool (`sheet.poolDefs`), meter/cast field (`features.castFields`), band orb
// (`features.pinnedOrbs`), HUD widget (the dropped `rpg_hud_widgets` table). They were never siblings; they
// were ONE def read along four AXES:
//   • `subject` — actor (per-carrier) vs game (one value on the snapshot; the old widgets)
//   • `shape`   — meter (value/max) · text · list (the old widget `items[]`)
//   • `write`   — delta (a resource you spend/restore) vs set (a state you observe) — this drives the TOOL
//                 ARM the model gets, its mental model, and the panel read (a bar you drain vs a gauge)
//   • carriers  — `appliesTo` class or explicit actor list, ± per-actor grants/revokes off the SHEET
//
// NO LEGACY (owner ruling 2026-08-01, "we haven't launched — there shouldn't be legacy anything"): the old
// shapes are REPLACED outright. There is no lift-at-parse, no dual read, no compat wire arm.
//
// ADDRESSING IS BY `key`, ALWAYS. The old surfaces addressed by NAME/LABEL (`pools[].name`, `widgetValues`
// keyed by widget label), so a rename orphaned every stored value. A tracker's `key` is minted once and never
// re-spelled; `label` is free to change.
//
// CARRIER RESOLUTION IS ONE PURE FUNCTION ({@link carriesTracker}) — the effective carrier set is
// `resolve(appliesTo) + grants − revokes`, and every consumer (the panel read, the reminder, the per-actor
// write-schema assembly) derives from it rather than re-deciding who carries what.

import { z } from "zod";
import type { RpgTrackerCarrierClass } from "./enums";
import { RPG_TRACKER_CARRIER_CLASSES, RPG_TRACKER_SHAPES, RPG_TRACKER_SUBJECTS, RPG_TRACKER_WRITES } from "./enums";

/** The steering-HINT cap — a short prose gloss. ONE home for every host-authored gloss in the game (the
 *  tracker `hint`, the M1 custom-relationship hints, the R4c custom-journal-type hints); homed HERE because
 *  the tracker hint is the load-bearing one (R4b: the gloss is what makes a tracked value steer at all) and
 *  because `config.ts` imports THIS module, not the other way round. */
export const RPG_HINT_MAX = 120;

/** The strict tracker-color grammar (owner-ruled FREE HEX, inherited verbatim from the retired pool-color
 *  home): a 3/6-digit hex or a numeric `oklch(L C H)` (optional `deg` hue + `/ alpha`) — a COLOR literal,
 *  never raw CSS (no `var()`, no `color-mix()`, no url/expression vector). Free hex deliberately does NOT
 *  theme-adapt — accepted: the bar/orb geometry is decorative (aria-hidden), the value TEXT rides theme
 *  tokens. ASCII match, no `u`. */
export const RPG_TRACKER_COLOR_RE =
  /^(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|oklch\(\s*\d+(\.\d+)?%?\s+\d+(\.\d+)?\s+\d+(\.\d+)?(deg)?\s*(\/\s*\d+(\.\d+)?%?\s*)?\))$/;

/** Who an actor-subject tracker applies to BEFORE per-actor exceptions: a carrier CLASS (`party` = the
 *  roster's character/user actors · `npcs` = scene `cast` actors · `everyone` = both) or an explicit actor
 *  list (the ad-hoc arm — "the act-3 demon's Bound Will", a personal field on two named characters). The
 *  classes are honest to what the old surfaces actually were: pool defs were per-party-member, cast fields
 *  were per-NPC. Ignored entirely on a `subject:"game"` tracker (there is no carrier to resolve).
 *
 *  The explicit arm holds ACTOR-REF KEYS (`actorRefKey`'s `character:<id>`/`user:<id>`/`cast:<name>` — the ONE
 *  string projection every map/lock/find already keys on), not embedded ref objects: it keeps this module free
 *  of an `./actor` import (which imports THIS one for the value plane — the cycle is physics, not taste), and
 *  it stores flat, so a carrier list reads the same as a lock path. */
export const rpgTrackerAppliesToSchema = z.union([z.enum(RPG_TRACKER_CARRIER_CLASSES), z.array(z.string().min(1))]);
export type RpgTrackerAppliesTo = z.infer<typeof rpgTrackerAppliesToSchema>;

/** THE unified tracked-field definition. Lives in `RpgGameConfig.trackers[]` — ONE home for every tracker in
 *  a game, whatever its subject (the old per-actor `sheet.poolDefs` split was exactly the thing that forced
 *  the three-tab define/value/pin dance the unification kills).
 *
 *  `max` is a meter's DEFAULT ceiling (owner amendment 2026-07-31): what a carrier gets when it has no
 *  override, what the reminder teaches, and what the Game-tab editor edits. A carrier MAY deliberately differ
 *  (two characters with different Vitality ceilings — the d20 max-HP reality), which rides `RpgTrackerValue.max`
 *  and resolves through the ONE {@link trackerCeiling} home. `hint` is THE steering lever: a bare tracked number measurably does NOT move
 *  narration where a one-clause gloss does (R4b, Δ −0.12 vs −1.00), so it rides every model-facing surface —
 *  the reminder gloss, the delta line, and the write-surface tool description.
 *
 *  `locked` is R6 prevent-at-schema: a locked tracker is ABSENT from the write schema the model is handed
 *  (the apply-time lock strip stays as the backstop, never the primary gate). `pinned` is the band. */
export const rpgTrackerDefSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  shape: z.enum(RPG_TRACKER_SHAPES),
  write: z.enum(RPG_TRACKER_WRITES),
  subject: z.enum(RPG_TRACKER_SUBJECTS),
  appliesTo: rpgTrackerAppliesToSchema.default("everyone"),
  max: z.number().int().min(1).nullable().default(null),
  hint: z.string().max(RPG_HINT_MAX).default(""),
  color: z.string().regex(RPG_TRACKER_COLOR_RE).nullable().default(null),
  icon: z.string().nullable().default(null),
  sort: z.number().int().default(0),
  pinned: z.boolean().default(false),
  locked: z.boolean().default(false),
});
export type RpgTrackerDef = z.infer<typeof rpgTrackerDefSchema>;

/** ONE tracker's stored value, TOTAL by construction (every field always present — the weather-label lesson:
 *  the snapshot merge recurses into objects, so an omitted key would strand the PREVIOUS value on the new
 *  one). Which field carries the datum is decided by the def's `shape`:
 *    • `meter` ⇒ `value` is a number
 *    • `text`  ⇒ `value` is a string
 *    • `list`  ⇒ `items` carries the lines (`value` null)
 *  A null across the board is an EXISTING-but-unset tracker (the carrier has it, the story hasn't moved it).
 *
 *  `max` is the PER-CARRIER CEILING OVERRIDE (owner amendment 2026-07-31, restoring §5.2): `null` = this
 *  carrier uses the def's default ceiling; a number = this carrier is DELIBERATELY different (Kael's Vitality
 *  tops out at 34 where the party default is 30 — the d20 max-HP reality, which `hp` has always modelled this
 *  way). The old drift class it was cut to kill is killed by an ANTI-DRIFT WRITE RULE instead of by absence:
 *  the override is written ONLY when it differs from the def's max, and a UI/tool edit that sets it back equal
 *  CLEARS it to null ({@link resolveTrackerMaxOverride}). So the two numbers can never quietly disagree about
 *  the same fact — a stored override always MEANS "different on purpose". Max stays HOST-AUTHORED: the model's
 *  write surface carries no max arm. Every read of a ceiling goes through {@link trackerCeiling}. */
export const rpgTrackerValueSchema = z.object({
  value: z.union([z.number(), z.string()]).nullable().default(null),
  items: z.array(z.string()).nullable().default(null),
  max: z.number().int().min(1).nullable().default(null),
});
export type RpgTrackerValue = z.infer<typeof rpgTrackerValueSchema>;

/** The stored value plane: `key → value`. Actor-subject values live on `actorState[].trackerValues`,
 *  game-subject values on `snapshotState.trackerValues` — one shape, two homes by subject. */
export const rpgTrackerValuesSchema = z.record(z.string(), rpgTrackerValueSchema);
export type RpgTrackerValues = z.infer<typeof rpgTrackerValuesSchema>;

/** The EMPTY tracker value — a carrier that has the tracker but no reading yet. Total by construction. */
export const RPG_TRACKER_VALUE_EMPTY: RpgTrackerValue = { value: null, items: null, max: null };

/** THE ceiling resolver — `value.max ?? def.max` — and the ONLY place that fallback is spelled. Every consumer
 *  (the panel bars + band orbs, the reminder gloss, the delta clamp, the write-surface description) reads a
 *  meter's ceiling through here, so "which max wins" is one decision made once. `null` = an uncapped meter. */
export function trackerCeiling(def: RpgTrackerDef, value: RpgTrackerValue | undefined): number | null {
  return value?.max ?? def.max;
}

/** The ANTI-DRIFT write rule for a per-carrier ceiling: a requested ceiling EQUAL to the def's default stores
 *  `null` (no override), anything else stores the number. Every max write — the panel's per-character edit, a
 *  future import — goes through here, so a stored override always means "deliberately different". */
export function resolveTrackerMaxOverride(def: RpgTrackerDef, requested: number | null): number | null {
  if (requested === null || requested === def.max) {
    return null;
  }
  return Math.max(1, requested);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// CARRIER RESOLUTION — the ONE pure home for "who carries this tracker".
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════

/** The CLASS a concrete carrier belongs to — the `everyone` member is a def-side wildcard, never a carrier's
 *  own class, so it is excluded by derivation (never re-declared — spine §5.5). The caller classifies, because
 *  the caller is the one holding the `RpgActorRef`: roster identities (character/user) are `party`, scene
 *  `cast` actors are `npcs`. */
export type RpgTrackerCarrierKind = Exclude<RpgTrackerCarrierClass, "everyone">;

/** One candidate carrier as the resolver sees it: the actor's ref KEY + its class + that actor's own
 *  exceptions (`sheet.trackerGrants` / `sheet.trackerRevokes` — a `cast` NPC has no sheet, so it carries empty
 *  lists and is reached through the `npcs` class or an explicit `appliesTo` list). `name` is the model/panel-
 *  facing display name, carried here so the write-surface assembly can group carriers without a second join. */
export interface RpgTrackerCarrier {
  readonly actorKey: string;
  readonly name: string;
  readonly kind: RpgTrackerCarrierKind;
  readonly grants: readonly string[];
  readonly revokes: readonly string[];
}

/** Does a carrier CLASS (or explicit key list) cover this carrier, BEFORE grants/revokes? An explicit list
 *  matches by the ONE `actorRefKey` projection (never by name — a rename must not orphan a carrier). */
export function trackerAppliesToCarrier(appliesTo: RpgTrackerAppliesTo, carrier: RpgTrackerCarrier): boolean {
  if (Array.isArray(appliesTo)) {
    return appliesTo.includes(carrier.actorKey);
  }
  return appliesTo === "everyone" || appliesTo === carrier.kind;
}

/** THE carrier predicate: `resolve(appliesTo) + grants − revokes`. A REVOKE beats everything (it is the
 *  host saying "not this one, not on them"); a GRANT reaches an actor the class/list missed (the one-off
 *  ad-hoc arm). A `subject:"game"` tracker has no carriers at all — it is one value on the snapshot. */
export function carriesTracker(def: RpgTrackerDef, carrier: RpgTrackerCarrier): boolean {
  if (def.subject === "game") {
    return false;
  }
  if (carrier.revokes.includes(def.key)) {
    return false;
  }
  return carrier.grants.includes(def.key) || trackerAppliesToCarrier(def.appliesTo, carrier);
}

/** Every actor that effectively carries ONE tracker (the def-side read — "who has Mana?"). */
export function resolveTrackerCarriers(def: RpgTrackerDef, carriers: readonly RpgTrackerCarrier[]): readonly RpgTrackerCarrier[] {
  return carriers.filter((c) => carriesTracker(def, c));
}

/** The ONE tracker ordering: `sort` ascending, ties broken by `key` so the order is total + stable across
 *  reads (a set-order-dependent render is exactly the kind of drift the panel used to show). */
export function sortTrackers(defs: readonly RpgTrackerDef[]): readonly RpgTrackerDef[] {
  return [...defs].sort((a, b) => (a.sort !== b.sort ? a.sort - b.sort : a.key.localeCompare(b.key)));
}

/** Every tracker ONE actor effectively carries, in `sort` then declaration order (the actor-side read — "what
 *  does Kael have?"). This is what the panel renders per row AND what the R6 per-actor write schema offers. */
export function trackersForCarrier(defs: readonly RpgTrackerDef[], carrier: RpgTrackerCarrier): readonly RpgTrackerDef[] {
  return sortTrackers(defs.filter((def) => carriesTracker(def, carrier)));
}

/** The game-subject trackers (the old custom widgets), in render order. */
export function gameTrackers(defs: readonly RpgTrackerDef[]): readonly RpgTrackerDef[] {
  return sortTrackers(defs.filter((def) => def.subject === "game"));
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// R6 — the WRITE surface: per-actor-aware tool assembly inputs.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// "The reminder is the model's knowledge; the tools are its permissions." The READ surface always shows every
// tracker (incl. locked ones — the model narrates around them); the WRITE surface offers, PER TARGET ACTOR,
// only the trackers that actor actually carries and that are not locked. A model can then never be handed a
// `Mana` write on an actor with no Mana, and a locked tracker is unrepresentable rather than stripped later.
//
// The mechanism is a GROUPED schema, not one branch per actor: actors whose writable-tracker sets are
// IDENTICAL (the overwhelmingly common case — one `everyone` class) collapse into ONE group, so a plain game
// projects to exactly the flat schema it had before, and only a game with genuinely divergent carrier sets
// pays for a `oneOf` branch per distinct set. Grammar cost tracks real divergence, never headcount.

/** One write-surface group: the actor NAMES that share a writable-tracker set, plus that set split by the
 *  `write` axis (delta arms take `{key, delta}`, set arms take `{key, value}`). A group with BOTH lists empty
 *  is still emitted — its actors are targetable for the non-tracker planes (hp/conditions/status). */
export interface RpgTrackerWriteGroup {
  readonly targetRefs: readonly string[];
  readonly deltaKeys: readonly string[];
  readonly setKeys: readonly string[];
}

/** The writable trackers for one carrier: carried AND not `locked` (R6 prevent-at-schema). */
function writableTrackersFor(defs: readonly RpgTrackerDef[], carrier: RpgTrackerCarrier): readonly RpgTrackerDef[] {
  return trackersForCarrier(defs, carrier).filter((def) => !def.locked);
}

/** Build the per-call write-surface groups (R6). Carriers whose writable sets are identical collapse into one
 *  group (keyed by the ordered key signature), preserving first-seen order so the projected schema is stable
 *  across calls — a per-call schema that reshuffles is a prompt-cache and xgrammar-compile miss for nothing. */
export function buildTrackerWriteGroups(defs: readonly RpgTrackerDef[], carriers: readonly RpgTrackerCarrier[]): readonly RpgTrackerWriteGroup[] {
  const bySignature = new Map<string, { deltaKeys: readonly string[]; setKeys: readonly string[]; targetRefs: string[] }>();
  for (const carrier of carriers) {
    const writable = writableTrackersFor(defs, carrier);
    const deltaKeys = writable.filter((d) => d.write === "delta").map((d) => d.key);
    const setKeys = writable.filter((d) => d.write === "set").map((d) => d.key);
    const signature = `${deltaKeys.join(" ")} ${setKeys.join(" ")}`;
    const group = bySignature.get(signature);
    if (group === undefined) {
      bySignature.set(signature, { deltaKeys, setKeys, targetRefs: [carrier.name] });
      continue;
    }
    group.targetRefs.push(carrier.name);
  }
  return [...bySignature.values()];
}

/** The game-subject write surface: the unlocked game trackers split by the `write` axis (the retired
 *  `set_widget_value` arm, now `set_tracker`). */
export function gameTrackerWriteKeys(defs: readonly RpgTrackerDef[]): { readonly deltaKeys: readonly string[]; readonly setKeys: readonly string[] } {
  const writable = gameTrackers(defs).filter((def) => !def.locked);
  return {
    deltaKeys: writable.filter((d) => d.write === "delta").map((d) => d.key),
    setKeys: writable.filter((d) => d.write === "set").map((d) => d.key),
  };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// The GLOSS — ONE seg builder for every tracker, on every model-facing surface.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════

/** The bare reading, gloss-free (`Mana 5/10`, `trust: guarded`, `Pack: rope, torch`) — the datum half of
 *  {@link trackerGloss}, exported for the delta/panel surfaces that carry the hint separately. Returns `null`
 *  when the tracker has no reading at all (an unset tracker must never print `Mana null`). */
export function trackerReading(def: RpgTrackerDef, value: RpgTrackerValue | undefined): string | null {
  if (def.shape === "list") {
    const items = value?.items ?? null;
    return items === null || items.length === 0 ? null : `${def.label}: ${items.join(", ")}`;
  }
  const raw = value?.value ?? null;
  if (raw === null) {
    return null;
  }
  if (def.shape === "text") {
    return `${def.label}: ${raw}`;
  }
  // The EFFECTIVE ceiling (this carrier's override, else the def default) — the model is taught the number
  // that actually applies to the actor it is narrating, never the party default a carrier deliberately left.
  const ceiling = trackerCeiling(def, value);
  return ceiling === null ? `${def.label} ${raw}` : `${def.label} ${raw}/${ceiling}`;
}

/** The ONE tracker gloss (`Mana 5/10 (fuels spellcasting)`). Replaces the three drifted per-concept builders
 *  the reminder used to carry (pool segs · cast-field segs · widget lines) — that drift is exactly how the
 *  R4b class was born (cast fields shipped a hint the model never saw). `null` when there is no reading.
 *
 *  READING-BOUND BY CONSTRUCTION, which is why it is NOT the reminder's per-carrier builder any more: an
 *  UNSET tracker glosses to `null`, so a carrier that has the tracker and no reading yet taught the model
 *  nothing — not the tracker's existence, not its meaning. The reminder now teaches the vocabulary once
 *  ({@link trackerVocabulary}) and prints bare {@link trackerReading}s per carrier (the `attributeGloss` /
 *  `attributeReading` split). This stays for the surfaces that carry ONE reading with no vocabulary line
 *  above it (the delta's standalone `{{rpgDelta}}` consumer). */
export function trackerGloss(def: RpgTrackerDef, value: RpgTrackerValue | undefined): string | null {
  const reading = trackerReading(def, value);
  if (reading === null) {
    return null;
  }
  return def.hint !== "" ? `${reading} (${def.hint})` : reading;
}

/** ONE tracker's VOCABULARY gloss — `Corruption (how corrupted someone is.)`, the hint omitted when empty.
 *  The `attributeGloss` twin (same `label (hint)` grammar, same reason): the MEANING is taught ONCE per turn,
 *  and each carrier's line then carries only the `label value/max` {@link trackerReading}. Teaching the hint
 *  per carrier multiplied the host's prose by the party size, and — worse — a carrier with no reading yet
 *  glossed to nothing at all, so a freshly-defined tracker reached the model NOWHERE (the live-turn bug: a
 *  pinned `Corruption 0/100` visible on every Status card, absent from the whole reminder). */
export function trackerVocabulary(def: RpgTrackerDef): string {
  return def.hint === "" ? def.label : `${def.label} (${def.hint})`;
}

/** A meter tracker's numeric reading, or `null` when it has none (a text/list tracker, or an unset/non-numeric
 *  meter). The ONE place the stored `number | string` union is narrowed for arithmetic — the band orbs, the
 *  numeric delta line, and the delta applier all read through it, so a string-typed meter value (a hand edit,
 *  a model writing "5") can never produce a `NaN` render. */
export function trackerNumber(value: RpgTrackerValue | undefined): number | null {
  const raw = value?.value ?? null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw === "string") {
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}
