// Unit tests for the BIND POSTURE resolver (PROD-LEAK, 2026-08-09) — the deploy-mode invariant that a
// NON-PRODUCTION process must not be reachable from an untrusted network. Two arms, both load-bearing:
// the DEFAULT restriction (dev with no BIND_HOST listens on loopback, so a proxy off-box simply cannot
// reach a dev build) and the REFUSE (an explicit non-loopback dev bind is boot-fatal unless the operator
// opened ALLOW_DEV_PUBLIC_BIND). Production is deliberately untouched — the reverse-proxy target needs
// every interface. The parse-time enforcement of `refusal` is pinned in index.test.ts.

import { bindPostureWarnings, resolveBindPosture } from "@orb/server/foundation/env";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const HATCH_OPEN = { allowDevPublicBind: true } as const;
const HATCH_SHUT = { allowDevPublicBind: false } as const;

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
  test.each(["0.0.0.0", "::", "192.168.1.50", "orbweaver.inktomi.tech", "0.0.0.0 "])("development + BIND_HOST=%s without the hatch → refusal", (bindHost) => {
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
