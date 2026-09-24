// admin.restart at the router: the explicit confirm is the input, so a call without it never reaches the verb, and
// layer 1 refuses a plain user before it. The verb's own gates (owner, supervisor, single flight) are its unit test.

import { describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, makeContext, principal } from "../_support.ts";

function harness(role: "owner" | "admin" | "user"): {
  readonly admin: ReturnType<typeof caller>["admin"];
  readonly restart: ReturnType<typeof vi.fn>;
} {
  const restart = vi.fn(() => Promise.resolve());
  const admin = caller(makeContext({ auth: principal(role), services: { admin: { restart } } })).admin;
  return { admin, restart };
}

describe("admin.restart", () => {
  test("without the confirm it answers BAD_REQUEST and the verb never runs", async () => {
    const h = harness("owner");
    for (const input of [{}, { confirm: false }, { confirm: "true" }]) {
      // @ts-expect-error the wire can carry a missing or wrong confirm; the input schema is what refuses it
      const refusal = h.admin.restart(input);
      await expect(refusal, JSON.stringify(input)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(h.restart).not.toHaveBeenCalled();
  });

  test("a plain user is refused at layer 1 and the verb never runs", async () => {
    const h = harness("user");
    await expect(h.admin.restart({ confirm: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(h.restart).not.toHaveBeenCalled();
  });

  test("control: the confirmed call reaches the verb with the caller and the confirm", async () => {
    const h = harness("owner");
    await expect(h.admin.restart({ confirm: true })).resolves.toEqual({ restarting: true });
    expect(h.restart).toHaveBeenCalledExactlyOnceWith({ principal: principal("owner"), confirm: true });
  });
});
