// The leaving-cover controls' shared names: the planted dialog holds its close until a test dispatches the release event.
// The story imports this file, so it stays free of imports.

/** The window event that lets the planted dialog's held close finish and unmount its layers. */
export const LEAVING_RELEASE_EVENT = "orb-ct-release-leaving-cover";

/** The planted alert dialog's backdrop, in any phase. */
export const PLANTED_BACKDROP = '[data-slot="alert-dialog-backdrop"]';

/** The planted alert dialog's backdrop while its close is held. */
export const LEAVING_BACKDROP = `${PLANTED_BACKDROP}[data-ending-style]`;

/**
 * The page timeout a held case sets, which the probe's leaving wait inherits: short enough to end the case, long enough for a loaded
 * box's reads before the wait.
 */
export const HELD_LEAVING_TIMEOUT_MS = 5000;
