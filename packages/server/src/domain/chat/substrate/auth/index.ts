// Pure authority decisions and per-member visibility clamps.
// The domain guard combines these decisions with membership I/O and the resolved history floor.

export { NO_HISTORY_FLOOR } from "@orb/contracts/chat";
export {
  clampMemberCard,
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
