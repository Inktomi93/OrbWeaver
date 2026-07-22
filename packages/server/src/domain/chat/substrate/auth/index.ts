// domain/chat/substrate/auth — the chat authority substrate (the PURE half): the typed default-deny
// per-verb authority matrix, the pure decision core (the PD-1 swap point),
// and the D22 member-card visibility clamp. Zero I/O. The I/O enforcer that wires `loadMemberChat` to these
// deciders is the feature-root `guard.ts` (the membership chokepoint).

export {
  buildAgentCardView,
  clampMemberCard,
  resolveCardVisibility,
} from "./clamp";
export {
  assertAuthorOrHost,
  assertHost,
  assertParticipant,
  permitsHost,
} from "./decide";
export {
  authorityForSurface,
  CHAT_AUTHORITIES,
  CHAT_NONVERB_SURFACES,
  CHAT_SURFACE_AUTHORITY,
  CHAT_VERB_AUTHORITY,
  DENY,
} from "./matrix";
