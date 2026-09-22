// @orb/contracts/automation — the RULE-PRESET wire slice (S3). A preset is the user-facing vocabulary of the
// automation platform: a named, knob-parameterized recipe that MINTS an ordered set of ordinary
// `automation_rules` rows through the existing `createRule` validation. Nothing here is a second rule model —
// after a mint the rows are BEHAVIORALLY indistinguishable from hand-authored ones, but they carry
// PROVENANCE (`rule_preset_id` + `rule_preset_knobs` on `automation_rules` — the §3-S3 flip shape, landed
// with B10's rules rider): stamped at mint, CLEARED by `updateRule` (a hand-edited rule is no longer the
// preset's mint — v1's knob-EDIT path stays re-mint), and projected on `RuleView` so a room's enabled
// rule-preset accrual is readable (the saved-cast capture; B2's future in-place knob editor).
//
// WHAT LIVES HERE vs the domain: the ID TUPLE + the client-visible PROJECTION (id/title/summary/knob
// descriptors) — the picker's whole read model. The CEL predicate sources, the arm templates and the mint
// handlers stay DOMAIN-side (`domain/automation/contract/presets.ts`): a predicate is server logic, not wire
// vocabulary, and the client never re-derives one.
//
// The knob descriptor is a DISCRIMINATED union on `kind`, so a picker's editor dispatch is exhaustive
// (`RULE_PRESET_KNOB_KINDS` + a mapped-type Record — the §5.5 discipline) and the DOMAIN side derives each
// knob's resolved VALUE type from its descriptor (`RulePresetKnobValueOf`), which is what makes a preset
// builder's `knobs.everyN` a compile-checked `number` rather than a stringly bag.
//
// FOUR SCALAR KINDS + ONE REFERENCE KIND. `entityRef` is the odd one and is the whole reason a host no
// longer types a TypeID from memory: it names an ENTITY AXIS (`RULE_PRESET_ENTITY_KINDS`) rather than a
// value, the picker renders it as a chooser over what THIS CHAT actually has, and its resolved value is a
// BRANDED id parsed through the axis's own schema. One entity member ships (`worldInfoBook`) — the kind is
// proven end to end for one consumer before it generalizes.

