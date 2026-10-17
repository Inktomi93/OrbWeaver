// @subject packages/server/src/transport/trpc/router.ts
// @subject packages/server/src/foundation/observability/client-error.ts
import "@orb/testkit/node/composed-real.ts";
import { RATE_LIMIT_CAP_MIN } from "@orb/contracts/settings";
import { logger } from "@orb/server/foundation/observability";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { vi } from "vitest";

test("anonymous and authenticated reports keep sink truncation, URL secrecy and client correlation isolation", async () => {
  await using root = await createServerHarness();
  const anonymous = await root.internalCallerFor(null);
  const authenticated = await root.internalCallerFor(root.ownerId);
  const error = vi.spyOn(logger, "error");
  try {
    expect(
      await anonymous.clientError({
        message: "m".repeat(5000),
        url: "/auth/callback?code=private-query#private-fragment",
        stack: "s".repeat(5000),
        ownerStack: "at <Component>",
        requestId: "client request\nfrom-prior-call",
      }),
    ).toEqual({ ok: true });
    expect(error).toHaveBeenCalledExactlyOnceWith(
      {
        clientError: true,
        url: "/auth/callback",
        stack: `${"s".repeat(4000)}…`,
        ownerStack: "at <Component>",
        clientRequestId: "clientrequestfrom-prior-call",
      },
      `client error: ${"m".repeat(4000)}…`,
    );
    expect(await authenticated.clientError({ message: "signed-in", url: "/" })).toEqual({ ok: true });
    expect(error).toHaveBeenLastCalledWith(
      {
        clientError: true,
        url: "/",
        stack: undefined,
        ownerStack: undefined,
        clientRequestId: undefined,
      },
      "client error: signed-in",
    );
  } finally {
    error.mockRestore();
  }
});

test("the actual root accepts every inclusive wire ceiling and refuses over-limit reports before logging", async () => {
  await using root = await createServerHarness();
  const anonymous = await root.internalCallerFor(null);
  const error = vi.spyOn(logger, "error");
  try {
    let logged = 0;
    for (const { field, maximum } of [
      { field: "message", maximum: 20_000 },
      { field: "stack", maximum: 20_000 },
      { field: "ownerStack", maximum: 20_000 },
      { field: "url", maximum: 4000 },
      { field: "requestId", maximum: 200 },
    ]) {
      const accepted = { message: "bounds", url: "/", [field]: "x".repeat(maximum) };
      expect(await anonymous.clientError(accepted)).toEqual({ ok: true });
      expect(error).toHaveBeenCalledTimes(++logged);
      await expect(anonymous.clientError({ ...accepted, [field]: "x".repeat(maximum + 1) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(error).toHaveBeenCalledTimes(logged);
    }
  } finally {
    error.mockRestore();
  }
});

test("the actual HTTP boundary rejects missing or non-string report fields without requiring authentication", async () => {
  await using root = await createServerHarness();
  for (const input of [{ message: "boom", url: "/" }, { message: "boom" }, { message: "boom", url: "/", stack: null }]) {
    const response = await root.http.request("/api/trpc/clientError", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = await response.text();
    expect(response.status).toBe("url" in input && !("stack" in input) ? 200 : 400);
    expect(body).toContain(response.status === 200 ? '"ok":true' : "BAD_REQUEST");
  }
});

test("anonymous and authenticated client error reports retain their separate production rate-limit buckets", async () => {
  await using root = await createServerHarness();
  await root.services.settings.updateAppSettings({
    principal: await root.principalFor(root.ownerId),
    partial: { rateLimits: { publicIp: RATE_LIMIT_CAP_MIN, authed: RATE_LIMIT_CAP_MIN } },
  });
  const anonymous = await root.internalCallerFor(null);
  const authenticated = await root.internalCallerFor(root.ownerId);
  const error = vi.spyOn(logger, "error");
  try {
    for (const caller of [anonymous, authenticated]) {
      for (let count = 0; count < RATE_LIMIT_CAP_MIN; count++) {
        expect(await caller.clientError({ message: "rate-control", url: "/" })).toEqual({ ok: true });
      }
      await expect(caller.clientError({ message: "must-not-log", url: "/" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    }
    expect(error).toHaveBeenCalledTimes(RATE_LIMIT_CAP_MIN * 2);
  } finally {
    error.mockRestore();
  }
});
