// domain/buddy/substrate/soul — soul generation at hatch (the agent's IDENTITY, model-authored once).
// A vLLM `summarize` call with `jsonSchema` guided decoding (free, local) seeded by the bones so the
// soul matches the body, with a canned fallback when the engine is down (buddy.md "Esoteric"). Pure-ish:
// it calls the INJECTED `roleClients.summarize` op (no direct provider import).

import type { CompanionBones, Species } from "@orb/contracts/buddy";
import { STAT_NAMES } from "@orb/contracts/buddy";
import type { RoleClients } from "@orb/contracts/role-clients";

// The model-authored identity. Module-local (not exported — `no-inline-types`); callers infer it.
interface Soul {
  readonly name: string;
  readonly personality: string;
}

const NAME_MAX = 48;
const PERSONALITY_MAX = 400;
const SOUL_MAX_TOKENS = 220;
const SOUL_TEMPERATURE = 0.9;

// vLLM guided-decoding schema — forces a clean {name, personality}.
const SOUL_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    personality: { type: "string" },
  },
  required: ["name", "personality"],
} as const;

const SOUL_SYSTEM =
  "You invent the soul of a tiny ASCII companion that lives on the corner of a roleplay/worldbuilding " +
  "app's screen. Given its body (species, rarity, eyes, hat) and disposition stats, give it a short " +
  "memorable name (one or two words) and a 1-2 sentence personality that matches its look and its " +
  "highest/lowest stats. Warm, a little odd, never corporate.";

const CANNED_NAMES: Record<Species, string> = {
  mote: "Mote",
  scribe: "Quill",
  ember: "Cinder",
  loom: "Thread",
  pixel: "Bit",
  wisp: "Puff",
};

function cannedSoul(bones: CompanionBones): Soul {
  const top = STAT_NAMES.reduce((a, b) => (bones.stats[b] > bones.stats[a] ? b : a), STAT_NAMES[0]);
  return {
    name: CANNED_NAMES[bones.species],
    personality: `A ${bones.rarity} ${bones.species} with a soft spot for ${top.toLowerCase()}. Keeps you company while you work.`,
  };
}

function parseSoul(raw: string): Soul | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  const rawName = obj["name"];
  const rawPersonality = obj["personality"];
  if (typeof rawName !== "string" || typeof rawPersonality !== "string") {
    return null;
  }
  const name = rawName.trim().slice(0, NAME_MAX);
  const personality = rawPersonality.trim().slice(0, PERSONALITY_MAX);
  if (name === "" || personality === "") {
    return null;
  }
  return { name, personality };
}

/** Author the soul: the injected vLLM `summarize` with guided decoding, seeded by the bones + the
 *  per-roll inspiration seed; canned fallback on engine-down / parse failure. */
export async function generateSoul(
  roleClients: RoleClients,
  bones: CompanionBones,
  inspirationSeed: number,
): Promise<Soul> {
  const statLine = STAT_NAMES.map((s) => `${s} ${bones.stats[s]}`).join(", ");
  const userPrompt =
    `Species: ${bones.species}. Rarity: ${bones.rarity}. Eyes: ${bones.eye}. Hat: ${bones.hat}.` +
    `${bones.shiny ? " It is shiny." : ""} Stats - ${statLine}. Seed: ${inspirationSeed}.`;
  try {
    const res = await roleClients.summarize([{ systemPrompt: SOUL_SYSTEM, userPrompt }], {
      jsonSchema: SOUL_SCHEMA,
      maxTokens: SOUL_MAX_TOKENS,
      temperature: SOUL_TEMPERATURE,
    });
    const soul = parseSoul(res.items[0]?.text ?? "");
    if (soul) {
      return soul;
    }
  } catch {
    // engine down / parse failure → canned fallback below
  }
  return cannedSoul(bones);
}
