// Pure authority decisions and per-member visibility clamps.
// The domain guard combines these decisions with membership I/O and the resolved history floor.

export {
  clampMemberCard,
  historyFloorFollowsJoin,
  isBelowHistoryFloor,
  resolveCardVisibility,
  resolveHistoryFloorSeq,
} from "./clamp.ts";
export {
  assertAuthorOrHost,
  assertHost,
  assertParticipant,
  permitsHost,
} from "./decide.ts";
