// domain/share — COMPOSITION ROOT. Wires the verbs over the context built from the injected deps. ZERO logic.

import { createShareContext } from "./context.ts";
import type { ShareService, ShareServiceDeps } from "./contract/service.ts";
import { createBootShare } from "./verbs/boot-share.ts";
import { createStart } from "./verbs/start.ts";
import { createStatus } from "./verbs/status.ts";
import { createStop } from "./verbs/stop.ts";

export function createShareService(deps: ShareServiceDeps): ShareService {
  const ctx = createShareContext(deps);
  return {
    start: createStart(ctx),
    stop: createStop(ctx),
    status: createStatus(ctx),
    ...createBootShare(ctx),
  };
}
