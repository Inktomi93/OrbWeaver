// verb: createUser — mint a loginable LOCAL human (admin.md). admin-gated (owner ∪ admin). Mints humans
// ONLY (loginable: a password hash, no agent kind — agent principals are sessions' `provisionAgentPrincipal`,
// not this path). Guards: invalid_handle (empty), cannot_grant_owner (the owner is never minted here),
// weak_password (below the auth floor), user_exists (the handle is taken — BOTH the friendly pre-SELECT
// and the TOCTOU `INSERT`-conflict race translate to the same typed code, admin.md §Esoteric).

import type { UserRole } from "@orb/contracts/identity";
import { isConstraintViolation, users } from "@orb/db";
import { DomainOperationError } from "@orb/kit/errors";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { MIN_PASSWORD_LENGTH } from "#infra/auth";
import { ADMIN_OP_CODES } from "../contract/errors";
import type { CreateUserParams } from "../contract/params";
import type { AdminContext, AdminService } from "../contract/service";
import type { AdminUserView } from "../contract/views";
import { requireAdmin } from "../guard";
import { userCols } from "../persistence/queries";

const OWNER_ROLE = "owner";
const DEFAULT_ROLE = "user";
const LIMIT_ONE = 1;

/** Validate the create params into a clean `{ handle, role }`, throwing the typed reason on each failure. */
function validateCreate(params: CreateUserParams): { handle: string; role: UserRole } {
  const handle = params.handle.trim();
  if (handle.length === 0) {
    throw new DomainOperationError(ADMIN_OP_CODES.invalidHandle, "handle must not be empty");
  }
  const role = params.role ?? DEFAULT_ROLE;
  // The owner is the immutable bootstrap row — it is never minted through admin (D17).
  if (role === OWNER_ROLE) {
    throw new DomainOperationError(
      ADMIN_OP_CODES.cannotGrantOwner,
      "the owner role cannot be assigned to a newly created user",
    );
  }
  if (params.password.length < MIN_PASSWORD_LENGTH) {
    throw new DomainOperationError(
      ADMIN_OP_CODES.weakPassword,
      `password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }
  return { handle, role };
}

const handleTaken = (handle: string): DomainOperationError =>
  new DomainOperationError(ADMIN_OP_CODES.userExists, `handle '${handle}' is already taken`);

/** INSERT the local user, translating a racing unique-violation to the same `user_exists` code the
 *  pre-SELECT throws (the TOCTOU backstop; the raw driver error is kept as `cause`). */
interface LocalUserInsert {
  readonly handle: string;
  readonly role: UserRole;
  readonly passwordHash: string;
  readonly at: number;
}

async function insertLocalUser(ctx: AdminContext, row: LocalUserInsert): Promise<AdminUserView> {
  // `.returning(userCols)` omits the joined `ownerHandle` (D60) — a fresh human's owner is null, added at return.
  let inserted: Omit<AdminUserView, "ownerHandle">[];
  try {
    inserted = await ctx.db
      .insert(users)
      .values({
        id: ctx.newUserId(),
        handle: castId<Handle>(row.handle),
        role: row.role,
        // D60: `createUser` mints HUMANS only — agent rows come exclusively from provisionAgentPrincipal
        // (doc 01 inv 3). Hardcoded (not the schema default) so a future default change can't leak agents here.
        kind: "human",
        passwordHash: row.passwordHash,
        createdAt: row.at,
        updatedAt: row.at,
      })
      .returning(userCols);
  } catch (err) {
    if (isConstraintViolation(err)?.kind === "unique") {
      const dup = handleTaken(row.handle);
      dup.cause = err;
      throw dup;
    }
    throw err;
  }
  const created = inserted[0];
  if (created === undefined) {
    throw new DomainOperationError(
      ADMIN_OP_CODES.userExists,
      "user row was not returned after insert",
    );
  }
  // A freshly-minted human never owns anything — `ownerHandle` is null (D60). `.returning(userCols)` omits
  // the joined column, so it is set explicitly here.
  return { ...created, ownerHandle: null };
}

export function createCreateUser(ctx: AdminContext): AdminService["createUser"] {
  return async (params: CreateUserParams) => {
    requireAdmin(params.principal);
    const { handle, role } = validateCreate(params);

    // Friendly pre-check — the fast-path user_exists. The unique index + the TOCTOU translation in
    // insertLocalUser are the real defense against a racing create taking the handle.
    const existing = await ctx.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.handle, castId<Handle>(handle)))
      .limit(LIMIT_ONE);
    if (existing[0] !== undefined) {
      throw handleTaken(handle);
    }

    const passwordHash = await ctx.hashPassword(params.password);
    const at = ctx.now();
    const row = await insertLocalUser(ctx, { handle, role, passwordHash, at });

    await ctx.audit(
      {
        actorUserId: params.principal.userId,
        action: "admin.createUser",
        entityType: "user",
        entityId: row.id,
        metadata: { handle, role },
      },
      at,
    );
    return row;
  };
}
