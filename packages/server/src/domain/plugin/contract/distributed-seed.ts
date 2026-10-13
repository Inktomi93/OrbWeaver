// Once-per-recipient delivery consumes a settings latch; never grants or replaces an owned copy.

import type { Principal } from "@orb/contracts/identity";
import type { PluginSeedOps } from "./seed-ops.ts";

export interface DistributedPluginApplierDeps {
  /** The REAL self-scoped verb, under the receiving user's own Principal. Returns which slugs it installed. */
  readonly apply: (principal: Principal) => Promise<Pick<Awaited<ReturnType<PluginSeedOps["apply"]>>, "installedSlugs">>;
  readonly isApplied: (principal: Principal) => Promise<boolean>;
  readonly markApplied: (principal: Principal) => Promise<void>;
}

export interface DistributedPluginApplier {
  readonly ensureApplied: (principal: Principal) => Promise<void>;
}