import type { WorldBookId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

/** The committed preset catalogue's ids — the A3-riding v1 rows of the §4 catalogue. The domain holds an
 *  exhaustive `Record<RulePresetId, …>` over this tuple, so a new id without a definition fails `tsc`.
 *  Ids are camelCase (they are Record PROPERTY keys, not data literals — `useNamingConvention`). */
export const RULE_PRESET_IDS = [
  /** §4 #1 — the welcome-back recap: a confirm-first CARD after an idle gap (two rules). */
  "welcomeBackRecap",
  /** §4 #3 — auto-add lore entries, confirm-first by default. */
  "autoAddLore",
  /** §4 #4 — a guided pacing turn every N beats. */
  "pacingNudge",
  /** §4 #5 — a scene illustration on a cadence. */
  "illustrateScenes",
  /** §4 #6 — diegetic dice chips after a beat. */
  "diceChips",
  /** §4 #7 — the two-rule clock: a counter that fills, then fires and resets. */
  "clockFires",
  /** §4 #8 — the opener deck: compose-mode staples the member owns and edits. */
  "openerChips",
  /** §4 #9 — a diegetic veil word redirects the scene. */
  "sceneVeil",
  /** §4 #10 — call a vote: send-mode chips, raised on demand (R7), never on its own. */
  "callAVote",
  /** §4 #12 — the two-rule callback: an unresolved promise resurfaces D beats later. */
  "callback",
  /** §4 #13 — a short cutaway every N beats. */
  "cutaways",
  /** §4 #15 — the C1 story-pacing analysis: a quiet think-first pass steering the narrator (RULED F7,
   *  direct steer). Mint refuses on an active-game chat (the game owns its own steering, D109). */
  "storyPacing",
  /** §4 #11 — C2's distill-lore: a confirm-first `run_analysis` → `upsertLoreEntry` pass that distills durable
   *  keyed lore from the settled span (watermarked, span-stamped, idempotent on re-run) onto a confirm card. */
  "distillLore",
  /** §4 #11's sibling — the rumour mill: the SAME confirm-first lore route, distilling the consequences and
   *  hearsay the settled events would stir up rather than the durable facts. */
  "rumorMill",
  /** §4 #16 — the needle: C1's analysis pass scoring narrative tension 0-10 into the ONE member-visible chat
   *  variable (`NEEDLE_TENSION_VAR_KEY`, this package's index) plus a sibling rule that redresses the room's backdrop past a
   *  threshold. RULED 2026-08-24: it SHIPS, OFF BY DEFAULT — F6's single exception (a published SCORE may
   *  cross into the member-visible vars plane; arcs, twists and guidance never do). */
  "theNeedle",
  /** §4 #15 — C3's prose audit: a confirm-first `run_analysis` → `suggestRewrite` pass that audits the newest
   *  reply and offers a conservative rewrite on a variant-pinned, content-hashed card. The confirmed rewrite
   *  lands as a NEW VARIANT of the audited slot (the original stays selectable — that is the revert). */
  "proseAudit",
  /** §4 #2 — the async table nudge: when a post lands after a lull, ping the members who are WAITING (the
   *  actor is excluded — `all_members_except_actor`), outside quiet hours. */
  "asyncTableNudge",
  /** §4 #14 — spotlight balance: a C1 analysis pass that steers the narrator toward whoever the scene has
   *  been leaving out. Direct steer, like `storyPacing`; it never addresses or puppets a member. */
  "spotlightBalance",
  /** §4 #20 — the living library (C5): the catalogue's ONE owner-GLOBAL row and the showcase of the
   *  owner-global lane. A single global rule watches the domain bus for a character whose CONTENT changed
   *  and quietly generates a fresh portrait of them — so an import lands with art and no room ever has to
   *  be open. It is the only preset whose mint takes no chat. */
  "livingLibrary",
  /** §4 #17 — illustrate on lore reveal (OPTIONAL, owner 2026-08-24 "everything optional gets included"):
   *  when a lore reveal surfaces on `worldInfoActivated`, illustrate the current scene. Rides A3. */
  "illustrateOnLoreReveal",
  /** §4 #18 — react to lore activation (OPTIONAL): a `worldInfoActivated` reveal steers a guided narrator
   *  turn. Rides A3. */
  "reactToLoreActivation",
  /** §4 #19 — auto-set scene background (OPTIONAL): as the scene moves, quietly re-dress the room's
   *  backdrop over the author's own library (the `set_chat_background` autobg pick). Rides A3. */
  "autoSetSceneBackground",
] as const;
export type RulePresetId = (typeof RULE_PRESET_IDS)[number];
export const rulePresetIdSchema = z.enum(RULE_PRESET_IDS) satisfies z.ZodType<RulePresetId>;

/** C5 — WHERE a preset's rules live: inside one room, or on the author's owner-GLOBAL lane
 *  (`automation_rules.chat_id IS NULL`). It is the preset's own declaration, not a caller's choice: a
 *  preset's rules are written against a scope (a global rule's arms may not touch a room), so the mint
 *  DERIVES the chat from this rather than trusting a caller to pair them correctly.
 *
 *  IT IS ALSO THE PICKER'S PARTITION, which is why it rides the client-visible projection: the chat "Rules"
 *  section offers only `chat` presets and the Automation settings pane only `global` ones. Without it the
 *  in-room picker would offer a preset whose mint refuses, which is the affordance-that-does-nothing this
 *  catalogue has already paid for once (#655). */
export const RULE_PRESET_SCOPES = ["chat", "global"] as const;
export type RulePresetScope = (typeof RULE_PRESET_SCOPES)[number];
export const rulePresetScopeSchema = z.enum(RULE_PRESET_SCOPES) satisfies z.ZodType<RulePresetScope>;

/** The knob editor kinds. A new kind fails every exhaustive descriptor dispatch (`tsc`). */
export const RULE_PRESET_KNOB_KINDS = ["number", "text", "textList", "choice", "entityRef"] as const;
export type RulePresetKnobKind = (typeof RULE_PRESET_KNOB_KINDS)[number];

/** The ENTITIES an `entityRef` knob may point at. ONE member, deliberately: the kind exists because the
 *  auto-add-lore rule preset needs a BOOK and no knob could reference one (a host was asked to type a
 *  TypeID from memory). It generalizes when a SECOND consumer exists — the axis is already the §5.5 shape
 *  (a tuple + mapped-type Records below), so widening it is adding a member and letting `tsc` name every
 *  site, not a redesign. */
export const RULE_PRESET_ENTITY_KINDS = ["worldInfoBook"] as const;
export type RulePresetEntityKind = (typeof RULE_PRESET_ENTITY_KINDS)[number];

/** The id VALIDATOR per entity kind — a mapped-type Record, so a new entity kind without a schema fails
 *  `tsc`. This is what makes an `entityRef` knob's resolved value a BRANDED id rather than a hopeful cast:
 *  the mint substrate parses the caller's raw string through this before a preset builder ever reads it. */
export const RULE_PRESET_ENTITY_REF_SCHEMAS = {
  worldInfoBook: typeIdSchema(ID_PREFIX.worldBook),
} as const satisfies { readonly [TEntity in RulePresetEntityKind]: z.ZodType<RulePresetEntityRefValueOf<TEntity>> };

/** The NOUN a refusal names an entity by — host vocabulary, never the wire key ("world book", not
 *  "worldInfoBook"). Mapped over the axis for the same `tsc` reason as the schemas. */
export const RULE_PRESET_ENTITY_NOUNS = {
  worldInfoBook: "world book",
} as const satisfies { readonly [TEntity in RulePresetEntityKind]: string };

/** Shared by every descriptor: what the picker labels the field, and the optional one-line help under it. */
interface RulePresetKnobBase {
  readonly label: string;
  readonly help?: string;
}

/** An integer knob (a cadence N, a beat distance D, a threshold). `min`/`max` are the picker's bounds AND
 *  the mint-time clamp — an out-of-range override is a typed refusal, never a silent clamp. */
export interface RulePresetNumberKnobDescriptor extends RulePresetKnobBase {
  readonly kind: "number";
  readonly default: number;
  readonly min: number;
  readonly max: number;
}

/** A free-text knob (a steer line, a veil word). `maxLength` mirrors the arm cap the value lands in, so a
 *  refusal happens at the knob rather than deep inside `automationActionSchema`. `minLength` is the knob's
 *  OWN floor — most text knobs feed an arm field that is meaningless blank (a veil marker, an entry name),
 *  so `minLength: 1` is the common case, but a few (`storyPacing`'s "Standing direction") are documented as
 *  legitimately optional (their own `help` says "leave empty for none", and the arm field they feed is
 *  `.optional()` with no `.min()`), and those declare `minLength: 0` — never a hardcoded "must not be
 *  empty" that cannot tell the two apart (#1387). */
export interface RulePresetTextKnobDescriptor extends RulePresetKnobBase {
  readonly kind: "text";
  readonly default: string;
  readonly minLength: number;
  readonly maxLength: number;
}

/** A list-of-strings knob (chip labels, the callback patterns). `minItems` is load-bearing, not decoration:
 *  an emptied list would build a degenerate CEL predicate (`(...)` with no disjunct) or a zero-choice chip
 *  arm — both are mint-time refusals rather than a rule that stores and then errors every event. */
export interface RulePresetTextListKnobDescriptor extends RulePresetKnobBase {
  readonly kind: "textList";
  readonly default: readonly string[];
  readonly minItems: number;
  readonly maxItems: number;
  readonly maxLength: number;
}

/** A one-of knob. Generic in its OPTION literal union so a preset builder reading it gets the narrow type
 *  (e.g. a `PromptTemplateMode` subset) rather than a bare `string` — the default parameter is what lets the
 *  erased union below stay one type.
 *
 *  IT CARRIES ITS OWN LABELS, and that channel is not decoration (#655). `options` are WIRE values — the CEL
 *  branch keys and arm discriminators a builder switches on (`ask`/`write`, `scenario`/`background`/`free`) —
 *  and without a label channel the picker's only honest render was the raw value, so a host configuring a
 *  money-spending image rule chose between three unexplained lowercase words while the help line directly
 *  beneath named "Ask" and "Write", two options the control did not spell. A MAPPED-TYPE Record over the
 *  option union (§5.5's other sanctioned dispatch shape, the `RULE_PRESET_ENTITY_NOUNS` precedent) rather
 *  than a parallel array: an option without a label fails `tsc` at the preset def, so the two cannot drift
 *  and there is no ordering to keep in sync. */
export interface RulePresetChoiceKnobDescriptor<TOption extends string = string> extends RulePresetKnobBase {
  readonly kind: "choice";
  readonly options: readonly TOption[];
  /** What the picker SHOWS for each wire value — host vocabulary, never the discriminator. */
  readonly optionLabels: Readonly<Record<TOption, string>>;
  readonly default: TOption;
}

/** A reference to an ENTITY the rule will act on — the world book the auto-add-lore preset writes into. The
 *  picker renders it as a chooser over what the CHAT actually has, so minting needs no typed id.
 *
 *  IT CARRIES NO `default`, and that absence is load-bearing rather than an omission: no entity is "the"
 *  entity, and `resolveKnob` returns a descriptor default UNVALIDATED (an absent override never reaches a
 *  bounds check — A3-verify). A `default: ""` would therefore ride straight through resolution into a mint
 *  and only die deep inside the arm's own schema. With no default there is nothing to bypass: an absent
 *  entityRef override is a typed refusal at the knob, in the host's own vocabulary.
 *
 *  Generic in its entity so a preset builder's read is the BRANDED id (the `RulePresetChoiceKnobDescriptor`
 *  shape — the default parameter keeps the erased union one type). */
export interface RulePresetEntityRefKnobDescriptor<TEntity extends RulePresetEntityKind = RulePresetEntityKind> extends RulePresetKnobBase {
  readonly kind: "entityRef";
  readonly entity: TEntity;
}

/** The branded id an entity kind resolves to. One arm today; a second entity kind adds an arm here and
 *  `tsc` names every builder that reads one. */
export type RulePresetEntityRefValueOf<TEntity extends RulePresetEntityKind> = TEntity extends "worldInfoBook" ? WorldBookId : never;

/** One knob's editor descriptor — the picker's exhaustive dispatch axis. */
export type RulePresetKnobDescriptor =
  | RulePresetNumberKnobDescriptor
  | RulePresetTextKnobDescriptor
  | RulePresetTextListKnobDescriptor
  | RulePresetChoiceKnobDescriptor
  | RulePresetEntityRefKnobDescriptor;

/** The VALUE type a descriptor resolves to. The domain's `ResolvedRulePresetKnobs` maps a preset's knob schema
 *  through this, which is what makes every preset builder's knob reads compile-checked. */
export type RulePresetKnobValueOf<TKnob extends RulePresetKnobDescriptor> = TKnob extends RulePresetNumberKnobDescriptor
  ? number
  : TKnob extends RulePresetTextKnobDescriptor
    ? string
    : TKnob extends RulePresetTextListKnobDescriptor
      ? readonly string[]
      : TKnob extends RulePresetChoiceKnobDescriptor<infer TOption>
        ? TOption
        : TKnob extends RulePresetEntityRefKnobDescriptor<infer TEntity>
          ? RulePresetEntityRefValueOf<TEntity>
          : never;

/** A knob value on the wire — the union every descriptor kind resolves into. */
export type RulePresetKnobValue = number | string | readonly string[];

/** The wire validator for a caller's knob OVERRIDES (the mint's optional partial bag). Shape-only: the
 *  per-knob kind/bound check is the domain's, against the named preset's own descriptors. */
export const rulePresetKnobValuesSchema = z.record(z.string(), z.union([z.number(), z.string(), z.array(z.string())]));

/** The override bag AS A CALLER SPELLS IT — DERIVED from the wire validator above, never re-spelled. It is
 *  the mutable-array sibling of `RulePresetKnobValue`: the wire takes `string[]` and a `readonly string[]`
 *  will not assign into it, so a picker form holding its own editable list needs this shape rather than the
 *  resolved one. */
export type RulePresetKnobValueInputs = z.output<typeof rulePresetKnobValuesSchema>;
/** ONE knob's value in that bag. */
export type RulePresetKnobValueInput = RulePresetKnobValueInputs[string];

/** A RESOLVED knob bag — every declared knob present, each value validated by its own descriptor (the
 *  output shape of the domain's `resolveRulePresetKnobs`). This is the bag STORED as mint provenance on
 *  `automation_rules.rule_preset_knobs` and as a saved cast's rule row (`roster_preset_rules.knobs`), and
 *  the bag a re-mint hands back to `createRuleFromPreset` (a complete bag is a valid override bag — every
 *  key known, every value in bounds; a knob the preset gained SINCE the bag was stored resolves to its
 *  descriptor default, and a knob it LOST refuses loudly at the re-mint, never silently). */
export type RulePresetKnobValues = Readonly<Record<string, RulePresetKnobValue>>;

/** A stored/resolved bag re-spelled as the WIRE INPUT bag (mutable arrays — the values schema takes
 *  `string[]`, and a `readonly string[]` will not assign into it). For surfaces that
 *  ECHO a view's bag back into a write (the saved-cast capture + the library editor's full-replace
 *  rename), so neither hand-rolls the readonly→mutable conversion or reaches for a cast. */
export function rulePresetKnobBagToInputs(bag: RulePresetKnobValues): RulePresetKnobValueInputs {
  return Object.fromEntries(Object.entries(bag).map(([key, value]) => [key, typeof value === "string" || typeof value === "number" ? value : [...value]]));
}

/** Deep equality over two resolved knob bags — the re-apply idempotency comparison (a saved cast's rule
 *  vs a room rule's stored provenance). The value union is closed (number | string | list-of-strings), so
 *  this is a total structural compare, not a generic deep-equal. */
export function rulePresetKnobBagsEqual(a: RulePresetKnobValues, b: RulePresetKnobValues): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) {
    return false;
  }
  return aKeys.every((key) => {
    const left = a[key];
    const right = b[key];
    if (left === undefined || right === undefined) {
      return left === right;
    }
    if (typeof left === "number" || typeof left === "string" || typeof right === "number" || typeof right === "string") {
      return left === right;
    }
    return left.length === right.length && left.every((entry, index) => entry === right[index]);
  });
}

