import type { JoinerPersona } from "@orb/contracts/persona";
import { joinerPersonaSchema } from "@orb/contracts/persona";

/** The typed persona fields as the wire persona, trimmed; null while the name is empty or a field breaks its limit. */
export function joinerPersonaOf(name: string, description: string): JoinerPersona | null {
  const parsed = joinerPersonaSchema.safeParse({ name: name.trim(), description: description.trim() });
  return parsed.success ? parsed.data : null;
}
