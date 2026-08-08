// @orb/contracts/prose-slot — the SHAPE half of the PROSE-1 registry: the slot interface, the ONE closed id
// vocabulary, the override storage schema, and the legacy-field adapter. Split from `#prose` (which composes
// the per-domain TABLES into `PROSE_SLOTS` and owns `resolveProse`) for exactly one reason: the tables live
// beside the vocabulary they teach and must import the slot shape, so a single module would close a
// `no-circular` cycle (`#prose` → `#preset` → `#prose`). Consumers import `@orb/contracts/prose`, which
// re-exports everything here — only the domain slot TABLES import this module directly.
//

import { isPlainObject } from "@orb/kit/guards";
import { z } from "zod";

/** Which storage owns a slot's override. Exactly one per slot — never a cascade (PROSE-1 §3.1).
 *
 *  TWO storages, not three: the per-GAME home (`rpg_games.config.prose`) was RETIRED by the owner ruling of
 *  2026-08-08 ("we are putting everything in presets") and the whole rpg cohort re-homed to `preset`. A member
 *  with no slot is dead vocabulary that invites the next author to re-open the storage this ruling closed, so
 *  it is deleted rather than parked (NO-LEGACY). */
export const PROSE_HOMES = ["preset", "user"] as const;
export type ProseHome = (typeof PROSE_HOMES)[number];

/** The macro power a slot's text resolves under (PROSE-1 §6.1). `names-only` = the `{{user}}`/`{{char}}`
 *  identity registry ONLY (the steer-neutralization posture); `full` = the whole macro engine; `none` = the
 *  bytes ship verbatim, braces and all. */
export const PROSE_MACRO_MODES = ["none", "names-only", "full"] as const;
export type ProseMacroMode = (typeof PROSE_MACRO_MODES)[number];

/** One model-facing prose slot: the shipped default + everything the edit surface and the gate need. */
export interface ProseSlotDef {
  readonly id: ProseSlotId;
  readonly home: ProseHome;
  /** Bumped in the SAME commit as any `text` change — enforced by `prose-baseline.json` (PROSE-1 §4.4). */
  readonly version: number;
  /** The shipped default. An absent override resolves to these exact bytes. */
  readonly text: string;
  readonly macros: ProseMacroMode;
  /** Macros whose ABSENCE from an override is a lint in the editor — never a block (PROSE-1 §6.3). A
   *  `macros:"none"` slot may still list one: `resolveProseText`'s optional PRE-SUBSTITUTION tokens are
   *  spliced by the CALLER (the `{{person}}`/`{{base}}` guided precedent — a plain string replace, never the
   *  macro engine), and an override that drops the token drops the value it carried. */
  readonly requiredMacros: readonly string[];
  /** Literal tokens (not macros) an override must keep or the downstream renderer stops recognising the
   *  output — the `:::card` / composition-prefix class. Same warn-never-block posture. */
  readonly requiredTokens: readonly string[];
  /** Editor copy: what this slot is (the imagery-card `title`/`fires` precedent). */
  readonly title: string;
  /** Editor copy: WHEN these bytes reach a model. */
  readonly fires: string;
}

/** The closed slot vocabulary. A new slot lands here AND in its domain table, or `tsc` fails. Ids are
 *  `<domain>.<group>.<key>` and are STABLE — an id is the key a host's override is stored under, so a
 *  rename is a storage migration, never a refactor. */
