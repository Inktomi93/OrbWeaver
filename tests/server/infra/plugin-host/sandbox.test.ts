import { Sandbox } from "@orb/server/infra/plugin-host";
import { expect, test } from "@orb/testkit/node";

test("guest error fields remain plain diagnostics without host object coercion", async ({ clock }) => {
  using sandbox = await Sandbox.create({ nowEpochMs: clock.now, nextRandom: () => 0, mintId: () => "guest-error-test" });

  expect(await sandbox.evalGuest('throw new TypeError("guest refusal")')).toMatchObject({
    ok: false,
    error: { name: "TypeError", message: "guest refusal" },
  });
  expect(await sandbox.evalGuest("throw {name: 7, message: false}")).toMatchObject({
    ok: false,
    error: { name: "7", message: "false" },
  });
  expect(await sandbox.evalGuest('throw {name: {kind: "GuestRefusal"}, message: {reason: "not admitted"}}')).toMatchObject({
    ok: false,
    error: { name: '{"kind":"GuestRefusal"}', message: '{"reason":"not admitted"}' },
  });
  expect(sandbox.pendingHandles).toBe(0);
  expect((await sandbox.evalGuest("40 + 2")).value).toBe("42");
});
