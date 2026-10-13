// Only the seeder's own marker identifies its artifact; unrelated or merely same-named personas do not.

import type { DefaultPersonaSeederDeps } from "../contract/default-seed.ts";
import type { PersonaService } from "../contract/service.ts";

export function createFindSeededDefault(list: PersonaService["list"]): DefaultPersonaSeederDeps["findSeededDefault"] {
  return async (principal) => (await list({ principal })).find((row) => row.metadata?.seededDefault === true)?.id ?? null;
}
