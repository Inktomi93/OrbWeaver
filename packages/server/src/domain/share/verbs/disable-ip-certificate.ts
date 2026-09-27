// verb: disableIpCertificate — the owner turns https at the public IP address off (D269). The stored choice clears
// first, so a crash mid-way never brings the certificate back at the next boot; then https closes and its files go.

import type { ShareParams } from "../contract/params.ts";
import type { ShareContext, ShareService } from "../contract/service.ts";

export function createDisableIpCertificate(
  ctx: Pick<ShareContext, "requireOwner" | "saveCertificateSetting" | "certificate" | "relay" | "statusFor" | "audit" | "now">,
): ShareService["disableIpCertificate"] {
  return async ({ principal }: ShareParams) => {
    ctx.requireOwner(principal);
    await ctx.saveCertificateSetting(principal, null);
    await ctx.certificate.disable();
    await ctx.audit({ actorUserId: principal.userId, action: "share.disableIpCertificate", entityType: "server" }, ctx.now());
    return ctx.statusFor(principal, ctx.relay.status());
  };
}
