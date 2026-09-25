// Mint a loginable local human. Authority is role-dependent: minting a regular `user` is admin-gated;
// minting an `admin` is owner-only — the same gate `setRole` uses, closing the create/set-role privilege
// asymmetry. Mints humans only. Guards: invalid_handle (empty), cannot_grant_owner (never minted here),
// weak_password, user_exists (both the pre-SELECT and the TOCTOU insert-conflict race translate to the same code).
//
// The account and its audit row are ONE batch (#1691, `substrate/audited-write.ts`). Before that the audit
// was a separate await after the INSERT, which failed both ways: in production the injected `audit` is
// `logAudit`, which SWALLOWS its failure, so a dead audit channel minted a loginable account and returned
// 200 with no forensic record at all; and any tail that did reject rejected the endpoint with the account
// already created. A privileged mint that cannot be recorded must not happen.

import type { Principal, UserRole } from "@orb/contracts/identity";

import { users } from "@orb/db";
import { isConstraintViolation } from "@orb/db/kit";
import { DomainOperationError } from "@orb/kit/errors";
import { admitsHandle, handleKey } from "@orb/kit/handle-key";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { MIN_PASSWORD_LENGTH } from "#infra/auth";
import type { AdminContext } from "../context.ts";
import { ADMIN_OP_CODES } from "../contract/errors.ts";
import type { CreateUserParams } from "../contract/params.ts";
import type { AdminService } from "../contract/service.ts";
import type { AdminUserView } from "../contract/views.ts";
import { requireAdmin, requireOwner } from "../guard.ts";
import { loadUser } from "../persistence/queries.ts";
import { commitAuditedWrite } from "../substrate/audited-write.ts";

const OWNER_ROLE = "owner";
const DEFAULT_ROLE = "user";
const LIMIT_ONE = 1;

/** The authority required to mint the requested role. Minting a regular `user` is delegated-admin work.
 *  Minting anything elevated is owner-only — the same gate `setRole` uses. Fail-closed by default: any
 *  non-`user` role routes to `requireOwner`. */
function requireMintAuthority(principal: Principal, role: UserRole): void {
  if (role === DEFAULT_ROLE) {
    requireAdmin(principal);
    return;
  }
  requireOwner(principal);
}

/** Validate the create params into a clean `handle`, throwing the typed reason on each failure. The
 *  requested `role` is derived + authorized by `requireMintAuthority` BEFORE this runs. */
function validateCreate(params: CreateUserParams, role: UserRole): Handle {
  const handle = params.handle.trim();
  if (handle.length === 0) {
    throw new DomainOperationError(ADMIN_OP_CODES.invalidHandle, "handle must not be empty");
  }
  if (!admitsHandle(handle)) {
    throw new DomainOperationError(ADMIN_OP_CODES.invalidHandle, "handle is not admissible: over the length cap, blank, or mixed-script (D257)");
  }

  // The owner is the immutable bootstrap row — never minted through admin. Refuses even the owner caller,
  // so a second owner can never be minted.
  if (role === OWNER_ROLE) {
    throw new DomainOperationError(ADMIN_OP_CODES.cannotGrantOwner, "the owner role cannot be assigned to a newly created user");
  }
  if (params.password.length < MIN_PASSWORD_LENGTH) {
    throw new DomainOperationError(ADMIN_OP_CODES.weakPassword, `password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  return castId<Handle>(handle);
}

const handleTaken = (handle: Handle): DomainOperationError => new DomainOperationError(ADMIN_OP_CODES.userExists, `handle '${handle}' is already taken`);

/** Insert the local user, translating a racing unique-violation to the same `user_exists` code the
 *  pre-SELECT throws (the raw driver error is kept as `cause`). */
interface LocalUserInsert {
  readonly handle: Handle;
  readonly role: UserRole;
  readonly passwordHash: string;
  readonly at: number;
}

async function insertLocalUser(ctx: AdminContext, row: LocalUserInsert, actorUserId: UserId): Promise<AdminUserView> {
  // The id is minted BEFORE the batch so the audit row can name the account it records without reading the
  // INSERT's own RETURNING back (the two statements commit together — there is no "after" to read in).
  const id = ctx.newUserId();
  let inserted: { readonly id: UserId }[];
  try {
    // ONE batch: the account and its audit row exist together or neither does (#1691). A rejecting audit
    // insert now un-mints the account instead of leaving a loginable row with no forensic record.
    inserted = await commitAuditedWrite(ctx, {
      // D257: the mint is sessions' statement, which derives the handle key and mints humans only.
      write: ctx.sessions.localUserInsertStatement({ id, handle: row.handle, role: row.role, passwordHash: row.passwordHash, at: row.at }),
      entry: {
        actorUserId,
        action: "admin.createUser",
        entityType: "user",
        entityId: id,
        metadata: { handle: row.handle, role: row.role },
      },
      at: row.at,
    });
  } catch (err) {
    if (isConstraintViolation(err)?.kind === "unique") {
      const dup = handleTaken(row.handle);
      dup.cause = err;
      throw dup;
    }
    throw err;
  }
  const created = inserted[0] === undefined ? undefined : await loadUser(ctx.db, inserted[0].id);
  if (created === undefined) {
    throw new DomainOperationError(ADMIN_OP_CODES.userExists, "user row was not returned after insert");
  }
  return created;
}

export function createCreateUser(ctx: AdminContext): AdminService["createUser"] {
  return async (params: CreateUserParams) => {
    const role = params.role ?? DEFAULT_ROLE;
    // Authorize before validating: the requested role selects the gate.
    requireMintAuthority(params.principal, role);
    const handle = validateCreate(params, role);

    // Friendly pre-check on the handle key (D257: a case variant or look-alike is the same handle) — the
    // key's unique index + the TOCTOU translation in insertLocalUser are the real defense.
    const existing = await ctx.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.handleKey, handleKey(handle)))
      .limit(LIMIT_ONE);
    if (existing[0] !== undefined) {
      throw handleTaken(handle);
    }

    const passwordHash = await ctx.hashPassword(params.password);
    const at = ctx.now();
    const view = await insertLocalUser(ctx, { handle, role, passwordHash, at }, params.principal.userId);
    // #2481 — the new account's local-light vector floor (§5.3b), AFTER the audited batch has committed and
    // deliberately OUTSIDE it: the batch's bargain is that a mint which cannot be recorded must not happen,
    // and the inverse bargain here is that a mint whose convenience seed fails must still happen. Total by
    // contract, so there is nothing to catch — see `AdminContext.seedUserConnections`.
    await ctx.seedUserConnections(view.id);
    return view;
  };
}
