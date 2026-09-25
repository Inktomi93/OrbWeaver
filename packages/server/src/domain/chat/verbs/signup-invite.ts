// The signup-invite ops (D254): the Principal-free pre-check and the one gated batch that creates an
// account, spends one use, seats the new member and writes the audit row. The batch order is the control:
// the account insert runs only where the invite admits, and every later statement runs only where the one
// before it changed a row, so a refused step leaves nothing behind. Never reorder it and never let a later
// statement run ungated: an ungated insert placed after the claim seats a stranger on a spent invite.

import { isConstraintViolation } from "@orb/db/kit";
import type { ChatId, ChatInviteId, Handle, UserId } from "@orb/kit/ids";
import type { ChatContext } from "../context.ts";
import type { SignupInviteDeps, SignupInviteOps, SignupRedeemOutcome, SignupRefusal } from "../contract/signup.ts";
import { findAdmittingSignupInvite, redeemSignupAtomic, signupAccountAdmission } from "../persistence/invites.ts";

type SignupInviteCtx = Pick<ChatContext, "db" | "now" | "hashToken" | "newParticipantId" | "signupInvites">;

type AdmittingInvite = NonNullable<Awaited<ReturnType<typeof findAdmittingSignupInvite>>>;

const refused = (reason: SignupRefusal): SignupRedeemOutcome => ({ outcome: "refused", reason });

/** Build the signup ops over chat's own context. */
export function createSignupInvite(ctx: SignupInviteCtx, deps: SignupInviteDeps): SignupInviteOps {
  const { mode } = ctx.signupInvites;

  // The invite admits one more account under this mode, and its minter is still enabled and a global admin.
  async function standing(tokenHash: string, at: number): Promise<AdmittingInvite | null> {
    const invite = await findAdmittingSignupInvite(ctx.db, { tokenHash, now: at, mode });
    if (invite === undefined || invite.createdByUserId === null) {
      return null;
    }
    return (await deps.minterMayMintSignup(invite.createdByUserId)) ? invite : null;
  }

  async function redeem(args: { readonly token: string; readonly handle: Handle; readonly passwordHash: string }): Promise<SignupRedeemOutcome> {
    const tokenHash = ctx.hashToken(args.token);
    const at = ctx.now();
    const invite = await standing(tokenHash, at);
    if (invite === null) {
      return refused("invite");
    }
    const admission = signupAccountAdmission({ tokenHash, now: at, mode });
    const account = deps.signupUserStatement({ handle: args.handle, passwordHash: args.passwordHash, at, admission });
    const audit = deps.auditStatementAfterWrite(
      {
        actorUserId: account.userId,
        action: "invites.signup",
        entityType: "chat_invite",
        entityId: invite.id,
        metadata: { chatId: invite.chatId, handle: args.handle, minterUserId: invite.createdByUserId },
      },
      at,
    );
    let settled: Awaited<ReturnType<typeof redeemSignupAtomic>>;
    try {
      settled = await redeemSignupAtomic(ctx.db, {
        account: account.statement,
        audit,
        inviteId: invite.id,
        tokenHash,
        userId: account.userId,
        participantId: ctx.newParticipantId(),
        now: at,
        mode,
      });
    } catch (err) {
      // An exact-handle race lost to a concurrent insert: the unique index threw and the batch rolled back.
      if (isConstraintViolation(err)?.kind === "unique") {
        return refused("handle-taken");
      }
      throw err;
    }
    return await settle({ settled, tokenHash, at, userId: account.userId, chatId: invite.chatId });
  }

  // Every RETURNING non-empty is the one success. All empty means the chain gated off at the account insert:
  // the invite stopped admitting, or a handle matched case-insensitively. A partial chain cannot happen while
  // the insert and the claim read one predicate; if it ever does, fail loudly rather than report a join.
  async function settle(args: {
    readonly settled: Awaited<ReturnType<typeof redeemSignupAtomic>>;
    readonly tokenHash: string;
    readonly at: number;
    readonly userId: UserId;
    readonly chatId: ChatId;
  }): Promise<SignupRedeemOutcome> {
    const { settled, tokenHash, at, userId, chatId } = args;
    const { accounts, claims, seats } = settled;
    if (accounts === 1 && claims === 1 && seats === 1) {
      return { outcome: "joined", userId, chatId };
    }
    if (accounts === 0 && claims === 0 && seats === 0) {
      return refused((await standing(tokenHash, at)) === null ? "invite" : "handle-taken");
    }
    throw new Error(`signup batch wrote a partial chain (accounts=${accounts}, claims=${claims}, seats=${seats})`);
  }

  return {
    admits: async (token: string): Promise<ChatInviteId | null> => (await standing(ctx.hashToken(token), ctx.now()))?.id ?? null,
    redeem,
    announceJoined: (chatId) => deps.emit({ type: "chatUpdated", chatId }),
  };
}