export const PROSE_SLOT_IDS = [
  // ── per-PRESET: the guided-action templates (census 38-44) ──
  "preset.guided.opening",
  "preset.guided.continue",
  "preset.guided.response",
  "preset.guided.impersonate",
  "preset.guided.rewrite",
  "preset.guided.greetingRewrite",
  "preset.guided.greetingNew",
  // ── per-PRESET: the format strings (census 45-48) ──
  "preset.format.continueNudge",
  "preset.format.impersonateNudge",
  "preset.format.responseNudge",
  "preset.format.wiFormat",
  // ── per-PRESET: the compaction steering (census 49) — ADAPTED like guided/format: the override is the
  //    pre-PROSE-1 `promptConfig.compaction.instructions` field, not a `promptConfig.prose` row. ──
  "preset.compaction.instructions",
  // ── per-USER: the imagery prompt catalog (census 82-90) ──
  "imagery.template.character",
  "imagery.template.face",
  "imagery.template.scenario",
  "imagery.template.background",
  "imagery.caption.characterMultimodal",
  "imagery.caption.faceMultimodal",
  "imagery.negative.base",
  // ── per-USER: the app-tier chat side-generation prompts (census 74-81) ──
  "chat.assembly.anchorIdentity",
  "chat.arbiter.system",
  "chat.compaction.system",
  "chat.memory.digestSystem",
  "chat.memory.consolidationSystem",
  "chat.memory.consolidationLead",
  // ── per-USER: the group-round FRAMING prose (the S1b inline stragglers) ──
  "chat.group.alsoPresent",
  "chat.group.castMember",
  "chat.group.scenarioHeading",
  "chat.group.exampleHeading",
  "chat.group.roundNudge",
  "chat.group.narratorNudge",
  "chat.group.speakerTags",
  // ── per-PRESET: the turn-wire FRAMINGS (owner ruling 2026-08-07 — "templates need to have one home in
  //    presets"). Authored in the preset Templates tab, stored in `promptConfig.prose`. ──
  "chat.injection.systemNote",
  "chat.injection.userNote",
  "chat.assembly.continuationNudge",
  // ── per-USER: the prose-less-completion recovery ask (dogfood EMPTYGEN-REASONING) ──
  "chat.recovery.narrativeContinuation",
  // ── per-USER: the automation quiet-pick prompts (census 91) ──
  "automation.autobg.task",
  "automation.autobg.reply",
  // ── per-USER: discovery's three whole side-generation system prompts (S1b) ──
  "discovery.compare.system",
  "discovery.ask.system",
  "discovery.distill.system",
  // ── per-USER: the refinery pipeline prompts (R1 — docs/design/refinery-r0.md §9.7): four stage-SYSTEM
  //    slots (`refine` = the refinement-rewrite system) + the eight F4 (stage × mode) instruction bodies.
  //    All `macros:"none"` BY LAW (belt 5 by-construction): refinery prompts never enter the macro engine,
  //    so card-text `{{…}}` rides to the model verbatim and applied rewrites keep their macros intact. ──
  "refinery.score.system",
  "refinery.rewrite.system",
  "refinery.refine.system",
  "refinery.analyze.system",
  "refinery.score.mode.full",
  "refinery.score.mode.quick",
  "refinery.rewrite.mode.conservative",
  "refinery.rewrite.mode.balanced",
  "refinery.rewrite.mode.expansive",
  "refinery.analyze.mode.full",
  "refinery.analyze.mode.iteration",
  "refinery.analyze.mode.quick",
  // ── per-PRESET: the game-turn steering-reminder TEACHES (census 1-7) — stored in `promptConfig.prose`,
  //    authored in the preset Templates tab, and threaded to `LiteReminderInput.prose` by chat's rpg gather
  //    args (`domain/rpg/substrate/reminder.ts` resolves them). `names-only` macro mode (§6.1): a host
  //    override's `{{user}}`/`{{char}}` resolve through the identity-only registry, the default resolves
  //    byte-identically (it carries no macro). ──
  "rpg.reminder.steeringLicense",
  "rpg.reminder.deceptionTeach",
  "rpg.reminder.omniscienceTeach",
  "rpg.card.askInteractive",
  "rpg.card.askStatic",
  "rpg.card.example",
  "rpg.reminder.cyoaTeach",
  // ── per-PRESET: the cast/offstage HEADERS (census 8 + the offstage sibling) and the delta-block headings
  //    (census 9-10) — `macros:"none"`: a header/heading has no character context to substitute, so its bytes
  //    ship verbatim (owner decision 5 ruled the delta headings prose/voice, in scope). The cast header is a
  //    DUAL-surface vocabulary — the reminder AND the `{{rpgCast}}`/`{{rpgSceneState}}` macro feed both resolve
  //    it, so an override lands on both surfaces at once (the "two surfaces, one vocabulary" law). ──
  "rpg.reminder.castHeader",
  "rpg.reminder.offstageHeader",
  "rpg.delta.changesHeading",
  "rpg.delta.sceneOpensHeading",
  // ── per-PRESET: the EXTRACTION seam (census 11-27 + 29-36) — the WRITE-surface prose every state vehicle
  //    composes (`contracts/rpg/extraction-prompt.ts` + `entry/compose/rpg.ts`). `macros:"none"` for the whole
  //    cohort: several carry a PRE-SUBSTITUTION token vocabulary (this game's tracker catalogue, the worked
  //    example's keys, the resolved ref lists) which the seam splices as data — never the macro engine, which
  //    has no binding to offer an extraction prompt. Census 27 is `rpg.extract.stateTrackingGuide` — the owner
  //    ruled decision 6 WIRE (2026-08-08), so the former dead `RPG_STATE_TRACKING_GUIDE` constant is now a slot
  //    composed onto both write surfaces. 28/32 are structural labels, out by §2.11. ──
  "rpg.extract.deceptionSurface",
  "rpg.extract.party.resources",
  "rpg.extract.party.states",
  "rpg.extract.party.trackerScope",
  "rpg.extract.scene.core",
  "rpg.extract.scene.clock",
  "rpg.extract.scene.weather",
  "rpg.extract.scene.dayStructured",
  "rpg.extract.scene.dayNarrated",
  "rpg.extract.scene.present",
  "rpg.extract.scene.mood",
  "rpg.extract.scene.emoji",
  "rpg.extract.scene.plot",
  "rpg.extract.plane.party",
  "rpg.extract.plane.inventory",
  "rpg.extract.plane.trackers",
  "rpg.extract.plane.quests",
  "rpg.extract.plane.journal",
  "rpg.extract.journal.customType",
  "rpg.extract.journal.customLabels",
  "rpg.extract.stateTrackingGuide",
  "rpg.extract.reconcileDoctrine",
  "rpg.extract.tool.updateParty",
  "rpg.extract.tool.partyExample",
  "rpg.extract.tool.updateInventory",
  "rpg.extract.tool.updateScene",
  "rpg.extract.tool.setTracker",
  "rpg.extract.tool.upsertQuest",
  "rpg.extract.tool.addJournalEntry",
  "rpg.extract.tool.noChanges",
  "rpg.extract.systemHeader",
  "rpg.extract.toolRoundHeader",
  "rpg.extract.reconcilePass",
  "rpg.extract.foldedReconcile",
  "rpg.extract.lockedPaths",
  "rpg.extract.refs.targets",
  "rpg.extract.refs.playerToken",
  "rpg.extract.refs.trackerGroup",
  "rpg.extract.refs.gameTrackerKeys",
  "rpg.extract.refs.conditions",
  "rpg.extract.refs.closing",
  // ── per-PRESET: the POPULATE round's own prose (the populate census rows 1-7,
  //    `docs/design/prose-1-populate-census.md`). Its own `rpg.populate.*` group rather than more
  //    `rpg.extract.*` rows because the two fire on DIFFERENT CALLS — the extraction cohort rides every state
  //    round of every turn, this one rides the host's ONE born-state click over a card — so a host tuning the
  //    card read has no reason to read the turn-loop teaching. Same posture as the extraction cohort
  //    otherwise: `macros:"none"`, with a PRE-SUBSTITUTION token vocabulary the seam splices as data (the
  //    card's name + body, the opening, the one target ref). Census rows 8-10 (the three host TOASTS) are OUT:
  //    they are read from a click result and never reach a model, which is the §Scope test. ──
  "rpg.populate.systemHeader",
  "rpg.populate.identity",
  "rpg.populate.doctrine",
  "rpg.populate.cardBlock",
  "rpg.populate.emptyCard",
  "rpg.populate.openingBlock",
  "rpg.populate.targetLine",
] as const;
export type ProseSlotId = (typeof PROSE_SLOT_IDS)[number];

