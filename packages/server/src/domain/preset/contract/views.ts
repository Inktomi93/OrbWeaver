// The read-model shapes the client receives. Domain-local (the client gets them via tRPC inference, not
// a direct import), so they live in the feature's `contract/`, NOT `@orb/contracts` (which homes only
// the cross-boundary `PromptConfig` / `UserIntent` / guided-action shapes the view CARRIES).
// `isSystemDefault` is the derived signal that lets the client identify the un-owned row without the
// domain-internal `SYSTEM_DEFAULT_PRESET_ID` sentinel.

import type { PromptConfig } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";

export interface PresetSummary {
  readonly id: PresetId;
  readonly name: string;
  readonly kind: string;
  /** Derived (`ownerId IS NULL`): the one un-owned system-default row. Editing it COWs into a fork. */
  readonly isSystemDefault: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface PresetDetail extends PresetSummary {
  readonly config: PromptConfig;
  readonly schemaVersion: number;
}
