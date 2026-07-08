// persona/ front door (UI-Arch §2.1) — the ONLY entry into the persona slice (dep-cruiser
// client-feature-front-door). ONE route-composed surface: the rail-foot account + persona panel,
// injected into the app-shell rail-foot slot (home-page.tsx). A prop-free @container consumer; no
// feature imports this slice's internals, and this slice imports no other feature (cross-domain reads
// ride trpc.*).

export { PersonaPanelSurface } from "./surfaces/persona-panel-surface";
