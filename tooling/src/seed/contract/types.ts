// seed's shapes: the three seeders' parsed args and the demo seeder's reusable core contract
// (`runFullSeed` is imported by the tooling int test, so this is a real cross-consumer surface).
import type { Principal } from "@orb/contracts/identity";
import type { createDb } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { createServices } from "@orb/server/entry/compose";

export type Db = Awaited<ReturnType<typeof createDb>>;
type Built = Awaited<ReturnType<typeof createServices>>;
export type Services = Built["services"];

export interface DemoArgs {
  readonly fresh: boolean;
  readonly force: boolean;
}

export interface ChatArgs {
  readonly messages: number;
  readonly characters: number;
  readonly title: string;
  readonly force: boolean;
}


export interface RunFullSeedDeps {
  readonly db: Db;
  readonly now: () => number;
  /** The invite/session-token pepper (any non-empty string against the throwaway db). */
  readonly sessionSecret: string;
  readonly casDir: string;
  readonly variantDir: string;
  /** Re-augment even when the demo sentinel already exists (the CLI's --force/--fresh; tests pass true). */
  readonly force: boolean;
  readonly log: (msg: string) => void;
  /** Fail-loud preflight for assets this demo promises. Runs before the first database mutation. */
  readonly validateRequiredAssets?: (() => Promise<void>) | undefined;
}

export interface RunFullSeedResult {
  readonly built: Built;
  readonly ownerId: UserId;
  /** false when the sentinel was present and `force` was not set (demo content left untouched). */
  readonly augmented: boolean;
}

export interface SeedDemoDeps {
  readonly services: Services;
  readonly built: Built;
  readonly owner: Principal;
  readonly ownerId: UserId;
  readonly log: (msg: string) => void;
}

/** The multi-user fixture's contract, supplied as env by its launcher so the shell and this tool share ONE
 *  source of truth. */
export interface MultiUserConfig {
  readonly baseUrl: string;
  readonly ownerHandle: string;
  readonly ownerPassword: string;
  readonly memberHandle: string;
  readonly memberPassword: string;
}
