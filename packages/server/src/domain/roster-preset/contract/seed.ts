import type { Principal } from "@orb/contracts/identity";
import type { CreateRosterPresetInput } from "@orb/contracts/roster-preset";
import type { CharacterId } from "@orb/kit/ids";

export interface SeedRosterInput extends Pick<CreateRosterPresetInput, "name" | "description" | "game"> {
  readonly characterIds: readonly CharacterId[];
}
export type SeedRosterPreset = (principal: Principal, roster: SeedRosterInput) => Promise<void>;
