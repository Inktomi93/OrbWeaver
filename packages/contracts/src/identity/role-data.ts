// Captured role data is opaque to consumers; only the authority and data-projection owners decode it.
declare const userRoleState: unique symbol;
declare const participantRoleState: unique symbol;

/** The row's global role, not a cached authorization decision or a wire value. */
export interface UserRoleState {
  readonly [userRoleState]: true;
}

/** One loaded seat's role; membership presence and its chat/viewer binding remain the loader's responsibility. */
export interface ParticipantRoleState {
  readonly [participantRoleState]: true;
}