/** One knob descriptor as the picker reads it — the descriptor plus the key it is addressed by (the domain
 *  holds knobs as a keyed schema; the projection flattens it). */
export type RulePresetKnobView = RulePresetKnobDescriptor & { readonly key: string };

/** The preset picker's read model (`listRulePresets`). Carries NO CEL and NO arm templates — a preset's
 *  predicates are server logic; the client picks an id + knob values and the mint verb does the rest. */
export interface RulePresetView {
  readonly id: RulePresetId;
  /** C5 — the preset's own scope ({@link RulePresetScope}); the picker's partition between the in-room
   *  Rules section and the owner-global Automation pane. */
  readonly scope: RulePresetScope;
  readonly title: string;
  /** One plain sentence: what enabling this does to the room. */
  readonly summary: string;
  /** How many rules the mint creates (titled `<title> (i/n)` when it mints more than one). */
  readonly ruleCount: number;
  /** S4: the preset's fires SUGGEST rather than act. Carried here at A3 (the def declares it and the view
   *  projects it); the suggestion machinery itself is A4's. */
  readonly confirmFirst: boolean;
  /** Whether this preset MINTS A RECURRING CHARGE at its default knobs — its rules carry an arm in
   *  `SPEND_ARM_TYPES` (a model call the host funds), so enabling it bills them on a cadence, forever.
   *
   *  IT EXISTS BECAUSE THE PICKER HAD NO SPEND SIGNAL AT ALL (#655). Seven of the eleven committed presets
   *  spend — "Periodic pacing nudge" fires a `trigger_turn` every 8 beats — and the only place the word
   *  appeared was a row's overflow menu, two clicks deep, AFTER the rule was already minted. The house bar
   *  is that a spend is visible at the DECISION point.
   *
   *  DEFAULT-KNOB SEMANTICS, stated because one preset's answer moves with a knob: `clockFires` emits a
   *  `trigger_turn` under `firedArm: "narrate"` and a free `post_notification` under `"notify"`. The
   *  projection DERIVES this by running the def's own builder over its descriptor defaults
   *  (`substrate/presets.ts`), which is exactly the configuration a host mints by pressing Add without
   *  touching a knob — so the catalogue row is true for the row it labels. Never a hand-maintained flag: a
   *  boolean an author forgets to flip is a lie on a money surface. */
  readonly spends: boolean;
  readonly knobs: readonly RulePresetKnobView[];
}
