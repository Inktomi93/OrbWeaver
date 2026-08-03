// verb: setGlobalVariable — owner-scoped upsert (last-write-wins), cap validation, injected-clock stamp.

import { GLOBAL_VARIABLE_KEY_MAX_CHARS, GLOBAL_VARIABLE_VALUE_MAX_BYTES } from "@orb/contracts/automation";
import { createAutomationService, GlobalVariableInvalidError } from "@orb/server/domain/automation";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeAutomationHarness, principal, seedUser } from "../_support.ts";

describe("setGlobalVariable", () => {
  test("upsert is last-write-wins on the (owner, key) natural key", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createAutomationService(makeAutomationHarness(db));

    await svc.setGlobalVariable({ principal: principal(owner), key: "k", value: "1" });
    await svc.setGlobalVariable({ principal: principal(owner), key: "k", value: "2" });

    await expect(svc.getGlobalVariable({ principal: principal(owner), key: "k" })).resolves.toBe("2");
    // exactly one row (upsert, not insert-twice)
    await expect(svc.listGlobalVariables({ principal: principal(owner) })).resolves.toHaveLength(1);
  });

  test("stamps the injected clock onto updated_at", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createAutomationService(makeAutomationHarness(db));

    await svc.setGlobalVariable({ principal: principal(owner), key: "k", value: "v" });

    const [row] = await svc.listGlobalVariables({ principal: principal(owner) });
    expect(row?.updatedAt).toBe(1_700_000_000_000);
  });

  test("refuses an empty key", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createAutomationService(makeAutomationHarness(db));

    await expect(svc.setGlobalVariable({ principal: principal(owner), key: "", value: "v" })).rejects.toThrow(GlobalVariableInvalidError);
  });

  test("refuses a key over the char cap", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createAutomationService(makeAutomationHarness(db));

    const longKey = "k".repeat(GLOBAL_VARIABLE_KEY_MAX_CHARS + 1);
    await expect(svc.setGlobalVariable({ principal: principal(owner), key: longKey, value: "v" })).rejects.toThrow(GlobalVariableInvalidError);
  });

  test("refuses a value over the 64 KiB byte cap", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createAutomationService(makeAutomationHarness(db));

    const bigValue = "x".repeat(GLOBAL_VARIABLE_VALUE_MAX_BYTES + 1);
    await expect(svc.setGlobalVariable({ principal: principal(owner), key: "k", value: bigValue })).rejects.toThrow(GlobalVariableInvalidError);
  });

  test("accepts a value exactly at the byte cap", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createAutomationService(makeAutomationHarness(db));

    const atCap = "x".repeat(GLOBAL_VARIABLE_VALUE_MAX_BYTES);
    await expect(svc.setGlobalVariable({ principal: principal(owner), key: "k", value: atCap })).resolves.toBeUndefined();
  });
});
