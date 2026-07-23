// Mint a loginable local human. Authority is role-dependent: minting a regular `user` is admin-gated;
// minting an `admin` is owner-only — the same gate `setRole` uses, closing the create/set-role privilege
// asymmetry. Mints humans only. Guards: invalid_handle (empty OR the reserved `__agent__` namespace —
// the fourth namespace-belt arm, D60 doc 06 §1/§8 inv 3), cannot_grant_owner (never minted here),
// weak_password, user_exists (both the pre-SELECT and the TOCTOU insert-conflict race translate to the same code).

import type { Principal, UserRole } from "@orb/contracts/identity";

import { isConstraintViolation, users } from "@orb/db";
import { DomainOperationError } from "@orb/kit/errors";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { MIN_PASSWORD_LENGTH } from "#infra/auth";
import type { AdminContext } from "../context";
import { ADMIN_OP_CODES } from "../contract/errors";
import type { CreateUserParams } from "../contract/params";
import type { AdminService } from "../contract/service";
import type { AdminUserView } from "../contract/views";
import { requireAdmin, requireOwner } from "../guard";
import { userCols } from "../persistence/queries";

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
function validateCreate(params: CreateUserParams, role: UserRole): string {
  const handle = params.handle.trim();
  if (handle.length === 0) {
    throw new DomainOperationError(ADMIN_OP_CODES.invalidHandle, "handle must not be empty");
  }

  // The owner is the immutable bootstrap row — never minted through admin. Refuses even the owner caller,
  // so a second owner can never be minted.
  if (role === OWNER_ROLE) {
    throw new DomainOperationError(ADMIN_OP_CODES.cannotGrantOwner, "the owner role cannot be assigned to a newly created user");
  }
  if (params.password.length < MIN_PASSWORD_LENGTH) {
    throw new DomainOperationError(ADMIN_OP_CODES.weakPassword, `password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  return handle;
}

const handleTaken = (handle: string): DomainOperationError => new DomainOperationError(ADMIN_OP_CODES.userExists, `handle '${handle}' is already taken`);

/** Insert the local user, translating a racing unique-violation to the same `user_exists` code the
 *  pre-SELECT throws (the raw driver error is kept as `cause`). */
interface LocalUserInsert {
  readonly handle: string;
  readonly role: UserRole;
  readonly passwordHash: string;
  readonly at: number;
}

async function insertLocalUser(ctx: AdminContext, row: LocalUserInsert): Promise<AdminUserView> {
  // `.returning(userCols)` omits the joined `ownerHandle` — a fresh human's owner is null, added at return.
  let inserted: Omit<AdminUserView, "ownerHandle">[];
  try {
    inserted = await ctx.db
      .insert(users)
      .values({
        id: ctx.newUserId(),
        handle: castId<Handle>(row.handle),
        role: row.role,
        // `createUser` mints humans only — agent rows come exclusively from provisionAgentPrincipal.
        // Hardcoded (not the schema default) so a future default change can't leak agents here.
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
    throw new DomainOperationError(ADMIN_OP_CODES.userExists, "user row was not returned after insert");
  }
  // A freshly-minted human never owns anything — `ownerHandle` is null; the joined column is omitted from
  // `.returning`, so it's set explicitly here.
  return { ...created, ownerHandle: null };
}

export function createCreateUser(ctx: AdminContext): AdminService["createUser"] {
  return async (params: CreateUserParams) => {
    const role = params.role ?? DEFAULT_ROLE;
    // Authorize before validating: the requested role selects the gate.
    requireMintAuthority(params.principal, role);
    const handle = validateCreate(params, role);

    // Friendly pre-check — the unique index + the TOCTOU translation in insertLocalUser are the real defense.
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
