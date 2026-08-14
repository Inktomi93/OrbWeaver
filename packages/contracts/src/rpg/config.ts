// @orb/contracts/rpg/config — the `rpg_games.config` JSON blob (rpg-design/05 §4.1). Holds the
// `statProfile` (§2.3 — no separate profile table until a cross-game library exists) + the lite dials.
// Full's dials (`genres`/`tones`/`setting`/`difficulty`/`rating`/`language`/`playerGoals`/`gm`/
// `houseRules`/`imagery`/`assist`) graft as ADDITIVE defaulted fields — a JSON-column additive lift
// self-heals at the parse seam (no version stamp needed, unlike `user_settings`: rpg tables carry no
// versioned-config columns, so the schema_version DEFAULT question is moot).

import { z } from "zod";
import { MAX_USER_MACROS, userMacroSchema } from "#preset";
import { RPG_CYOA_CHOICE_BEHAVIORS } from "./enums.ts";
import { RPG_PROFILE_FREEFORM, rpgStatProfileSchema } from "./profile.ts";
import { RPG_HINT_MAX, rpgTrackerDefSchema } from "./tracker.ts";

/** The steering-note cap — a short always-wins user slot (the reminder tail, §4.7). */
export const RPG_STEERING_NOTE_MAX = 500;

/** The recent-beats keep-last default: `snapshot.recentEvents` is an append-only durable log (the
 *  journal keeps the full record); the REMINDER read slices it to the last N so the steering injection never
 *  bloats the prompt with the whole scene history. A sane floor — enough beats for continuity, bounded for
 *  budget/cache. `0` = keep none (the reminder drops the "Recent beats" block); the durable log is untouched. */
export const RPG_RECENT_BEATS_KEEP_DEFAULT = 8;

/** The immersive-card keep-last-X default (M2, §3.5): `0` = every stored card collapses to its `[card: title]`
 *  stub on the wire — the cache-stable, budget-honest posture. Named so the host editor can state the effective
 *  default in its empty state instead of re-spelling the literal. */
export const RPG_CARD_KEEP_LAST_DEFAULT = 0;

/** The per-game FEATURE knobs (parity-plus §9 — the create-time options + advanced config). Additive defaulted
 *  fields on the JSON blob, self-healing at the parse seam (no version stamp — rpg tables carry no versioned
 *  column).
 *  `relationshipHints` maps a custom relationship `label` → a steering gloss (M1: a bare custom label steers as
 *  precisely as the five built-ins when the host glosses it; the hint is a property of the VOCAB, one home, not
 *  duplicated per cast row).
 *
 *  P3 hidden-channel knobs (§3.3/§3.6): `deception` teaches `<lie …/>`, `omniscience` teaches `<ofilter …/>` —
 *  both default OFF (opt-in mechanics). EITHER on = the game is DECEPTION-ACTIVE, which (a) composes the teaching
 *  block into the reminder and (b) flips the REASONING channel HOST-ONLY for members (a deceptive model can spill
 *  a lie's truth in the thinking channel — the whole-channel host-only gate is the clean threat boundary, §3.6).
 *  `hiddenContentReveal` (M4, default ON) governs whether the HOST is offered the reveal eye at all — off = the
 *  host runs PURE hidden (no peek even for themselves); it NEVER changes the member-strip (a member never reads
 *  hidden bytes regardless) nor the wire (the model always remembers). `recentBeatsKeepLast` caps the reminder's
 *  Recent-beats slice (the P3 fold — the durable log stays append-only). */
