// Axis-3 pointer/hover CAPABILITY class fragments (UI-Architecture §4b) — the SHELL/SHARED-layer home for
// `pointer-coarse:`/`pointer-fine:` utility variants. Those variants are BANNED in features/** by
// `no-pointer-variants-in-features`, exactly as viewport width variants are by `no-media-queries-in-features`:
// pointer/hover are a device CAPABILITY a container query cannot see, so a feature COMPOSES a named fragment
// from here (or a pointer-conditional TOKEN like `min-w-(--size-touch-target)`) instead of spelling the media variant
// inline. Behaviour is homed here so a coarse touch-floor or a fine-only reveal is retunable in ONE place.
// Each value below is the EXACT class it replaced in a feature — the relocation is byte-for-byte
// behaviour-preserving, and the coarse touch-floors it carries are CT-pinned (paths noted per fragment).

/** Drop an element entirely at a coarse pointer (`display:none`) — chrome a phone-width row cannot afford. A
 *  DEVICE-class swap (never hover-keyed), so it cannot oscillate the way a hover `display` swap does. A feature
 *  takes the same swap through a primitive's `hiddenAt` prop. Live: the config setting row's action cluster. */
export const HIDE_AT_COARSE = "pointer-coarse:hidden";

/** Reveal an opacity/pointer-events reveal cluster PERMANENTLY at a coarse pointer (there is no hover to
 *  reveal it there). Composed onto a hover/`:focus-within` reveal base so the cluster is always interactive on
 *  touch. Live: the message-actions reveal resolver. */
export const REVEAL_AT_COARSE = "pointer-coarse:opacity-100 pointer-coarse:pointer-events-auto";
