// domain/chat/contract/signup — the signup-invite ops (D254). The entry signup route calls them with no
// Principal: the route is the signed-out door, and the authority is the invite plus its minter's standing.
// Chat owns the invite, the seat and the order of the batch; sessions owns the account insert and hands it
// in as a statement builder that takes chat's admission predicate, so sessions reads no chat table.

import type { DurableChatBusEvent } from "@orb/contracts/chat";
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

/** What the signup ops close over beside chat's own context. */
export interface SignupInviteDeps {
  readonly signupUserStatement: SignupUserStatementOp;
  readonly minterMayMintSignup: SignupMinterCheckOp;
  /** The `changes()`-guarded audit insert (`buildAuditStatementIfPrecedingWrote`). */
  readonly auditStatementAfterWrite: (entry: AuditEntry, at: number) => BatchStmt;
  readonly emit: (event: DurableChatBusEvent) => Promise<void>;
}

/** Why a signup redeem created nothing. `invite` covers a missing, spent, expired, revoked, re-moded or
 *  orphaned invite alike, so the answer is no oracle over which. */
const SIGNUP_REFUSALS = ["invite", "handle-taken"] as const;
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
  /** Fan `chatUpdated` for the joined room. */
  readonly announceJoined: (chatId: ChatId) => Promise<void>;
}
