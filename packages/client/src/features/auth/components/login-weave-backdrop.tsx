// The login backdrop — the settled brand web behind the card (docs/design/login-loading-screen.md
// §3/§9.5). Pure decoration: the mode→web mapping lives in ../lib/login-weave.ts (shared inputs
// with the surface's arm dispatch, so the two can never disagree); this component just reads the
// config through the query layer and mounts the weave full-bleed under the content.

import { WebWeave } from "@orb/ui/web-weave";
import type { ReactElement } from "react";
import { useAuthConfig } from "#data";
import { resolveLoginWeave } from "../lib/login-weave.ts";

/** The login web hangs its hub above the card (the free zone + resting spider peek over it). */
const LOGIN_HUB = { x: 0.5, y: 0.34 } as const;

/** The full-bleed per-mode web behind the login card. Decoration only — mounts under the content
 *  (CT locator: the primitive's own `data-slot="web-weave"`). */
export function LoginWeaveBackdrop(): ReactElement {
  const config = useAuthConfig();
  const spec = resolveLoginWeave(config.data, globalThis.location.search);
  return <WebWeave state={spec.state} dim={spec.dim} hub={LOGIN_HUB} className="absolute inset-0" />;
}
