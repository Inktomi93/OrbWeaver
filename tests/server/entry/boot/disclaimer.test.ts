// The boot disclaimer composes one line per fact and one security line per standing exposure; a healthy box says nothing alarming.
import type { AuthMode } from "@orb/contracts/identity";
import {
  AUTH_FALLBACK_KEY,
  AUTH_FALLBACK_TRUSTED_PEERS_KEY,
  AUTH_MODE_KEY,
  AUTH_MODES,
  OIDC_CLIENT_ID_KEY,
  OIDC_CLIENT_SECRET_KEY,
  OIDC_ISSUER_KEY,
  OIDC_REDIRECT_URIS_KEY,
} from "@orb/contracts/identity";
import { composeBootDisclaimer } from "@orb/server/entry/boot";
import { resolveBindPosture } from "@orb/server/foundation/env";
import { bindPostureInput, ownerFallbackPeerInput, resolveOwnerFallbackPeers } from "@orb/server/foundation/env/record";
import { expect, test } from "@orb/testkit/node";
import { createTestEnv } from "@orb/testkit/node/helpers";
import { BOOT_DISCLAIMER_TOPICS } from "#server/entry/boot/disclaimer.ts";

type Options = Parameters<typeof composeBootDisclaimer>[0];
type BootDisclaimerLine = ReturnType<typeof composeBootDisclaimer>[number];
type EnvInput = Parameters<typeof createTestEnv>[0];

const NO_WARNINGS: readonly string[] = [];

// The posture inputs come from a record parsed by production, so the bind and the peer set are the shapes a boot reads.
function options(env: EnvInput, over: Partial<Options> = {}): Options {
  const record = createTestEnv(env);
  return {
    authMode: record.AUTH_MODE,
    authFallback: record.AUTH_FALLBACK,
    breakGlass: record.AUTH_BREAK_GLASS,
    bind: resolveBindPosture(bindPostureInput(record)),
    bindWarnings: NO_WARNINGS,
    ownerPeers: resolveOwnerFallbackPeers(ownerFallbackPeerInput(record)),
    ownerPeerWarnings: NO_WARNINGS,
    diagnosticsWarnings: NO_WARNINGS,
    forwardHeaderUnsignedClosed: false,
    secrets: {
      sessionSecret: { explicit: false, keyfile: "/data/secrets/session_secret" },
      credentialsKey: { explicit: true, keyfile: null },
    },
    ...over,
  };
}

const topics = (lines: readonly BootDisclaimerLine[]): readonly string[] => lines.map((line) => line.topic);
const securityLines = (lines: readonly BootDisclaimerLine[]): readonly BootDisclaimerLine[] => lines.filter((line) => line.security);

const OIDC: EnvInput = {
  [AUTH_MODE_KEY]: "oidc",
  [OIDC_ISSUER_KEY]: "https://issuer.example.test",
  [OIDC_CLIENT_ID_KEY]: "orb",
  [OIDC_CLIENT_SECRET_KEY]: "x",
  [OIDC_REDIRECT_URIS_KEY]: "https://orb.example.test/api/auth/callback",
};
// One row per login mode, so a mode added to the auth-mode tuple fails tsc here until it has a valid record.
type LoginMode = Exclude<AuthMode, "single-user">;
const LOGIN_MODE_ENV: Readonly<Record<LoginMode, EnvInput>> = {
  local: { [AUTH_MODE_KEY]: "local", [AUTH_FALLBACK_KEY]: "deny" },
  "forward-header": { [AUTH_MODE_KEY]: "forward-header", [AUTH_FALLBACK_KEY]: "deny" },
  oidc: { ...OIDC, [AUTH_FALLBACK_KEY]: "deny" },
};
const isLoginMode = (mode: AuthMode): mode is LoginMode => mode !== "single-user";
const LOGIN_MODES: readonly EnvInput[] = AUTH_MODES.filter(isLoginMode).map((mode) => LOGIN_MODE_ENV[mode]);