export const proseSlotIdSchema = z.enum(PROSE_SLOT_IDS);

const SLOT_ID_SET: ReadonlySet<string> = new Set<string>(PROSE_SLOT_IDS);
export function isProseSlotId(value: string): value is ProseSlotId {
  return SLOT_ID_SET.has(value);
}

/** An instruction is a paragraph, not an essay — mirrors `IMAGERY_TEMPLATE_MAX_CHARS`. */
export const PROSE_MAX_CHARS = 4000;

/** Show a prose editor's character counter from 80% of the cap — the `hint-editor` precedent ("a quiet
 *  counter from 80% full"). A counter that is always on is chrome; one that appears only as the ceiling
 *  approaches is the warning it exists to be. */
export const PROSE_COUNTER_AT = 0.8;

/** How many characters `text` is OVER {@link PROSE_MAX_CHARS}; `0` when it fits.
 *
 *  MEASURED ON THE TRIMMED TEXT because that is what gets STORED — both editors trim at their save boundary
 *  (`normalizePresetProse` / `proseSlotPatch`), so measuring the raw draft would refuse a save whose actual
 *  payload fits.
 *
 *  WHY AN EDITOR NEEDS THIS AT ALL. `proseOverrideSchema` caps `text` and `proseOverridesSchema` wraps each
 *  key in `.catch(undefined)` — correct at the contract (one malformed row must not nuke its siblings), but
 *  it means an over-cap override does not FAIL, it VANISHES: the key heals to absent, the shipped default
 *  rides, and the host's text is gone with no signal anywhere. The self-heal is the right last resort and
 *  stays; the editors are what must stop the loss before the wire, and they cap and refuse off THIS number
 *  rather than re-spelling it. */
