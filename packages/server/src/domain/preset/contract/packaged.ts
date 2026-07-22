// The PACKAGED-preset template store: ownerless, well-known-KEYED presets that ship WITH the app and are
// CLONED into a caller's library on demand (`clonePackaged`). Distinct from THE system default (the single
// shared sentinel row that lists/reads surface and COWs on edit) — a packaged preset is a clone SOURCE, not
// a pickable library row: it is deliberately kept OUT of the readable list (`persistence/queries` keys the
// shared arm on the sentinel id, not `ownerId IS NULL`). One closed key union locks the shape; adding a
// packaged preset = one `PACKAGED_PRESETS` entry (well-known id + name + kind + config) and its boot seed +
// clone addressing come for free (the string-union dispatch discipline — `Spine-TypeScript-and-Patterns.md`).

import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

/** The closed set of packaged-preset keys. The `PackagedPresetKey` union derives from it; `clonePackaged`
 *  and the boot seeder dispatch over `PACKAGED_PRESETS`. Not exported (no runtime consumer yet) — the union
 *  is the importable surface. */
const PACKAGED_PRESET_KEYS = ["rpg-gm"] as const;
export type PackagedPresetKey = (typeof PACKAGED_PRESET_KEYS)[number];

/** A shipped template preset: a reserved well-known id (like the system-default sentinel — a stable literal so
 *  reseeding is idempotent), its display name/kind, and the `PromptConfig` seeded verbatim. */
export interface PackagedPreset {
  readonly id: PresetId;
  readonly name: string;
  readonly kind: string;
  readonly config: PromptConfig;
}

// ── The "RPG Game Master" packaged preset (rpg-design/02 §1.1, 06 §1) ────────────────────────────────
// GM-TUNE: the 8 `rpg*` data-fed macros (domain/rpg/substrate/gather-macros.ts, feeding `RpgGatherResult`)
// are now wired into their 06 §1 section slots — `game-frame`(#2)/`server-context`(#5)/`gm-secrets`(#6)/
// `continuity`(#7)/`cast`(#8) — inserted around the earned marinara GM-law prose (still macro-free, still
// ported verbatim). RPG-RATING: `rating_guidelines` (06 §1 #4) is now added as a STATIC section (NOT a 9th
// macro — the doc's table row carries no `{{rpg…}}` token and the pairing test asserts exactly 8). It keys off
// `config.rating`, which the game frame surfaces to the model (`buildWorld` appends `Rating: <sfw|nsfw>`), so
// the block states both policies and the GM applies the one matching the game's rating. The
// DEFAULT_PROMPT_CONFIG-derived world-info/card/persona/memory sections are kept as-is (06 §1's 10-slot
// table doesn't forbid them and dropping them is a separate design call, not a macro-wiring one).

const GM_ROLE_SECTION: PromptSection = {
  type: "marker",
  id: "gm-role",
  name: "GM role",
  marker: "main_prompt",
  role: "system",
  enabled: true,
  template:
    "You are the Game Master of an immersive, ongoing tabletop-style roleplay for {{user}}. You bring the world to life with vivid imagination, memorable NPCs, and evocative sensory detail — you crack jokes, build tension, celebrate epic moments, and mourn losses.",
};

const GM_INSTRUCTIONS_SECTION: PromptSection = {
  type: "literal",
  id: "gm-instructions",
  name: "GM instructions",
  role: "system",
  enabled: true,
  content: [
    "Canonical truth: system blocks, weather updates, and tool results are canonical truth. Do not recalculate or contradict them.",
    "Intent, not success: narrate in second person from the player character's limited POV. Treat player input as committed intent, not guaranteed success — a stated action is an attempt whose outcome you adjudicate.",
    "Fairness: keep the game fair but challenging. Reward creativity, punish recklessness, and never treat the player as a Mary Sue. Failure is part of play.",
    "Epistemics: no one is omniscient. Characters know only what they personally witnessed, inferred from available evidence, learned from public reputation, or were told by someone in-scene. When unsure, let them be wrong, suspicious, confused, or curious instead.",
    "Party jurisdiction: you also play the party members, who have their own autonomy and emotions, but the outcomes of their actions and lines are under the GM's jurisdiction.",
    'Fail forward: a failed or partial check always changes the situation — narrate the consequence the tool result names. Never narrate "nothing happens."',
    "Agency: end every turn at a point where the players can act.",
  ].join("\n\n"),
};