test("a block names the mode, listener, owner rule, cookie rule and secrets, in that order", () => {
  // The tuple states the block's order; the single-user caveat and the security exposure lines ride only some boots.
  const standing = BOOT_DISCLAIMER_TOPICS.filter((topic) => topic !== "caveat" && topic !== "exposure");
  expect(topics(composeBootDisclaimer(options({ [AUTH_MODE_KEY]: "local", [AUTH_FALLBACK_KEY]: "deny" })))).toEqual(standing);
});

test("the single-user proxy caveat rides every single-user boot as information, and no login mode carries it", () => {
  const healthy = composeBootDisclaimer(options({}));
  expect(healthy.map((line) => line.topic)).toContain("caveat");
  expect(healthy.find((line) => line.topic === "caveat")?.security).toBe(false);
  expect(securityLines(healthy)).toEqual([]);

  const widened = options({ ["BIND_HOST"]: "0.0.0.0", ["ALLOW_DEV_PUBLIC_BIND"]: "true", [AUTH_FALLBACK_TRUSTED_PEERS_KEY]: "172.16.0.0/12" });
  expect(widened.ownerPeers.widened).toBe(true);
  expect(topics(composeBootDisclaimer(widened))).toContain("caveat");

  for (const mode of LOGIN_MODES) {
    expect(topics(composeBootDisclaimer(options(mode)))).not.toContain("caveat");
  }
});

test("each standing exposure kind is exactly one security line and a warning, and a healthy box has none", () => {
  expect(securityLines(composeBootDisclaimer(options({})))).toHaveLength(0);
  const live = options({ ...OIDC, [AUTH_FALLBACK_KEY]: "owner", ["AUTH_BREAK_GLASS"]: "true" });
  const kinds: Readonly<Record<string, Options>> = {
    bind: options({}, { bindWarnings: ["hatch"] }),
    "owner peers": options({}, { ownerPeerWarnings: ["widened"] }),
    diagnostics: options({}, { diagnosticsWarnings: ["ring"] }),
    "break-glass": live,
  };
  for (const [kind, given] of Object.entries(kinds)) {
    const lines = securityLines(composeBootDisclaimer(given));
    expect(lines, kind).toHaveLength(1);
    expect(lines[0]?.level, kind).toBe("warn");
  }
  // Several warnings of one kind are one line each.
  expect(securityLines(composeBootDisclaimer(options({}, { diagnosticsWarnings: ["ring", "token"] })))).toHaveLength(2);
});

test("break-glass is an exposure only for a login mode that also lets the owner in without a credential", () => {
  const live = options({ ...OIDC, [AUTH_FALLBACK_KEY]: "owner", ["AUTH_BREAK_GLASS"]: "true" });
  expect(live.breakGlass).toBe(true);
  expect(securityLines(composeBootDisclaimer(live))).toHaveLength(1);
  // Controls: each missing ingredient takes the line away, so the one above is the gate firing.
  expect(securityLines(composeBootDisclaimer({ ...live, authFallback: "deny" }))).toHaveLength(0);
  expect(securityLines(composeBootDisclaimer({ ...live, breakGlass: false }))).toHaveLength(0);
  expect(securityLines(composeBootDisclaimer({ ...live, authMode: "single-user" satisfies AuthMode }))).toHaveLength(0);
});

test("a forward-header box with its unsigned path closed warns, but a closed door is not an exposure", () => {
  const closed = composeBootDisclaimer(options({ [AUTH_MODE_KEY]: "forward-header", [AUTH_FALLBACK_KEY]: "deny" }, { forwardHeaderUnsignedClosed: true }));
  expect(closed.filter((line) => line.level === "warn")).toHaveLength(1);
  expect(securityLines(closed)).toHaveLength(0);
  const open = composeBootDisclaimer(options({ [AUTH_MODE_KEY]: "forward-header", [AUTH_FALLBACK_KEY]: "deny" }));
  expect(open.filter((line) => line.level === "warn")).toHaveLength(0);
});
