// Live Appearance census adapter for the dev bridge. Extracted as one cohesive observer when #953 added
// message-prop carriers: agent-bridge.ts retains the only global install and exhaustive registries, while
// this module joins mounted DOM owners to the existing carrier/registry authorities.

import type { AppearanceCarrierObservable, AppearanceMatrixContract, AppearanceMatrixContractRow } from "./appearance-carrier-manifest.ts";
import { appearanceMatrixContract } from "./appearance-carrier-manifest.ts";
import { readAppearanceMessageSnapshots } from "./appearance-message-registry.ts";

interface AppearanceMessageRegistryReceipt {
  readonly mounted: number;
  readonly registered: number;
  readonly matched: number;
  readonly missingIds: readonly string[];
  readonly staleIds: readonly string[];
}

export interface AppearanceMatrixBridgeContract extends Omit<AppearanceMatrixContract, "rows"> {
  readonly rows: readonly (AppearanceMatrixContractRow & { readonly reached: number; readonly samples: readonly unknown[] })[];
  readonly messageRegistry: AppearanceMessageRegistryReceipt;
}

function nestedValue(value: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((current, part) => (typeof current === "object" && current !== null ? (current as Record<string, unknown>)[part] : undefined), value);
}

function domObservableSamples(observable: Exclude<AppearanceCarrierObservable, { readonly kind: "message-prop" }>): readonly unknown[] {
  return [...document.querySelectorAll<HTMLElement>(observable.selector)].map((element) =>
    observable.kind === "attribute" ? element.getAttribute(observable.signal) : element.style.getPropertyValue(observable.signal),
  );
}

export function readAppearanceMatrixBridgeContract(): AppearanceMatrixBridgeContract {
  const contract = appearanceMatrixContract();
  const messageEntries = readAppearanceMessageSnapshots();
  const mountedIds = new Set(
    [...document.querySelectorAll<HTMLElement>('[data-slot="message-row"][data-message-id]')]
      .map((element) => element.dataset["messageId"])
      .filter((id): id is string => id !== undefined),
  );
  const messageById = new Map(messageEntries.map((entry) => [entry.instanceId, entry] as const));
  const staleIds = messageEntries.filter((entry) => !mountedIds.has(entry.instanceId)).map((entry) => entry.instanceId);
  const missingIds = [...mountedIds].filter((id) => !messageById.has(id));
  const matchedMessages = messageEntries.filter((entry) => mountedIds.has(entry.instanceId));
  return {
    ...contract,
    rows: contract.rows.map((row) => {
      const observable = row.observable;
      if (observable === null) {
        return { ...row, reached: 0, samples: [] };
      }
      const samples =
        observable.kind === "message-prop" ? matchedMessages.map((entry) => nestedValue(entry.snapshot, observable.signal)) : domObservableSamples(observable);
      return { ...row, reached: samples.length, samples };
    }),
    messageRegistry: {
      mounted: mountedIds.size,
      registered: messageEntries.length,
      matched: matchedMessages.length,
      missingIds,
      staleIds,
    },
  };
}