export const rpgGameFeaturesSchema = z.object({
  relationshipHints: z.record(z.string(), z.string().max(RPG_HINT_MAX)).default({}),
  // R4c (owner go, 2026-07-31) — the JOURNAL-TYPE gloss map, the exact sibling of `relationshipHints`: a
  // journal entry may ride `type:"custom"` with a free `label`, and this maps that label → a steering gloss so
  // a host-defined beat type teaches as precisely as the seven built-ins (the R4b hint argument, applied to
  // the plane that fires on 79% of turns). Empty ⇒ bare labels.
  journalTypeHints: z.record(z.string(), z.string().max(RPG_HINT_MAX)).default({}),
  deception: z.boolean().default(false),
  omniscience: z.boolean().default(false),
  hiddenContentReveal: z.boolean().default(true),
  recentBeatsKeepLast: z.number().int().min(0).default(RPG_RECENT_BEATS_KEEP_DEFAULT),
  // Feature 7 — immersive HTML cards (parity-plus §4/§9 #7). `immersiveHtml` gates the TEACHING ask + the
  // §4.8 lenient wrap only — an emitted `:::card` ALWAYS renders (the render is toggle-independent, so a
  // stored card never breaks on a later toggle-off). Default on: the sandbox is the wall.
  immersiveHtml: z.boolean().default(true),
  // M3 — governs whether the teaching ASKS for interactivity (animations/scripts), never the render: a card
  // the model emits renders in the same sandbox regardless (§4.2 — the toggle shapes the PROMPT).
  immersiveHtmlInteractive: z.boolean().default(true),
  // M2 — the X most-recent cards ride the wire FULL; older cards collapse to the `[card: title]` stub.
  // 0 (default) = immediate total collapse (the cache-stable, budget-honest posture — §3.5).
  cardKeepLastX: z.number().int().min(0).default(RPG_CARD_KEEP_LAST_DEFAULT),
  // P5 — CYOA as a first-class MODE (§5.4): ON composes the choices-fence teaching into the reminder so the
  // model ends turns with a clickable choice set. Default OFF (a strong play-style many tables don't want);
  // the wand's one-shot "Offer choices" covers the this-turn-only ask regardless of the knob. The render is
  // toggle-independent — an emitted fence always renders as buttons (never a stored-content break).
  cyoa: z.boolean().default(false),
  // P5 — what a CYOA choice CLICK does (§5.4). `compose` (default) drops the option text into the composer
  // draft + focuses it (append flavor, then send); `send` fires the option as the user turn immediately.
  // Toggle-independent render — the buttons always show; this only branches the client click handler.
  cyoaChoiceBehavior: z.enum(RPG_CYOA_CHOICE_BEHAVIORS).default("compose"),
  // P5 — plot progression (§6.4): gates the wand's Plot submenu (steer entries) for this game. Default ON
  // (fires only on click — no always-on prompt cost; broadly useful for un-sticking a scene). The submenu is
  // ABSENT when off, never a disabled twin (applicability, [no-separate-reduced-modes]).
  plotProgression: z.boolean().default(true),
});
export type RpgGameFeatures = z.infer<typeof rpgGameFeaturesSchema>;

/** Is a game's config DECEPTION-ACTIVE (parity-plus §3.6)? True when either hidden channel is on — the ONE
 *  predicate that (a) gates the teaching-block composition and (b) drives the member reasoning-host-only strip.
 *  Homed here so the injected chat op (`resolveReasoningHostOnly`) and the reminder assembler agree on ONE
 *  definition — a drift between "teach deception" and "strip reasoning" would leak the thinking channel. */
export function isDeceptionActive(features: RpgGameFeatures): boolean {
  return features.deception || features.omniscience;
}

