// domain/automation/contract/presets — THE PRESET CATALOGUE (S3, interaction-direction-spec §3-S3 + §4).
// A preset mints an ordered RULE SET, never "exactly one rule": a rule's predicate gates the WHOLE rule
// before any arm and no arm carries a per-arm condition, so a counter-then-threshold shape (the clock, the
// callback) is structurally TWO rules that are same-batch-correct via the dispatch's shared-env write-through
// (`engine/arm-executors.ts:88-98`). Every minted rule goes through the EXISTING `createRule` validation —
// there is no second write path, no second rule model, and after a mint the rows are indistinguishable from
// hand-authored ones.
//
// KNOBS SUBSTITUTE AT MINT, AS LITERALS. `rules` is a BUILDER over the resolved knob bag rather than a frozen
// array of strings: that is the only shape in which "substitute the knob into the CEL source as a literal" is
// COMPILE-CHECKED (a builder reading `knobs.everyN` gets a `number` from its own descriptor; a typo is a tsc
// error). A frozen array would need a placeholder mini-language and would move every knob-name mistake from
// compile time to mint time. The def's field name (`rules`) and every other field are the spec's.
//
// THE AUTHORING LAWS (spec §2) are obeyed here, mechanically, and the `tests/kit/cel/cel-goldens.json` vector
// pins the dialect they exist for:
//   law 1 — every maybe-unset `vars`/`event` read is `has()`-guarded (`int(vars.absent)` THROWS "No such key").
//   law 2 — every mixed arithmetic is `int()`-coerced (`chat.messageCount % N` throws
//           "no such overload: dyn<double> % int").
//   law 3 — chip text is DIEGETIC (a chip click sends as the CLICKING member, so the send text must be words
//           that member would say). The compose-mode chips are #8's, which rides A2's per-choice mode field.
//   law 4 — a COUNTER rule (one that fires on every beat) carries an explicit HIGH `maxFiresPerHour`: the
//           per-rule default is 30/hr and an active RP hour exceeds it, so an uncapped counter freezes stale
//           mid-session. Only `outcome:"fired"` rows count against the cap
//           (`persistence/fires.ts:56-62`), which is exactly why the THRESHOLD half needs no raise.
//   law 5 — preset defaults are CONSERVATIVE (cadences are beats apart, not every turn); rules are born
//           DISABLED by `createRule` and the owner enables per room.
//
// CEL is built through `celString`/`celInt` ONLY — never raw interpolation. Variable KEYS are fixed
// constants, never knobs: a knob-supplied key would be interpolated into an IDENTIFIER position
// (`has(vars.<k>)` — CEL's `has()` macro takes a field selection, not an index), which is both an injection
// surface and the key B9's clock widget has to know. The v1 knob-EDIT path is RE-MINT (spec §3-S3); the
// mint verb stamps `rule_preset_id`/`rule_preset_knobs` PROVENANCE on every rule it creates (the §3-S3
// flip shape, landed with B10's saved-cast rules rider) — nothing HERE reads it; a def stays pure data.

import type {
  AutomationActionInput,
  ChatTriggerType,
  DomainTriggerType,
  RulePresetId,
  RulePresetKnobDescriptor,
  RulePresetKnobValue,
  RulePresetKnobValueOf,
  RulePresetScope,
} from "@orb/contracts/automation";
import { ANALYSIS_SCORE_MAX, CLOCK_MAX_VAR_KEY, CLOCK_VAR_KEY, NEEDLE_TENSION_VAR_KEY } from "@orb/contracts/automation";
import type { PromptTemplateMode } from "@orb/contracts/imagery";
import { AUTOMATION_NOTICE_MESSAGE_MAX } from "@orb/contracts/notifications";

/** A caller's PARTIAL knob overrides for a mint — an absent key takes its descriptor's default. Validated
 *  against the named preset's own descriptors by `substrate/presets`'s `resolveRulePresetKnobs` before any build. */
export type RulePresetKnobOverrides = Readonly<Record<string, RulePresetKnobValue>>;

// ── the def shape ────────────────────────────────────────────────────────────────────────────────────
/** One rule a preset mints. `predicate` is the CEL source built from the knobs (`null` = always).
 *
 *  `triggerType` NAMES A MEMBER OF EITHER TUPLE and the BUS IS DERIVED from it (C5 widened this field with
 *  the engine's nullable-chat seam, exactly as this header used to promise). Deriving beats carrying a
 *  `{bus, type}` pair: the db pairs the two columns with a tuple-derived CHECK, so a def that spelled both
 *  could spell them INCONSISTENTLY and only find out at the insert — `automationTriggerFor` reads the
 *  contracts tuples that generate that CHECK, so the pair is right by construction. */
export interface RulePresetRuleDef {
  readonly triggerType: ChatTriggerType | DomainTriggerType;
  readonly predicate: string | null;
  /** AUTHORED arms (the schema's INPUT — a builder spells only what it chose; the mint parses). */
  readonly arms: readonly AutomationActionInput[];
  /** Law 4 — set explicitly on COUNTER rules. Absent ⇒ `createRule`'s per-rule default (30/hr). */
  readonly maxFiresPerHour?: number;
  /** Absent ⇒ 0. A `post_notification` arm forces ≥ 60 (`substrate/validate.ts`'s cooldown floor). */
  readonly cooldownSeconds?: number;
}

/** A preset's knob schema: key → editor descriptor. Keyed (not a list) so `ResolvedRulePresetKnobs` can map it
 *  into the typed bag the builder reads; the client projection flattens it back to a keyed list. */
export type RulePresetKnobSchema = Readonly<Record<string, RulePresetKnobDescriptor>>;

/** The typed knob bag a preset's builder receives — each key's value type DERIVED from its own descriptor. */
type ResolvedRulePresetKnobs<TKnobs extends RulePresetKnobSchema> = {
  readonly [TKey in keyof TKnobs]: RulePresetKnobValueOf<TKnobs[TKey]>;
};

/** A preset definition, generic in its own knob schema so the builder's reads are compile-checked. */
export interface RulePresetDef<TKnobs extends RulePresetKnobSchema = RulePresetKnobSchema> {
  readonly id: RulePresetId;
  /** C5 — WHERE this preset's rules live. Absent ⇒ `"chat"`, which is every catalogue row but #20: the
   *  default is the shape 18 of 19 presets have, and spelling it on all of them would only make the ONE
   *  interesting value harder to see. The mint DERIVES the chat from this rather than trusting a caller to
   *  pair a preset with a compatible scope. */
  readonly scope?: RulePresetScope;
  readonly title: string;
  /** One plain sentence for the picker: what enabling this does to the room. */
  readonly summary: string;
  /** How many rules `rules()` returns — DATA, so the picker can say "(1/2)" before a build. Pinned against
   *  the builder's actual output by the catalogue test. */
  readonly ruleCount: number;
  readonly knobs: TKnobs;
  /** S4 — the preset's fires SUGGEST rather than act. Carried at A3 (declared + projected); the suggestion
   *  storage/confirm machinery is A4's, and nothing here reads this beyond the projection. */
  readonly confirmFirst?: boolean;
  readonly rules: (knobs: ResolvedRulePresetKnobs<TKnobs>) => readonly RulePresetRuleDef[];
}

/** The type-ERASED def the exhaustive registry holds. A generic `RulePresetDef<TSpecific>` is NOT assignable
 *  to `RulePresetDef<RulePresetKnobSchema>` (its builder parameter is contravariant under
 *  `strictFunctionTypes`), so the registry holds this erased shape and `defineRulePreset` is the ONE erasure
 *  boundary. */
export type ErasedRulePresetDef = Omit<RulePresetDef, "rules" | "confirmFirst" | "scope"> & {
  readonly confirmFirst: boolean;
  /** RESOLVED at erasure (the def's optional `scope` defaulted) — every consumer reads a concrete scope, so
   *  no caller re-applies the default and none can disagree about it. */
  readonly scope: RulePresetScope;
  readonly rules: (knobs: Readonly<Record<string, unknown>>) => readonly RulePresetRuleDef[];
};

/** Erase a preset def's knob generic for the registry. The `as` at the seam is SOUND BY CONSTRUCTION: the
 *  mint's `resolveRulePresetKnobs` validates the incoming bag against THIS def's own `knobs` schema (the same `TKnobs`)
 *  and refuses anything off-shape, so every key the builder reads is present and of its declared kind. */
function defineRulePreset<const TKnobs extends RulePresetKnobSchema>(def: RulePresetDef<TKnobs>): ErasedRulePresetDef {
  return {
    id: def.id,
    scope: def.scope ?? "chat",
    title: def.title,
    summary: def.summary,
    ruleCount: def.ruleCount,
    knobs: def.knobs,
    confirmFirst: def.confirmFirst ?? false,
    rules: (knobs) => def.rules(knobs as ResolvedRulePresetKnobs<TKnobs>),
  };
}

// ── CEL + template building blocks ────────────────────────────────────────────────────────────────────
/** A knob string as a CEL STRING LITERAL. `JSON.stringify` is the escape (quotes, backslashes, control
 *  chars) — never raw interpolation, which would let a veil word containing `"` build a broken or
 *  attacker-shaped predicate. */
function celString(value: string): string {
  return JSON.stringify(value);
}

/** A knob number as a CEL INT literal. `resolveRulePresetKnobs` has already proven it a finite integer in range. */
function celInt(value: number): string {
  return String(Math.trunc(value));
}

/** Law 2 — the pure turn-cadence predicate. `chat.messageCount` is a `dyn<double>` in the shipped dialect, so
 *  the bare `chat.messageCount % N` form THROWS "no such overload: dyn<double> % int" (pinned in the goldens). */
