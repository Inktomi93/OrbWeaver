// @module-tag requires-process-chdir
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { runsInContainer } from "#server/foundation/env/container.ts";
import { dirWithEnvFile, reimportEnvIn, reimportEnvWith, VALID_SESSION_SECRET } from "./_support.ts";

// ── AUTH_FALLBACK_TRUSTED_PEERS (docs/law/container-deployment-security.md) ───────────────────
// The opt-in that widens the un-credentialed owner fallback's peer set so a containerized deploy (whose
// published port never delivers a loopback peer) is usable. The three env-tier properties pinned here:
// it PARSES into the posture, it is LAUNCH-ONLY like AUTH_FALLBACK (#301 — a `.env` pin is boot-fatal),
// and it is refused beside AUTH_BREAK_GLASS (widening the on-box recovery door is the whole hole again).
describe("AUTH_FALLBACK_TRUSTED_PEERS — the opt-in widened fallback peer set", () => {
  test("unset ⇒ the posture is the shipped loopback-only one (byte-identical default)", async () => {
    const mod = await reimportEnvWith({ AUTH_MODE: "single-user", AUTH_FALLBACK: "owner" });
    expect(mod.env.AUTH_FALLBACK_TRUSTED_PEERS).toBeUndefined();
    expect(mod.resolveOwnerFallbackPeers(mod.ownerFallbackPeerInput())).toEqual({ ranges: [], widened: false });
  });

  test("a comma list parses into the posture's ranges and reports WIDENED", async () => {
    const mod = await reimportEnvWith({
      AUTH_MODE: "single-user",
      AUTH_FALLBACK: "owner",
      AUTH_FALLBACK_TRUSTED_PEERS: "172.17.0.0/16, 172.18.0.0/16",
    });
    expect(mod.resolveOwnerFallbackPeers(mod.ownerFallbackPeerInput())).toEqual({
      ranges: ["172.17.0.0/16", "172.18.0.0/16"],
      widened: true,
    });
  });

  test("prod + single-user + the knob boots — this IS the container case the fork exists for", async () => {
    const { env } = await reimportEnvWith({
      NODE_ENV: "production",
      AUTH_MODE: "single-user",
      AUTH_FALLBACK: "owner",
      AUTH_FALLBACK_TRUSTED_PEERS: "172.17.0.0/16",
    });
    expect(env.AUTH_FALLBACK_TRUSTED_PEERS).toBe("172.17.0.0/16");
  });

  // The knob widens the fallback's peer set; break-glass is DEFINED as the brief on-box recovery door
  // (spec §4). Together they hand the whole named range the owner on a prod SSO box — the #298 hole, at
  // network scale, behind a flag whose own doc says "on-box". Same fail-fast family as the SSO-BYPASS fatal.
  test("AUTH_BREAK_GLASS + the knob → boot FAILS (break-glass is on-box by definition)", async () => {
    await expect(
      reimportEnvWith({
        NODE_ENV: "production",
        AUTH_MODE: "oidc",
        AUTH_FALLBACK: "owner",
        AUTH_BREAK_GLASS: "true",
        AUTH_FALLBACK_TRUSTED_PEERS: "172.17.0.0/16",
        OIDC_ISSUER: "https://idp.example",
        OIDC_CLIENT_ID: "client",
        OIDC_CLIENT_SECRET: "x",
        OIDC_REDIRECT_URIS: "https://app/api/auth/oidc/callback",
        SESSION_SECRET: VALID_SESSION_SECRET,
      }),
    ).rejects.toThrow("AUTH_FALLBACK_TRUSTED_PEERS must not be combined with AUTH_BREAK_GLASS");
  });

  // #301, GENERALIZED: `.env` loads with override:true, so a value there is forced into EVERY launch from
  // that dir. A container passes this knob in its container environment, never in the app's own `.env`.
  test("#301: AUTH_FALLBACK_TRUSTED_PEERS declared in .env → boot FAILS at parse", async () => {
    const dir = dirWithEnvFile(["AUTH_MODE=single-user", "AUTH_FALLBACK_TRUSTED_PEERS=172.17.0.0/16"].join("\n"));
    await expect(reimportEnvIn(dir, { AUTH_FALLBACK: "owner" }, { vitest: false })).rejects.toThrow("AUTH_FALLBACK_TRUSTED_PEERS must not be set in .env");
  });

  test("#301: the peers refusal names the container's env file in a container", async () => {
    const dir = dirWithEnvFile(["AUTH_MODE=single-user", "AUTH_FALLBACK_TRUSTED_PEERS=172.17.0.0/16"].join("\n"));
    await expect(reimportEnvIn(dir, { AUTH_FALLBACK: "owner", ORB_CONTAINER: "true" }, { vitest: false })).rejects.toThrow("docker/orbweaver.local.env");
  });

  // A container marker file on the test host would make this a container too.
  test.skipIf(runsInContainer(false))("#301: the peers refusal names the launcher's environment on bare metal", async () => {
    const dir = dirWithEnvFile(["AUTH_MODE=single-user", "AUTH_FALLBACK_TRUSTED_PEERS=172.17.0.0/16"].join("\n"));
    await expect(reimportEnvIn(dir, { AUTH_FALLBACK: "owner", ORB_CONTAINER: "false" }, { vitest: false })).rejects.toThrow("export it in the environment");
  });

  test("#301: the container environment (not `.env`) is accepted — the supported way to set it", async () => {
    const dir = dirWithEnvFile("AUTH_MODE=single-user");
    const mod = await reimportEnvIn(dir, { AUTH_FALLBACK: "owner", AUTH_FALLBACK_TRUSTED_PEERS: "172.17.0.0/16" }, { vitest: false });
    expect(mod.env.AUTH_FALLBACK_TRUSTED_PEERS).toBe("172.17.0.0/16");
  });
});

