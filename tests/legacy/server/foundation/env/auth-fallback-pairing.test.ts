// @module-tag requires-process-chdir
import { AUTH_MODES } from "@orb/contracts/identity";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { reimportEnvWith, restoreProcessEnvAfterEach, VALID_SESSION_SECRET } from "./_support.ts";

describe("foundation/env — AUTH_FALLBACK pairing, the SSO-bypass fence and the conditional default", () => {
  restoreProcessEnvAfterEach();

  // The INCOHERENT pair, in the same class as the oidc/local refusals above: single-user has no credential
  // other than the owner fallback (`resolveSingleUser` always returns null) and `infra/auth/resolve` tests
  // `fallback === "owner"` BEFORE the mode's unconditional origin arm, so this combination authenticates
  // NOBODY and every request 401s. It shipped as the container image's default env
  // (2026-08-08 F1) precisely because three docs
  // claimed single-user ignores the knob. A silently-inert box is the failure this refusal replaces.
  test("AUTH_MODE=single-user + AUTH_FALLBACK=deny → boot FAILS (the pair authenticates nobody)", async () => {
    await expect(reimportEnvWith({ AUTH_MODE: "single-user", AUTH_FALLBACK: "deny" })).rejects.toThrow(
      "AUTH_FALLBACK=deny with AUTH_MODE=single-user leaves NO way to authenticate",
    );
  });

  // Scope control #1: the fence refuses the incoherent PAIR, never the mode's working default.
  test("single-user + AUTH_FALLBACK=owner boots (the shipped container pair)", async () => {
    const { env } = await reimportEnvWith({ AUTH_MODE: "single-user", AUTH_FALLBACK: "owner" });
    expect(env.AUTH_MODE).toBe("single-user");
    expect(env.AUTH_FALLBACK).toBe("owner");
  });

  // Scope control #2: `deny` is the SSO modes' SECURE default and must stay freely selectable — a fence
  // that made `deny` feel banned would push a public deploy back onto the peer-gated owner fallback.
  test("AUTH_MODE=oidc + AUTH_FALLBACK=deny boots — deny is the SSO-mode secure default, not a banned value", async () => {
    const { env } = await reimportEnvWith({
      AUTH_MODE: "oidc",
      AUTH_FALLBACK: "deny",
      OIDC_ISSUER: "https://idp.example",
      OIDC_CLIENT_ID: "client",
      OIDC_CLIENT_SECRET: "x",
      OIDC_REDIRECT_URIS: "https://app/api/auth/oidc/callback",
      SESSION_SECRET: VALID_SESSION_SECRET,
    });
    expect(env.AUTH_FALLBACK).toBe("deny");
  });

  // ── THE SSO-FALLBACK LEAK fence (#298 f2, owner ruling 2026-08-19) ────────────────────────────────────
  // prod + an SSO mode + AUTH_FALLBACK=owner is a mass SSO bypass: behind a same-host reverse proxy every
  // request arrives on a loopback socket, which `ownerFallbackAllowed` mints owner for. Boot-fatal in prod
  // unless AUTH_BREAK_GLASS acknowledges the on-box-recovery exception. The signal is NODE_ENV=production
  // (a proxy can't be reliably detected at boot); dev is the legit AUTH_FALLBACK=owner home and stays green.
  const oidcRequired = {
    OIDC_ISSUER: "https://idp.example",
    OIDC_CLIENT_ID: "client",
    OIDC_CLIENT_SECRET: "x",
    OIDC_REDIRECT_URIS: "https://app/api/auth/oidc/callback",
    SESSION_SECRET: VALID_SESSION_SECRET,
  } as const;

  test("prod + oidc + AUTH_FALLBACK=owner → boot FAILS (the same-host-proxy SSO bypass)", async () => {
    await expect(reimportEnvWith({ NODE_ENV: "production", AUTH_MODE: "oidc", AUTH_FALLBACK: "owner", ...oidcRequired })).rejects.toThrow("SSO BYPASS");
  });

  test("prod + local + AUTH_FALLBACK=owner → boot FAILS (every SSO mode, not just oidc)", async () => {
    await expect(reimportEnvWith({ NODE_ENV: "production", AUTH_MODE: "local", AUTH_FALLBACK: "owner", SESSION_SECRET: VALID_SESSION_SECRET })).rejects.toThrow(
      "SSO BYPASS",
    );
  });

  test("prod + forward-header + AUTH_FALLBACK=owner → boot FAILS (the third SSO mode bites too)", async () => {
    await expect(reimportEnvWith({ NODE_ENV: "production", AUTH_MODE: "forward-header", AUTH_FALLBACK: "owner" })).rejects.toThrow("SSO BYPASS");
  });

  test("prod + oidc + AUTH_FALLBACK=deny boots (the secure prod default — the owner logs in via SSO)", async () => {
    const { env } = await reimportEnvWith({ NODE_ENV: "production", AUTH_MODE: "oidc", AUTH_FALLBACK: "deny", ...oidcRequired });
    expect(env.AUTH_FALLBACK).toBe("deny");
  });

  test("prod + oidc + owner + AUTH_BREAK_GLASS=on boots (the deliberate on-box recovery exception)", async () => {
    const { env } = await reimportEnvWith({ NODE_ENV: "production", AUTH_MODE: "oidc", AUTH_FALLBACK: "owner", AUTH_BREAK_GLASS: "true", ...oidcRequired });
    expect(env.AUTH_FALLBACK).toBe("owner");
    expect(env.AUTH_BREAK_GLASS).toBe(true);
  });

  test("DEV + oidc + AUTH_FALLBACK=owner boots (the dev-tooling default — the fence is prod-only)", async () => {
    const { env } = await reimportEnvWith({ AUTH_MODE: "oidc", AUTH_FALLBACK: "owner", ...oidcRequired });
    expect(env.AUTH_FALLBACK).toBe("owner");
    expect(env.AUTH_BREAK_GLASS).toBe(false);
  });

  test("prod + single-user + AUTH_FALLBACK=owner boots (single-user is not an SSO mode — its only credential IS the fallback)", async () => {
    const { env } = await reimportEnvWith({ NODE_ENV: "production", AUTH_MODE: "single-user", AUTH_FALLBACK: "owner" });
    expect(env.AUTH_MODE).toBe("single-user");
  });

  // ── THE CONDITIONAL DEFAULT (#2406) — what SILENCE means, per mode ────────────────────────────────────
  // Between #1864 and #2406 the schema default was a flat `deny`, which paired boot-fatally with the schema's
  // OWN AUTH_MODE default: an empty environment could not boot at all, and every launcher plus the vitest
  // floor plus each hermetic env-wiping test carried a pin for a value none of them cared about. The fix
  // resolves the unset key per mode. The SECURITY property
  // the flat `deny` existed for is the one thing that may not move, so it is pinned FIRST and per mode:
  // OMISSION NEVER PRODUCES `owner` OUTSIDE `single-user`.
  const modeRequiredEnv: Record<(typeof AUTH_MODES)[number], Record<string, string>> = {
    "single-user": {},
    local: { SESSION_SECRET: VALID_SESSION_SECRET },
    oidc: { ...oidcRequired },
    "forward-header": {},
  };

  for (const mode of AUTH_MODES) {
    const expected = mode === "single-user" ? "owner" : "deny";
    test(`#2406: AUTH_MODE=${mode} with AUTH_FALLBACK UNSET resolves to ${expected}`, async () => {
      const { env } = await reimportEnvWith({ AUTH_MODE: mode, ...modeRequiredEnv[mode] });
      expect(env.AUTH_FALLBACK).toBe(expected);
    });

    if (mode !== "single-user") {
      // #1864's whole point, restated as the property rather than the mechanism: a PRODUCTION SSO deploy that
      // never mentions AUTH_FALLBACK boots, and boots DENIED — it must not trip the SSO-BYPASS fatal (which
      // would be a dead box) and it must not silently open the loopback owner arm (which would be #298's hole
      // behind a same-host reverse proxy). Iterating AUTH_MODES makes a fifth mode inherit this pin for free.
      test(`#2406/#1864: prod + ${mode} + AUTH_FALLBACK UNSET boots DENIED (no fatal, no implicit owner)`, async () => {
        const { env } = await reimportEnvWith({ NODE_ENV: "production", AUTH_MODE: mode, ...modeRequiredEnv[mode] });
        expect(env.AUTH_FALLBACK).toBe("deny");
      });
    }
  }

  test("#2406: a COMPLETELY empty environment boots — single-user + the resolved owner fallback, no pin anywhere", async () => {
    const { env } = await reimportEnvWith({});
    expect(env.AUTH_MODE).toBe("single-user");
    expect(env.AUTH_FALLBACK).toBe("owner");
  });

  // The conditional default decides what SILENCE means; it never softens a stated value. An operator who
  // TYPED the incoherent pair still hits the fatal — pinned beside the resolution so the two cannot drift.
  test("#2406: an EXPLICIT deny under single-user is still boot-fatal (the default resolves silence, not a typed value)", async () => {
    await expect(reimportEnvWith({ AUTH_MODE: "single-user", AUTH_FALLBACK: "deny" })).rejects.toThrow("leaves NO way to authenticate");
  });

  // The break-glass × widened-peers refusal judges the EFFECTIVE fallback, not the declared one — so it must
  // still fire when `owner` arrives implicitly. (The two refusals above deliberately read the DECLARED value;
  // this one deliberately does not, and that asymmetry is the thing this pin defends.)
  test("#2406: break-glass + a widened peer set is refused even when `owner` is IMPLICIT (the refusal reads the resolved value)", async () => {
    await expect(reimportEnvWith({ AUTH_MODE: "single-user", AUTH_BREAK_GLASS: "true", AUTH_FALLBACK_TRUSTED_PEERS: "172.17.0.0/16" })).rejects.toThrow(
      "AUTH_FALLBACK_TRUSTED_PEERS must not be combined with AUTH_BREAK_GLASS",
    );
  });
});
