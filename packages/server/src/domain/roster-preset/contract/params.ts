// Every roster-preset verb's *Params. The authored-input shape (`CreateRosterPresetInput`) is the
// cross-boundary wire and lives in `@orb/contracts/roster-preset` (one home — the router's zod schema
// and these params derive from the same type, never a re-spell). `update` takes the SAME input shape as
// `create` deliberately: a party is small enough that patch semantics would only buy drift (full
// replace, member list included).

import type { Principal } from "@orb/contracts/identity";
import type { CreateRosterPresetInput } from "@orb/contracts/roster-preset";
import type { ChatId, RosterPresetId } from "@orb/kit/ids";
import type { IanaTimeZone } from "@orb/kit/time";

/** The acting caller — every surface is ownership-scoped off `principal.userId`. */
interface RosterPresetActorParams {
  readonly principal: Principal;
}

export interface CreateRosterPresetParams extends RosterPresetActorParams {
  readonly input: CreateRosterPresetInput;
}

export interface UpdateRosterPresetParams extends RosterPresetActorParams {
  readonly presetId: RosterPresetId;
  /** Full replace — same authored fields as create, member list included. */
  readonly input: CreateRosterPresetInput;
}

export interface RemoveRosterPresetParams extends RosterPresetActorParams {
  readonly presetId: RosterPresetId;
}

export type ListRosterPresetsParams = RosterPresetActorParams;

export interface GetRosterPresetParams extends RosterPresetActorParams {
  readonly presetId: RosterPresetId;
}

export interface ApplyRosterPresetParams extends RosterPresetActorParams {
  readonly presetId: RosterPresetId;
  readonly chatId: ChatId;
  /** The applying host's zone: every cast rule this apply mints reads its clock in it. */
  readonly timeZone: IanaTimeZone;
}
