// Unit tests for the BIND POSTURE resolver: a NON-PRODUCTION process must not be reachable from an untrusted
// network, and single-user (no login) serves this machine only. The parse-time enforcement of `refusal` is
// pinned in index.test.ts.

import type { AuthMode } from "@orb/contracts/identity";
import { bindPostureWarnings, loopbackOrigin, resolveBindPosture, settingInstruction } from "@orb/server/foundation/env";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

// The deploy-mode arms are mode-independent; a login mode keeps the single-user arm out of them.
const HATCH_OPEN = { allowDevPublicBind: true, authMode: "local", ownerPeersDeclared: false, inContainer: false } as const;
const HATCH_SHUT = { allowDevPublicBind: false, authMode: "local", ownerPeersDeclared: false, inContainer: false } as const;
const SINGLE_USER = { authMode: "single-user", allowDevPublicBind: false, ownerPeersDeclared: false, inContainer: false } as const;

describe("resolveBindPosture — production binds where the proxy can reach it", () => {
  test("BIND_HOST unset → host undefined (node's default: every interface), no refusal", () => {
    const posture = resolveBindPosture({ nodeEnv: "production", bindHost: undefined, ...HATCH_SHUT });
    expect(posture).toMatchObject({ host: undefined, publicBind: true, refusal: null });
  });

  test("an explicit loopback bind is honored (the containerize/interim belt), still no refusal", () => {
    const posture = resolveBindPosture({ nodeEnv: "production", bindHost: "127.0.0.1", ...HATCH_SHUT });
    expect(posture).toMatchObject({ host: "127.0.0.1", publicBind: false, refusal: null });
  });

  test("the dev hatch is INERT in production — no refusal, no warning, the bind is unchanged", () => {
    const input = { nodeEnv: "production", bindHost: undefined, ...HATCH_OPEN } as const;
    const posture = resolveBindPosture(input);
    expect(posture.refusal).toBeNull();
    expect(bindPostureWarnings(input, posture)).toEqual([]);
  });
});

describe("resolveBindPosture — the DEFAULT arm: a non-production build restricts itself to loopback", () => {
  test("development, BIND_HOST unset → 127.0.0.1 (the incident's process would be unreachable off-box)", () => {
    const posture = resolveBindPosture({ nodeEnv: "development", bindHost: undefined, ...HATCH_SHUT });
    expect(posture).toMatchObject({ host: "127.0.0.1", publicBind: false, refusal: null });
  });

  // The restriction changes what the OWNER's own habit does (browsing the FQDN, which proxies to :8788
  // and now gets a 502 when a dev stack holds the port). The 502 belongs to the proxy and cannot explain
  // itself, so this line is the one place the answer can be found — it must name the symptom AND both
  // exits, or the next confused operator "fixes" it by deleting the belt.
  test("production + an explicit loopback BIND_HOST says LOOPBACK, never 'every interface' (the 2026-09-18 container log lie)", () => {
    const posture = resolveBindPosture({ nodeEnv: "production", bindHost: "127.0.0.1", ...HATCH_SHUT });
    expect(posture.publicBind).toBe(false);
    expect(posture.notice).toContain("loopback ONLY");
    expect(posture.notice).not.toContain("every interface");
    const open = resolveBindPosture({ nodeEnv: "production", bindHost: undefined, ...HATCH_SHUT });
    expect(open.notice).toContain("every interface");
  });

  test("the boot notice names the symptom AND both exits (the FQDN/LAN 502 is discoverable, not mysterious)", () => {
    const { notice } = resolveBindPosture({ nodeEnv: "development", bindHost: undefined, ...HATCH_SHUT });
    expect(notice).toContain("LOOPBACK ONLY");
    expect(notice).toContain("public FQDN");
    expect(notice).toContain("502");
    expect(notice).toContain("pnpm stack up prod");
    expect(notice).toContain("ALLOW_DEV_PUBLIC_BIND=true");
  });

  test("test env behaves as development (the rule is NOT-production, not just development)", () => {
    expect(resolveBindPosture({ nodeEnv: "test", bindHost: undefined, ...HATCH_SHUT }).host).toBe("127.0.0.1");
  });

  test("a healthy dev boot warns about nothing", () => {
    const input = { nodeEnv: "development", bindHost: undefined, ...HATCH_SHUT } as const;
    expect(bindPostureWarnings(input, resolveBindPosture(input))).toEqual([]);
  });

  test.each([
    "localhost",
    "::1",
    "[::1]",
    "127.0.0.53",
    "LOCALHOST",
    " 127.0.0.1 ",
  ])("an explicit loopback spelling (%s) is accepted in dev — no refusal, not a public bind", (bindHost) => {
    const posture = resolveBindPosture({ nodeEnv: "development", bindHost, ...HATCH_SHUT });
    expect(posture.refusal).toBeNull();
    expect(posture.publicBind).toBe(false);
  });
});

