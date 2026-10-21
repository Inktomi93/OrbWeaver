import { createCharacterSchema } from "@orb/contracts/character";

export const TAIL_ROSTER = [
  createCharacterSchema.parse({ handle: "aria", name: "Aria", description: "An observant keeper." }),
  createCharacterSchema.parse({ handle: "bryn", name: "Bryn", description: "A patient traveller." }),
  createCharacterSchema.parse({ handle: "cara", name: "Cara", description: "An inquisitive ranger." }),
];
