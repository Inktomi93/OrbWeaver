// domain/share — COMPOSITION ROOT. Wires the verbs over the context built from the injected deps. ZERO logic.

import { createCertificateTransitions } from "./certificate/transitions.ts";
import { createShareContext } from "./context.ts";
import type { OwnedShareService, ShareServiceDeps } from "./contract/service.ts";
import { createBootShare } from "./verbs/boot-share.ts";
import { createDisableIpCertificate } from "./verbs/disable-ip-certificate.ts";
import { createEnableIpCertificate } from "./verbs/enable-ip-certificate.ts";
import { createResumeIpCertificate } from "./verbs/resume-ip-certificate.ts";
import { createSignInMode } from "./verbs/sign-in-mode.ts";
import { createStart } from "./verbs/start.ts";
import { createStatus } from "./verbs/status.ts";
import { createStop } from "./verbs/stop.ts";

export function createShareService(deps: ShareServiceDeps): OwnedShareService {
  // biome-ignore lint/nursery/useDisposables: the returned service transfers this exact transition owner to its production graph.
  const transitions = createCertificateTransitions();
  const ctx = createShareContext(deps, transitions.run);
  return {
    start: createStart(ctx),
    stop: createStop(ctx),
    status: createStatus(ctx),
    ...createBootShare(ctx),
    enableIpCertificate: createEnableIpCertificate(ctx),
    disableIpCertificate: createDisableIpCertificate(ctx),
    resumeIpCertificate: createResumeIpCertificate(ctx),
    signInMode: createSignInMode(ctx),
    [Symbol.asyncDispose]: () => transitions[Symbol.asyncDispose](),
  };
}
