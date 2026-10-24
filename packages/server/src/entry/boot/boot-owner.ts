// Boot's pre-assembly owner step: compose takes the owner id, so a transient sessions service resolves or seeds the
// owner first. Every root that stands for a booted box (the process, the test harness) runs this one step.

import type { DatabaseHandle } from "@orb/db/wiring";
import type { IdSource, UserId } from "@orb/kit/ids";
import type { SessionsRolePolicy, SessionsService } from "#domain/sessions";
import { createSessionsService } from "#domain/sessions";
import type { Logger } from "#foundation/observability";
import { getLog } from "#foundation/observability";
import type { SessionsCrypto } from "../compose/sessions-crypto.ts";
import { createLocalLightUserSeed } from "./seed-local-light.ts";
import { seedOwner } from "./seed-owner.ts";

/** A seeded-mode boot: `seedOwner` mints or heals the OWNER_HANDLES row, with the local first-boot password when set. */
export interface BootOwnerSeed {
  readonly initialPassword?: string;
  readonly hashPassword?: (plain: string) => Promise<string>;
}

export interface BootOwnerInput {
  readonly logger: Logger;
  readonly db: DatabaseHandle;
  readonly now: () => number;
  readonly idSource: IdSource;
  readonly rolePolicy: SessionsRolePolicy;
  readonly sessionSecret: string | null;
  readonly sessionsCrypto: SessionsCrypto;
  /** `null` in OIDC mode: the IdP's first owner-policy login mints the owner, so boot only reads an existing row. */
  readonly ownerSeed: BootOwnerSeed | null;
}

export interface BootOwner<Owner extends UserId | undefined = UserId | undefined> {
  /** The transient sessions service; it resolves boot Principals until compose owns the real one. */
  readonly sessions: SessionsService;
  readonly ownerId: Owner;
  /** Owners whose mint-time local-light seed bound an encoder; hand each to `detachEmbedReindex` once compose exists. */
  readonly ownersBoundBeforeAssembly: readonly UserId[];
}

/** The post-assembly half: start the embed sweeps of every owner whose pre-assembly seed bound an encoder. */
export function handOffBootOwnerSweeps(owner: Pick<BootOwner, "ownersBoundBeforeAssembly">, detachEmbedReindex: (owner: UserId) => void): void {
  for (const boundOwner of owner.ownersBoundBeforeAssembly) {
    detachEmbedReindex(boundOwner);
  }
}

async function seededOwnerId(sessions: SessionsService, input: BootOwnerInput, seed: BootOwnerSeed): Promise<UserId> {
  const ownerIds = await seedOwner({ logger: input.logger, db: input.db, sessions, ownerHandles: input.rolePolicy.ownerHandles(), now: input.now, ...seed });
  const seededId = ownerIds[0];
  if (seededId === undefined) {
    throw new Error("boot: seedOwner returned no owner id (OWNER_HANDLES resolved empty)");
  }
  // BELT: `ownerId` must name a REAL row, not merely be defined. Everything after binds to it — the owner
  // role-clients bundle, the boot Principal, and every owner-scoped seed — and the boot Principal is
  // ROW-DERIVED through `principalFromRow`, which deliberately DEGRADES an unknown id to `role:"user"`
  // (the frozen-host bridge needs that; a boot does not). So a defined-but-dangling id would seed the whole
  // box under a non-owner principal against a row that does not exist, silently. `ensureUser` refuses to
  // fabricate an id upstream; this is the boot-side floor beneath it — one read, fail-closed.
  if ((await sessions.loadUserById(seededId)) === null) {
    throw new Error(`boot: seedOwner returned owner id ${seededId} but no users row carries it — refusing to boot on a phantom owner`);
  }
  return seededId;
}

async function existingOwnerId(sessions: SessionsService): Promise<UserId | undefined> {
  const ownerId = await sessions.getOwnerUserId();
  if (ownerId !== undefined) {
    getLog().info({ ownerId }, "boot(oidc): existing owner row found (from a prior OIDC login)");
  } else {
    getLog().info("boot(oidc): no owner row yet — the first owner-policy OIDC login will create it; owner-dependent boot seeds are deferred");
  }
  return ownerId;
}

/** Resolve the owner before compose: seed it in every seeded mode, read the existing row in OIDC mode. */
export function prepareBootOwner(input: BootOwnerInput & { readonly ownerSeed: BootOwnerSeed }): Promise<BootOwner<UserId>>;
export function prepareBootOwner(input: BootOwnerInput): Promise<BootOwner>;
export async function prepareBootOwner(input: BootOwnerInput): Promise<BootOwner> {
  const ownersBoundBeforeAssembly: UserId[] = [];
  const sessions = createSessionsService({
    logger: input.logger,
    rolePolicy: input.rolePolicy,
    db: input.db,
    now: input.now,
    idSource: input.idSource,
    crypto: input.sessionsCrypto,
    sessionSecret: input.sessionSecret,
    // The owner row is MINTED here (`seedOwner` → `ensureUser`), so this transient service needs the
    // per-user seed too: on a fresh install the boot sweep would otherwise be the only thing that ever seeds the
    // owner, and it runs once per process. `workloads` does not exist yet, so an owner whose encoder this seed
    // binds is held and its sweeps are enqueued once compose has built the queue.
    seedUserConnections: createLocalLightUserSeed({
      logger: input.logger,
      db: input.db,
      now: input.now,
      idSource: input.idSource,
      onEmbedSpaceBound: (boundOwner) => ownersBoundBeforeAssembly.push(boundOwner),
    }),
  });
  const ownerId = input.ownerSeed === null ? await existingOwnerId(sessions) : await seededOwnerId(sessions, input, input.ownerSeed);
  return { sessions, ownerId, ownersBoundBeforeAssembly };
}
