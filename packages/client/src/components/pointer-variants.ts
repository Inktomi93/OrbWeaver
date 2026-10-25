// Axis-3 pointer/hover CAPABILITY class fragments (UI-Architecture §4b) — the SHELL/SHARED-layer home for
// `pointer-coarse:`/`pointer-fine:` utility variants. Those variants are BANNED in features/** by
// the `POINTER_CLASSES` pattern in `eslint.config.ts`, exactly as viewport width variants are by `VIEWPORT_CLASSES`:
// pointer/hover are a device CAPABILITY a container query cannot see, so a feature COMPOSES a named fragment
// from here (or a pointer-conditional TOKEN like `min-w-(--size-touch-target)`) instead of spelling the media variant
// inline. Behaviour is homed here so a coarse touch-floor or a fine-only reveal is retunable in ONE place.
// Each value below is the EXACT class it replaced in a feature — the relocation is byte-for-byte
// behaviour-preserving, and the coarse touch-floors it carries are CT-pinned (paths noted per fragment).

/** Drop an element entirely at a coarse pointer (`display:none`) — chrome a phone-width row cannot afford. A
 *  DEVICE-class swap (never hover-keyed), so it cannot oscillate the way a hover `display` swap does. A feature
 *  takes the same swap through a primitive's `hiddenAt` prop. Live: the config setting row's action cluster. */
export const HIDE_AT_COARSE = "pointer-coarse:hidden";
