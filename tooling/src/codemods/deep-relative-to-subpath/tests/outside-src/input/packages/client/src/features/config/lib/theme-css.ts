// A package-root file outside src keeps its relative spelling: no subpath import maps it.
import { OWNER_CSS_SURFACE } from "../../../../owner-css-surface.ts";
import { BROWSER_TARGETS } from "../../../../browser-targets.ts";

export const surface = [OWNER_CSS_SURFACE, BROWSER_TARGETS];
