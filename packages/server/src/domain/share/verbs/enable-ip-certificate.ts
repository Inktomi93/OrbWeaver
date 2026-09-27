// verb: enableIpCertificate — the owner asks for https at this server's public IP address (D269). The preconditions run
// first and refuse with a coded error naming the fix; only then is the choice stored and the certificate ordered.

import { DomainOperationError } from "@orb/kit/errors";
import type { EnableIpCertificateParams } from "../contract/params.ts";
import type { ShareContext, ShareService } from "../contract/service.ts";

export function createEnableIpCertificate(
  ctx: Pick<ShareContext, "requireOwner" | "certificateRefusal" | "saveCertificateSetting" | "certificate" | "relay" | "statusFor" | "audit" | "now">,
): ShareService["enableIpCertificate"] {
  return async ({ principal, setting }: EnableIpCertificateParams) => {
    ctx.requireOwner(principal);
    const checked = await ctx.certificateRefusal(setting);
    if (checked.refusal !== null) {
      throw new DomainOperationError(checked.refusal.code, checked.refusal.message);
    }
    await ctx.saveCertificateSetting(principal, checked.setting);
    const certificate = await ctx.certificate.enable(checked.setting);
    await ctx.audit(
      {
        actorUserId: principal.userId,
        action: "share.enableIpCertificate",
        entityType: "server",
        metadata: {
          address: checked.setting.address,
          httpsPort: checked.setting.httpsPort,
          challengePort: checked.setting.challengePort,
          state: certificate.state,
        },
      },
      ctx.now(),
    );
    return ctx.statusFor(principal, ctx.relay.status());
  };
}
