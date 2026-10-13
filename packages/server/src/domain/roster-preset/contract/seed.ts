import type { Principal } from "@orb/contracts/identity";
import type { CreateRosterPresetInput } from "@orb/contracts/roster-preset";
import type { CharacterHandle, CharacterId } from "@orb/kit/ids";

export interface SeedRosterInput extends Pick<CreateRosterPresetInput, "name" | "description" | "game"> {
  readonly characterIds: readonly CharacterId[];
}
export type SeedRosterPreset = (principal: Principal, roster: SeedRosterInput) => Promise<void>;

/** Raw authored roster inputs, bound once by the graph; the roster owner decides campaign and empty-seat semantics. */
export interface RosterSeedStepDeps extends Pick<SeedRosterInput, "name" | "description"> {
  readonly characterHandles: readonly CharacterHandle[];
  readonly startsGame: boolean;
  readonly findCharacter: (principal: Principal, handle: CharacterHandle) => Promise<CharacterId | null>;
  readonly createRosterPreset: SeedRosterPreset;
}
