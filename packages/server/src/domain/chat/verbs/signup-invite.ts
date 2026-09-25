// The signup-invite ops (D259): the Principal-free pre-checks, the signed-out preview, and the one gated batch
// that creates an account, spends one use, creates the persona the joiner named, seats the new member as it and
// writes the audit row. The batch order is the control: the account insert runs only where the invite admits
// (and, for an OIDC pending join, only where the pending take deleted a row), and every later statement runs only
// where the one before it changed a row, so a refused step leaves nothing behind. Never reorder it and never let a
// later statement run ungated: an ungated insert placed after the claim seats a stranger on a spent invite.

import type { InvitePreview } from "@orb/contracts/chat";
import type { JoinerPersona } from "@orb/contracts/persona";
import type { AwaitableBatchStmt, BatchStmt } from "@orb/db/kit";
import { isConstraintViolation } from "@orb/db/kit";
import type { ChatId, ChatInviteId, Handle, UserId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import type { ChatContext } from "../context.ts";
import type { AssembleInvitePreviewOp } from "../contract/context.ts";
import type { PendingSignupStatements, SignupInviteDeps, SignupInviteOps, SignupRedeemOutcome, SignupRefusal } from "../contract/signup.ts";
import { findAdmittingSignupInvite, redeemSignupAtomic, signupAccountAdmission } from "../persistence/invites.ts";

type SignupInviteCtx = Pick<ChatContext, "db" | "now" | "hashToken" | "newParticipantId" | "signupInvites">;

type AdmittingInvite = NonNullable<Awaited<ReturnType<typeof findAdmittingSignupInvite>>>;

/** One account attempt against one invite: the statements before the account insert, the insert, and the id
 *  the insert mints. */
interface ChainAttempt {
  readonly tokenHash: string;
  readonly at: number;
  readonly handle: Handle;
  readonly persona: JoinerPersona;
  readonly build: (admission: SQL) => {
    readonly leading: readonly BatchStmt[];
    readonly account: AwaitableBatchStmt<{ id: UserId }[]>;
    readonly userId: UserId;
  };
  /** The refusal an all-empty chain means while the invite still admits. */
  readonly refusedWhileAdmitting: SignupRefusal;
}

const refused = (reason: SignupRefusal): SignupRedeemOutcome => ({ outcome: "refused", reason });

/** Build the signup ops over chat's own context. `assemblePreview` and `emit` are wired at `service.ts`. */
export function createSignupInvite(
  ctx: SignupInviteCtx,
  deps: SignupInviteDeps & {
    readonly assemblePreview: AssembleInvitePreviewOp;
    readonly emit: (event: { type: "chatUpdated"; chatId: ChatId }) => Promise<void>;
  },
): SignupInviteOps {
  const { mode } = ctx.signupInvites;

  // The invite admits one more account under this mode, and its minter is still enabled and a global admin.
  async function standing(tokenHash: string, at: number): Promise<AdmittingInvite | null> {
    const invite = await findAdmittingSignupInvite(ctx.db, { tokenHash, now: at, mode });
    if (invite === undefined || invite.createdByUserId === null) {
      return null;
    }
    return (await deps.minterMayMintSignup(invite.createdByUserId)) ? invite : null;
  }

  // The one chain every signup runs, whichever door it came through.
  async function runChain(attempt: ChainAttempt): Promise<SignupRedeemOutcome> {
    const { tokenHash, at } = attempt;
    const invite = await standing(tokenHash, at);
    if (invite === null) {
      return refused("invite");
    }
    const { leading, account, userId } = attempt.build(signupAccountAdmission({ tokenHash, now: at, mode }));
    const persona = deps.signupPersonaStatement({ ownerId: userId, persona: attempt.persona, at });
    const pointers = deps.signupPersonaPointersStatement({ ownerId: userId, personaId: persona.personaId, at });
    const audit = deps.auditStatementAfterWrite(
      {
        actorUserId: userId,
        action: "invites.signup",
        entityType: "chat_invite",
        entityId: invite.id,
        metadata: { chatId: invite.chatId, handle: attempt.handle, minterUserId: invite.createdByUserId },
      },
      at,
    );
    let settled: Awaited<ReturnType<typeof redeemSignupAtomic>>;
    try {
      settled = await redeemSignupAtomic(ctx.db, {
        leading,
        account,
        persona: persona.statement,
        personaId: persona.personaId,
        pointers,
        audit,
        inviteId: invite.id,
        tokenHash,
        userId,
        participantId: ctx.newParticipantId(),
        now: at,
        mode,
      });
    } catch (err) {
      // A handle or subject race lost to a concurrent insert: the unique index threw and the batch rolled back.
      if (isConstraintViolation(err)?.kind === "unique") {
        return refused("handle-taken");
      }
      throw err;
    }
    return settle(settled, { attempt, userId, chatId: invite.chatId });
  }

  // Every RETURNING non-empty is the one success. All empty means the chain gated off at or before the account
  // insert. A partial chain cannot happen while the insert and the claim read one predicate; this detects it and
  // fails loudly rather than report a join.
  async function settle(
    settled: Awaited<ReturnType<typeof redeemSignupAtomic>>,
    joined: { readonly attempt: ChainAttempt; readonly userId: UserId; readonly chatId: ChatId },
  ): Promise<SignupRedeemOutcome> {
    const counts = [settled.accounts, settled.claims, settled.personas, settled.pointers, settled.seats];
    if (counts.every((count) => count === 1)) {
      return { outcome: "joined", userId: joined.userId, chatId: joined.chatId };
    }
    if (counts.every((count) => count === 0)) {
      const { attempt } = joined;
      return refused((await standing(attempt.tokenHash, attempt.at)) === null ? "invite" : attempt.refusedWhileAdmitting);
    }
    throw new Error(
      `signup batch wrote a partial chain (accounts=${settled.accounts}, claims=${settled.claims}, personas=${settled.personas}, pointers=${settled.pointers}, seats=${settled.seats})`,
    );
  }

  async function redeem(args: {
    readonly token: string;
    readonly handle: Handle;
    readonly passwordHash: string;
    readonly persona: JoinerPersona;
  }): Promise<SignupRedeemOutcome> {
    const at = ctx.now();
    return await runChain({
      tokenHash: ctx.hashToken(args.token),
      at,
      handle: args.handle,
      persona: args.persona,
      build: (admission) => {
        const account = deps.signupUserStatement({ handle: args.handle, passwordHash: args.passwordHash, at, admission });
        return { leading: [], account: account.statement, userId: account.userId };
      },
      refusedWhileAdmitting: "handle-taken",
    });
  }

  async function redeemPending(args: {
    readonly tokenHash: string;
    readonly userId: UserId;
    readonly handle: Handle;
    readonly persona: JoinerPersona;
    readonly statements: PendingSignupStatements;
  }): Promise<SignupRedeemOutcome> {
    return await runChain({
      tokenHash: args.tokenHash,
      at: ctx.now(),
      handle: args.handle,
      persona: args.persona,
      build: (admission) => {
        const { take, account } = args.statements(admission);
        return { leading: [take], account, userId: args.userId };
      },
      refusedWhileAdmitting: "identity",
    });
  }

  return {
    admits: async (token: string): Promise<ChatInviteId | null> => (await standing(ctx.hashToken(token), ctx.now()))?.id ?? null,
    tokenHashOf: (token: string): string => ctx.hashToken(token),
    admitsHash: async (tokenHash: string): Promise<boolean> => (await standing(tokenHash, ctx.now())) !== null,
    previewHash: async (tokenHash: string): Promise<InvitePreview | null> => {
      const invite = await standing(tokenHash, ctx.now());
      return invite === null ? null : await deps.assemblePreview(invite.chatId);
    },
    redeem,
    redeemPending,
    announceJoined: (chatId) => deps.emit({ type: "chatUpdated", chatId }),
  };
}
