// domain/chat/substrate/auth — the chat authority substrate (the PURE half): the typed default-deny
// per-verb authority matrix, the pure decision core (the swap point),
// and the per-member visibility clamps (D22 member-card fields + the D16 `joinHistoryVisibility` canon
// floor). Zero I/O. The I/O enforcer that wires `loadMemberChat` to these deciders — and that stamps the
// resolved history floor onto every gated membership — is the feature-root `guard.ts` (the chokepoint).

export {
  clampMemberCard,
  isBelowHistoryFloor,
  NO_HISTORY_FLOOR,
  resolveCardVisibility,
  resolveHistoryFloorSeq,
} from "./clamp.ts";
export {
  assertAuthorOrHost,
  assertHost,
  assertParticipant,
  permitsHost,
} from "./decide.ts";
export { CHAT_VERB_AUTHORITY } from "./matrix.ts";
