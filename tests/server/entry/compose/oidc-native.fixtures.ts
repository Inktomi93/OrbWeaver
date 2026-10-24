// A real HTTP root behind a scripted OIDC issuer, and the cookie and token-endpoint helpers its suites share.

import { authModeHarnessOptions } from "@orb/testkit/node/auth";
import type { ServerHarnessOptions, ServerTestHarness, UnclaimedServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { createNativeIssuer } from "@orb/testkit/node/helpers";
import { NATIVE_OIDC_SETTINGS as SETTINGS } from "@orb/testkit/node/helpers";
import type { JWTPayload } from "jose";
import { vi } from "vitest";

// biome-ignore lint/style/useNamingConvention: preferred_username is the issuer's actual configured OIDC claim.
export const MEMBER = { sub: "native-member-subject", preferred_username: "oidc-member" } satisfies JWTPayload;
export const LOGOUT_TOKEN_PARAM = "logout_token";
export const LOGOUT_EVENT = "http://schemas.openid.net/event/backchannel-logout";

export type HttpRoot = Pick<ServerTestHarness, "http" | "db">;
export type Issuer = Awaited<ReturnType<typeof createNativeIssuer>>;

export function rootFor(
  issuer: Issuer,
  oidc: Partial<NonNullable<ServerHarnessOptions["oidc"]>> = {},
  edges: Pick<ServerHarnessOptions, "clock" | "timers" | "db" | "rolePolicyConfig"> = {},
): Promise<UnclaimedServerTestHarness> {
  const wiring = authModeHarnessOptions("oidc", issuer);
  return createServerHarness({
    ...edges,
    ...wiring,
    ownerId: null,
    oidc: { ...SETTINGS, ...oidc },
  });
}

export const ID_TOKEN_SECRET = "callback-thrown-secret-must-not-reflect";

export const SESSION_COOKIE_PATTERN = /^(?:__Host-)?orb_session(?:_insecure)?=/u;

export const BINDING_COOKIE_PATTERN = /^(?:__Host-)?orb_oidc_state(?:_insecure)?=/u;

export function scriptTokenEndpoint(issuer: Issuer, answer: (native: () => Promise<Response>) => Promise<Response>): void {
  const execute = issuer.fetch;
  vi.spyOn(issuer, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    return new URL(request.url).pathname === "/token" ? await answer(() => execute(request)) : await execute(request);
  });
}

export function writes(response: Response, pattern: RegExp): string[] {
  return response.headers.getSetCookie().filter((line) => pattern.test(line));
}
