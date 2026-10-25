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

/** Hide an opacity/pointer-events reveal cluster at rest ONLY where the primary input can hover. Where it cannot
 *  (a phone, or a stylus-driven tablet with a fine pointer) the cluster simply stays revealed, since no hover
 *  exists to reveal it. Keyed on hover capability, not on pointer size: a fine pointer without hover would
 *  otherwise leave it hidden forever. Composed with the `group-hover`/`group-focus-within` reveals, which win by
 *  specificity. Live: the message-actions reveal resolver. */
export const HIDDEN_UNTIL_HOVER = "hover-capable:opacity-0 hover-capable:pointer-events-none";