describe("resolveBindPosture — the REFUSE arm: an explicit dev public bind is boot-fatal", () => {
  test.each(["0.0.0.0", "::", "192.168.1.50", "orbweaver.example.com", "0.0.0.0 "])("development + BIND_HOST=%s without the hatch → refusal", (bindHost) => {
    const posture = resolveBindPosture({ nodeEnv: "development", bindHost, ...HATCH_SHUT });
    expect(posture.publicBind).toBe(true);
    expect(posture.refusal).toContain("NON-PRODUCTION");
  });

  test("the refusal is operator-actionable: it names the offending pair AND both ways out", () => {
    const refusal = resolveBindPosture({ nodeEnv: "development", bindHost: "0.0.0.0", ...HATCH_SHUT }).refusal ?? "";
    expect(refusal).toContain("BIND_HOST=0.0.0.0");
    expect(refusal).toContain("NODE_ENV=development");
    expect(refusal).toContain("pnpm stack up prod");
    expect(refusal).toContain("ALLOW_DEV_PUBLIC_BIND=true");
  });

  test("the hatch converts the refusal into a STANDING warning, never into silence", () => {
    const input = { nodeEnv: "development", bindHost: "0.0.0.0", ...HATCH_OPEN } as const;
    const posture = resolveBindPosture(input);
    expect(posture).toMatchObject({ host: "0.0.0.0", publicBind: true, refusal: null });
    const warnings = bindPostureWarnings(input, posture);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("ALLOW_DEV_PUBLIC_BIND");
    expect(warnings[0]).toContain("pnpm stack up prod");
  });

  test("the hatch with BIND_HOST unset opens every interface — and still warns", () => {
    const input = { nodeEnv: "development", bindHost: undefined, ...HATCH_OPEN } as const;
    const posture = resolveBindPosture(input);
    expect(posture).toMatchObject({ host: undefined, publicBind: true, refusal: null });
    expect(bindPostureWarnings(input, posture)[0]).toContain("every interface");
  });
});