/** The delivery-model knob (the 2026-07-26 amendment / D108, as amended by D109 + the R1 fold). It picks the
 *  state round's VEHICLE, never its existence:
 *    • `cheap` = a DEDICATED post-commit TOOL round (the 7 state tools, `tool_choice:"required"`). Two model
 *      calls per exchange; the LOCAL champion (grammar-bound on vLLM — the measured 8B floor).
 *    • `folded` (DEFAULT, owner ruling 2026-08-01) = the SAME 7 tools mounted on the CHARACTER turn itself with
 *      `tool_choice:"auto"`, whose co-emitted `tool_calls` ARE the state round — ONE model call per exchange
 *      (measured ~43% cheaper / ~34% faster on a hosted strong model, 6/6 co-emission — D112) and the ONLY mode
 *      whose state lands WITH the turn. The narrative is never at risk — and that guarantee, not the mode, is
 *      what decides where folded actually lands. TWO wires fall back to `cheap`'s post-commit round (the SAME
 *      delta, one extra call, LOGGED — `rpg.extraction.path` WARN + `fallbackReason`, never silent):
 *        · one that cannot carry wire `tools[]` on a chat turn at all — the stateful agent-sdk wire
 *          (`no-terminal-channel`);
 *        · one that CAN, but answers `content: null` the moment tools ride — the local vLLM engine, measured
 *          0 chars of narrative on 36/36 tool-attached turns (`local-engine-fold-guard`, D112 as amended by the
 *          owner ruling; the mount is withheld PRE-commit so the character turn is byte-identically tool-less).
 *      So `folded` is NOT universal: it is the hosted-strong shape, with an honest, loud degrade everywhere
 *      else. New games are BORN folded; a host who wants the two-call arm on purpose (the local floor) flips the
 *      knob — recommend, never force, and the guard never touches an EXPLICIT `cheap`.
 *  An ADDITIVE config field — a pre-amendment blob self-heals to the default at the parse seam (the schema
 *  `.default` fills it; no version stamp — §4.11 #1 / D107 knob-wire discipline).
 *
 *  DELETED THIRD MODE (owner ruling 2026-08-01, pre-launch NO-LEGACY): the dedicated structured-output round
 *  ("reliable") was the accuracy arm on paper and measured WORST on the exact field its schema guardrail
 *  existed to secure (0/12 hpDelta — a field-routing failure; the extraction-mode empirical map). It is gone
 *  whole — no shim, no deprecation arm. The structured-output MACHINERY survives where it is still the only
 *  vehicle: the agent-sdk wire (no wire `tools[]` ⇒ `cheap`/`folded` degrade to it) and the host resync. A game
 *  blob still carrying the retired mode is healed to the default at rpg's parse-on-read seam
 *  (`persistence/games.ts`), which is the ONLY place that knows the mode axis ever had a third member. */
export const RPG_EXTRACTION_MODES = ["folded", "cheap"] as const;
export type RpgExtractionMode = (typeof RPG_EXTRACTION_MODES)[number];

/** WHY a `folded` game did not fold (D112 (3)) — the TOTAL cause vocabulary, homed here (contracts) because
 *  BOTH ends read it: the flush derives it per turn for `rpg.extraction.path`, and `RpgGameView` carries it to
 *  the panel so the freshness surface can say WHY it is rounding instead of claiming "Live" (EFF-3).
 *    • `no-terminal-channel`     — the wire cannot carry terminal tools at all (an unliftable mount, a
 *      tools-incapable model): the channel came back `null`. Only a COMPLETED turn knows this.
 *    • `local-engine-fold-guard` — the wire CAN carry them but goes mute when they ride
 *      (`coEmitsProseWithTools` false — the measured local vLLM fact), so the mount is withheld ON PURPOSE,
 *      pre-commit, off the room connection's capability. Knowable BEFORE a turn runs. */
export const RPG_FOLD_FALLBACK_REASONS = ["no-terminal-channel", "local-engine-fold-guard"] as const;
export type RpgFoldFallbackReason = (typeof RPG_FOLD_FALLBACK_REASONS)[number];

/** The VEHICLE that produces a turn's state delta — the delivery axis as it actually LANDS, distinct from the
 *  `extractionMode` KNOB that asks for it (D112 (3): a `folded` game does not always fold). One home for the
 *  words so the flush's observability line and the panel's freshness surface cannot drift:
 *    • `folded`     — the character turn co-emitted its own state; ZERO extra model calls, state lands AT commit.
 *    • `tool-round` — a dedicated post-commit model call writes this beat's state (the host's `cheap` choice, or
 *      a `folded` game that could not fold — `fallbackReason` names which).
 *    • `none`       — NO state round runs at all: the resolved connection has no model write path for this game
 *      (`deriveTrackersReadOnly`), so the flush returns before any vehicle. A ROOM-level verdict only — a flush
 *      that reports a path has already passed that gate, so its own field excludes this member. */
export const RPG_DELIVERY_PATHS = ["folded", "tool-round", "none"] as const;
export type RpgDeliveryPath = (typeof RPG_DELIVERY_PATHS)[number];

