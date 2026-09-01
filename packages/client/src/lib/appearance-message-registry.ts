// Dev-instrument evidence for the prop-driven Appearance plane. Message props never belong on root DOM
// carriers, but the rated browser matrix still needs proof of the exact values real mounted rows received.
// Each MessageRow registers its own values; tokened cleanup prevents a stale virtualizer unmount from
// deleting a newer mount with the same message id. This module does not enter the client barrel.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { IS_DEV } from "./dev-flag.ts";

export interface AppearanceMessageCarrierSnapshot {
  readonly avatarAspect: AppearanceSettings["avatarAspect"];
  readonly avatarRing: AppearanceSettings["avatarRing"];
  readonly avatarShape: AppearanceSettings["avatarShape"];
  readonly avatarSize: AppearanceSettings["avatarSize"];
  readonly autoFixMarkdown: AppearanceSettings["autoFixMarkdown"];
  readonly chatStyle: AppearanceSettings["chatStyle"];
  readonly colorQuotedSpeech: AppearanceSettings["colorQuotedSpeech"];
  readonly messageActions: AppearanceSettings["messageActions"];
  readonly metadataVisibility: {
    readonly showGenerationCost: AppearanceSettings["showGenerationCost"];
    readonly showGenerationTimer: AppearanceSettings["showGenerationTimer"];
    readonly showMessageId: AppearanceSettings["showMessageId"];
    readonly showModelIcon: AppearanceSettings["showModelIcon"];
    readonly showTimestamps: AppearanceSettings["showTimestamps"];
    readonly showTokenCount: AppearanceSettings["showTokenCount"];
  };
  readonly showInChatAvatars: AppearanceSettings["showInChatAvatars"];
  readonly showLLMReasoningIcon: AppearanceSettings["showLLMReasoningIcon"];
}

export interface AppearanceMessageCarrierEntry {
  readonly instanceId: string;
  readonly snapshot: AppearanceMessageCarrierSnapshot;
}

interface RegisteredSnapshot extends AppearanceMessageCarrierEntry {
  readonly token: symbol;
}

const mountedSnapshots = new Map<string, RegisteredSnapshot>();
let testEnabled = false;

export function appearanceMessageRegistryEnabled(): boolean {
  return IS_DEV || testEnabled;
}

export function registerAppearanceMessageSnapshot(instanceId: string, snapshot: AppearanceMessageCarrierSnapshot): () => void {
  const token = Symbol(instanceId);
  mountedSnapshots.set(instanceId, { instanceId, snapshot, token });
  return (): void => {
    if (mountedSnapshots.get(instanceId)?.token === token) {
      mountedSnapshots.delete(instanceId);
    }
  };
}

export function readAppearanceMessageSnapshots(): readonly AppearanceMessageCarrierEntry[] {
  return [...mountedSnapshots.values()]
    .sort((left, right) => left.instanceId.localeCompare(right.instanceId))
    .map(({ instanceId, snapshot }) => ({ instanceId, snapshot }));
}

/** Test-only reset. Production lifetime is one page; real rows own all ordinary cleanup. */
export function __resetAppearanceMessageRegistryForTest(): void {
  mountedSnapshots.clear();
  testEnabled = false;
}

/** CT-only enablement for the production-mode component-test bundle. */
export function __enableAppearanceMessageRegistryForTest(): () => void {
  testEnabled = true;
  return (): void => {
    testEnabled = false;
  };
}