describe("resolveBindPosture — single-user serves this machine only, in every NODE_ENV", () => {
  test.each(["production", "development", "test"] as const)("NODE_ENV=%s, BIND_HOST unset → loopback, no refusal", (nodeEnv) => {
    const posture = resolveBindPosture({ ...SINGLE_USER, nodeEnv, bindHost: undefined });
    expect(posture).toMatchObject({ host: "127.0.0.1", publicBind: false, refusal: null });
  });

  test.each([true, false])("inContainer=%s: the notice and the refusal carry that install shape's fix", (inContainer) => {
    const fix = settingInstruction(inContainer, "AUTH_MODE", "local" satisfies AuthMode);
    expect(resolveBindPosture({ ...SINGLE_USER, inContainer, nodeEnv: "production", bindHost: undefined }).notice).toContain(fix);
    expect(resolveBindPosture({ ...SINGLE_USER, inContainer, nodeEnv: "production", bindHost: "0.0.0.0" }).refusal).toContain(fix);
  });

  test.each(["0.0.0.0", "::", "192.168.1.50"])("production + BIND_HOST=%s with no declared peer set → refusal naming the login mode", (bindHost) => {
    const posture = resolveBindPosture({ ...SINGLE_USER, nodeEnv: "production", bindHost });
    expect(posture.refusal).toContain("AUTH_MODE=local");
  });

  test("the dev hatch under single-user with no declared peer set → refusal (the hatch is not an owner door)", () => {
    const posture = resolveBindPosture({ ...SINGLE_USER, nodeEnv: "development", bindHost: undefined, allowDevPublicBind: true });
    expect(posture.refusal).toContain("AUTH_MODE=local");
  });

  test("a declared peer set admits the public bind (the container shape)", () => {
    const posture = resolveBindPosture({ ...SINGLE_USER, nodeEnv: "production", bindHost: "0.0.0.0", ownerPeersDeclared: true });
    expect(posture).toMatchObject({ host: "0.0.0.0", publicBind: true, refusal: null });
  });

  test("a declared peer set with BIND_HOST unset still binds loopback (it lifts a refusal, it never widens a default)", () => {
    const posture = resolveBindPosture({ ...SINGLE_USER, nodeEnv: "production", bindHost: undefined, ownerPeersDeclared: true });
    expect(posture).toMatchObject({ host: "127.0.0.1", publicBind: false, refusal: null });
  });

  test("a declared peer set does not lift the non-production refusal", () => {
    const posture = resolveBindPosture({ ...SINGLE_USER, nodeEnv: "development", bindHost: "0.0.0.0", ownerPeersDeclared: true });
    expect(posture.refusal).not.toBeNull();
    expect(posture.refusal).not.toContain("AUTH_MODE=local");
  });

  test("an explicit loopback bind is honored", () => {
    const posture = resolveBindPosture({ ...SINGLE_USER, nodeEnv: "production", bindHost: "127.0.0.1" });
    expect(posture).toMatchObject({ host: "127.0.0.1", publicBind: false, refusal: null });
  });

  // Control: every login mode keeps the production posture, node's default of every interface.
  test.each(["local", "oidc", "forward-header"] as const)("control: AUTH_MODE=%s in production still binds every interface", (authMode) => {
    const posture = resolveBindPosture({ ...SINGLE_USER, authMode, nodeEnv: "production", bindHost: undefined });
    expect(posture).toMatchObject({ host: undefined, publicBind: true, refusal: null });
  });
});

// The IP certificate's https listener forwards over loopback (D269): the app must see a loopback peer to believe the
// hop's X-Forwarded-Proto and X-Forwarded-For (D255). A listener on one named interface has no loopback to reach.
describe("loopbackOrigin — where a same-host hop reaches the app listener", () => {
  test("an unset bind and 0.0.0.0 are reached over IPv4 loopback", () => {
    // Unset, node listens on `::` with IPV6_V6ONLY cleared (dual-stack whatever net.ipv6.bindv6only says) or, with no
    // IPv6, on 0.0.0.0: IPv4 loopback reaches both, and [::1] would miss the second.
    for (const host of [undefined, "0.0.0.0"]) {
      expect({ host, origin: loopbackOrigin(host, 8788) }).toEqual({ host, origin: "http://127.0.0.1:8788" });
    }
  });

  test("an explicit :: bind is reached over IPv6 loopback, which a v6 listener takes on any host", () => {
    for (const host of ["::", "[::]"]) {
      expect({ host, origin: loopbackOrigin(host, 8788) }).toEqual({ host, origin: "http://[::1]:8788" });
    }
  });

  test("a loopback bind is reached at its own loopback address", () => {
    expect(loopbackOrigin("127.0.0.1", 8788)).toBe("http://127.0.0.1:8788");
    expect(loopbackOrigin("::1", 8788)).toBe("http://[::1]:8788");
  });

  test("a bind to one named interface, public or LAN, has no loopback origin", () => {
    for (const host of ["81.2.69.160", "192.168.1.5", "2a00:1450:4001:80b::200e", "nas.local"]) {
      expect({ host, origin: loopbackOrigin(host, 8788) }).toEqual({ host, origin: null });
    }
  });
});
