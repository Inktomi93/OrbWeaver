import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { reimportEnvWith, restoreProcessEnvAfterEach } from "./_support.ts";

describe("foundation/env — the deploy-mode bind invariant", () => {
  restoreProcessEnvAfterEach();

  // THE DEPLOY-MODE INVARIANT (PROD-LEAK, 2026-08-09). The rule + its arms are unit-tested in bind.test.ts;
  // what is pinned HERE is that the refusal is wired into the PARSE — i.e. an `env` that says
  // "non-production + a public interface" cannot come into existence, so no bind-site code path has to
  // remember to check. The live incident's env is the first case: a dev process reachable behind the proxy.
  test("NODE_ENV=development + an explicit public BIND_HOST → boot FAILS at parse (the 08-09 leak shape)", async () => {
    await expect(reimportEnvWith({ AUTH_MODE: "local", NODE_ENV: "development", BIND_HOST: "0.0.0.0" })).rejects.toThrow(
      "a NON-PRODUCTION process must not listen where an untrusted",
    );
  });

  test("the same pair with ALLOW_DEV_PUBLIC_BIND=true boots under a login mode (deliberate LAN dev use is opt-in, not banned)", async () => {
    const { env } = await reimportEnvWith({ AUTH_MODE: "local", NODE_ENV: "development", BIND_HOST: "0.0.0.0", ALLOW_DEV_PUBLIC_BIND: "true" });
    expect(env.BIND_HOST).toBe("0.0.0.0");
    expect(env.ALLOW_DEV_PUBLIC_BIND).toBe(true);
  });

  // Scope control: production is the deployment posture the reverse proxy targets — a public bind there is
  // the POINT for every login mode, and a fence that refused it would take the box down.
  test("NODE_ENV=production + BIND_HOST=0.0.0.0 boots under a login mode (the proxy target, never refused)", async () => {
    const { env } = await reimportEnvWith({ AUTH_MODE: "local", NODE_ENV: "production", BIND_HOST: "0.0.0.0" });
    expect(env.BIND_HOST).toBe("0.0.0.0");
  });

  // Rule A: single-user has no login, so a listener off loopback hands the owner to whoever reaches it. The
  // parse refuses it unless AUTH_FALLBACK_TRUSTED_PEERS declares the peer set (the container shape).
  test("single-user + production + BIND_HOST=0.0.0.0 with no declared peer set → boot FAILS at parse, naming the login mode", async () => {
    await expect(reimportEnvWith({ NODE_ENV: "production", BIND_HOST: "0.0.0.0" })).rejects.toThrow("AUTH_MODE=local");
  });

  test("single-user + ALLOW_DEV_PUBLIC_BIND with no declared peer set → boot FAILS at parse", async () => {
    await expect(reimportEnvWith({ NODE_ENV: "development", ALLOW_DEV_PUBLIC_BIND: "true" })).rejects.toThrow("AUTH_MODE=local");
  });

  test("single-user + production + BIND_HOST=0.0.0.0 WITH a declared peer set boots (the shipped container)", async () => {
    const mod = await reimportEnvWith({ NODE_ENV: "production", BIND_HOST: "0.0.0.0", AUTH_FALLBACK_TRUSTED_PEERS: "172.16.0.0/12" });
    expect(mod.resolveBindPosture(mod.bindPostureInput())).toMatchObject({ host: "0.0.0.0", publicBind: true, refusal: null });
  });

  // An empty peer list is "unset" (the host-network overlay resets it that way), so it declares nothing.
  test("single-user + BIND_HOST=0.0.0.0 with an EMPTY peer list → boot FAILS at parse", async () => {
    await expect(reimportEnvWith({ NODE_ENV: "production", BIND_HOST: "0.0.0.0", AUTH_FALLBACK_TRUSTED_PEERS: "" })).rejects.toThrow("AUTH_MODE=local");
  });

  test("single-user + production with BIND_HOST unset boots on loopback (the bare-metal `pnpm start` default)", async () => {
    const mod = await reimportEnvWith({ NODE_ENV: "production" });
    expect(mod.resolveBindPosture(mod.bindPostureInput())).toMatchObject({ host: "127.0.0.1", publicBind: false, refusal: null });
  });

  // Scope control: the default dev boot (no BIND_HOST) must stay green — the restriction to loopback is
  // resolved at the bind site, NOT a refusal. A fence that killed every dev boot (`pnpm stack up`) would be
  // reverted by morning and the invariant would be gone with it.
  test("NODE_ENV=development with BIND_HOST unset boots clean (restriction, not refusal)", async () => {
    const { env } = await reimportEnvWith({ NODE_ENV: "development" });
    expect(env.BIND_HOST).toBeUndefined();
    expect(env.ALLOW_DEV_PUBLIC_BIND).toBe(false);
  });
});
