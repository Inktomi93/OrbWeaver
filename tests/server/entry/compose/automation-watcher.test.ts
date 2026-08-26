// entry/compose/automation-watcher — the real domain-bus adapter must honor the watcher's restartable
// lifecycle: stop detaches this watcher while leaving the process-owned bus usable by other subscribers.

import type { AssetCreatedEvent } from "@orb/contracts/events";
import type { AssetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { startAutomationWatcher } from "@orb/server/domain/automation";
import { createDomainEventBus } from "@orb/server/entry/compose";
import { vi } from "vitest";
import { createAutomationWatcherEnv } from "../../../../packages/server/src/entry/compose/automation-watcher.ts";
import { expect, test } from "../../../support/fixtures.ts";

test("stop detaches the domain-event handler from the composed watcher", async () => {
  const eventBus = createDomainEventBus();
  const handleEvent = vi.fn(() => Promise.resolve());
  const watcher = startAutomationWatcher(createAutomationWatcherEnv({ automation: { handleEvent }, eventBus }));
  const event: AssetCreatedEvent = { type: "asset.created", assetId: castId<AssetId>("asset_watcher_stop") };

  eventBus.emit(event);
  await Promise.resolve();
  expect(handleEvent).toHaveBeenCalledOnce();

  watcher.stop();
  eventBus.emit(event);
  await Promise.resolve();
  expect(handleEvent).toHaveBeenCalledOnce();
});