function everyNBeats(everyN: number): string {
  return `int(chat.messageCount) % ${celInt(everyN)} == 0`;
}

/** The predicate shape every SETTLED-span analysis preset shares: the law-1 `has()` guard on `event.turn` and
 *  the law-2 `int()` coercion of `automationDepth`, AND the cadence gate. The `automationDepth == 0` clause is
 *  belt-and-suspenders over the engine's own default cascade suppression (`engine/dispatch.ts`) — an
 *  automation-triggered reply can never count as a beat even for a rule opted into cascades, so a distill pass
 *  never re-triggers off its own confirmed lore write. C1's `storyPacing` inlines the identical shape; a future
 *  consolidation folds it into this one home. */
function analysisBeatPredicate(everyN: number): string {
  return `(!has(event.turn) || int(event.turn.automationDepth) == 0) && ${everyNBeats(everyN)}`;
}

/** #2 — the AWAKE-HOURS clause: true outside the host's quiet window, `null` when there is no window to
 *  respect (`from == until` — the honest spelling of "never mute me", since a zero-length window is the only
 *  way a single pair of bounds can say it).
 *
 *  The WRAP CASE is the normal one and is why this is a builder rather than one interpolated string: quiet
 *  hours are typically 23→08, which spans midnight, so the clause is a CONJUNCTION there
 *  (`h < 23 && h >= 8`) and a DISJUNCTION for a same-day window (`h < 1 || h >= 7`). Both bounds are literals
 *  at mint, so which shape is built is decided once, here, rather than by a CEL expression that has to
 *  compute it on every event. Law 2's `int()` rides `now.hour` for the same reason it rides everything else.
 *
 *  THE HOURS ARE UTC, and that is a real limitation rather than an implicit convention: `now.hour` is
 *  `getUTCHours()` (`substrate/dry-run.ts::nowFields`) — the dispatch env carries no timezone, and inventing
 *  one for this preset would be a second clock the engine does not have. The knob help says so out loud. */
function awakeHoursPredicate(fromHour: number, untilHour: number): string | null {
  if (fromHour === untilHour) {
    return null;
  }
  const hour = "int(now.hour)";
  return fromHour < untilHour
    ? `(${hour} < ${celInt(fromHour)} || ${hour} >= ${celInt(untilHour)})`
    : `(${hour} < ${celInt(fromHour)} && ${hour} >= ${celInt(untilHour)})`;
}

/** Law 1 + the sanctioned content-match forms: a case-insensitive OR over the needles. `.matches("(?i)…")`
 *  is NOT available (the inline-flag regex throws — goldens), so `lowerAscii().contains(…)` is the form, and
 *  the needles are lowercased HERE because `lowerAscii()` only lowers the haystack. */
function messageContainsAny(needles: readonly string[]): string {
  const disjuncts = needles.map((needle) => `event.message.content.lowerAscii().contains(${celString(needle.toLowerCase())})`);
  return `has(event.message) && (${disjuncts.join(" || ")})`;
}

/** §4 #17 — the lore-reveal significance gate. Law 1's `has()` on the fact's `worldInfo` projection (a
 *  non-activation event carries none, and the short-circuit keeps the `.size()` read from throwing there),
 *  then law 2's `int()` over the entry count — `event.worldInfo.entryIds.size()` is a `dyn` in the shipped
 *  dialect, so the coercion is the same requirement every count comparison has. Both forms — list membership
 *  (`x in event.worldInfo.entryIds`) and `size()` — are pinned in `tests/kit/cel/cel-goldens.json`. */
function loreRevealPredicate(minEntries: number): string {
  return `has(event.worldInfo) && int(event.worldInfo.entryIds.size()) >= ${celInt(minEntries)}`;
}

// ── named bounds (noMagicNumbers) ─────────────────────────────────────────────────────────────────────
/** Law 4's explicit high cap for a per-beat COUNTER rule. Equals `substrate/validate.ts`'s
 *  `RULE_MAX_FIRES_CAP` ceiling — the per-preset int tests mint against the real verb, so a drift below this
 *  becomes a typed mint refusal rather than silent rot. (The per-CHAT 120/hr belt still applies above it.) */
const COUNTER_RULE_MAX_FIRES_PER_HOUR = 240;
/** A `post_notification` rule's cooldown floor (`substrate/validate.ts`). */
const NOTIFY_COOLDOWN_SECONDS = 60;
/** A preset steer/guidance line is a sentence, not the 4 KiB `guidedTemplate` ceiling. */
const STEER_TEXT_MAX = 600;
/** A chip's text is both its label and what the member says — the label cap is the binding one. */
const CHIP_TEXT_MAX = 80;
/** A veil marker / match needle. */
const NEEDLE_MAX = 80;
/** Cadence bounds shared by the beat-counting presets. */
const CADENCE_MIN = 2;
const CADENCE_MAX = 200;
/** The clock's threshold bounds. */
const CLOCK_MIN = 1;
const CLOCK_MAX = 100;
/** `surface_quick_reply` admits 1..4 choices (`automationActionSchema`) — the chip deck mirrors it. */
const CHIPS_MIN = 1;
const CHIPS_MAX = 4;
/** The callback's needle list bounds. */
const PATTERNS_MIN = 1;
const PATTERNS_MAX = 8;
/** One image per fire (the `generate_image` arm's `n`). */
const IMAGES_PER_FIRE = 1;

/** #1's idle window, in hours. The floor is 1 (a recap sooner than that is a recap of the last minute); the
 *  ceiling is a month, past which the room is not "idle", it is over. */
const IDLE_HOURS_MIN = 1;
const IDLE_HOURS_MAX = 720;
/** #2's quiet-hours bounds — an hour of the day, `now.hour`'s own range. */
const HOUR_MIN = 0;
const HOUR_MAX = 23;
/** Hours → the epoch-ms the `now.epochMs` predicate compares in. */
const MS_PER_HOUR = 3_600_000;
/** `insert_world_info_entry`'s own `entryKey` cap (`automationActionSchema`). */
const ENTRY_KEY_MAX = 256;
/** A preset-authored lore note is a paragraph, not the 8 KiB `contentTemplate` ceiling. */
const LORE_NOTE_MAX = 2000;

/** #10's predicate: a rule that NEVER fires on its own. A manual run skips the predicate (it is the
 *  whether-to-fire-BY-ITSELF gate), so this is the honest spelling of "on demand only" — as opposed to a
 *  trigger that fires rarely, which would still fire eventually and surprise the room. */
const NEVER_ON_ITS_OWN = "false";

/** Laws 1+2 — "this reply came from a human's turn". The `has()` guard keeps a manual/odd dispatch from
 *  throwing on an unpopulated `event.turn`, and the `int()` coercion is the shipped dialect's requirement; the
 *  depth clause is belt-and-suspenders over the engine's own cascade suppression, so an automation-triggered
 *  reply is never itself audited (an audit of a rewrite of an audit is the loop this closes). */
const HUMAN_TURN_ONLY = "!has(event.turn) || int(event.turn.automationDepth) == 0";

/** C3's cadence axis — the catalogue's "every-turn vs on-demand" knob, as wire values + host labels (the
 *  `ILLUSTRATE_MODES` pair-shape: a mapped-type label Record, so an option without a label fails `tsc`). */
const AUDIT_CADENCES = ["onDemand", "everyReply"] as const;
const AUDIT_CADENCE_LABELS = {
  onDemand: "Only when I ask",
  everyReply: "Every reply",
} as const satisfies { readonly [TWhen in (typeof AUDIT_CADENCES)[number]]: string };

// The clock's chat variables (`CLOCK_VAR_KEY` fill + `CLOCK_MAX_VAR_KEY` threshold) live in
// `@orb/contracts/automation` now that B9's `SegmentedClock` flank widget reads BOTH back — see the doc there.
/** The callback's two chat variables — the catalogue names them (§4 #12). */
const DEBT_VAR_KEY = "debt";
const DEBT_BEAT_VAR_KEY = "debtBeat";
/** #1's beat stamp — the wall-clock of the last committed message, written by R1 and read by R2. */
const LAST_BEAT_VAR_KEY = "lastBeatMs";
/** #2's OWN beat stamp, deliberately NOT `lastBeatMs` even though both hold "the wall-clock of the last
 *  committed message". Sharing the key would make this preset's correctness depend on the POSITION of a
 *  DIFFERENT preset's rule: #1's stamp rule also fires on `messageCommitted`, and the dispatch runs a chat's
 *  rules in position order over one write-through env — so if #1 were minted first, its stamp would refresh
 *  before this preset's nudge predicate ever read it and the nudge could never fire in a room that also runs
 *  the recap. A private key keeps the ordering that decides this preset INSIDE this preset, where the mint
 *  controls it. */
const NUDGE_BEAT_VAR_KEY = "nudgeBeatMs";
/** #16's threshold floor. 0 would mean "re-dress on every read", which is the knob saying nothing. */
const NEEDLE_THRESHOLD_MIN = 1;
/** `set_chat_background`'s own `instruction` cap (`automationActionSchema`) — the bias is one sentence about
 *  what the pick should look like, not the 4 KiB guided-template class. */
const BACKDROP_INSTRUCTION_MAX = 512;

