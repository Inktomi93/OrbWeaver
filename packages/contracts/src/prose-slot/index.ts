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
] as const;
export type ProseSlotId = (typeof PROSE_SLOT_IDS)[number];

export const proseSlotIdSchema = z.enum(PROSE_SLOT_IDS);

const SLOT_ID_SET: ReadonlySet<string> = new Set<string>(PROSE_SLOT_IDS);
export function isProseSlotId(value: string): value is ProseSlotId {
  return SLOT_ID_SET.has(value);
}

/** An instruction is a paragraph, not an essay — mirrors `IMAGERY_TEMPLATE_MAX_CHARS`. */
export const PROSE_MAX_CHARS = 4000;

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
