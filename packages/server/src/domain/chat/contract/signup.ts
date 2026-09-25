// domain/chat/contract/signup — the signup-invite ops (D254). The entry signup route calls them with no
// Principal: the route is the signed-out door, and the authority is the invite plus its minter's standing.
// Chat owns the invite, the seat and the order of the batch; sessions owns the account insert and hands it
// in as a statement builder that takes chat's admission predicate, so sessions reads no chat table.

import type { InvitePreview } from "@orb/contracts/chat";
import type { AuthMode } from "@orb/contracts/identity";
import type { AwaitableBatchStmt, BatchStmt } from "@orb/db/kit";
import type { ChatId, ChatInviteId, Handle, UserId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import type { AuditEntry } from "#foundation/observability";

/** Whether this deployment mints signup invites, and the mode a signup invite is stamped with. The chat
 *  composition root builds it from a mapped `Record<AuthMode, boolean>`, so a new mode fails `tsc`. */
export interface SignupInviteCapability {
  readonly mode: AuthMode;
  readonly mintable: boolean;
}

/** The sessions-owned account insert. It inserts a `user`-role human with the password hash only where
 *  `admission` holds and no handle matches case-insensitively, and it never absorbs a unique conflict. */
export type SignupUserStatementOp = (args: { readonly handle: Handle; readonly passwordHash: string; readonly at: number; readonly admission: SQL }) => {
  readonly userId: UserId;
  readonly statement: AwaitableBatchStmt<{ id: UserId }[]>;
};

/** Does the invite's minter still hold the authority to mint a signup invite: enabled, and a global admin? */
export type SignupMinterCheckOp = (minterUserId: UserId) => Promise<boolean>;

/** The foreign halves of the signup ops, wired at the composition root. */
export interface SignupInviteDeps {
  readonly signupUserStatement: SignupUserStatementOp;
  readonly minterMayMintSignup: SignupMinterCheckOp;
  /** The `changes()`-guarded audit insert (`buildAuditStatementIfPrecedingWrote`). */
  readonly auditStatementAfterWrite: (entry: AuditEntry, at: number) => BatchStmt;
}

/** D254 — the sessions half of an OIDC pending join: its first two batch statements around chat's opaque
 *  `admission`. `take` deletes the live pending row; `account` inserts only where `take` deleted one. */
export type PendingSignupStatements = (admission: SQL) => { readonly take: BatchStmt; readonly account: AwaitableBatchStmt<{ id: UserId }[]> };

/** Why a signup redeem created nothing. `invite` covers a missing, spent, expired, revoked, re-moded or
 *  orphaned invite alike, so the answer is no oracle over which. `handle-taken` is a handle or subject
 *  collision. `identity` is a pending join that was gone, expired or collided on email at the batch. */
const SIGNUP_REFUSALS = ["invite", "handle-taken", "identity"] as const;
export type SignupRefusal = (typeof SIGNUP_REFUSALS)[number];

export type SignupRedeemOutcome =
  | { readonly outcome: "joined"; readonly userId: UserId; readonly chatId: ChatId }
  | { readonly outcome: "refused"; readonly reason: SignupRefusal };

/** The ops the entry signup route runs, in its order: `admits` before any password hashing, `redeem` after,
 *  then `announceJoined` once the session cookie is written. */
export interface SignupInviteOps {
  /** The invite id when the raw token names a signup invite that still admits one account under this mode and
   *  whose minter still holds the authority; else null. Reads only. */
  readonly admits: (token: string) => Promise<ChatInviteId | null>;
  /** The one gated batch: account, use, seat, audit row, or none of them. */
  readonly redeem: (args: { readonly token: string; readonly handle: Handle; readonly passwordHash: string }) => Promise<SignupRedeemOutcome>;
  /** The peppered hash chat keys invites by. The OIDC login stores only this, never the raw token. */
  readonly tokenHashOf: (token: string) => string;
  /** `admits` for an invite already hashed (the OIDC transaction carries only the hash). */
  readonly admitsHash: (tokenHash: string) => Promise<boolean>;
  /** The preview of a signup invite that still admits, or null. The signed-out pending join reads this. */
  readonly previewHash: (tokenHash: string) => Promise<InvitePreview | null>;
  /** D254 — the OIDC confirm's batch: take the pending row, the gated account, the use, the seat, the audit
   *  row, or none of them. */
  readonly redeemPending: (args: {
    readonly tokenHash: string;
    readonly userId: UserId;
    readonly handle: Handle;
    readonly statements: PendingSignupStatements;
  }) => Promise<SignupRedeemOutcome>;
  /** Fan `chatUpdated` for the joined room. */
  readonly announceJoined: (chatId: ChatId) => Promise<void>;
}
