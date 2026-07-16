// verb: confirm — the ONLY place a proposed action executes (the propose/confirm gate). The agent only
// STASHES proposals (the propose_* tools); nothing mutates until the user confirms here. Every mutation
// passes the capability ceiling: the `agencyEnabled` kill switch + the hourly rate-limit. The
// `proposal.kind` switch is `assertNever`-exhaustive (§7.5 exhaustive-dispatch) — a new kind needs a member +
// an arm + a tool, or `tsc` red. Cross-feature actions go through the injected `agentEnv` (buddy imports
// no sibling domain). Owner-scoped by `principal.userId`.

import { DomainConflictError } from "@orb/kit/errors";
import type { BuddyContext } from "../context";
import type { ConfirmBuddyParams } from "../contract/params";
import type { ConfirmBuddyResult, Proposal } from "../contract/results";
import type { BuddyService } from "../contract/service";
import { appendTurn, loadBuddy, renameBuddy } from "../persistence/queries";
import { claimProposal, dropProposal, withinMutationBudget } from "../substrate/gate";

function assertNever(value: never): never {
  throw new Error(`unhandled proposal kind: ${String(value)}`);
}

export function createConfirm(ctx: BuddyContext): BuddyService["confirm"] {
  async function resolve(params: ConfirmBuddyParams): Promise<ConfirmBuddyResult> {
    const userId = params.principal.userId;
    if (!params.confirmed) {
      dropProposal(userId);
      return { applied: false, detail: "Okay, cancelled." };
    }

    const proposal = claimProposal(userId, params.proposalId, ctx.now());
    if (proposal === null) {
      return { applied: false, detail: "That suggestion expired — just ask me again." };
    }

    const row = await loadBuddy(ctx.db, userId);
    if (row !== null && !row.agencyEnabled) {
      return { applied: false, detail: "My hands are switched off right now." };
    }
    if (!withinMutationBudget(userId, ctx.now())) {
      return {
        applied: false,
        detail: "Whoa — that's a lot of actions this hour. Give me a beat.",
      };
    }

    return executeProposal(userId, proposal);
  }

  async function executeProposal(userId: ConfirmBuddyParams["principal"]["userId"], proposal: Proposal): Promise<ConfirmBuddyResult> {
    switch (proposal.kind) {
      case "rename": {
        await renameBuddy(ctx.db, userId, proposal.newName, ctx.now());
        return { applied: true, detail: `Done — now going by ${proposal.newName}.` };
      }
      case "workload": {
        try {
          const { workloadId } = await ctx.agentEnv.startWorkload({
            ownerId: userId,
            kind: proposal.workloadKind,
          });
          return {
            applied: true,
            detail: `On it — queued the ${proposal.workloadKind} job (${workloadId}). I'll be digesting.`,
          };
        } catch (e) {
          if (e instanceof DomainConflictError) {
            return {
              applied: false,
              detail: `There's already a ${proposal.workloadKind} job running.`,
            };
          }
          throw e;
        }
      }
      default:
        return assertNever(proposal);
    }
  }

  return async (params: ConfirmBuddyParams) => {
    const result = await resolve(params);
    await appendTurn(ctx.db, {
      id: ctx.newTurnId(),
      userId: params.principal.userId,
      role: "assistant",
      content: result.detail,
      createdAt: ctx.now(),
    });
    return result;
  };
}
