/**
 * `@orb/ui/web-weave` — the brand web, live (D173; the "one emblem,
 * every scale" system): `<WebWeave>` (the canvas orb web — weaving | settled | partial | strand-out),
 * `<WeaveVeil>` (the boot/blocking veil owning the ST-style dissolve exit), and the PURE geometry —
 * `buildWeb` + the seeded jitter (the vitest-testable half, waystone pattern) and `webGlyph` (the
 * condensed mark the favicon, the client `WeaveGlyph`, and `WebSpinner`'s icon all derive from —
 * one geometry, every scale).
 */

export type { WeaveVeilProps } from "./weave-veil.tsx";
export { WeaveVeil } from "./weave-veil.tsx";
export type { WebGlyphGeometry, WebGlyphInput, WebGlyphSpoke } from "./web-glyph.ts";
export { WEB_GLYPH_COMPACT, WEB_GLYPH_DISPLAY, webGlyph } from "./web-glyph.ts";
export type { WebWeaveProps } from "./web-weave.tsx";
export { WebWeave } from "./web-weave.tsx";
export type { WeaveCharacter } from "./web-weave-character.ts";
export { WEAVE_CHARACTERS } from "./web-weave-character.ts";
export type { BuildWebInput, SpiderLeg, WeaveDewDrop, WeavePoint, WeaveState, WeaveStrand, WovenWeb } from "./web-weave-geometry.ts";
export { AUX_TURNS, buildStrandOut, buildWeb, CAPTURE_TURNS, RADIUS_COUNT, WEAVE_STATES } from "./web-weave-geometry.ts";
export { sagLine, weaveJitter } from "./web-weave-math.ts";
export type { WeavePhase } from "./web-weave-timeline.ts";
export { WEAVE_TIMELINE, weavePhaseAt } from "./web-weave-timeline.ts";
