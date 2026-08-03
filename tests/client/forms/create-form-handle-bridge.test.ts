// createFormHandleBridge — the module-scope form-handle store's observable contract: read() starts null
// and reflects the last publish, publish REPLACES (never merges) the prior handle, clear() nulls it, and
// two minted bridges are independent stores (no shared module singleton across instances). Headless — the
// publish/clear/read half is DOM-free; useHandle's React `useSyncExternalStore` binding is exercised live
// by the character/preset editor-inspector CTs.

import { createFormHandleBridge } from "@orb/client/forms";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

interface Handle {
  readonly id: string;
}

describe("createFormHandleBridge", () => {
  test("read() starts null, reflects a publish, and clears", () => {
    const bridge = createFormHandleBridge<Handle>();
    expect(bridge.read()).toBeNull();

    const handle: Handle = { id: "a" };
    bridge.publish(handle);
    expect(bridge.read()).toBe(handle);

    bridge.clear();
    expect(bridge.read()).toBeNull();
  });

  test("publish replaces the prior handle (never merges)", () => {
    const bridge = createFormHandleBridge<Handle>();
    bridge.publish({ id: "first" });

    const second: Handle = { id: "second" };
    bridge.publish(second);
    expect(bridge.read()).toBe(second);
  });

  test("two minted bridges are independent stores", () => {
    const one = createFormHandleBridge<Handle>();
    const two = createFormHandleBridge<Handle>();

    const handle: Handle = { id: "one" };
    one.publish(handle);
    expect(one.read()).toBe(handle);
    expect(two.read()).toBeNull();
  });
});
