---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the contracts union members the unwired unions scan reports

## What

`pnpm unwired unions` reports each of the union members below in `contracts`; `reports/unwired/unions.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Member | At | Kind | Class | Decision |
| - | - | - | - | - |
| `IMAGE_ART_STYLES.anime` | `contracts/src/embeddings/index.ts:91` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_ART_STYLES.semi-realistic` | `contracts/src/embeddings/index.ts:92` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_ART_STYLES.photorealistic` | `contracts/src/embeddings/index.ts:93` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_ART_STYLES.painterly` | `contracts/src/embeddings/index.ts:94` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_ART_STYLES.cartoon` | `contracts/src/embeddings/index.ts:96` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_ART_STYLES.pixel-art` | `contracts/src/embeddings/index.ts:97` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_ART_STYLES.3d-render` | `contracts/src/embeddings/index.ts:98` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_ART_STYLES.sketch` | `contracts/src/embeddings/index.ts:99` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_ART_STYLES.comic` | `contracts/src/embeddings/index.ts:100` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_ART_STYLES.abstract` | `contracts/src/embeddings/index.ts:101` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_PALETTES.warm` | `contracts/src/embeddings/index.ts:106` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_PALETTES.cool` | `contracts/src/embeddings/index.ts:106` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_PALETTES.vibrant` | `contracts/src/embeddings/index.ts:106` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_PALETTES.monochrome` | `contracts/src/embeddings/index.ts:106` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_PALETTES.pastel` | `contracts/src/embeddings/index.ts:106` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_PALETTES.high-contrast` | `contracts/src/embeddings/index.ts:106` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_MOODS.cheerful` | `contracts/src/embeddings/index.ts:109` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_MOODS.serene` | `contracts/src/embeddings/index.ts:109` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_MOODS.melancholic` | `contracts/src/embeddings/index.ts:109` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_MOODS.menacing` | `contracts/src/embeddings/index.ts:109` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_MOODS.sensual` | `contracts/src/embeddings/index.ts:109` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_MOODS.playful` | `contracts/src/embeddings/index.ts:109` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_MOODS.wistful` | `contracts/src/embeddings/index.ts:109` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_MOODS.triumphant` | `contracts/src/embeddings/index.ts:109` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_RATINGS.safe` | `contracts/src/embeddings/index.ts:112` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_RATINGS.suggestive` | `contracts/src/embeddings/index.ts:112` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_SHOT_TYPES.bust` | `contracts/src/embeddings/index.ts:115` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_SHOT_TYPES.half-body` | `contracts/src/embeddings/index.ts:115` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_SHOT_TYPES.full-body` | `contracts/src/embeddings/index.ts:115` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_SHOT_TYPES.close-up` | `contracts/src/embeddings/index.ts:115` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_CAMERA_ANGLES.eye-level` | `contracts/src/embeddings/index.ts:118` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_CAMERA_ANGLES.low-angle` | `contracts/src/embeddings/index.ts:118` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_CAMERA_ANGLES.high-angle` | `contracts/src/embeddings/index.ts:118` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_CAMERA_ANGLES.dutch` | `contracts/src/embeddings/index.ts:118` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_CAMERA_ANGLES.overhead` | `contracts/src/embeddings/index.ts:118` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_CAMERA_ANGLES.from-behind` | `contracts/src/embeddings/index.ts:118` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_GENDERS.female` | `contracts/src/embeddings/index.ts:121` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_GENDERS.male` | `contracts/src/embeddings/index.ts:121` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_GENDERS.androgynous` | `contracts/src/embeddings/index.ts:121` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_GENDERS.non-human` | `contracts/src/embeddings/index.ts:121` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_COVERAGES.fully-covered` | `contracts/src/embeddings/index.ts:124` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_COVERAGES.mostly-covered` | `contracts/src/embeddings/index.ts:124` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_COVERAGES.partially-exposed` | `contracts/src/embeddings/index.ts:124` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_COVERAGES.mostly-exposed` | `contracts/src/embeddings/index.ts:124` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_COVERAGES.uncovered` | `contracts/src/embeddings/index.ts:124` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_BODY_TYPES.slim` | `contracts/src/embeddings/index.ts:126` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_BODY_TYPES.average` | `contracts/src/embeddings/index.ts:126` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_BODY_TYPES.athletic` | `contracts/src/embeddings/index.ts:126` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_BODY_TYPES.curvy` | `contracts/src/embeddings/index.ts:126` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_BODY_TYPES.heavy` | `contracts/src/embeddings/index.ts:126` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_BODY_TYPES.petite` | `contracts/src/embeddings/index.ts:126` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_BODY_TYPES.muscular` | `contracts/src/embeddings/index.ts:126` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_BODY_TYPES.non-human` | `contracts/src/embeddings/index.ts:126` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_BODY_TYPES.not-applicable` | `contracts/src/embeddings/index.ts:126` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_CHEST_SIZES.small` | `contracts/src/embeddings/index.ts:128` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_CHEST_SIZES.large` | `contracts/src/embeddings/index.ts:128` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_CHEST_SIZES.very-large` | `contracts/src/embeddings/index.ts:128` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_CHEST_SIZES.not-applicable` | `contracts/src/embeddings/index.ts:128` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_SKIN_TONES.pale` | `contracts/src/embeddings/index.ts:130` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_SKIN_TONES.fair` | `contracts/src/embeddings/index.ts:130` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_SKIN_TONES.tan` | `contracts/src/embeddings/index.ts:130` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_SKIN_TONES.olive` | `contracts/src/embeddings/index.ts:130` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_SKIN_TONES.brown` | `contracts/src/embeddings/index.ts:130` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_SKIN_TONES.non-human` | `contracts/src/embeddings/index.ts:130` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_SKIN_TONES.not-applicable` | `contracts/src/embeddings/index.ts:130` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_OUTFIT_TYPES.casual` | `contracts/src/embeddings/index.ts:132` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_OUTFIT_TYPES.formal` | `contracts/src/embeddings/index.ts:132` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_OUTFIT_TYPES.armor` | `contracts/src/embeddings/index.ts:132` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_OUTFIT_TYPES.uniform` | `contracts/src/embeddings/index.ts:132` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_OUTFIT_TYPES.swimwear` | `contracts/src/embeddings/index.ts:132` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_OUTFIT_TYPES.lingerie` | `contracts/src/embeddings/index.ts:132` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_OUTFIT_TYPES.traditional` | `contracts/src/embeddings/index.ts:132` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_OUTFIT_TYPES.streetwear` | `contracts/src/embeddings/index.ts:132` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_OUTFIT_TYPES.fantasy` | `contracts/src/embeddings/index.ts:132` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_CLOTHING_STATES.intact` | `contracts/src/embeddings/index.ts:135` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_CLOTHING_STATES.disheveled` | `contracts/src/embeddings/index.ts:135` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_CLOTHING_STATES.partially-removed` | `contracts/src/embeddings/index.ts:135` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_CLOTHING_STATES.not-applicable` | `contracts/src/embeddings/index.ts:135` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_NUDITY_LEVELS.suggestive` | `contracts/src/embeddings/index.ts:138` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_EXPOSED_PARTS.shoulders` | `contracts/src/embeddings/index.ts:141` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_EXPOSED_PARTS.midriff` | `contracts/src/embeddings/index.ts:141` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_EXPOSED_PARTS.cleavage` | `contracts/src/embeddings/index.ts:141` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_EXPOSED_PARTS.back` | `contracts/src/embeddings/index.ts:141` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_EXPOSED_PARTS.legs` | `contracts/src/embeddings/index.ts:141` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_EXPOSED_PARTS.thighs` | `contracts/src/embeddings/index.ts:141` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_EXPOSED_PARTS.chest` | `contracts/src/embeddings/index.ts:141` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_EXPOSED_PARTS.buttocks` | `contracts/src/embeddings/index.ts:141` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_EXPOSED_PARTS.genitals` | `contracts/src/embeddings/index.ts:141` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `IMAGE_EXPOSED_PARTS.feet` | `contracts/src/embeddings/index.ts:141` | parsed | unknown (read) | keep while the vocabulary is offered to the model: its structured output fills the member through `z.enum`; delete the member only when the vocabulary drops it |
| `EVIDENCE_TIERS.advertised` | `contracts/src/inference/evidence.ts:16` | parsed | unknown | keep it only if the parsed source still produces it; otherwise delete it |
| `EVIDENCE_TIERS.family-floor` | `contracts/src/inference/evidence.ts:16` | parsed | unknown | keep it only if the parsed source still produces it; otherwise delete it |
| `EVIDENCE_TIERS.kind-floor` | `contracts/src/inference/evidence.ts:16` | parsed | unknown | keep it only if the parsed source still produces it; otherwise delete it |
| `PROMPT_CACHE_FORMATS.openai-breakpoint` | `contracts/src/inference/prompt-cache.ts:16` | parsed | unknown | keep it only if the parsed source still produces it; otherwise delete it and the 5 branch, check or keys that name it |
| `RESPONSE_CACHE_STATUSES.hit` | `contracts/src/inference/usage.ts:33` | parsed | unknown | keep it only if the parsed source still produces it; otherwise delete it and the 3 branch, check or keys that name it |
| `RESPONSE_CACHE_STATUSES.miss` | `contracts/src/inference/usage.ts:33` | parsed | unknown | keep it only if the parsed source still produces it; otherwise delete it |
| `SIDE_GEN_KINDS.arbiter` | `contracts/src/preset/index.ts:188` | unbuilt | wire (read) | D299 gives each background task its own sampling posture: pass this kind at the task's side-generation call, or delete the task's posture if the task is gone |
| `SIDE_GEN_KINDS.quiet_generate` | `contracts/src/preset/index.ts:189` | unbuilt | wire (read) | D299 gives each background task its own sampling posture: pass this kind at the task's side-generation call, or delete the task's posture if the task is gone |
| `SIDE_GEN_KINDS.extract_quiet` | `contracts/src/preset/index.ts:190` | unbuilt | wire (read) | D299 gives each background task its own sampling posture: pass this kind at the task's side-generation call, or delete the task's posture if the task is gone |
| `SIDE_GEN_KINDS.greeting_studio` | `contracts/src/preset/index.ts:194` | unbuilt | wire (read) | D299 gives each background task its own sampling posture: pass this kind at the task's side-generation call, or delete the task's posture if the task is gone |
| `SIDE_GEN_KINDS.schema_forge` | `contracts/src/preset/index.ts:201` | unbuilt | wire (read) | D299 gives each background task its own sampling posture: pass this kind at the task's side-generation call, or delete the task's posture if the task is gone |
| `SIDE_GEN_KINDS.theme_name` | `contracts/src/preset/index.ts:202` | unbuilt | wire (read) | D299 gives each background task its own sampling posture: pass this kind at the task's side-generation call, or delete the task's posture if the task is gone |
| `SIDE_GEN_KINDS.memory_digest` | `contracts/src/preset/index.ts:203` | unbuilt | wire (read) | D299 gives each background task its own sampling posture: pass this kind at the task's side-generation call, or delete the task's posture if the task is gone |
| `REFINERY_REWRITE_MODES.conservative` | `contracts/src/refinery/index.ts:144` | parsed | unknown | keep it only if the parsed source still produces it; otherwise delete it and the 2 branch, check or keys that name it |
| `REFINERY_REWRITE_MODES.expansive` | `contracts/src/refinery/index.ts:144` | parsed | unknown | keep it only if the parsed source still produces it; otherwise delete it and the 2 branch, check or keys that name it |
| `FORGE_FIELD_TYPES.integer` | `contracts/src/refinery/schema-forge.ts:97` | parsed | unknown | keep it only if the parsed source still produces it; otherwise delete it and the 1 branch, check or key that name it |
| `RPG_QUEST_ACTIONS.complete` | `contracts/src/rpg/tools.ts:198` | parsed | unknown | keep it only if the parsed source still produces it; otherwise delete it and the 1 branch, check or key that name it |
| `RPG_QUEST_ACTIONS.fail` | `contracts/src/rpg/tools.ts:198` | parsed | unknown | keep it only if the parsed source still produces it; otherwise delete it and the 1 branch, check or key that name it |
| `USER_SETTINGS_SECTIONS.groupDefaults` | `contracts/src/settings/index.ts:756` | parsed | unknown | keep it only if the parsed source still produces it; otherwise delete it |
| `LEADERBOARD_SORTS.totalGenTimeMs` | `contracts/src/stats/index.ts:750` | parsed | unknown | keep it only if the parsed source still produces it; otherwise delete it |
| `LEADERBOARD_SORTS.lastActivityAt` | `contracts/src/stats/index.ts:750` | parsed | unknown | keep it only if the parsed source still produces it; otherwise delete it and the 7 branch, check or keys that name it |

