// home/ front door (UI-Arch §2.1) — the ONLY entry into the home slice (dep-cruiser
// client-feature-front-door). Home owns its SECTION (the factory the door calls with the `home-tiles`
// registry). Every tile is exported by the feature that owns its data + intent; home imports none of them.

export { makeHomeSection } from "./lib/home-section.tsx";

export {} from "./lib/order-home-tiles.ts";

export {} from "./surfaces/home-surface.tsx";
