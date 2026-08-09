// The per-mode WEB-STATE map behind the login card (docs/design/login-loading-screen.md §3/§9.5) —
// pure (config + search in, weave spec out) so the backdrop and the surface can never disagree on
// which arm the user is in, and the mapping is unit-assertable without a browser. Notable arms:
//   · local first-run (B4) → the deliberately HALF-WOVEN web (radii done, no capture spiral —
//     "your server isn't fully spun").
//   · oidc auto-redirect (A9) → the strand-out beat (the spider rides a new silk line off-screen —
//     "handing you off along the silk").
//   · forward-header / unreachable → settled, dimmest (explainer surfaces; the web recedes).
//   · normal sign-in card on a FRESH DOCUMENT LOAD (deep-link / cold open / reload) → WEAVING: the
//     deep-linker watches the web build. The boot veil's 1s min-floor dissolves long before the ~7.6s
//     weave settles, so the reveal catches the web mid-build — one continuous weave, not a double-play
//     (owner ruling 2026-08-09). On IN-SPA arrival (a logout/expiry bounce, not a fresh load) it stays
//     SETTLED — a rebuild there would replay a beat with no veil to justify it (motion guide §3.8).
// Deviation from the design table (§9.5): `config pending`/absent renders SETTLED, not weaving —
// the boot veil still covers that window.

import type { WeaveState } from "@orb/ui/web-weave";
import type { AuthConfig } from "#data";
import { shouldAutoRedirectToSso } from "./sso-redirect.ts";

export interface LoginWeaveSpec {
  readonly state: WeaveState;
  readonly dim: number;
}

// Dim steps (mock-tuned): the card is the subject; the web is ambience.
const DIM_DEFAULT = 0.6;
const DIM_FIRST_RUN = 0.62;
const DIM_EXPLAINER = 0.45;
const DIM_UNREACHABLE = 0.5;

/** The per-arm weave spec — mirrors `LoginBody`'s arm dispatch, decoration-side. `freshLoad` is the
 *  backdrop's `isFreshDocumentLoad()` reading (kept a PARAM so this stays pure + unit-assertable). */
export function resolveLoginWeave(config: AuthConfig | undefined, search: string, freshLoad: boolean): LoginWeaveSpec {
  if (config === undefined) {
    return { state: "settled", dim: DIM_UNREACHABLE };
  }
  if (config.mode === "local" && config.localFirstRun) {
    return { state: "partial", dim: DIM_FIRST_RUN };
  }
  if (shouldAutoRedirectToSso(config.mode, search)) {
    return { state: "strand-out", dim: DIM_DEFAULT };
  }
  if (config.mode === "forward-header") {
    return { state: "settled", dim: DIM_EXPLAINER };
  }
  // The normal sign-in card (oidc manual / local credential): weave the web in on a fresh document load
  // so a deep-linker watches it build; settled on an in-SPA arrival (no fresh load, no veil to justify a replay).
  return { state: freshLoad ? "weaving" : "settled", dim: DIM_DEFAULT };
}
