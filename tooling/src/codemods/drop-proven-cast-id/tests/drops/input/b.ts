import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

export const member = castId<CharacterId>(row.id);
export const coalesced = castId<CharacterId>(left ?? right);
export const awaited = castId<CharacterId>((await start()).id);
