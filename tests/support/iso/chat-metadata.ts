import type { GroupConfig, GroupConfigInput, RoomOverrides } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG, DEFAULT_ROOM_OVERRIDES, groupConfigSchema, roomOverridesSchema } from "@orb/contracts/chat";

/** Defaulted room knobs and narrator normalization remain owned by the production schema. */
export function makeGroupConfig(input: GroupConfigInput = DEFAULT_GROUP_CONFIG): GroupConfig {
  return groupConfigSchema.parse(input);
}

/** Absent room section overrides retain the production inherit posture. */
export function makeRoomOverrides(overrides: Partial<RoomOverrides> = {}): RoomOverrides {
  return roomOverridesSchema.parse({ ...DEFAULT_ROOM_OVERRIDES, ...overrides });
}