export function proseOverBy(text: string): number {
  return Math.max(0, text.trim().length - PROSE_MAX_CHARS);
}

/** A stored host override. `baseVersion` = the slot `version` this edit was authored against; it is the
 *  ONLY staleness signal (PROSE-1 §4.4) and is never used to pick which text wins. */
export const proseOverrideSchema = z.object({
  text: z.string().max(PROSE_MAX_CHARS),
  baseVersion: z.number().int().positive(),
});
export type ProseOverride = z.infer<typeof proseOverrideSchema>;

/** The ONE override record shape all three storages produce, so `resolveProse` is home-agnostic and the
 *  precedence rule lives in exactly one place. Per-key `.catch(undefined)` so a malformed single override
 *  self-heals to the shipped default instead of nuking the whole section (the imagery-field posture). */
export const proseOverridesSchema = z
  .preprocess(
    // A RETIRED slot id (§4.4 rung 5: a default whose feature was deleted) must not make a whole stored blob
    // unparseable — an enum-keyed record REJECTS an unknown key, so strip them before the record sees them.
    (raw) => (isPlainObject(raw) ? Object.fromEntries(Object.entries(raw).filter(([key]) => isProseSlotId(key))) : raw),
    z.partialRecord(proseSlotIdSchema, proseOverrideSchema.optional().catch(undefined)),
  )
  .prefault({});
export type ProseOverrides = z.infer<typeof proseOverridesSchema>;

export interface ProseResolution {
  readonly text: string;
  readonly source: "default" | "override";
  /** The shipped default moved on since this override was authored — the edit surface offers the new text;
   *  nothing is ever silently swapped (PROSE-1 §4.4 rung 3). */
  readonly stale: boolean;
}

/** The pre-PROSE-1 override fields (`formatStrings.*`, `UserSettings.imagery.*`) store a BARE string with no
 *  authored-against version. They are adapted, never duplicated (PROSE-1 §4.6): a legacy string is stamped
 *  at the FIRST slot version, so it reads as non-stale today and correctly reports stale the first time its
 *  shipped default is revised. */
export const LEGACY_PROSE_BASE_VERSION = 1;

/** Adapt a legacy bare-string override field into the ONE override shape. */
export function proseOverrideFromLegacy(text: string | undefined): ProseOverride | undefined {
  return text === undefined ? undefined : { text, baseVersion: LEGACY_PROSE_BASE_VERSION };
}

