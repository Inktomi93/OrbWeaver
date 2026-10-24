/**
 * `@orb/ui/web-weave` — the brand web, live (D173; the "one emblem,
 * every scale" system): `<WebWeave>` (the canvas orb web — weaving | settled | partial | strand-out),
 * `<WeaveVeil>` (the boot/blocking veil owning the ST-style dissolve exit), and the glyph display box.
 * The pure geometry, jitter and timeline stay in their own modules, where the components and their
 * unit suites read them; `webGlyph` there is the one mark the favicon, the client `WeaveGlyph` and
 * `WebSpinner`'s icon all derive from.
 */

export { WeaveVeil } from "./weave-veil.tsx";

export { WEB_GLYPH_DISPLAY } from "./web-glyph.ts";

export { WebWeave } from "./web-weave.tsx";

export type { WeaveState } from "./web-weave-geometry.ts";
export type { WeavePhase } from "./web-weave-timeline.ts";