### Plugin API: keep unless no guest can reach it

Plugin guests use the published plugin surface from outside the tree, so the scan cannot see their reads, writes and calls. Delete a row only after proving no guest reaches it through the host ABI or the plugin SDK.

| Member | At | Kind | Class | Decision |
| - | - | - | - | - |
| `PLUGIN_FREE_NAMESPACES.grants` | `contracts/src/plugin/host-v1.ts:706` | unbuilt | unknown | keep unless no guest can reach it; else delete the member |
| `PLUGIN_FREE_NAMESPACES.ids` | `contracts/src/plugin/host-v1.ts:706` | unbuilt | unknown | keep unless no guest can reach it; else delete the member |
| `PLUGIN_BADGE_INTENTS.danger` | `contracts/src/plugin/ui.ts:82` | parsed | unknown | keep unless no guest can reach it; else keep it only if the parsed source still produces it; otherwise delete it and the 1 branch, check or key that name it |
| `PLUGIN_ICON_NAMES.star` | `contracts/src/plugin/ui.ts:128` | parsed | unknown | keep unless no guest can reach it; else keep it only if the parsed source still produces it; otherwise delete it and the 1 branch, check or key that name it |
| `PLUGIN_ICON_NAMES.heart` | `contracts/src/plugin/ui.ts:129` | parsed | unknown | keep unless no guest can reach it; else keep it only if the parsed source still produces it; otherwise delete it and the 1 branch, check or key that name it |
| `PLUGIN_ICON_NAMES.flame` | `contracts/src/plugin/ui.ts:130` | parsed | unknown | keep unless no guest can reach it; else keep it only if the parsed source still produces it; otherwise delete it and the 1 branch, check or key that name it |
| `PLUGIN_ICON_NAMES.sparkles` | `contracts/src/plugin/ui.ts:131` | parsed | unknown | keep unless no guest can reach it; else keep it only if the parsed source still produces it; otherwise delete it and the 1 branch, check or key that name it |
| `PLUGIN_ICON_NAMES.award` | `contracts/src/plugin/ui.ts:132` | parsed | unknown | keep unless no guest can reach it; else keep it only if the parsed source still produces it; otherwise delete it and the 1 branch, check or key that name it |
| `PLUGIN_ICON_NAMES.crown` | `contracts/src/plugin/ui.ts:133` | parsed | unknown | keep unless no guest can reach it; else keep it only if the parsed source still produces it; otherwise delete it and the 1 branch, check or key that name it |
| `PLUGIN_ICON_NAMES.gem` | `contracts/src/plugin/ui.ts:134` | parsed | unknown | keep unless no guest can reach it; else keep it only if the parsed source still produces it; otherwise delete it and the 1 branch, check or key that name it |
| `PLUGIN_ICON_NAMES.download` | `contracts/src/plugin/ui.ts:137` | parsed | unknown | keep unless no guest can reach it; else keep it only if the parsed source still produces it; otherwise delete it and the 1 branch, check or key that name it |
| `PLUGIN_ICON_NAMES.eye` | `contracts/src/plugin/ui.ts:138` | parsed | unknown | keep unless no guest can reach it; else keep it only if the parsed source still produces it; otherwise delete it and the 1 branch, check or key that name it |
| `PLUGIN_ICON_NAMES.chartColumn` | `contracts/src/plugin/ui.ts:143` | parsed | unknown | keep unless no guest can reach it; else keep it only if the parsed source still produces it; otherwise delete it and the 1 branch, check or key that name it |
| `PLUGIN_ICON_NAMES.fileText` | `contracts/src/plugin/ui.ts:146` | parsed | unknown | keep unless no guest can reach it; else keep it only if the parsed source still produces it; otherwise delete it and the 1 branch, check or key that name it |
| `PLUGIN_ICON_NAMES.bookOpen` | `contracts/src/plugin/ui.ts:147` | parsed | unknown | keep unless no guest can reach it; else keep it only if the parsed source still produces it; otherwise delete it and the 1 branch, check or key that name it |
| `PLUGIN_ICON_NAMES.drama` | `contracts/src/plugin/ui.ts:150` | parsed | unknown | keep unless no guest can reach it; else keep it only if the parsed source still produces it; otherwise delete it and the 1 branch, check or key that name it |
| `PLUGIN_ICON_NAMES.swords` | `contracts/src/plugin/ui.ts:151` | parsed | unknown | keep unless no guest can reach it; else keep it only if the parsed source still produces it; otherwise delete it and the 1 branch, check or key that name it |
| `PLUGIN_ICON_NAMES.leaf` | `contracts/src/plugin/ui.ts:152` | parsed | unknown | keep unless no guest can reach it; else keep it only if the parsed source still produces it; otherwise delete it and the 1 branch, check or key that name it |
| `PLUGIN_ICON_NAMES.globe` | `contracts/src/plugin/ui.ts:153` | parsed | unknown | keep unless no guest can reach it; else keep it only if the parsed source still produces it; otherwise delete it and the 1 branch, check or key that name it |
| `PLUGIN_ICON_NAMES.compass` | `contracts/src/plugin/ui.ts:154` | parsed | unknown | keep unless no guest can reach it; else keep it only if the parsed source still produces it; otherwise delete it and the 1 branch, check or key that name it |
| `PLUGIN_ICON_NAMES.map` | `contracts/src/plugin/ui.ts:155` | parsed | unknown | keep unless no guest can reach it; else keep it only if the parsed source still produces it; otherwise delete it and the 1 branch, check or key that name it |
| `PLUGIN_ICON_NAMES.circleAlert` | `contracts/src/plugin/ui.ts:159` | parsed | unknown | keep unless no guest can reach it; else keep it only if the parsed source still produces it; otherwise delete it and the 1 branch, check or key that name it |
| `PLUGIN_ICON_NAMES.alertTriangle` | `contracts/src/plugin/ui.ts:160` | parsed | unknown | keep unless no guest can reach it; else keep it only if the parsed source still produces it; otherwise delete it and the 1 branch, check or key that name it |
| `PLUGIN_ICON_NAMES.externalLink` | `contracts/src/plugin/ui.ts:162` | parsed | unknown | keep unless no guest can reach it; else keep it only if the parsed source still produces it; otherwise delete it and the 1 branch, check or key that name it |
| `PLUGIN_ICON_NAMES.chevronRight` | `contracts/src/plugin/ui.ts:163` | parsed | unknown | keep unless no guest can reach it; else keep it only if the parsed source still produces it; otherwise delete it and the 1 branch, check or key that name it |
| `PLUGIN_ICON_NAMES.arrowLeft` | `contracts/src/plugin/ui.ts:164` | parsed | unknown | keep unless no guest can reach it; else keep it only if the parsed source still produces it; otherwise delete it and the 1 branch, check or key that name it |
| `PLUGIN_PAGE_STAGE_KINDS.browse` | `contracts/src/plugin/ui.ts:173` | parsed | unknown | keep unless no guest can reach it; else keep it only if the parsed source still produces it; otherwise delete it and the 1 branch, check or key that name it |
| `PLUGIN_SELECT_HOST_SOURCES.owned-lore-books` | `contracts/src/plugin/ui.ts:570` | parsed | unknown | keep unless no guest can reach it; else keep it only if the parsed source still produces it; otherwise delete it and the 1 branch, check or key that name it |

### Owner calls

Each row looks like a half-built feature. The owner decides whether to wire it or delete it.

| Member | At | Kind | Question |
| - | - | - | - |
| `WORKLOAD_RESUME_POLICIES.checkpointed` | `contracts/src/workloads/execution.ts:25` | unbuilt | no workload declares a checkpointed resume and no code resumes from a checkpoint: build checkpointed resume or delete the member |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired unions` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
