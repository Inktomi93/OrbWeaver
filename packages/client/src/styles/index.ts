// The production CSS front door. Import order is load-bearing: shell structure first, then the client
// sheet whose first CSS import expands @orb/ui's Tailwind/theme/tiers stack before client-wide rules.
// Both the production boot and Playwright CT import this module, so the topology cannot drift by roster.
//
// THIS MODULE IS IMPORTED FOR ITS EFFECT ALONE (`main.tsx`, no bindings), and that once made it
// INVISIBLE TO THE PRODUCTION BUILD (#1752). `@orb/client` declared a `sideEffects` allowlist for the
// Aug-14 boot code-split; Rolldown applies the nearest package.json's `sideEffects` to the app's OWN
// files (vitejs/vite#22620), the array's `**/*.css` glob cannot match a `.ts`, and so this door was
// shaken away with BOTH stylesheets behind it — the built bundle carried zero `display:flex`, a planted
// `<div class="flex">` computed `display: block` on the served page, and every chat room hit the
// MessageList unbounded-window guard (packages/ui/src/lib/virtual-gap.ts). Five days, invisible to tsc,
// biome, every gate and every test. Owner ruling 2026-09-05: the allowlist is GONE
// (client-architecture-lockdown.md §7) — every module here is side-effectful by default and this door survives by
// construction. Do NOT reintroduce a `sideEffects` field in `packages/client/package.json`.
import "../features/app-shell/surfaces/shell.css";
import "./globals.css";
