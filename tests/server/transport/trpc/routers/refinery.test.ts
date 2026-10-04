// refinery.decideRewrite — the wire bounds the Keep/Discard sheet, so an oversized one is a BAD_REQUEST at the
// transport and never reaches the verb (whose own parse would surface as an unmapped 500).

import type { UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { RefineryService } from "@orb/server/domain/refinery";
import { vi } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, makeContext, principal } from "../_support.ts";

const ACTOR = castId<UserId>("user_actor");
/** One more decision than a rewrite payload can have entries. */
const OVERSIZED_SHEET = 109;

test("an oversized decision sheet is refused at the wire with BAD_REQUEST, before the verb runs", async () => {
  const decideRewrite = vi.fn<RefineryService["decideRewrite"]>();
  const ctx = makeContext({ auth: principal("user", { userId: ACTOR }), services: { refinery: { decideRewrite } } });

  const call = caller(ctx).refinery.decideRewrite({
    sessionId: mintTypeId(ID_PREFIX.refinerySession),
    rewriteRunId: mintTypeId(ID_PREFIX.refineryRun),
    decisions: Array.from({ length: OVERSIZED_SHEET }, () => true),
  });

  await expect(call).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(decideRewrite).not.toHaveBeenCalled();
});
