// The production CSS front door. The client sheet loads first because its first import, @orb/ui's entry, declares
// the cascade layer order; a layer ranks by its first appearance, so a sheet that opened a house layer before that
// statement would rank it lowest (client-architecture-lockdown.md §4.5). Production and Playwright CT both import
// this module, so the topology cannot drift by roster.
//
// THIS MODULE IS IMPORTED FOR ITS EFFECT ALONE (`main.tsx`, no bindings). A `sideEffects` allowlist in
// `packages/client/package.json` would let the bundler drop it with both stylesheets behind it, invisible to every
// static check (client-architecture-lockdown.md §7). Do not reintroduce one.
import "./globals.css";
import "../features/app-shell/surfaces/shell.css";