/** §4 #17's "entry filter" — the MINIMUM number of lore entries that must fire at once for the reveal to be
 *  worth an illustration. It is a COUNT, not an identity filter, because the `worldInfoActivated` fact
 *  carries only `entryIds` (opaque `WorldEntryId` strings, no keys — `substrate/fact-resolver.ts`,
 *  `contracts/automation`'s `triggerFactSchema.worldInfo`), so no host could author "illustrate entry X" from
 *  memory — the same problem the `entityRef` knob exists for, and there is no entity kind for a lore ENTRY.
 *  A count is the one filter the fact can honestly express, and it doubles as the reveal's significance gate:
 *  a single-keyword ping fires lore on nearly every turn, so `1` = every reveal and a higher floor = only the
 *  substantial ones. The floor of 1 is "any reveal"; the ceiling is generous — a reveal of 20 entries at once
 *  is already the whole book. */
const LORE_ENTRIES_MIN = 1;
const LORE_ENTRIES_MAX = 20;
/** §4 #18's rate belt. A `worldInfoActivated` reaction TURN is a heavy autonomous interjection, and its own
 *  reply re-runs assembly and can re-activate the same lore. The self-chain is bounded by the engine's
 *  cascade-depth guard since #704 — `worldInfoActivated` now carries the generating turn's `automationDepth`
 *  on the event (`substrate/fact-resolver.ts` reads it, no longer hardcoded 0), so a reaction's re-activation
 *  escalates toward the hard cap like any cascade. The cooldown is COMPLEMENTARY, not the sole defence: within
 *  the depth cap it still bounds PACE — a wall-clock gate (`engine/budget-gate.ts` reads `last_fired_at`) that
 *  keeps the reaction from dominating the room. Conservative by law 5 — a few minutes between interjections. */
const REACTIVE_TURN_COOLDOWN_SECONDS = 180;
/** §4 #19's rate belt. `set_chat_background` re-picks over the author's library on a QUIET model call, and a
 *  backdrop that flipped on every message would be both jarring and a needless spend. A cooldown spaces the
 *  re-dress to the pace scenes actually shift at; the message that fires after the window supplies the fresh
 *  scene text the pick reads (`engine/arm-executors.ts::runSetChatBackground` reads `fact.message.content`). */
const SCENE_BACKGROUND_COOLDOWN_SECONDS = 300;

/** The illustration modes a scene-cadence preset may pick: the two SCENE modes, and ONLY those. The
 *  character/face/multimodal modes need a subject + an avatar and are the `/imagine` surface's, not a
 *  standing rule's.
 *
 *  `free` WAS OFFERED HERE AND COULD NOT RUN (#655). This preset's arm carries no `prompt` — `free` is the
 *  prompt-VERBATIM mode, and `generatePicture` refuses it outright when none is supplied
 *  (`domain/imagery/verbs/generate-picture.ts:90-92`, `'imagery: "free" mode requires a prompt'`), so a
 *  host who picked it minted a rule that raised an `action_error` on every single fire. Adding a prompt
 *  knob is not the fix either: a present `prompt` SKIPS extraction (`contract/params.ts:27`), which is
 *  precisely what the two scene modes exist to do. An option that cannot work is worse than an option that
 *  is merely unlabelled, so it is gone rather than captioned. */
const ILLUSTRATE_MODES = ["scenario", "background"] as const satisfies readonly PromptTemplateMode[];

/** Host labels for the illustration modes — the same words the `/imagine` surface uses for the same wire
 *  values (`features/imagery/components/imagine-body.tsx`'s `MODE_LABELS`), so one concept has one name
 *  across the app. */
const ILLUSTRATE_MODE_LABELS = {
  scenario: "Scene",
  background: "Background",
} as const satisfies { readonly [TMode in (typeof ILLUSTRATE_MODES)[number]]: string };

// ── the catalogue ─────────────────────────────────────────────────────────────────────────────────────
// §4 rows #1/#3/#10 (confirm-first + suggestion riders) are A4's; #8 rides A2's per-choice `mode` field;
// #11/#15/#16 ride C1's `run_analysis` arm (#16 also rides the vars read proc its meter renders through);
// #2/#14/#20 ride later phases. Everything else here is A3-riding.

/** §4 #1 — welcome-back recap (class 1; the CONFIRM-FIRST card). TWO rules, and the pair is the point:
 *  R1 stamps the wall-clock of every beat into a chat var (a per-beat counter, hence law 4's explicit high
 *  cap); R2 fires on `chatOpened` when that stamp is old — or ABSENT, which law 1 forces us to spell, since
 *  `int(vars.lastBeatMs)` THROWS on a chat that has never had a beat.
 *
 *  WHY A CARD AND NOT CHIPS (the catalogue's own WHY, kept because it is the reasoning a later editor would
 *  otherwise redo): a chip's click posts as the CLICKING member (law 3), while `chatOpened` is per-attach and
 *  viewer-blind — chips would fan the recap ask room-wide and whoever clicked would appear to have ASKED for
 *  a recap in their own voice. A card is host-tier, replace-per-rule, take-once, and its stored arm is
 *  STATIC (a fixed guided steer), so the confirm class's staleness cost is nil here. */
const WELCOME_BACK_RECAP = defineRulePreset({
  id: "welcomeBackRecap",
  title: "Welcome-back recap",
  summary: "After you have been away a while, offer to recap where the scene left off.",
  ruleCount: 2,
  confirmFirst: true,
  knobs: {
    idleHours: {
      kind: "number",
      label: "Away for at least (hours)",
      help: "How long the room must have been quiet before the recap is offered.",
      default: 12,
      min: IDLE_HOURS_MIN,
      max: IDLE_HOURS_MAX,
    },
    steer: {
      kind: "text",
      label: "The recap",
      default: "Briefly recap where the scene stands — who is present, what just happened, what is unresolved. Two or three sentences, in narration.",
      minLength: 1,
      maxLength: STEER_TEXT_MAX,
    },
  },
  rules: (knobs) => [
    {
      triggerType: "messageCommitted",
      predicate: null,
      arms: [{ type: "set_variable", scope: "chat", key: LAST_BEAT_VAR_KEY, op: "set", value: "{{expr::now.epochMs}}" }],
      maxFiresPerHour: COUNTER_RULE_MAX_FIRES_PER_HOUR, // law 4 — this one stamps every beat.
    },
    {
      triggerType: "chatOpened",
      // Law 1 — the unguarded read THROWS on a room that has never had a beat, and law 2's `int()` coercion
      // is what makes the subtraction legal at all.
      predicate: `!has(vars.${LAST_BEAT_VAR_KEY}) || int(now.epochMs) - int(vars.${LAST_BEAT_VAR_KEY}) > ${celInt(knobs.idleHours * MS_PER_HOUR)}`,
      arms: [{ type: "trigger_turn", guidedTemplate: knobs.steer, confirmFirst: true }],
    },
  ],
});

/** §4 #3 — auto-add lore entries (class 1), CONFIRM-FIRST BY DEFAULT — "the natural first card".
 *
 *  THE V1 LIMITATION, stated plainly because the row's name promises more than the substrate can currently
 *  deliver: an arm template renders against the CEL activation MINUS `event`
 *  (`substrate/macro-render.ts::celBindingsForRender` — assembly/render has no trigger), so the TRIGGERING
 *  MESSAGE'S TEXT is not reachable from `contentTemplate`. v1 therefore maintains a host-authored entry on a
 *  cadence (macros/`{{expr::…}}` over vars/chat/now are available); the model-authored capture the row
 *  ultimately wants is C2's `upsertLoreEntry` route off `run_analysis`, not this arm.
 *
 *  Law 5 is why the cadence knob exists: the catalogue's trigger is `messageCommitted`, and an ungated
 *  confirm-first rule on that trigger would raise (and replace) a card on EVERY message. */
const AUTO_ADD_LORE = defineRulePreset({
  id: "autoAddLore",
  title: "Auto-add lore entries",
  summary: "Every so often, offer to write what has happened into one of this room's world books.",
  ruleCount: 1,
  confirmFirst: true,
  knobs: {
    // AN ENTITY REFERENCE, and it carries NO DEFAULT — the recorded widening, now built (#630). A lore
    // rule without a book is not a rule, and no value is the right book, so there is nothing to default
    // TO: the picker renders this as a chooser over the books THIS CHAT has attached, and an absent
    // choice refuses at the knob in the host's own noun ("choose a world book") rather than as a `""`
    // riding `resolveKnob`'s unvalidated-default path into a TypeID error deep inside the arm schema.
    // The mint still validates it twice — the axis schema parses the id here (which is what makes
    // `knobs.bookId` a `WorldBookId` below, no cast), and `createRule` refuses a book that is not
    // attached to this chat, which is a LIVE fact the picker cannot pre-empt.
    bookId: { kind: "entityRef", entity: "worldInfoBook", label: "World book", help: "The book to write into — one of this room's own." },
    everyN: { kind: "number", label: "Every N messages", default: 10, min: CADENCE_MIN, max: CADENCE_MAX },
    entryKey: { kind: "text", label: "Entry name", default: "session notes", minLength: 1, maxLength: ENTRY_KEY_MAX },
    note: {
      kind: "text",
      label: "What to write",
      help: "Macros and CEL expressions over this chat's variables are available.",
      default: "Session notes.",
      minLength: 1,
      maxLength: LORE_NOTE_MAX,
    },
    confirmFirst: {
      kind: "choice",
      label: "Before writing",
      help: "Ask first keeps a card in the room until you say yes; Write silently does it without asking.",
      options: ["ask", "write"],
      optionLabels: { ask: "Ask first", write: "Write silently" },
      default: "ask",
    },
  },
  rules: (knobs) => [
    {
      triggerType: "messageCommitted",
      predicate: everyNBeats(knobs.everyN),
      arms: [
        {
          type: "insert_world_info_entry",
          // Already a `WorldBookId` — the entityRef knob's own axis schema parsed it at resolution.
          bookId: knobs.bookId,
          entryKey: knobs.entryKey,
          keys: [knobs.entryKey],
          contentTemplate: knobs.note,
          position: "before",
          confirmFirst: knobs.confirmFirst === "ask",
        },
      ],
    },
  ],
});

