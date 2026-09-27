// verb: resumeIpCertificate — the boot start of the owner's stored IP certificate choice (D269), after the listener
// binds. It has no caller, and it runs the same preconditions as the owner's enable: the sign-in mode and the bind are
// env, and either may have changed since the choice was stored.

import type { CertificateBootOutcome, ShareContext, ShareService } from "../contract/service.ts";

export function createResumeIpCertificate(
  ctx: Pick<ShareContext, "certificateSetting" | "certificateRefusal" | "certificate">,
): ShareService["resumeIpCertificate"] {
  return async (): Promise<CertificateBootOutcome> => {
    const setting = ctx.certificateSetting();
    if (setting === null) {
      return { kind: "not_configured" };
    }
    const checked = await ctx.certificateRefusal(setting);
    if (checked.refusal !== null) {
      return { kind: "refused", refusal: checked.refusal };
    }
    return { kind: "started", certificate: await ctx.certificate.enable(checked.setting) };
  };
}
