// The first default card and the persona item the content seeder suites assert on.

import { SEED_MANIFEST } from "@orb/default-content";

const firstCard = SEED_MANIFEST.find((item) => item.kind === "character");
if (firstCard?.kind !== "character") {
  throw new Error("the canonical seed manifest has no character");
}
const personaItem = SEED_MANIFEST.find((item) => item.kind === "persona");
if (personaItem === undefined) {
  throw new Error("the canonical seed manifest has no persona");
}
export const FIRST_CARD = firstCard;
export const PERSONA_ITEM = personaItem;
