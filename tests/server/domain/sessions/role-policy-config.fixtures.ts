// A forward-header root under a given role policy and the header identity it admits.

import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, authMeSchema, FORWARD_AUTH_TRUSTED_PROXIES_KEY } from "@orb/contracts/identity";
import type { SessionsRolePolicyConfig } from "@orb/server/domain/sessions";
import { expect } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, createTestEnv } from "@orb/testkit/node/composed";

function rootForConfig(rolePolicyConfig: SessionsRolePolicyConfig): Promise<ServerTestHarness> {
  return createServerHarness({
    rolePolicyConfig,
    env: { [AUTH_MODE_KEY]: "forward-header", [AUTH_FALLBACK_KEY]: "deny", [FORWARD_AUTH_TRUSTED_PROXIES_KEY]: "127.0.0.1/32" },
    physicalPeer: () => "127.0.0.1",
  });
}

export function rootForPolicy(policy: Partial<SessionsRolePolicyConfig> = {}): Promise<ServerTestHarness> {
  return rootForConfig({ ...createTestEnv(), ...policy });
}

export function headerIdentity(groups: string, handle = "policy-member", subject = "policy-member-subject"): Headers {
  return new Headers({ "x-authentik-username": handle, "x-authentik-uid": subject, "x-authentik-groups": groups });
}

export async function me(root: Pick<ServerTestHarness, "http">, headers: Headers): Promise<ReturnType<typeof authMeSchema.parse>> {
  const response = await root.http.request("/api/auth/me", { headers });
  expect(response.status).toBe(200);
  return authMeSchema.parse(await response.json());
}