// ── ALLOWED_HOSTS: the Host allowlist's configured names (`allowed-hosts.ts` owns the grammar) ──
// A malformed entry matches nothing, so the name the operator meant would be refused on every request with no
// hint why. The parse refuses it instead, naming the entry.
describe("ALLOWED_HOSTS — a malformed entry is a parse refusal naming it", () => {
  test.each(["nas.local:8788", "*.example.com", "https://orb.example"])("ALLOWED_HOSTS containing %j refuses boot, naming it", async (entry) => {
    await expect(reimportEnvWith({ ALLOWED_HOSTS: `ok.example, ${entry}` })).rejects.toThrow(entry);
  });

  test("a one-label suffix such as .lan refuses boot, naming it", async () => {
    await expect(reimportEnvWith({ ALLOWED_HOSTS: "nas.local, .lan" })).rejects.toThrow(".lan");
  });

  test("an image that declares itself (ORB_CONTAINER=true) is a container: its host name is not admitted", async () => {
    const declared = await reimportEnvWith({ ORB_CONTAINER: "true" });
    expect(declared.allowedHostsInput().machineHostname).toBeNull();
    expect(declared.bindPostureInput().inContainer).toBe(true);
  });

  // Control, bare metal only: in a container a marker file makes the name null whatever the declaration says.
  test.skipIf(runsInContainer(false))("without the declaration, on bare metal, the machine's name is read", async () => {
    const bare = await reimportEnvWith({});
    expect(bare.allowedHostsInput().machineHostname).not.toBeNull();
  });

  test("well-formed names boot and reach the resolver beside the OIDC callback hosts", async () => {
    const mod = await reimportEnvWith({
      ALLOWED_HOSTS: "nas.local, .ts.net",
      OIDC_REDIRECT_URIS: "https://orbweaver.example.com/api/auth/oidc/callback",
    });
    // Configured names first, then the OIDC callback host; the machine's own names (bare metal only) follow them.
    expect(mod.resolveAllowedHosts(mod.allowedHostsInput()).slice(0, 3)).toEqual(["nas.local", ".ts.net", "orbweaver.example.com"]);
  });
});

// ── TRUSTED_PRIVATE_RANGES: the egress guard's extra private ranges (`@orb/kit/ip` parseCidr owns the grammar) ──
// An entry the range match cannot read blocks nothing, so a range the operator meant to fence stays reachable
// through the SSRF guard with no hint why. The parse refuses it instead, naming the entry.
describe("TRUSTED_PRIVATE_RANGES — an unreadable entry is a parse refusal naming it", () => {
  test.each([
    "10.0.0.0/33",
    "192.168.1.0/",
    "fd00::/129",
    "10.0.0.0/8/9",
    "10.0.0.0/eight",
    "fe80::1%eth0",
    "010.0.0.0/8",
    "lan-subnet",
  ])("TRUSTED_PRIVATE_RANGES containing %j refuses boot, naming it", async (entry) => {
    await expect(reimportEnvWith({ TRUSTED_PRIVATE_RANGES: `10.0.0.0/8, ${entry}` })).rejects.toThrow(entry);
  });

  test("readable ranges, a bare address and empty list items boot", async () => {
    const mod = await reimportEnvWith({ TRUSTED_PRIVATE_RANGES: " 10.0.0.0/8, fd00::/8 ,192.168.7.5,, " });
    expect(mod.env.TRUSTED_PRIVATE_RANGES).toBe(" 10.0.0.0/8, fd00::/8 ,192.168.7.5,, ");
  });
});
