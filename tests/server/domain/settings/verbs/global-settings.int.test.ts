// verbs: getGlobalSetting / setGlobalSetting — the raw KV escape hatch. The load-bearing invariant: the
// generic setter REFUSES the reserved APP_SETTINGS_KEY (`"app"`) with DomainOperationError(reserved_key);
// a normal key round-trips + audits as a system event (actorUserId: null); a missing key reads null.

import { DomainOperationError } from "@orb/kit/errors";
import { describe, expect, test } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { makeHarness } from "../_support.ts";

describe("global settings (raw KV)", () => {
  test("setGlobalSetting refuses the reserved 'app' key", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    await expect(h.svc.setGlobalSetting("app", { x: 1 })).rejects.toBeInstanceOf(
      DomainOperationError,
    );
    await expect(h.svc.setGlobalSetting("app", { x: 1 })).rejects.toMatchObject({
      code: "reserved_key",
    });
  });

  test("a normal key round-trips and audits as a system event", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const view = await h.svc.setGlobalSetting("openrouter-model-catalog", { models: ["a", "b"] });
    expect(view.key).toBe("openrouter-model-catalog");
    expect(view.value).toEqual({ models: ["a", "b"] });
    expect(view.updatedAt).toBe(h.clock.now());
    const read = await h.svc.getGlobalSetting("openrouter-model-catalog");
    expect(read?.value).toEqual({ models: ["a", "b"] });
    const audit = h.audits.find((x) => x.entry.action === "settings.setGlobalSetting");
    expect(audit?.entry.actorUserId).toBeNull();
  });

  test("getGlobalSetting returns null for a missing key", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    expect(await h.svc.getGlobalSetting("nope")).toBeNull();
  });
});