// ── THE RESOLUTION PRIMITIVES (PROSE-1 §4.3) ────────────────────────────────────────────────────────
// The precedence rule and the pre-substitution splice live HERE, on the SHAPE half, rather than in `#prose`
// beside the composed registry — because a domain TABLE may need to resolve its own slots and cannot reach
// `#prose` without closing the `#prose → #<domain> → #prose` cycle this module's split exists to prevent
// (`contracts/rpg/extraction-prompt.ts` is the first such caller: its per-game plane/tool templates resolve
// `RPG_PROSE_SLOTS` rows against the turn's overrides, in contracts, beside the schema they teach).
//
// STILL EXACTLY ONE HOME. `#prose`'s `resolveProse(id, overrides)` / `resolveProseText(id, overrides, tokens)`
// are THIN DELEGATES over these — they add the registry lookup and nothing else. A second spelling of "which
// text wins" or "how a token splices" is what these two functions exist to make unnecessary.

/** Host edit BEATS shipped default, two rungs, no cascade — over a slot DEF + that slot's stored override,
 *  so a caller holding its own domain table can resolve without the composed registry.
 *
 *  A BLANK override is treated as ABSENT: `{text:""}` parses (the schema has no min length), so it can arrive
 *  from an imported preset file, a direct API write, or a blob predating a normalizer, and resolving it
 *  literally puts EMPTY BYTES on the wire. Healed at the READ, per `#prose`'s own long-form reasoning. */
export function resolveProseFrom(slot: ProseSlotDef, override: ProseOverride | undefined): ProseResolution {
  if (override === undefined || override.text.trim() === "") {
    return { text: slot.text, source: "default", stale: false };
  }
  return { text: override.text, source: "override", stale: override.baseVersion < slot.version };
}

// The pre-substitution token regexes, memoized by token NAME (an assembler resolves the same handful of
// frames per member per turn, so a per-call `new RegExp` would recompile them forever). Names are code
// constants from the slot table — never host or user input — so there is nothing to escape. The
// `useTopLevelRegex` lint's sanctioned shape: build once, cache, reuse.
const tokenReByName = new Map<string, RegExp>();
function tokenRe(name: string): RegExp {
  const cached = tokenReByName.get(name);
  if (cached !== undefined) {
    return cached;
  }
  const re = new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, "gi");
  tokenReByName.set(name, re);
  return re;
}

/**
 * Splice a slot's caller-supplied PRE-SUBSTITUTION tokens into resolved text: a `{{name}}`/`{{note}}` in the
 * text (default OR host override) becomes the caller's string, as a plain replace — NOT the macro engine (the
 * `resolveGuidedInstruction` `{{person}}`/`{{base}}` precedent). Two reasons it must stay a replace: these
 * frames wrap text that is ALREADY macro-resolved (re-running the engine would resolve it twice), and the
 * value is per-render data the engine has no binding for. Absent ⇒ verbatim, so every token-free slot and
 * every existing caller is byte-identical.
 *
 * The replacement is a FUNCTION, so a `$&`/`$1` inside a member name or an injection body is a literal.
 */
export function spliceProseTokens(text: string, tokens: Readonly<Record<string, string>> | undefined): string {
  if (tokens === undefined) {
    return text;
  }
  let out = text;
  for (const [name, value] of Object.entries(tokens)) {
    out = out.replace(tokenRe(name), () => value);
  }
  return out;
}

/** Does `text` carry the pre-substitution token `name` — by EXACTLY the recognition {@link spliceProseTokens}
 *  splices with (whitespace-tolerant, case-insensitive)?
 *
 *  It lives HERE, beside the splice that defines the semantics, because its one caller is a REFUSAL: the
 *  preset write boundary's carrier guard (`promptConfigWriteSchema`). A guard carrying its own spelling —
 *  a plain `text.includes("{{note}}")` — would bounce `{{ note }}` and `{{Note}}`, both of which the splice
 *  fills perfectly well, and a refusal that is stricter than the renderer is a bug the author cannot argue
 *  with. One recogniser, one answer. */
export function hasProseToken(text: string, name: string): boolean {
  const re = tokenRe(name);
  // The cached regex is GLOBAL (the splice needs it to replace every occurrence) and `RegExp.test` on a
  // global regex ADVANCES `lastIndex` — without this reset, alternating calls would report a matching text
  // as token-less. `String.replace` resets it itself, which is why the splice never had to.
  re.lastIndex = 0;
  return re.test(text);
}
