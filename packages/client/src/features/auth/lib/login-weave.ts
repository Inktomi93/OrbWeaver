// The per-mode WEB-STATE map behind the login card (docs/design/login-loading-screen.md §3/§9.5) —
// pure (config + search in, weave spec out) so the backdrop and the surface can never disagree on
// which arm the user is in, and the mapping is unit-assertable without a browser. Notable arms:
//   · local first-run (B4) → the deliberately HALF-WOVEN web (radii done, no capture spiral —
//     "your server isn't fully spun").
//   · oidc auto-redirect (A9) → the strand-out beat (the spider rides a new silk line off-screen —
//     "handing you off along the silk").
//   · forward-header / unreachable → settled, dimmest (explainer surfaces; the web recedes).
// Deviation from the design table (§9.5): `config pending`/absent renders SETTLED, not weaving —
// the boot veil still covers that window, and a rebuild would replay a beat the user already
// watched (motion guide §3.8).

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

/** The per-arm weave spec — mirrors `LoginBody`'s arm dispatch, decoration-side. */
export function resolveLoginWeave(config: AuthConfig | undefined, search: string): LoginWeaveSpec {
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
  return { state: "settled", dim: DIM_DEFAULT };
}
