import type { Principal } from "@orb/contracts/identity";
import type { ResolveCurrentPersonaOp, ResolveDefaultPersonaOp } from "@orb/contracts/persona";
import type { LoadUserSettings } from "@orb/contracts/settings";
import type { UserId } from "@orb/kit/ids";
import type { PersonaService } from "./service.ts";

export interface PersonaSeedPointerDeps {
  readonly loadUserSettings: LoadUserSettings;
  readonly get: PersonaService["get"];
  readonly principalForUser: (userId: UserId) => Principal;
}
export interface PersonaSeedPointers {
  readonly resolveDefaultPersona: ResolveDefaultPersonaOp;
  readonly resolveCurrentPersona: ResolveCurrentPersonaOp;
}