/** The extraction-CONTEXT knob (the crunchy-cluster redesign §1.3) — how much of the turn's OWN story the
 *  post-narration state round reads as evidence. The round rides the character turn's already-loaded canon
 *  transcript (zero extra model reads, §1.4); this knob slices it:
 *    • `beat`   = today's behavior EXACTLY — the round sees only the latest committed beat (the escape hatch,
 *                 byte-compatible; the 8B floor if a local model proves swamped by more context).
 *    • `window` (default) = the last `extractionWindowTokens` of transcript (whole messages, newest-first
 *                 fill, oldest→newest in the prompt) — "the recent arc" so relationships/inventory/quests
 *                 evolve as arcs and stale planes reconcile against what actually happened.
 *    • `full`   = the whole threaded canon (itself compaction-bounded by the char turn's loading) — maximum
 *                 inference for a hosted room, with an honest GM-console consequence line.
 *  Additive, default `"window"` — a pre-redesign blob self-heals at the parse seam (D107 knob-wire discipline). */
export const RPG_EXTRACTION_CONTEXTS = ["beat", "window", "full"] as const;
export type RpgExtractionContext = (typeof RPG_EXTRACTION_CONTEXTS)[number];

/** The `window` arm's transcript-token budget bounds + default (§1.3). Floored for the sad-path 8B (enough for
 *  the recent arc), capped so a hosted room can raise it without unbounded prefill ([[plan-for-small-hardware]]);
 *  4096 ≈ 10–16 typical RP beats. */
export const RPG_EXTRACTION_WINDOW_TOKENS_MIN = 512;
export const RPG_EXTRACTION_WINDOW_TOKENS_MAX = 32_768;
export const RPG_EXTRACTION_WINDOW_TOKENS_DEFAULT = 4096;

/** The reconcile-cadence bounds + default (§1.3): every Nth flush forces a full plane re-emission (0 = off). */
export const RPG_RECONCILE_EVERY_BEATS_MAX = 100;
export const RPG_RECONCILE_EVERY_BEATS_DEFAULT = 10;

/** The ambient DATE mode (#9, owner-ruled default): `narrated` = the date is a FREEFORM STRING the model
 *  provides from the fiction (`calendarDate` — "3rd of Frostmoon"), with NO forced sequential day-counter
 *  display and no exact-date pressure; `structured` = the integer `clock.day` counter renders beside it
 *  (the pre-#9 behavior). Time-of-day + weather stay STRUCTURED and functional in BOTH modes — they drive
 *  the Waystone day-night + rain visual, which must never be lost. A DISPLAY/steering knob only: the
 *  stored `clock` plane is untouched by the mode (flipping it back loses nothing). */
export const RPG_DATE_MODES = ["narrated", "structured"] as const;
export type RpgDateMode = (typeof RPG_DATE_MODES)[number];

/** The `rpg_games.config` blob. `lite.steeringNote` is the always-wins user tuning slot (§4.11 #2 — a
 *  real shipped knob). `statProfile` defaults to `freeform` (lite's create default). `extractionMode` is the
 *  delivery-model knob (the amendment), default `"folded"` (the one-call fold — owner ruling 2026-08-01, on
 *  D112's measured evidence; the two-call `cheap` arm is the host's opt-out). `dateMode` (#9) defaults `"narrated"` —
 *  additive, self-heals at the parse seam. */
