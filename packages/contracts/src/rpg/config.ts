// @orb/contracts/rpg/config — the `rpg_games.config` JSON blob (rpg-design/05 §4.1). Holds the
// `statProfile` (§2.3 — no separate profile table until a cross-game library exists) + the lite dials.
// Full's dials (`genres`/`tones`/`setting`/`difficulty`/`rating`/`language`/`playerGoals`/`gm`/
// `houseRules`/`imagery`/`assist`) graft as ADDITIVE defaulted fields — a JSON-column additive lift
// self-heals at the parse seam (no version stamp needed, unlike `user_settings`: rpg tables carry no
// versioned-config columns, so the schema_version DEFAULT question is moot).

import { z } from "zod";
import { RPG_PROFILE_FREEFORM, rpgStatProfileSchema } from "./profile";

/** The steering-note cap — a short always-wins user slot (the reminder tail, §4.7). */
export const RPG_STEERING_NOTE_MAX = 500;

/** The `rpg_games.config` blob. `lite.steeringNote` is the always-wins user tuning slot (§4.11 #2 — a
 *  real shipped knob). `statProfile` defaults to `freeform` (lite's create default). */
export const rpgGameConfigSchema = z.object({
  statProfile: rpgStatProfileSchema.default(RPG_PROFILE_FREEFORM),
  lite: z
    .object({
      steeringNote: z.string().max(RPG_STEERING_NOTE_MAX).default(""),
    })
    .default({ steeringNote: "" }),
});
export type RpgGameConfig = z.infer<typeof rpgGameConfigSchema>;
