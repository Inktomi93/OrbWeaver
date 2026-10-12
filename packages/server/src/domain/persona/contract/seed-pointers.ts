import type { Principal } from "@orb/contracts/identity";
import type { UserSettings } from "@orb/contracts/settings";
import type { UserId } from "@orb/kit/ids";
import type { ChatContext } from "#domain/chat";
import type { PersonaService } from "./service.ts";
export interface PersonaSeedPointerDeps {
  readonly loadUserSettings: (userId: UserId) => Promise<UserSettings>;
  readonly get: PersonaService["get"];
  readonly principalForUser: (userId: UserId) => Principal;
}
export type PersonaSeedPointers = Pick<ChatContext, "resolveDefaultPersona" | "resolveCurrentPersona">;
