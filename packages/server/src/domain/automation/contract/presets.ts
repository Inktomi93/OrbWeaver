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
// surface and the key B9's clock widget has to know. The v1 knob-EDIT path is RE-MINT (spec §3-S3); no
// `preset_id`/`knobs` provenance column exists and none is added here.

import type {
  AutomationAction,
  ChatTriggerType,
  RulePresetId,
  RulePresetKnobDescriptor,
  RulePresetKnobValue,
  RulePresetKnobValueOf,
} from "@orb/contracts/automation";
import type { PromptTemplateMode } from "@orb/contracts/imagery";

/** A caller's PARTIAL knob overrides for a mint — an absent key takes its descriptor's default. Validated
 *  against the named preset's own descriptors by `substrate/presets`'s `resolveRulePresetKnobs` before any build. */
export type RulePresetKnobOverrides = Readonly<Record<string, RulePresetKnobValue>>;

// ── the def shape ────────────────────────────────────────────────────────────────────────────────────
/** One rule a preset mints. `triggerType` is chat-bus by construction — every committed A3 catalogue row
 *  rides the chat bus, and the owner-global (domain-bus) lane is C5's, which widens this field together with
 *  the engine's nullable-chat seam. `predicate` is the CEL source built from the knobs (`null` = always). */
export interface RulePresetRuleDef {
  readonly triggerType: ChatTriggerType;
  readonly predicate: string | null;
  readonly arms: readonly AutomationAction[];
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
export type ErasedRulePresetDef = Omit<RulePresetDef, "rules" | "confirmFirst"> & {
  readonly confirmFirst: boolean;
  readonly rules: (knobs: Readonly<Record<string, unknown>>) => readonly RulePresetRuleDef[];
};

/** Erase a preset def's knob generic for the registry. The `as` at the seam is SOUND BY CONSTRUCTION: the
 *  mint's `resolveRulePresetKnobs` validates the incoming bag against THIS def's own `knobs` schema (the same `TKnobs`)
 *  and refuses anything off-shape, so every key the builder reads is present and of its declared kind. */
function defineRulePreset<const TKnobs extends RulePresetKnobSchema>(def: RulePresetDef<TKnobs>): ErasedRulePresetDef {
  return {
    id: def.id,
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

/** Law 1 + the sanctioned content-match forms: a case-insensitive OR over the needles. `.matches("(?i)…")`
 *  is NOT available (the inline-flag regex throws — goldens), so `lowerAscii().contains(…)` is the form, and
 *  the needles are lowercased HERE because `lowerAscii()` only lowers the haystack. */
function messageContainsAny(needles: readonly string[]): string {
  const disjuncts = needles.map((needle) => `event.message.content.lowerAscii().contains(${celString(needle.toLowerCase())})`);
  return `has(event.message) && (${disjuncts.join(" || ")})`;
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

/** The clock's chat variable. FIXED, not a knob — B9's `SegmentedClock` widget reads this one key, and a
 *  knob-supplied key would land in a CEL identifier position. */
const CLOCK_VAR_KEY = "clock";
/** The callback's two chat variables — the catalogue names them (§4 #12). */
const DEBT_VAR_KEY = "debt";
const DEBT_BEAT_VAR_KEY = "debtBeat";

/** The illustration modes a scene-cadence preset may pick: the two SCENE modes plus verbatim `free`. The
 *  character/face/multimodal modes need a subject + an avatar and are the `/imagine` surface's, not a
 *  standing rule's. */
const ILLUSTRATE_MODES = ["scenario", "background", "free"] as const satisfies readonly PromptTemplateMode[];

// ── the catalogue ─────────────────────────────────────────────────────────────────────────────────────
// §4 rows #1/#3/#10 (confirm-first + suggestion riders) are A4's; #8 rides A2's per-choice `mode` field;
// #2/#11/#14/#15/#16/#20 ride later phases. Only the A3-riding committed rows land here.

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
    mode: { kind: "choice", label: "What to draw", options: ILLUSTRATE_MODES, default: "scenario" },
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
      help: "Narrate it in the room, or just notify you.",
      options: ["narrate", "notify"],
      default: "narrate",
    },
    firedText: {
      kind: "text",
      label: "What happens",
      default: "The pressure that has been building finally breaks into the scene.",
      maxLength: STEER_TEXT_MAX,
    },
  },
  rules: (knobs) => {
    const fired: AutomationAction =
      knobs.firedArm === "narrate"
        ? { type: "trigger_turn", guidedTemplate: knobs.firedText }
        : { type: "post_notification", recipient: "host", messageTemplate: knobs.firedText };
    return [
      {
        triggerType: "turnCompleted",
        predicate: null,
        arms: [{ type: "set_variable", scope: "chat", key: CLOCK_VAR_KEY, op: "inc" }],
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
    veilWord: { kind: "text", label: "Veil marker", help: "Matched literally, anywhere in the message.", default: "((veil))", maxLength: NEEDLE_MAX },
    redirect: {
      kind: "text",
      label: "What to do instead",
      default: "Draw the veil: cut away from that beat and resume afterward, in a new moment.",
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

/** THE REGISTRY — exhaustive over `RulePresetId` (a new id without a def, or a def without an id, fails
 *  `tsc`). This is the S3 enforcer the spec names. */
export const RULE_PRESETS = {
  pacingNudge: PACING_NUDGE,
  illustrateScenes: ILLUSTRATE_SCENES,
  diceChips: DICE_CHIPS,
  clockFires: CLOCK_FIRES,
  sceneVeil: SCENE_VEIL,
  callback: CALLBACK,
  cutaways: CUTAWAYS,
} as const satisfies Record<RulePresetId, ErasedRulePresetDef>;