/** §4 #8 — opener chips, the compose-mode staple deck (class 1). Law 3's OTHER half: these are seeds the
 *  member OWNS and edits before sending, so they may be director-ish shorthand ("Time skip") that would be
 *  wrong as send-mode text put in a member's mouth. Rides A2's per-choice `mode` field — without it every
 *  chip fires as the clicking member's line and this deck could not exist. */
const OPENER_CHIPS = defineRulePreset({
  id: "openerChips",
  title: "Opener chips",
  summary: "When you open the room, offer a short deck of starters you can edit before sending.",
  ruleCount: 1,
  knobs: {
    labels: {
      kind: "textList",
      label: "The deck",
      help: "Each chip SEEDS your composer — you edit it before it is sent, so shorthand is fine.",
      default: ["Continue.", "Time skip — later that day.", "New scene."],
      minItems: CHIPS_MIN,
      maxItems: CHIPS_MAX,
      maxLength: CHIP_TEXT_MAX,
    },
  },
  rules: (knobs) => [
    {
      triggerType: "chatOpened",
      predicate: null,
      arms: [{ type: "surface_quick_reply", choices: knobs.labels.map((label) => ({ label, sendTemplate: label, mode: "compose" as const })) }],
      // Law 4 — an UNGATED rule, and `chatOpened` fires per ATTACH: a room opened across devices and
      // reloads passes 30/hr long before the deck stops being wanted.
      maxFiresPerHour: COUNTER_RULE_MAX_FIRES_PER_HOUR,
    },
  ],
});

/** §4 #10 — call a vote (class 1). SEND-mode chips: a vote pick IS the clicking member's own diegetic line
 *  ("I vote we go east"), which is exactly the case law 3 permits.
 *
 *  IT NEVER FIRES ON ITS OWN, and the predicate says so out loud: `false`. The catalogue's row is
 *  "R7 `runRuleNow` (host) → chips", i.e. the host calls the vote when the table needs one; there is no
 *  event in the trigger vocabulary that means "the host wants a vote now". A manual run skips the predicate
 *  (it is the whether-to-fire-BY-ITSELF gate — `engine/dispatch.ts::runGates`), so `false` reads exactly as
 *  intended: on-demand only. `chatOpened` is the trigger merely because a rule must name one; with this
 *  predicate no bus event can ever reach the arms. */
const CALL_A_VOTE = defineRulePreset({
  id: "callAVote",
  title: "Call a vote",
  summary: "On demand, put a short list of choices in the room — each pick is sent as that member's own line.",
  ruleCount: 1,
  knobs: {
    options: {
      kind: "textList",
      label: "The options",
      help: "Each is SENT as the clicking member's line — write them in a player's voice.",
      default: ["I say we press on.", "I say we turn back.", "I abstain."],
      minItems: CHIPS_MIN,
      maxItems: CHIPS_MAX,
      maxLength: CHIP_TEXT_MAX,
    },
  },
  rules: (knobs) => [
    {
      triggerType: "chatOpened",
      predicate: NEVER_ON_ITS_OWN,
      arms: [{ type: "surface_quick_reply", choices: knobs.options.map((label) => ({ label, sendTemplate: label, mode: "send" as const })) }],
    },
  ],
});

/** §4 #4 — periodic pacing nudge (class 1). */
const PACING_NUDGE = defineRulePreset({
  id: "pacingNudge",
  title: "Periodic pacing nudge",
  summary: "Every few beats, quietly ask the narrator to shift the pacing.",
  ruleCount: 1,
  knobs: {
    everyN: { kind: "number", label: "Every N beats", help: "Counted over the chat's messages.", default: 8, min: CADENCE_MIN, max: CADENCE_MAX },
    steer: {
      kind: "text",
      label: "Nudge",
      default: "Take stock of the pacing: raise a complication, or let the scene breathe. One beat, no recap.",
      minLength: 1,
      maxLength: STEER_TEXT_MAX,
    },
  },
  rules: (knobs) => [
    {
      triggerType: "turnCompleted",
      predicate: everyNBeats(knobs.everyN),
      arms: [{ type: "trigger_turn", guidedTemplate: knobs.steer }],
    },
  ],
});

/** §4 #5 — auto-illustrate scene changes (class 1). */
const ILLUSTRATE_SCENES = defineRulePreset({
  id: "illustrateScenes",
  title: "Illustrate the scene",
  summary: "Generate a picture of the current scene on a cadence, and post it into the room.",
  ruleCount: 1,
  knobs: {
    everyN: {
      kind: "number",
      label: "Cadence floor (beats)",
      help: "The minimum number of beats between illustrations.",
      default: 10,
      min: CADENCE_MIN,
      max: CADENCE_MAX,
    },
    mode: {
      kind: "choice",
      label: "What to draw",
      help: "Scene draws the moment that just played; Background draws the place it happened, with nobody in it.",
      options: ILLUSTRATE_MODES,
      optionLabels: ILLUSTRATE_MODE_LABELS,
      default: "scenario",
    },
  },
  rules: (knobs) => [
    {
      triggerType: "turnCompleted",
      predicate: everyNBeats(knobs.everyN),
      arms: [{ type: "generate_image", mode: knobs.mode, n: IMAGES_PER_FIRE, useAvatarReference: false, reuse: "prefer", quiet: false }],
    },
  ],
});

/** §4 #6 — dice chips after a beat (class 1). Law 3: every default chip is a line the CLICKING member would
 *  say (the chip sends AS them), never a director ask. The cadence knob is law 5's attention budget — chips
 *  after every single turn is exactly the noise the one-row display cap exists to bound. */
const DICE_CHIPS = defineRulePreset({
  id: "diceChips",
  title: "Offer chips after a beat",
  summary: "Every few beats, offer a short row of things you might say next.",
  ruleCount: 1,
  knobs: {
    everyN: { kind: "number", label: "Every N beats", default: 3, min: CADENCE_MIN, max: CADENCE_MAX },
    labels: {
      kind: "textList",
      label: "Chips",
      help: "Each chip is sent as YOUR line — write them in your own voice.",
      default: ["I press on.", "I hold back and watch.", "I try something reckless."],
      minItems: CHIPS_MIN,
      maxItems: CHIPS_MAX,
      maxLength: CHIP_TEXT_MAX,
    },
  },
  rules: (knobs) => [
    {
      triggerType: "turnCompleted",
      predicate: everyNBeats(knobs.everyN),
      arms: [
        {
          type: "surface_quick_reply",
          // Explicit "send" (the zod default): dice picks are the member's own diegetic words — §2 law 3's
          // send-legal chip class, same as call-a-vote. S1 (e0a910d9c) made the field required at the type.
          choices: knobs.labels.map((label) => ({ label, sendTemplate: label, mode: "send" as const })),
        },
      ],
    },
  ],
});

/** §4 #7 — clock fires when full (class 1). TWO rules: R1 counts every beat, R2 fires + resets. R2's
 *  `has()` guard is law 1 and is NOT decoration: on the first-ever batch R1 can be REFUSED (rate cap, lost
 *  authority), so the counter key may not exist when R2's predicate runs, and an unguarded `int(vars.clock)`
 *  would THROW rather than read zero. */
const CLOCK_FIRES = defineRulePreset({
  id: "clockFires",
  title: "Clock fires when full",
  summary: "A countdown fills one step per beat; when it is full, something happens and it resets.",
  ruleCount: 2,
  knobs: {
    n: { kind: "number", label: "Beats to fill", default: 4, min: CLOCK_MIN, max: CLOCK_MAX },
    firedArm: {
      kind: "choice",
      label: "When it fills",
      help: "Narrate it in the room (this asks for a reply, so it costs a model call), or just notify you.",
      options: ["narrate", "notify"],
      optionLabels: { narrate: "Narrate it in the room", notify: "Notify me" },
      default: "narrate",
    },
    firedText: {
      kind: "text",
      label: "What happens",
      default: "The pressure that has been building finally breaks into the scene.",
      minLength: 1,
      maxLength: STEER_TEXT_MAX,
    },
  },
  rules: (knobs) => {
    const fired: AutomationActionInput =
      knobs.firedArm === "narrate"
        ? { type: "trigger_turn", guidedTemplate: knobs.firedText }
        : { type: "post_notification", recipient: "host", messageTemplate: knobs.firedText };
    return [
      {
        triggerType: "turnCompleted",
        predicate: null,
        // Two free arms: count the fill up one step, and (re)publish the threshold so B9's flank widget can
        // render `filled/segments` from the member-visible vars plane alone (the max is otherwise only a CEL
        // literal in R2's predicate, which no member read exposes). Idempotent — `set` writes the same N each
        // beat; R2 deletes only the fill, so the max survives a reset and the widget shows an honest 0/N.
        arms: [
          { type: "set_variable", scope: "chat", key: CLOCK_VAR_KEY, op: "inc" },
          { type: "set_variable", scope: "chat", key: CLOCK_MAX_VAR_KEY, op: "set", value: String(knobs.n) },
        ],
        maxFiresPerHour: COUNTER_RULE_MAX_FIRES_PER_HOUR, // law 4 — this one fires every beat.
      },
      {
        triggerType: "turnCompleted",
        predicate: `has(vars.${CLOCK_VAR_KEY}) && int(vars.${CLOCK_VAR_KEY}) >= ${celInt(knobs.n)}`,
        arms: [fired, { type: "set_variable", scope: "chat", key: CLOCK_VAR_KEY, op: "delete" }],
        ...(knobs.firedArm === "notify" ? { cooldownSeconds: NOTIFY_COOLDOWN_SECONDS } : {}),
      },
    ];
  },
});

