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
  /** Derived (`id === SYSTEM_DEFAULT_PRESET_ID`): the one shared system-default row. Editing it COWs into a
   *  fork. Ownerless PACKAGED template rows are NOT flagged here — they never surface in the readable list. */
  readonly isSystemDefault: boolean;
  /** Fork lineage (`presets.forked_from`, null = born here): the preset this row was copied from — the
   *  system default for a copy-on-write fork, a PACKAGED template for a `clonePackaged` copy. The ID only
   *  (`ChatSummary.parentChatId`-style); the client resolves the NAME from the rows it already has and
   *  simply omits the lineage scent when the source is not among them (a packaged template never is). */
  readonly forkedFrom: PresetId | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface PresetDetail extends PresetSummary {
  readonly config: PromptConfig;
  readonly schemaVersion: number;
}