export const rpgGameConfigSchema = z.object({
  // The FRONT-DOOR toggle (#40 — the ⋯-menu game switch): `false` fully DISENGAGES the game from the
  // turn assembly (no reminder/state/steering/tools — every rpg chat-op behaves as a non-game chat) and
  // hides the panel, while PRESERVING every game row/snapshot (reversible — re-enable restores the
  // sheet/scene as they were, never a delete). Additive defaulted — a pre-toggle blob self-heals to
  // `true` (engaged) at the parse seam. Mirrored onto the chat pointer (`ChatRpgPointer.engaged`) so the
  // client's sync gate reads it off `ChatDetail` without a round-trip.
  engaged: z.boolean().default(true),
  statProfile: rpgStatProfileSchema.default(RPG_PROFILE_FREEFORM),
  // THE TRACKERS — the ONE home for every tracked field in the game, whatever its subject (the tracked-field
  // unification §5.1). This single array replaces `sheet.poolDefs` (per-actor, on four different sheets),
  // `features.castFields` (per-game NPC fields), `features.pinnedOrbs` (a third surface for the same defs) and
  // the whole `rpg_hud_widgets` TABLE. Values are keyed by `key` on the snapshot — actor-subject under
  // `actorState[].trackerValues`, game-subject under `snapshotState.trackerValues`. Empty = a game that tracks
  // nothing but the built-in planes (hp/wallet/inventory/conditions stay first-class, never trackers).
  trackers: z.array(rpgTrackerDefSchema).default([]),
  lite: z
    .object({
      steeringNote: z.string().max(RPG_STEERING_NOTE_MAX).default(""),
    })
    .default({ steeringNote: "" }),
  extractionMode: z.enum(RPG_EXTRACTION_MODES).default("folded"),
  // The extraction-DEPTH knobs (the crunchy-cluster redesign §1.3) — how much of the turn's own story the
  // state round reads, and its token budget. Additive defaulted, self-healing at the parse seam (the
  // `extractionMode` precedent — D107 knob-wire discipline, no version stamp). `extractionContext` defaults
  // to `window` (the "recent arc" — the ratified round-1 owner default); `extractionWindowTokens` bounds the
  // `window` arm's transcript budget (message-boundary sliced), floored for the sad-path 8B and capped so a
  // hosted room can raise it without unbounded prefill ([[plan-for-small-hardware]]).
  extractionContext: z.enum(RPG_EXTRACTION_CONTEXTS).default("window"),
  extractionWindowTokens: z
    .number()
    .int()
    .min(RPG_EXTRACTION_WINDOW_TOKENS_MIN)
    .max(RPG_EXTRACTION_WINDOW_TOKENS_MAX)
    .default(RPG_EXTRACTION_WINDOW_TOKENS_DEFAULT),
  // The RECONCILE CADENCE (§1.3) — every Nth flush FORCES a full re-emission of the refreshable planes
  // (scene + present cast, via the establish-when-unset machinery applied unconditionally) so a deep story's
  // panel self-heals instead of decaying. `0` = off. DEFINED here (wired-on-arrival, D107) so the config
  // view + write door carry it; the cadence CONSUMPTION at `stageStateRound` lands with the reconcile lane.
  reconcileEveryBeats: z.number().int().min(0).max(RPG_RECONCILE_EVERY_BEATS_MAX).default(RPG_RECONCILE_EVERY_BEATS_DEFAULT),
  dateMode: z.enum(RPG_DATE_MODES).default("narrated"),
  // The parity-plus feature knobs (§2.8/§2.1 M1 + P3 §3.3/§3.6 + the P4 card options) — additive,
  // self-healing at the parse seam (a pre-feature blob absent from a stored config parses to the
  // all-defaults features via the sub-schema, so the knobs heal in without a version stamp). The function
  // default parses `{}` through the sub-schema so EVERY inner default fills (a bare `{}` object literal
  // wouldn't satisfy the fully-required output type).
  features: rpgGameFeaturesSchema.default(() => rpgGameFeaturesSchema.parse({})),
  // WAVE MU (§12A.5 M5, owner ruling #20): GAME-authored user macros — the game half of the two-home
  // definition rule (preset `promptConfig.userMacros` is the other; ONE schema, imported from #preset).
  // Additive defaulted — a pre-MU blob self-heals to [] at the parse seam. Registered with source
  // `{kind:"game", id:<chatId>}` by the macro-feed threading (kit `registerUserMacros`).
  userMacros: z.array(userMacroSchema).max(MAX_USER_MACROS).default([]),
  // NO `prose` FIELD (owner ruling 2026-08-08, "we are putting everything in presets"). The steering-reminder
  // teach/heading OVERRIDES live in the PRESET's `promptConfig.prose` and are authored in the Templates tab;
  // a game turn assembles its `gmPresetId`, so a table's own copy rides that preset. The one-merge-long
  // `config.prose` spine is deleted, not deprecated — a second storage for one concept is the defect the
  // ruling closes, and pre-launch NO-LEGACY means no shim reads the old key.
});
export type RpgGameConfig = z.infer<typeof rpgGameConfigSchema>;
