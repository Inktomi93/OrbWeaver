// activation/deactivate — tear a resident plugin down. Pins the header's load-bearing claims: the pending
// posture-2 asks, surface state and the UI outbox are cleared UNCONDITIONALLY (even with no resident
// instance — a plugin can hold pending state while never having activated), and WITH a resident instance
// every registration handle is unregistered, the guest instance is disposed, and the registry entry is
// dropped (idempotent on a second call).

import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PluginContext } from "@orb/server/domain/plugin";
import { describe, vi } from "vitest";
import { createDeactivate } from "../../../../../packages/server/src/domain/plugin/activation/deactivate.ts";
import type { PluginRegistry } from "../../../../../packages/server/src/domain/plugin/contract/service.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const PLUGIN_ID = castId<PluginId>("plugin_x");

function makeCtx(): {
  ctx: PluginContext;
  voidForPlugin: ReturnType<typeof vi.fn>;
  clearSurface: ReturnType<typeof vi.fn>;
  clearOutbox: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
} {
  const voidForPlugin = vi.fn();
  const clearSurface = vi.fn();
  const clearOutbox = vi.fn();
  const dispose = vi.fn();
  // @orb-waive no-test-fabrication(unknown): a minimal PluginContext double — createDeactivate reads only ops.suggestions/surfaceState/uiOutbox/host. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const ctx = {
    ops: { suggestions: { voidForPlugin, raise: () => undefined } },
    surfaceState: { clearForPlugin: clearSurface },
    uiOutbox: { clearForPlugin: clearOutbox },
    host: { dispose },
  } as unknown as PluginContext;
  return { ctx, voidForPlugin, clearSurface, clearOutbox, dispose };
}

describe("createDeactivate", () => {
  test("with NO resident instance, the pending-state clears still fire unconditionally; dispose is never called", () => {
    const { ctx, voidForPlugin, clearSurface, clearOutbox, dispose } = makeCtx();
    const registry: PluginRegistry = new Map();

    createDeactivate(ctx, registry)(PLUGIN_ID);

    expect(voidForPlugin).toHaveBeenCalledWith(PLUGIN_ID);
    expect(clearSurface).toHaveBeenCalledWith(PLUGIN_ID);
    expect(clearOutbox).toHaveBeenCalledWith(PLUGIN_ID);
    expect(dispose).not.toHaveBeenCalled();
  });

  test("with a resident instance: every registration handle unregisters, the instance disposes, the registry drops the row", () => {
    const { ctx, dispose } = makeCtx();
    const unregisterA = vi.fn();
    const unregisterB = vi.fn();
    const instance = { marker: "the-instance" };
    // @orb-waive no-test-fabrication(unknown): a minimal resident-plugin double — deactivate reads only .handles and .instance. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const registry: PluginRegistry = new Map([
      [PLUGIN_ID, { instance, handles: [{ unregister: unregisterA }, { unregister: unregisterB }], invoke: vi.fn() }],
    ]) as unknown as PluginRegistry;

    createDeactivate(ctx, registry)(PLUGIN_ID);

    expect(unregisterA).toHaveBeenCalledTimes(1);
    expect(unregisterB).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledWith(instance);
    expect(registry.has(PLUGIN_ID)).toBe(false);
  });

  test("deactivating twice (a double-disable) is a no-op the second time — idempotent", () => {
    const { ctx, dispose } = makeCtx();
    const unregister = vi.fn();
    const instance = { marker: "x" };
    // @orb-waive no-test-fabrication(unknown): a minimal resident-plugin double — deactivate reads only .handles and .instance. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const registry: PluginRegistry = new Map([[PLUGIN_ID, { instance, handles: [{ unregister }], invoke: vi.fn() }]]) as unknown as PluginRegistry;
    const deactivate = createDeactivate(ctx, registry);

    deactivate(PLUGIN_ID);
    deactivate(PLUGIN_ID);

    expect(unregister).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
