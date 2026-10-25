// The page's one script: its static graph is the polyfill entry alone, and the app graph (main.tsx) loads only after the polyfills are in.
// Keep every other import out of this file; a module imported here would evaluate before the awaited Temporal install finishes.
import "./lib/platform-polyfills.ts";

await import("./main.tsx");