/** §4 #9 — scene veil (class 1). A diegetic marker in a member's own message redirects the next turn. */
const SCENE_VEIL = defineRulePreset({
  id: "sceneVeil",
  title: "Scene veil",
  summary: "Type a marker in your message and the next beat cuts away instead of playing it out.",
  ruleCount: 1,
  knobs: {
    veilWord: {
      kind: "text",
      label: "Veil marker",
      help: "Matched literally, anywhere in the message.",
      default: "((veil))",
      minLength: 1,
      maxLength: NEEDLE_MAX,
    },
    redirect: {
      kind: "text",
      label: "What to do instead",
      default: "Draw the veil: cut away from that beat and resume afterward, in a new moment.",
      minLength: 1,
      maxLength: STEER_TEXT_MAX,
    },
  },
  rules: (knobs) => [
    {
      triggerType: "messageCommitted",
      // Law 1 — `event.message` is populated per trigger type; an unguarded read throws on a fact without it.
      predicate: `has(event.message) && event.message.content.contains(${celString(knobs.veilWord)})`,
      arms: [{ type: "trigger_turn", guidedTemplate: knobs.redirect }],
    },
  ],
});

/** §4 #12 — the callback rule (class 1). TWO rules: R1 marks the debt AND anchors the beat it was made on;
 *  R2 waits D beats, resurfaces it, and clears both keys. `{{expr::int(chat.messageCount)}}` is how the beat
 *  anchor becomes a stored value — the arm-template render's CEL activation, law 2 coerced. */
const CALLBACK = defineRulePreset({
  id: "callback",
  title: "Callbacks",
  summary: "When someone makes a promise, bring it back a few beats later.",
  ruleCount: 2,
  knobs: {
    patterns: {
      kind: "textList",
      label: "Phrases that create a debt",
      help: "Matched case-insensitively, anywhere in a message.",
      default: ["i promise", "i swear", "i'll come back", "we'll finish this"],
      minItems: PATTERNS_MIN,
      maxItems: PATTERNS_MAX,
      maxLength: NEEDLE_MAX,
    },
    distance: { kind: "number", label: "Beats before it resurfaces", default: 8, min: CADENCE_MIN, max: CADENCE_MAX },
    steer: {
      kind: "text",
      label: "How it resurfaces",
      default: "An unresolved promise resurfaces and presses on the scene. Do not resolve it outright.",
      minLength: 1,
      maxLength: STEER_TEXT_MAX,
    },
  },
  rules: (knobs) => [
    {
      triggerType: "messageCommitted",
      predicate: messageContainsAny(knobs.patterns),
      arms: [
        { type: "set_variable", scope: "chat", key: DEBT_VAR_KEY, op: "inc" },
        { type: "set_variable", scope: "chat", key: DEBT_BEAT_VAR_KEY, op: "set", value: "{{expr::int(chat.messageCount)}}" },
      ],
      maxFiresPerHour: COUNTER_RULE_MAX_FIRES_PER_HOUR, // law 4 — a chatty scene trips this every message.
    },
    {
      triggerType: "messageCommitted",
      predicate:
        `has(vars.${DEBT_VAR_KEY}) && int(vars.${DEBT_VAR_KEY}) > 0 && has(vars.${DEBT_BEAT_VAR_KEY})` +
        ` && int(chat.messageCount) - int(vars.${DEBT_BEAT_VAR_KEY}) >= ${celInt(knobs.distance)}`,
      arms: [
        { type: "trigger_turn", guidedTemplate: knobs.steer },
        { type: "set_variable", scope: "chat", key: DEBT_VAR_KEY, op: "delete" },
        { type: "set_variable", scope: "chat", key: DEBT_BEAT_VAR_KEY, op: "delete" },
      ],
    },
  ],
});

/** §4 #13 — cutaways (class 1). */
const CUTAWAYS = defineRulePreset({
  id: "cutaways",
  title: "Cutaways",
  summary: "Every so often, cut away for one short beat somewhere else.",
  ruleCount: 1,
  knobs: {
    everyN: { kind: "number", label: "Every N beats", default: 14, min: CADENCE_MIN, max: CADENCE_MAX },
    steer: {
      kind: "text",
      label: "The cutaway",
      default: "One short cutaway elsewhere; seed a soft tension and resolve nothing.",
      minLength: 1,
      maxLength: STEER_TEXT_MAX,
    },
  },
  rules: (knobs) => [
    {
      triggerType: "turnCompleted",
      predicate: everyNBeats(knobs.everyN),
      arms: [{ type: "trigger_turn", guidedTemplate: knobs.steer }],
    },
  ],
});

/** §4 #15 — story pacing analysis (class 1; C1's showcase — RULED F7: apply DIRECT steer). ONE rule riding
 *  the S5 `run_analysis` arm with only the STEER route: every N beats a quiet schema-constrained pass reads
 *  the fresh window + its private arc/twist state and refreshes ONE narrator-facing guidance line, delivered
 *  verbatim by the S2 teaching contribution. The BRIEF is the arm's host-editable task (authored FRESH from
 *  the legacy director's proven semantics — the statProfile precedent, no string ports); the STEER knob is
 *  the host's standing direction, riding every pass ("" = none).
 *
 *  The predicate carries BOTH guards the issue names: the law-1 `has()` on `event.turn` (a `turnCompleted`
 *  fact populates it, but the guard keeps a manual/odd dispatch from throwing), the law-2 `int()` coercions,
 *  and `automationDepth == 0` — belt-and-suspenders over the engine's own default cascade suppression, so an
 *  automation-triggered reply can never count as a beat even for a rule opted into cascades. Mint REFUSES on
 *  an active-game chat (`substrate/validate.ts` `active_game` — the game owns its own steering, D109;
 *  §3-S5.7, revisitable). */
const STORY_PACING = defineRulePreset({
  id: "storyPacing",
  title: "Story pacing analysis",
  summary: "Every few beats, a quiet analyst reads the scene and steers the narrator's pacing.",
  ruleCount: 1,
  knobs: {
    everyN: { kind: "number", label: "Every N beats", help: "Counted over the chat's messages.", default: 8, min: CADENCE_MIN, max: CADENCE_MAX },
    steer: {
      kind: "text",
      label: "Standing direction",
      help: "Rides every pass — e.g. “slow burn”, “keep it cozy”. Leave empty for none.",
      default: "",
      // The one text knob whose OWN semantics allow blank ("" = none, said above and in the arm's own
      // `.optional()` schema with no `.min()`) — #1387.
      minLength: 0,
      maxLength: STEER_TEXT_MAX,
    },
  },
  rules: (knobs) => [
    {
      triggerType: "turnCompleted",
      predicate: `(!has(event.turn) || int(event.turn.automationDepth) == 0) && ${everyNBeats(knobs.everyN)}`,
      arms: [
        {
          type: "run_analysis",
          brief:
            "Watch the story's pacing: where tension is rising or going slack, which planted threads are ready to pay off, " +
            "and what would keep the next few turns alive without rushing them.",
          steer: knobs.steer,
          routes: { steer: { apply: "direct" } },
        },
      ],
    },
  ],
});

/** §4 #11 — distill lore (class 1; C2's showcase — RULED F7: CONFIRM-FIRST). ONE rule riding the S5
 *  `run_analysis` arm with only the `upsertLoreEntry` route, `apply: "confirm"` — every N settled beats a quiet
 *  schema-constrained pass distills durable, keyed lore from the SETTLED span (behind the protect tail, cursored
 *  by the state row's HIGH-WATER MARK) and offers the entries on a CONFIRM CARD; the host's yes lands them
 *  through the ONE lore belt (`engine/lore-write.ts` — attach gate + per-rule cap) and advances the watermark.
 *
 *  IDEMPOTENT ON RE-RUN, mechanically: the watermark advances ONLY on a successful apply (a raised-but-
 *  unconfirmed card leaves it unmoved), and the applier SPAN-STAMPS each entry key (`s<spanStart>.<key>`), so a
 *  re-run over an already-covered span reads no settled rows (the route drops for that pass) and a re-covered
 *  span overwrites its OWN titles rather than duplicating. The keeper semantics ride the BRIEF (authored FRESH
 *  from the legacy keeper's proven posture — durable-facts-only, merge-not-repeat, never-surface-a-secret; no
 *  string ports). Model bytes are `neutralizeMacros`'d at the write boundary by the belt (§2 law 7).
 *
 *  Knobs: the SPAN FLOOR (the cadence — how many beats accrue between distill passes, so the settled span the
 *  pass reads is at least this deep) and the TARGET BOOK (the `entityRef` chooser over this chat's attached
 *  books, #630). Mint REFUSES an unattached book (`substrate/validate.ts` — the attach gate follows the origin,
 *  re-checked at confirm) and an active-game chat (D109; both inherited from the arm's own admission rows). */
