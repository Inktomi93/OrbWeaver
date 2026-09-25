// domain/share/contract/params — the verbs' params. Every transport verb takes only its caller: the owner gate is the
// whole authorization, and no verb reads or writes a row.

import type { Principal } from "@orb/contracts/identity";

export interface ShareParams {
  readonly principal: Principal;
}
