import type { Db } from "@orb/db";
import type { BootDatabaseHandle, DbAssemblyInput } from "@orb/db/wiring";
import type { BootSecretResolution } from "#infra/crypto";
import type { SessionsService } from "./service.ts";

/** Trusted boot owner provisioning; no owner Principal exists before this operation. */
export interface SeedOwnerContext {
  readonly db: Db;
  readonly sessions: Pick<SessionsService, "ensureUser" | "renameUserHandle">;
  readonly ownerHandles: readonly string[];
  readonly now: () => number;
  /** AUTH_MODE=local only: the cleartext first-boot owner password. Never logged. */
  readonly initialPassword?: string;
  /** Present iff `initialPassword` is. Injected, not constructed here — infra/auth is the sole hashing home. */
  readonly hashPassword?: (plain: string) => Promise<string>;
}

/** The boot caller holds only the inert handle; sessions opens its own query context. */
export type SeedOwnerParams = DbAssemblyInput<SeedOwnerContext>;

/** Pre-compose secret settlement; the sessions domain's own password and session-token probes precede the
 *  other domains' dependency probes. */
export interface SettleSessionSecretParams {
  readonly db: BootDatabaseHandle;
  readonly resolution: BootSecretResolution<string>;
  readonly hasOtherDependents: () => Promise<boolean>;
  readonly createKeyfile: (path: string) => string | null;
}