const DISTILL_LORE = defineRulePreset({
  id: "distillLore",
  title: "Distill lore",
  summary: "Every so often, a quiet analyst reads the settled scene and offers durable lore to save into one of this room's books.",
  ruleCount: 1,
  confirmFirst: true,
  knobs: {
    everyN: {
      kind: "number",
      label: "Distill every N beats",
      help: "How many beats of settled play accrue between passes. Each pass reads only the stretch that has settled behind the live tip.",
      default: 12,
      min: CADENCE_MIN,
      max: CADENCE_MAX,
    },
    bookId: { kind: "entityRef", entity: "worldInfoBook", label: "World book", help: "The book to distill into — one of this room's own." },
  },
  rules: (knobs) => [
    {
      triggerType: "turnCompleted",
      predicate: analysisBeatPredicate(knobs.everyN),
      arms: [
        {
          type: "run_analysis",
          brief:
            "From the SETTLED stretch of play only, distill the durable facts worth keeping as lore — established places, people, " +
            "relationships, and standing situations. Write each as a short, stable, keyed entry. Merge into what is already known rather " +
            "than repeating it, and never record a secret the scene has not yet revealed on-screen.",
          // Already a `WorldBookId` — the entityRef knob's own axis schema parsed it at resolution (no cast).
          routes: { lore: { apply: "confirm", bookId: knobs.bookId } },
        },
      ],
    },
  ],
});

/** §4 #11's sibling — the rumour mill (class 1). The SAME plumbing as `distillLore` — a confirm-first
 *  `run_analysis` → `upsertLoreEntry` route over the settled span, watermarked and span-stamped — differing
 *  ONLY in the BRIEF: instead of durable facts, it distills the CONSEQUENCES and HEARSAY the settled events
 *  would set in motion (what people beyond the scene now say, reputations shifting, repercussions gathering),
 *  keyed for the narrator to draw on later. Same knobs (span floor + target book), same inherited belts. */
const RUMOR_MILL = defineRulePreset({
  id: "rumorMill",
  title: "Rumour mill",
  summary: "Every so often, a quiet analyst reads the settled scene and offers the rumours and consequences it would stir up, to save as lore.",
  ruleCount: 1,
  confirmFirst: true,
  knobs: {
    everyN: {
      kind: "number",
      label: "Distill every N beats",
      help: "How many beats of settled play accrue between passes. Each pass reads only the stretch that has settled behind the live tip.",
      default: 12,
      min: CADENCE_MIN,
      max: CADENCE_MAX,
    },
    bookId: { kind: "entityRef", entity: "worldInfoBook", label: "World book", help: "The book to record rumours into — one of this room's own." },
  },
  rules: (knobs) => [
    {
      triggerType: "turnCompleted",
      predicate: analysisBeatPredicate(knobs.everyN),
      arms: [
        {
          type: "run_analysis",
          brief:
            "From the SETTLED stretch of play only, distill the CONSEQUENCES and HEARSAY the events would set in motion — what people " +
            "beyond the scene would now be saying, rumours spreading, reputations shifting, and repercussions gathering. Write each as a " +
            "short keyed entry the narrator can draw on later. Never reveal a secret the scene has kept hidden.",
          routes: { lore: { apply: "confirm", bookId: knobs.bookId } },
        },
      ],
    },
  ],
});

/** §4 #16 — THE NEEDLE (class 1; RULED 2026-08-24: it SHIPS, OFF BY DEFAULT). TWO rules, and the pair is the
 *  whole feature: R1 is a `run_analysis` pass carrying ONLY the `vars` route, so every N beats the quiet
 *  analyst scores the scene's tension 0..`ANALYSIS_SCORE_MAX` into the one chat variable the client meter
 *  reads; R2 fires on the SAME beat, past a threshold, and re-dresses the room's backdrop.
 *
 *  WHY THIS PRESET IS THE ONE THAT CROSSES F6's WALL, stated where an editor will read it: the ruling is
 *  "scores may cross into the member-visible vars plane; arcs, twists and guidance NEVER do", and the arm
 *  enforces it in three tiers the preset does not get to weaken (`engine/analysis-arm.ts` header) — the route's
 *  absence removes `score` from both the model's enforced schema and the server-side zod, the applier is gated
 *  on the authored route, and the write is `String(clamp(int(score)))`. This def's part of the wall is simply
 *  that its arm authors `routes.vars` AND NOTHING ELSE: no steer route, so a pass has no guidance to store or
 *  deliver, and the private arc/twist bank the pass always maintains stays in the rule-state row, which has no
 *  member read surface at all.
 *
 *  OFF BY DEFAULT, mechanically rather than by a knob: `createRule` mints every rule DISABLED and enabling is
 *  the consent act (`verbs/create-rule-from-preset.ts`), and no room is born with this preset. So a host opts
 *  a ROOM in twice — by adding the preset and by enabling its rules — which is exactly the "host opts in per
 *  room, no room is born with it enabled" the ruling asks for. A third "publish the score?" knob would mint a
 *  preset that does nothing at all in its default configuration, which is a worse shape, not a safer one.
 *
 *  R2 CARRIES THE CADENCE TOO, and that is a rate belt rather than a copy-paste: the score only MOVES on a
 *  cadence beat, so reacting on any other beat would re-run the backdrop's quiet model pick against a value
 *  that had not changed — once per cadence is both the honest frequency and the cheap one. It reads R1's
 *  fresh score in the SAME batch through the dispatch's shared-env write-through (the clock preset's
 *  mechanism; `engine/analysis-arm.ts` writes `frame.env.vars` after the durable write), and law 1's `has()`
 *  guard is load-bearing on every beat before the first pass lands. */
const THE_NEEDLE = defineRulePreset({
  id: "theNeedle",
  title: "The needle",
  summary: "Every few beats, a quiet analyst rates the scene's tension on a dial — and when it runs high, the room's backdrop changes to match.",
  ruleCount: 2,
  knobs: {
    everyN: {
      kind: "number",
      label: "Read the room every N beats",
      help: "How often the analyst re-scores the tension. Each read costs a model call.",
      default: 8,
      min: CADENCE_MIN,
      max: CADENCE_MAX,
    },
    threshold: {
      kind: "number",
      label: "Change the backdrop at",
      help: `Tension score, 0-${ANALYSIS_SCORE_MAX}, at or above which the room re-dresses itself.`,
      default: 7,
      min: NEEDLE_THRESHOLD_MIN,
      max: ANALYSIS_SCORE_MAX,
    },
    backdrop: {
      kind: "text",
      label: "How it should look",
      help: "Biases the pick over your own backgrounds — it never invents one.",
      default: "Choose the most charged, high-stakes backdrop that still fits where the scene is taking place.",
      minLength: 1,
      maxLength: BACKDROP_INSTRUCTION_MAX,
    },
  },
  rules: (knobs) => [
    {
      triggerType: "turnCompleted",
      predicate: analysisBeatPredicate(knobs.everyN),
      arms: [
        {
          type: "run_analysis",
          brief:
            "Read how much pressure the scene is under right now — what is at stake, how close it is to breaking, " +
            "and whether the last beats tightened or released it. Judge the scene as it STANDS, not what might happen next.",
          routes: { vars: { key: NEEDLE_TENSION_VAR_KEY } },
        },
      ],
    },
    {
      triggerType: "turnCompleted",
      // Law 1 — the score does not exist until the first pass lands (and a refused/failed pass leaves it
      // unset), so the unguarded `int(vars.tension)` would THROW "No such key" on every beat until then.
      predicate: `${analysisBeatPredicate(knobs.everyN)} && has(vars.${NEEDLE_TENSION_VAR_KEY}) && int(vars.${NEEDLE_TENSION_VAR_KEY}) >= ${celInt(knobs.threshold)}`,
      arms: [{ type: "set_chat_background", instruction: knobs.backdrop }],
    },
  ],
});

/** §4 #15 — the PROSE AUDIT (class 1; C3 — RULED F7: CONFIRM-FIRST). ONE rule riding the S5 `run_analysis`
 *  arm with only the `rewrite` route: a quiet pass reads the newest reply, and when it finds a real flaw it
 *  offers a conservative repair on a card that PINS the audited variant and HASHES its bytes. The host's yes
 *  writes the rewrite as a NEW VARIANT of that slot — the audited text stays as a swipe, which is the revert.
 *
 *  THE `when` KNOB IS THE CATALOGUE'S "every-turn vs on-demand", and its default is `onDemand` under law 5
 *  (conservative defaults) for a reason bigger than taste: `run_analysis` is SPEND-classed, so the every-turn
 *  arm funds one structured model call per reply, forever, on the author's own connection. On demand, the
 *  host presses Run now on the reply that bothered them (R7 — the predicate is the whether-to-fire-BY-ITSELF
 *  gate, so a manual run skips it) and the verb's synchronous outcome carries the verdict: `suggested` = a
 *  card is waiting, `fired` = the pass ran and found the reply CLEAN. A clean reply draws nothing, and that
 *  silence is legible instead of ambiguous — the legacy transient-clean lesson, carried without a row.
 *
 *  Law 4: the every-turn arm fires once per beat, so it carries the explicit high cap; the on-demand arm
 *  never fires by itself and needs none. Law 7 (`neutralizeMacros` on the model's bytes) and the variant-pin +
 *  hash guards are the ARM's, not this def's — one home, in `engine/analysis-arm.ts`. Mint REFUSES on an
 *  active-game chat (D109), inherited from the arm's own admission rows. */
