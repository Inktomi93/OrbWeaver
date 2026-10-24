import type { UserId } from "@orb/kit/ids";
import type { Logger } from "#foundation/observability";
import type { LocalLightSeedResult } from "./results.ts";

/** Convenience seeding must not undo a committed account or abort boot. */
export interface LocalLightSeedPolicyDeps {
  readonly logger: Logger;
  readonly seedConnections: (userId: UserId) => Promise<LocalLightSeedResult>;
  readonly onEmbedSpaceBound: (userId: UserId) => void;
}
export interface LocalLightBootPolicyDeps extends LocalLightSeedPolicyDeps {
  readonly listAccounts: () => Promise<readonly UserId[]>;
}
