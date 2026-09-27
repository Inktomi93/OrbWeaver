// domain/share — DI bundle. The `ShareContext` type is homed in `contract/service.ts`; this builder adds the precondition
// checks every start path runs over the injected facts, and the one status every verb answers.

import type { ShareContext, ShareServiceDeps } from "./contract/service.ts";
import { certificateRefusal } from "./substrate/certificate-refusal.ts";
import { shareRefusal } from "./substrate/refusal.ts";

export function createShareContext(deps: ShareServiceDeps): ShareContext {
  return {
    ...deps,
    refusal: () => shareRefusal(deps),
    certificateRefusal: (setting) => certificateRefusal(deps, setting),
    statusFor: (principal, relay) => ({
      relay,
      liveSocketCount: deps.liveSocketCount() - deps.liveSocketCount(principal.userId),
      publicAddresses: [...deps.publicAddresses],
      certificate: deps.certificate.status(),
    }),
  };
}