const PROSE_AUDIT = defineRulePreset({
  id: "proseAudit",
  title: "Prose audit",
  summary: "A quiet editor checks the reply for contradictions and slips, and offers a careful fix you approve before it lands.",
  ruleCount: 1,
  confirmFirst: true,
  knobs: {
    when: {
      kind: "choice",
      label: "When to audit",
      help: "On demand costs nothing until you ask. Every reply audits each new reply automatically — one model call per reply.",
      options: AUDIT_CADENCES,
      optionLabels: AUDIT_CADENCE_LABELS,
      default: "onDemand",
    },
  },
  rules: (knobs) => [
    {
      triggerType: "turnCompleted",
      predicate: knobs.when === "onDemand" ? NEVER_ON_ITS_OWN : HUMAN_TURN_ONLY,
      arms: [
        {
          type: "run_analysis",
          brief:
            "Audit the newest reply for prose faults only — contradictions with what the transcript established, " +
            "speaking or acting for a human's character, broken point of view or tense, and lines that repeat themselves. " +
            "Most replies are clean; say so. When one is not, repair exactly the fault and change nothing else — same voice, " +
            "same length, same events.",
          routes: { rewrite: {} },
        },
      ],
      ...(knobs.when === "onDemand" ? {} : { maxFiresPerHour: COUNTER_RULE_MAX_FIRES_PER_HOUR }),
    },
  ],
});

/** §4 #2 — the async table nudge (class 1; C6's row). TWO rules on `messageCommitted`, and BOTH the trigger
 *  and the ORDER are load-bearing:
 *
 *  THE TRIGGER IS `messageCommitted`, NOT `turnCompleted`, because the actor-excluding recipient resolves
 *  against the triggering fact's `message.authorUserId` and a turn fact carries no `message` at all — under
 *  `turnCompleted` the arm would spare nobody and the preset would ping the very person who just posted.
 *
 *  THE NUDGE IS RULE 1 AND THE STAMP IS RULE 2 — the inverse of the clock's counter-then-threshold order, for
 *  the same mechanism. A chat's rules dispatch in position order over ONE write-through env, so a stamp
 *  minted first would refresh `vars` before the nudge's predicate read it and the gap would always measure
 *  zero. Rule 1 therefore reads the PREVIOUS beat's stamp — which is exactly the quantity the row is about:
 *  how long the table had been silent before this post landed.
 *
 *  Law 1 is why the `!has(…)` arm exists, and its semantics here are deliberate rather than defensive: on the
 *  first-ever post there is no stamp, so the nudge fires — an async table's first beat is precisely when the
 *  other seats want telling. The `post_notification` arm forces `cooldownSeconds ≥ 60`
 *  (`substrate/validate.ts`), which also bounds a burst of first posts. */
const ASYNC_TABLE_NUDGE = defineRulePreset({
  id: "asyncTableNudge",
  title: "Async table nudge",
  summary: "When someone posts after the table has been quiet a while, notify the members who are waiting — never the one who just posted.",
  ruleCount: 2,
  knobs: {
    idleHours: {
      kind: "number",
      label: "Quiet for at least (hours)",
      help: "How long the room must have been silent before a new post is worth a notification.",
      default: 6,
      min: IDLE_HOURS_MIN,
      max: IDLE_HOURS_MAX,
    },
    message: {
      kind: "text",
      label: "The notice",
      help: "What the waiting members are told. Macros and expressions over this room's state are available.",
      default: "The scene has moved — there is a new post waiting for you.",
      minLength: 1,
      // The arm's own `messageTemplate` bound and the stored notice's bound are the same 200 by design
      // (`AUTOMATION_NOTICE_MESSAGE_MAX` is the wire cap the executor slices the RENDERED text to); refusing
      // at the knob means an over-long notice is a typed mint refusal rather than a silent truncation.
      maxLength: AUTOMATION_NOTICE_MESSAGE_MAX,
    },
    quietFromHour: {
      kind: "number",
      label: "Quiet hours start (UTC)",
      help: "No notifications from this hour. Set both bounds to the same hour for none. Hours are UTC — the engine's clock has no timezone.",
      default: 23,
      min: HOUR_MIN,
      max: HOUR_MAX,
    },
    quietUntilHour: {
      kind: "number",
      label: "Quiet hours end (UTC)",
      help: "Notifications resume from this hour.",
      default: 8,
      min: HOUR_MIN,
      max: HOUR_MAX,
    },
  },
  rules: (knobs) => {
    const idle = `!has(vars.${NUDGE_BEAT_VAR_KEY}) || int(now.epochMs) - int(vars.${NUDGE_BEAT_VAR_KEY}) > ${celInt(knobs.idleHours * MS_PER_HOUR)}`;
    const awake = awakeHoursPredicate(knobs.quietFromHour, knobs.quietUntilHour);
    return [
      {
        triggerType: "messageCommitted",
        // The idle test is parenthesised: it is a disjunction, and an unbracketed `a || b && c` would bind
        // the quiet-hours clause to the second arm only — muting the never-stamped case is not the same rule.
        predicate: awake === null ? idle : `(${idle}) && ${awake}`,
        arms: [{ type: "post_notification", recipient: "all_members_except_actor", messageTemplate: knobs.message }],
        cooldownSeconds: NOTIFY_COOLDOWN_SECONDS,
      },
      {
        triggerType: "messageCommitted",
        predicate: null,
        arms: [{ type: "set_variable", scope: "chat", key: NUDGE_BEAT_VAR_KEY, op: "set", value: "{{expr::now.epochMs}}" }],
        maxFiresPerHour: COUNTER_RULE_MAX_FIRES_PER_HOUR, // law 4 — this one stamps every beat.
      },
    ];
  },
});

/** §4 #14 — spotlight balance (class 1; a C1 `run_analysis` row — direct steer, the `storyPacing` posture).
 *  ONE rule: every N beats a quiet pass reads the FRESH window and refreshes the single narrator-facing
 *  guidance line, this time watching WHO the scene has been carrying and who has gone quiet.
 *
 *  IT STEERS THE NARRATOR, NEVER THE PLAYERS, and that is the row's whole constraint rather than a style
 *  note: the guidance is delivered verbatim into the prompt by the S2 teaching contribution, so a brief that
 *  invited the pass to say what a member's character does would put words in a human's mouth through the
 *  narrator's voice. The brief below asks only for framing the narrator controls — where the camera turns,
 *  what the world does next, whose answer the scene needs.
 *
 *  NO STEER KNOB, unlike `storyPacing`: the catalogue row's knob is the cadence, and the standing-direction
 *  channel this preset would duplicate already exists on the pacing row for the host who wants one. Ships OFF
 *  like every rule (`createRule` mints DISABLED — law 5) and inherits the analysis arm's own admission rows,
 *  including the active-game refusal (D109; §3-S5.7). */
const SPOTLIGHT_BALANCE = defineRulePreset({
  id: "spotlightBalance",
  title: "Spotlight balance",
  summary: "Every so often, a quiet analyst notices who the scene has been leaving out and steers the narrator toward them.",
  ruleCount: 1,
  knobs: {
    everyN: {
      kind: "number",
      label: "Every N beats",
      help: "Counted over the chat's messages. A spotlight only looks unbalanced over a stretch — short cadences read noise.",
      default: 10,
      min: CADENCE_MIN,
      max: CADENCE_MAX,
    },
  },
  rules: (knobs) => [
    {
      triggerType: "turnCompleted",
      predicate: analysisBeatPredicate(knobs.everyN),
      arms: [
        {
          type: "run_analysis",
          brief:
            "Watch how the spotlight has been moving: which characters have carried the last several beats, and who has been " +
            "standing at the edge of the frame with nothing to answer. If someone has been sidelined for a while, give the " +
            "NARRATOR one concrete way to turn the scene toward them — a door they are nearest, a question only they can " +
            "answer, a consequence that lands on them. Steer the narrator's framing only: never address a player, and never " +
            "say what anyone's character does or says. If the spotlight is already moving around the table, say nothing.",
          routes: { steer: { apply: "direct" } },
        },
      ],
    },
  ],
});

/** §4 #20 — THE LIVING LIBRARY (class 1; the catalogue's ONE owner-GLOBAL row and the showcase of C5's
 *  lane). A single chat-less rule watches the DOMAIN bus: a character whose CONTENT changed gets a fresh
 *  portrait, generated quietly into the author's gallery. The owner's test for the whole lane is this preset
 *  firing on a character import with no room open anywhere.
 *
 *  THE `contentChanged` GUARD IS THE PRESET, not a refinement of it. `character.updated` fires on every edit
 *  including identity FLAGS — star, archive, trustHtml, theme — and the fact resolver used to drop the
 *  source event's own discriminator (S7 carries it now). Without the guard this row is an edit-burst chore
 *  that spends a model call every time someone stars a card, which is precisely the shape the catalogue's
 *  fun pass killed. Law 1's `has()` guard rides it because a synthesized fact (a `testRule` dry run, a
 *  host's "Run now") carries no `character` at all.
 *
 *  WHY `character_multimodal` AND NOT `character` — a corrected premise, recorded so it is not re-broken.
 *  §4 row 20 named mode `character`, which CANNOT run chat-less: it is a text-EXTRACTION mode, and
 *  `generatePicture` refuses it outright without a chat (`domain/imagery/verbs/generate-picture.ts` —
 *  "requires a chatId for prompt extraction") because the prompt comes from chat's quiet shaper reading the
 *  room's recent canon. `character_multimodal` CAPTIONS the subject's avatar instead
 *  (`domain/imagery/verbs/extract-prompt.ts`) and touches no chat, which is what makes it the honest global
 *  mode. A card with no avatar falls back to text extraction and therefore refuses typed — visible in the
 *  fire log, never a silent nothing.
 *
 *  QUIET IS MANDATORY here and the admission matrix enforces it: a non-quiet generation POSTS the image into
 *  a chat, and there is no chat. `reuse: "prefer"` is deliberate ON TOP of that: the reuse gate keys on the
 *  card's CONTENT HASH, so a re-fire for a card that did not really change short-circuits before any provider
 *  call — the second belt behind `contentChanged`, on the arm's own side. */
