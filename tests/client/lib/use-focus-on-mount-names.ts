// The names the arrival-focus stories and their spec share: the controls, the surface and the event that mounts a surface with no press.

export const OPEN_NAME = "Open the surface";
export const DISMISS_NAME = "Dismiss";
export const SURFACE_NAME = "Arrival surface";
/** A surface that mounts beside the boundary a read is pending in, for a reason that is no press's navigation. */
export const STRAY_NAME = "Stray surface";
export const PENDING_NAME = "Waiting for the surface";
/** Dispatched on `window` to mount the surface from outside any press, the way a store write or a viewport change would. */
export const ARRIVAL_EVENT = "arrival-probe";
