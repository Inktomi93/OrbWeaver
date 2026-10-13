// The ordered account seed consumes concrete operations selected from the canonical manifest at graph construction.

import type { Principal } from "@orb/contracts/identity";
import type { UserId } from "@orb/kit/ids";
import type { LegacySeedLatches, ReadSeededKeys } from "./composed-ops.ts";

export interface ContentSeedStep {
  readonly key: string;
  readonly legacyLatch?: keyof LegacySeedLatches;
  readonly seed: (principal: Principal) => Promise<boolean>;
}
export interface ContentSeedPolicyDeps {
  readonly enabled: () => boolean;
  readonly steps: readonly ContentSeedStep[];
  readonly now: () => number;
  readonly seededKeys: ReadSeededKeys;
  readonly recordSeeded: (userId: UserId, keys: readonly string[], at: number) => Promise<void>;
  readonly legacyLatches: (principal: Principal) => Promise<LegacySeedLatches>;
}
export interface UserContentSeeder {
  readonly ensureSeeded: (principal: Principal) => Promise<void>;
}