const LIVING_LIBRARY = defineRulePreset({
  id: "livingLibrary",
  scope: "global",
  title: "Living library",
  summary: "When a character's card changes, quietly generate a fresh portrait of them — no room required.",
  ruleCount: 1,
  knobs: {},
  rules: () => [
    {
      triggerType: "character.updated",
      // Law 1 — `has()` before the read (a synthesized fact carries no `character`); the field itself is
      // required inside the object, so no second guard is needed once the object is present.
      predicate: "has(event.character) && event.character.contentChanged",
      arms: [
        {
          type: "generate_image",
          mode: "character_multimodal",
          subjectCharacterId: undefined,
          n: IMAGES_PER_FIRE,
          useAvatarReference: false,
          reuse: "prefer",
          quiet: true,
        },
      ],
    },
  ],
});

/** §4 #17 — ILLUSTRATE ON LORE REVEAL (class 1; OPTIONAL — owner 2026-08-24, "everything optional gets
 *  included"). When a lore reveal surfaces on `worldInfoActivated`, illustrate the current scene: a
 *  non-quiet `generate_image` in `scenario` mode, posted into the room.
 *
 *  ONE KNOB, the spec's "entry filter", and it is a COUNT rather than an identity chooser — the deliberate
 *  shape, not a shortcut. The `worldInfoActivated` fact carries only opaque `entryIds` (no keys — the
 *  resolver reads the projection listed in `triggerFactSchema`), so "illustrate when entry X fires" is
 *  un-authorable from the picker, and there is no `entityRef` entity kind for a lore ENTRY (the one that
 *  ships is `worldInfoBook`). A minimum-entry-count filter is what the fact can honestly express, and it is
 *  also the reveal's significance gate: lore fires on nearly every turn, so `1` illustrates every reveal and
 *  a higher floor keeps it to the substantial ones. MODE IS FIXED to `scenario` (draw the moment that just
 *  played): the arm cannot read WHAT lore fired, only that it did, so illustrating the current scene is the
 *  honest response — the two SCENE modes are the standing-rule set (`ILLUSTRATE_MODES`), and `character`/
 *  face modes need a subject the reveal does not name.
 *
 *  The per-rule 30/hr default cap is the spend belt (the house norm for the image presets — `illustrateScenes`
 *  rides the same), so no explicit `maxFiresPerHour`; the count filter narrows WHICH reveals qualify, the cap
 *  bounds how often. */
const ILLUSTRATE_ON_LORE_REVEAL = defineRulePreset({
  id: "illustrateOnLoreReveal",
  title: "Illustrate on lore reveal",
  summary: "When the story surfaces new lore, generate a picture of the current scene and post it into the room.",
  ruleCount: 1,
  knobs: {
    minEntries: {
      kind: "number",
      label: "Only when at least this many entries fire",
      help: "Lore surfaces constantly, so 1 illustrates every reveal; a higher number keeps it to the bigger, scene-shifting ones.",
      default: 2,
      min: LORE_ENTRIES_MIN,
      max: LORE_ENTRIES_MAX,
    },
  },
  rules: (knobs) => [
    {
      triggerType: "worldInfoActivated",
      predicate: loreRevealPredicate(knobs.minEntries),
      arms: [{ type: "generate_image", mode: "scenario", n: IMAGES_PER_FIRE, useAvatarReference: false, reuse: "prefer", quiet: false }],
    },
  ],
});

/** §4 #18 — REACT TO LORE ACTIVATION (class 1; OPTIONAL — owner 2026-08-24). A lore reveal on
 *  `worldInfoActivated` steers a guided narrator turn, so the fiction acknowledges what just surfaced.
 *
 *  ONE KNOB, the spec's "guided text" — the standing direction the narrator's reaction rides. The predicate
 *  is law 1's `has()` on the fact projection and nothing more: any reveal is a reaction cue, and the
 *  significance filtering that #17 does by count is left off here on purpose — a reaction is cheap attention
 *  compared with an image, and the COOLDOWN, not a count, is what keeps it from dominating.
 *
 *  THE COOLDOWN BOUNDS PACE; the cascade-depth cap bounds RECURSION. A reaction TURN re-runs assembly and can
 *  re-activate the very lore that triggered it — and since #704 the engine's cascade-depth guard DOES catch
 *  that loop: `worldInfoActivated` carries the generating turn's `automationDepth` on the event
 *  (`substrate/fact-resolver.ts` reads it, no longer hardcoded 0), so the re-activation escalates toward the
 *  hard cap. The cooldown is complementary — a wall-clock gate (`engine/budget-gate.ts`) that, with the 30/hr
 *  cap, keeps the host-funded reaction at a conservative pace. */
const REACT_TO_LORE_ACTIVATION = defineRulePreset({
  id: "reactToLoreActivation",
  title: "React to lore activation",
  summary: "When the story surfaces new lore, quietly steer the narrator to weave it into the next beat.",
  ruleCount: 1,
  knobs: {
    steer: {
      kind: "text",
      label: "How to react",
      help: "Rides every reaction — e.g. “have a character notice it”, “let it change the mood”.",
      default: "New lore has just come into play. Weave it into the next beat naturally — let a character notice or react to it. Do not explain it outright.",
      minLength: 1,
      maxLength: STEER_TEXT_MAX,
    },
  },
  rules: (knobs) => [
    {
      triggerType: "worldInfoActivated",
      // Law 1 — a non-activation dispatch (a synthesized fact) carries no `worldInfo`; the guard reads false there.
      predicate: "has(event.worldInfo)",
      arms: [{ type: "trigger_turn", guidedTemplate: knobs.steer }],
      cooldownSeconds: REACTIVE_TURN_COOLDOWN_SECONDS,
    },
  ],
});

/** §4 #19 — AUTO-SET SCENE BACKGROUND (class 1; OPTIONAL — owner 2026-08-24). As the scene moves, quietly
 *  re-dress the room's backdrop over the author's own library — the `set_chat_background` autobg pick, a
 *  QUIET model choice among owned backgrounds, biased by the one knob.
 *
 *  ONE KNOB, the spec's "instruction bias" — a sentence that leans the pick without inventing a background
 *  (the arm only ever chooses an owned one). TRIGGER IS `messageCommitted`, deliberately: the pick reads the
 *  triggering message's prose as its scene hint (`engine/arm-executors.ts::runSetChatBackground` slices
 *  `fact.message.content`), and only a message-shaped fact carries that. Law 1's `has(event.message)` guards
 *  it — on this trigger it is effectively always true, but it is the honest "there is a scene to read" gate
 *  and it keeps the rule off the counter path (a null predicate would demand a law-4 high cap, wrong for a
 *  spend-shaped arm).
 *
 *  THE COOLDOWN is what makes it a re-DRESS rather than a per-message flicker: without it the pick would run
 *  on every committed message. `set_chat_background` is NOT `SPEND_ARM_TYPES` (the quiet pick is cheap, ruled
 *  at #16), so this preset reads as FREE in the picker — but a re-pick every message is still noise, and the
 *  cooldown spaces it to the pace scenes actually shift at. */
const AUTO_SET_SCENE_BACKGROUND = defineRulePreset({
  id: "autoSetSceneBackground",
  title: "Auto-set scene background",
  summary: "As the scene moves, quietly change the room's background to one of yours that fits — no room posts, no cost.",
  ruleCount: 1,
  knobs: {
    instruction: {
      kind: "text",
      label: "What to lean toward",
      help: "Biases the pick over your own backgrounds — it never invents one.",
      default: "Choose the background that best matches where the scene is now taking place.",
      minLength: 1,
      maxLength: BACKDROP_INSTRUCTION_MAX,
    },
  },
  rules: (knobs) => [
    {
      triggerType: "messageCommitted",
      // Law 1 — the pick reads `event.message.content`; guard that the fact carries a message before firing.
      predicate: "has(event.message)",
      arms: [{ type: "set_chat_background", instruction: knobs.instruction }],
      cooldownSeconds: SCENE_BACKGROUND_COOLDOWN_SECONDS,
    },
  ],
});

/** THE REGISTRY — exhaustive over `RulePresetId` (a new id without a def, or a def without an id, fails
 *  `tsc`). This is the S3 enforcer the spec names. */
export const RULE_PRESETS = {
  welcomeBackRecap: WELCOME_BACK_RECAP,
  autoAddLore: AUTO_ADD_LORE,
  pacingNudge: PACING_NUDGE,
  illustrateScenes: ILLUSTRATE_SCENES,
  diceChips: DICE_CHIPS,
  clockFires: CLOCK_FIRES,
  openerChips: OPENER_CHIPS,
  sceneVeil: SCENE_VEIL,
  callAVote: CALL_A_VOTE,
  callback: CALLBACK,
  cutaways: CUTAWAYS,
  storyPacing: STORY_PACING,
  distillLore: DISTILL_LORE,
  rumorMill: RUMOR_MILL,
  theNeedle: THE_NEEDLE,
  proseAudit: PROSE_AUDIT,
  asyncTableNudge: ASYNC_TABLE_NUDGE,
  spotlightBalance: SPOTLIGHT_BALANCE,
  livingLibrary: LIVING_LIBRARY,
  illustrateOnLoreReveal: ILLUSTRATE_ON_LORE_REVEAL,
  reactToLoreActivation: REACT_TO_LORE_ACTIVATION,
  autoSetSceneBackground: AUTO_SET_SCENE_BACKGROUND,
} as const satisfies Record<RulePresetId, ErasedRulePresetDef>;