/** SFW/NSFW block keyed off config.rating — section #4 (06 §1). Static: the game frame (`{{rpgWorld}}`) surfaces
 *  the game's rating to the model, so this block states both policies and the GM applies the matching one. */
const RATING_GUIDELINES_SECTION: PromptSection = {
  type: "literal",
  id: "rating-guidelines",
  name: "Rating guidelines",
  role: "system",
  enabled: true,
  content: [
    "Content rating: honor this game's content rating, shown in the game frame above.",
    "SFW: keep it PG-13 — fade to black on explicit sexual content, and keep violence and gore non-graphic. Imply rather than depict.",
    "NSFW: explicit sexual and graphic violent content is permitted between consenting adults when the scene, tone, and player intent call for it. Keep it in service of the story — never gratuitous, and never override a boundary the table has set.",
  ].join("\n\n"),
};

/** genre/setting/tone/difficulty frame — section #2 (06 §1). */
const GAME_FRAME_SECTION: PromptSection = {
  type: "literal",
  id: "game-frame",
  name: "Game frame",
  role: "system",
  enabled: true,
  content: "{{rpgWorld}}",
};

/** The server-computed state block the model narrates but never recalculates — section #5 (06 §1). */
const SERVER_CONTEXT_SECTION: PromptSection = {
  type: "literal",
  id: "server-context",
  name: "Server-computed context",
  role: "system",
  enabled: true,
  content: "Server-Computed Context (narrate these, don't recalculate):\n\n{{rpgSceneState}}\n\n{{rpgMorale}}\n\n{{rpgPerception}}\n\n{{rpgMap}}",
};

/** The GM-only spine — story arc, twist bank, hidden clocks — section #6 (06 §1). */
const GM_SECRETS_SECTION: PromptSection = {
  type: "literal",
  id: "gm-secrets",
  name: "GM secrets",
  role: "system",
  enabled: true,
  content:
    "{{rpgSecrets}}\n\nOptional pacing scaffolding. Use it when it fits; ignore clocks or seeds when the current game is meant to stay chill, domestic, or low-pressure.",
};

/** Session summaries + latest carryover detail — section #7 (06 §1). */
const CONTINUITY_SECTION: PromptSection = {
  type: "literal",
  id: "continuity",
  name: "Continuity",
  role: "system",
  enabled: true,
  content: "{{rpgContinuity}}",
};

/** Party sheets/arcs + tracked NPCs — section #8 (06 §1). */
const CAST_SECTION: PromptSection = {
  type: "literal",
  id: "cast",
  name: "Cast",
  role: "system",
  enabled: true,
  content: "{{rpgCast}}",
};

const RPG_GM_PRESET_CONFIG: PromptConfig = {
  ...DEFAULT_PROMPT_CONFIG,
  sections: [
    GM_ROLE_SECTION,
    GAME_FRAME_SECTION,
    GM_INSTRUCTIONS_SECTION,
    RATING_GUIDELINES_SECTION,
    SERVER_CONTEXT_SECTION,
    GM_SECRETS_SECTION,
    CONTINUITY_SECTION,
    CAST_SECTION,
    ...DEFAULT_PROMPT_CONFIG.sections.filter((s) => s.id !== "main"),
  ],
};

/** The registry — exhaustive over `PackagedPresetKey` by construction. Ids are reserved literals (never minted);
 *  the boot seeder inserts/reseeds each, `clonePackaged` reads the seeded row by id and forks an owned copy. */
export const PACKAGED_PRESETS: Record<PackagedPresetKey, PackagedPreset> = {
  "rpg-gm": {
    id: castId<PresetId>("preset_000000000000000000000rpggm"),
    name: "RPG Game Master",
    kind: "rpg-gm",
    config: RPG_GM_PRESET_CONFIG,
  },
};
