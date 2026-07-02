import type { AgentSourceKind } from "@orb/contracts/identity";
import { isConstraintViolation } from "@orb/db";
import { batchMany } from "@orb/db/kit";
import { DomainForbiddenError, DomainNotFoundError } from "@orb/kit/errors";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId, newId } from "@orb/kit/ids";
import { getLog, logAudit } from "#foundation/observability";
import type { ProvisionAgentParams } from "../contract/params";
import type { ProvisionAgentResult } from "../contract/results";
import type { SessionsContext, SessionsService } from "../contract/service";
import { agentMintStatements, selectIdByHandle, selectMintOwner } from "../persistence/users";

// The agent-principal MINT (D60; agent-principal-design/01 §4). Sessions owns it — it is the identity-owning
// domain (next to provisionIdentity), and the ONLY site that writes a `kind:'agent'` row (inv 3). LAZY by
// design: the seat verb (`chat.seatAgent`, AP3) calls this via an injected op; `buddy.hatch` does NOT mint.
// FLAG[PD-17]: no production caller until AP3 — at AP1 it is on the service surface + tested directly.

const AGENT_PRINCIPAL_MINTED = "AGENT_PRINCIPAL_MINTED";
const USER_ENTITY = "user";

/** The deterministic reserved-namespace handle — the idempotency key AND the `users_handle_unique` race
 *  arbiter. One agent per `(ownerUserId, sourceKind)` (agent-principal-design/01 §4). */
function agentHandle(sourceKind: AgentSourceKind, ownerUserId: UserId): Handle {
  return castId<Handle>(`__agent__${sourceKind}__${ownerUserId}`);
}

/** Run the mint batch (agent `users` row + satellite, atomic). The `users_handle_unique` violation is the
 *  race arbiter: a concurrent minter that LOST re-reads the winner (its whole batch rolled back — no orphan
 *  row) and returns `created:false`. Any other error re-throws. */
async function mintOrAdopt(
  ctx: SessionsContext,
  row: {
    agentUserId: UserId;
    handle: Handle;
    ownerUserId: UserId;
    sourceKind: AgentSourceKind;
    now: number;
  },
): Promise<ProvisionAgentResult> {
  try {
    await ctx.db.batch(batchMany(agentMintStatements(ctx.db, row)));
    return { agentUserId: row.agentUserId, created: true };
  } catch (err) {
    const winner =
      isConstraintViolation(err)?.kind === "unique"
        ? await selectIdByHandle(ctx.db, row.handle)
        : undefined;
    if (winner === undefined) {
      throw err;
    }
    return { agentUserId: winner, created: false };
  }
}

export function createProvisionAgent(
  ctx: SessionsContext,
): Pick<SessionsService, "provisionAgentPrincipal"> {
  async function provisionAgentPrincipal(
    params: ProvisionAgentParams,
  ): Promise<ProvisionAgentResult> {
    // Gate the owner: it must exist, be a HUMAN (no nested agents), and be enabled (a disabled human cannot
    // mint hands). A non-human / unknown owner collapses to a leak-free not-found.
    const owner = await selectMintOwner(ctx.db, params.ownerUserId);
    if (owner === undefined || owner.kind !== "human") {
      throw new DomainNotFoundError("user", params.ownerUserId);
    }
    if (!owner.enabled) {
      throw new DomainForbiddenError("a disabled human cannot mint an agent principal");
    }

    const handle = agentHandle(params.sourceKind, params.ownerUserId);
    // Idempotent short-circuit: the (owner, sourceKind) agent already exists → return it, no mint, no audit.
    const existing = await selectIdByHandle(ctx.db, handle);
    if (existing !== undefined) {
      return { agentUserId: existing, created: false };
    }

    const now = ctx.now();
    const result = await mintOrAdopt(ctx, {
      agentUserId: newId<UserId>(),
      handle,
      ownerUserId: params.ownerUserId,
      sourceKind: params.sourceKind,
      now,
    });
    // Audit ONLY a real mint (a principal coming into existence is security-relevant) — never the adopt path.
    if (result.created) {
      await logAudit(
        ctx.db,
        {
          actorUserId: params.ownerUserId,
          action: AGENT_PRINCIPAL_MINTED,
          entityType: USER_ENTITY,
          entityId: result.agentUserId,
        },
        now,
      );
      getLog().info(
        {
          ownerUserId: params.ownerUserId,
          agentUserId: result.agentUserId,
          sourceKind: params.sourceKind,
        },
        "agent principal: minted",
      );
    }
    return result;
  }
  return { provisionAgentPrincipal };
}
