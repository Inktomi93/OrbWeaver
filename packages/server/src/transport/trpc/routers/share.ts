// transport/trpc/routers/share — the owner's Share card surface (docs/law/Tier-4-Transport.md). Every procedure is
// `adminProcedure` (layer 1, owner ∪ admin); each verb re-checks `requireOwner` (layer 2) except `signInMode`, which
// Multi-user shows an admin too and re-checks `requireAdmin`. The strict output parsers keep anything else off the wire.

import { ipCertificateSettingSchema, shareStatusSchema, signInModeViewSchema } from "@orb/contracts/identity";
import { adminProcedure, t } from "../trpc.ts";

export const shareRouter = t.router({
  start: adminProcedure.output(shareStatusSchema).mutation(({ ctx }) => ctx.services.share.start({ principal: ctx.auth })),
  stop: adminProcedure.output(shareStatusSchema).mutation(({ ctx }) => ctx.services.share.stop({ principal: ctx.auth })),
  status: adminProcedure.output(shareStatusSchema).query(({ ctx }) => ctx.services.share.status({ principal: ctx.auth })),
  enableIpCertificate: adminProcedure
    .input(ipCertificateSettingSchema)
    .output(shareStatusSchema)
    .mutation(({ ctx, input }) => ctx.services.share.enableIpCertificate({ principal: ctx.auth, setting: input })),
  disableIpCertificate: adminProcedure.output(shareStatusSchema).mutation(({ ctx }) => ctx.services.share.disableIpCertificate({ principal: ctx.auth })),
  signInMode: adminProcedure.output(signInModeViewSchema).query(({ ctx }) => ctx.services.share.signInMode({ principal: ctx.auth })),
});
