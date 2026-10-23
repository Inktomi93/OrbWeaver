/**
 * `@orb/ui/web-weave` — the brand web, live (D173; the "one emblem,
 * every scale" system): `<WebWeave>` (the canvas orb web — weaving | settled | partial | strand-out),
 * `<WeaveVeil>` (the boot/blocking veil owning the ST-style dissolve exit), and the PURE geometry —
 * `buildWeb` + the seeded jitter (the vitest-testable half, waystone pattern) and `webGlyph` (the
 * condensed mark the favicon, the client `WeaveGlyph`, and `WebSpinner`'s icon all derive from —
 * one geometry, every scale).
 */

export { WeaveVeil } from "./weave-veil.tsx";

export { WEB_GLYPH_DISPLAY, webGlyph } from "./web-glyph.ts";

export { WebWeave } from "./web-weave.tsx";

export type { BuildWebInput, WeavePoint, WeaveState } from "./web-weave-geometry.ts";
export { buildStrandOut, buildWeb } from "./web-weave-geometry.ts";
export { weaveJitter, wrapToPi } from "./web-weave-math.ts";
export type { WeavePhase } from "./web-weave-timeline.ts";
export { WEAVE_TIMELINE, weavePhaseAt } from "./web-weave-timeline.ts";
