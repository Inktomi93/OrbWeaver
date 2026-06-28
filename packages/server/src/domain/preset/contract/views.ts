// domain/preset/contract/views — the read-model shapes the client receives (preset.md 8-slot). These are
// domain-local view types (the client receives them via tRPC inference, not a direct import), so they live
// in the feature's `contract/`, NOT `@orb/contracts` (which homes only the cross-boundary `PromptConfig` /
// `UserIntent` / guided-action shapes the view CARRIES). `isSystemDefault` is the derived signal that lets
// the client identify the un-owned row WITHOUT the domain-internal `SYSTEM_DEFAULT_PRESET_ID` sentinel.

import type { PromptConfig } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";

/** A list row — id/name/kind/dates + the derived system-default flag (preset.md: `PresetSummary`). */
export interface PresetSummary {
  readonly id: PresetId;
  readonly name: string;
  readonly kind: string;
  /** Derived (`ownerId IS NULL`): the one un-owned system-default row. Editing it COWs into a fork. */
  readonly isSystemDefault: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** The full preset — the list row PLUS the `PromptConfig` blob (lifted forward at the read seam) and its
 *  mirrored `schemaVersion` (preset.md: `PresetDetail`). */
export interface PresetDetail extends PresetSummary {
  readonly config: PromptConfig;
  readonly schemaVersion: number;
}
