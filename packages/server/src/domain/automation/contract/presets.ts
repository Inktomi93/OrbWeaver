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
  AutomationActionInput,
  ChatTriggerType,
  RulePresetId,
  RulePresetKnobDescriptor,
  RulePresetKnobValue,
  RulePresetKnobValueOf,
} from "@orb/contracts/automation";
import type { PromptTemplateMode } from "@orb/contracts/imagery";
import type { WorldBookId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

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

/** #1's idle window, in hours. The floor is 1 (a recap sooner than that is a recap of the last minute); the
 *  ceiling is a month, past which the room is not "idle", it is over. */
const IDLE_HOURS_MIN = 1;
const IDLE_HOURS_MAX = 720;
/** Hours → the epoch-ms the `now.epochMs` predicate compares in. */
const MS_PER_HOUR = 3_600_000;
/** A TypeID is 26 base32 chars after a prefix; this is the generous text-knob bound, not the validator —
 *  the arm's own `typeIdSchema` is what actually refuses a non-id. */
const BOOK_ID_MAX = 64;
/** `insert_world_info_entry`'s own `entryKey` cap (`automationActionSchema`). */
const ENTRY_KEY_MAX = 256;
/** A preset-authored lore note is a paragraph, not the 8 KiB `contentTemplate` ceiling. */
const LORE_NOTE_MAX = 2000;

/** #10's predicate: a rule that NEVER fires on its own. A manual run skips the predicate (it is the
 *  whether-to-fire-BY-ITSELF gate), so this is the honest spelling of "on demand only" — as opposed to a
 *  trigger that fires rarely, which would still fire eventually and surprise the room. */
const NEVER_ON_ITS_OWN = "false";

/** The clock's chat variable. FIXED, not a knob — B9's `SegmentedClock` widget reads this one key, and a
 *  knob-supplied key would land in a CEL identifier position. */
const CLOCK_VAR_KEY = "clock";
/** The callback's two chat variables — the catalogue names them (§4 #12). */
const DEBT_VAR_KEY = "debt";
const DEBT_BEAT_VAR_KEY = "debtBeat";
/** #1's beat stamp — the wall-clock of the last committed message, written by R1 and read by R2. */
const LAST_BEAT_VAR_KEY = "lastBeatMs";

/** The illustration modes a scene-cadence preset may pick: the two SCENE modes plus verbatim `free`. The
 *  character/face/multimodal modes need a subject + an avatar and are the `/imagine` surface's, not a
 *  standing rule's. */
const ILLUSTRATE_MODES = ["scenario", "background", "free"] as const satisfies readonly PromptTemplateMode[];

// ── the catalogue ─────────────────────────────────────────────────────────────────────────────────────
// §4 rows #1/#3/#10 (confirm-first + suggestion riders) are A4's; #8 rides A2's per-choice `mode` field;
// #2/#11/#14/#15/#16/#20 ride later phases. Only the A3-riding committed rows land here.

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
  summary: "Every so often, offer to write what has happened into one of this room's lorebooks.",
  ruleCount: 1,
  confirmFirst: true,
  knobs: {
    // NO USABLE DEFAULT, deliberately: a lore rule without a book is not a rule, and there is no knob
    // kind that can REFERENCE an entity yet (the recorded widening: an entity-ref descriptor the picker
    // renders as a book selector). The empty default therefore refuses at MINT — twice, in fact: the
    // arm's own `typeIdSchema` rejects a non-TypeID, and `createRule` rejects a book not attached to
    // this chat. Both are typed refusals a host can act on, which is the honest shape until the kind exists.
    bookId: {
      kind: "text",
      label: "Lorebook id",
      // The picker renders this as a text field until a book-REFERENCE knob kind exists (the recorded
      // widening); the mint validates it twice regardless — the arm's own `typeIdSchema` refuses a
      // non-TypeID, and `createRule` refuses a book that is not attached to this chat.
      help: "The book to write into. It must already be attached to this chat.",
      default: "",
      maxLength: BOOK_ID_MAX,
    },
    everyN: { kind: "number", label: "Every N messages", default: 10, min: CADENCE_MIN, max: CADENCE_MAX },
    entryKey: { kind: "text", label: "Entry name", default: "session notes", maxLength: ENTRY_KEY_MAX },
    note: {
      kind: "text",
      label: "What to write",
      help: "Macros and CEL expressions over this chat's variables are available.",
      default: "Session notes.",
      maxLength: LORE_NOTE_MAX,
    },
    confirmFirst: {
      kind: "choice",
      label: "Before writing",
      help: "Ask keeps a card in the room until you say yes; Write does it silently.",
      options: ["ask", "write"],
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
          bookId: castId<WorldBookId>(knobs.bookId),
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
    const fired: AutomationActionInput =
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
} as const satisfies Record<RulePresetId, ErasedRulePresetDef>;
