// transport/trpc/routers/share — the owner's Share card surface (docs/law/Tier-4-Transport.md). Every procedure is
// `adminProcedure` (layer 1, owner ∪ admin) and the verb re-checks `requireOwner` (layer 2), so an admin gets the same
// codeless FORBIDDEN a user gets. The strict output parser keeps anything beyond the status shape off the wire.

import { shareStatusSchema } from "@orb/contracts/identity";
import { adminProcedure, t } from "../trpc.ts";

export const shareRouter = t.router({
  start: adminProcedure.output(shareStatusSchema).mutation(({ ctx }) => ctx.services.share.start({ principal: ctx.auth })),
  stop: adminProcedure.output(shareStatusSchema).mutation(({ ctx }) => ctx.services.share.stop({ principal: ctx.auth })),
  status: adminProcedure.output(shareStatusSchema).query(({ ctx }) => ctx.services.share.status({ principal: ctx.auth })),
});
