import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

export const proven = castId<CharacterId>(row.id);
export const unproven = castId<CharacterId>(raw);
