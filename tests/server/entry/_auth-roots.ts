// Real request credentials over a composed root: a password login's cookie and a JWT signed by a scripted issuer.
import type { ViewerView } from "@orb/contracts/identity";
import { authMeSchema, CSRF_HEADER, viewerViewSchema } from "@orb/contracts/identity";
import type { Handle, UserId } from "@orb/kit/ids";
import type { AppRouter } from "@orb/server";
import type { SessionsRolePolicyConfig } from "@orb/server/domain/sessions";
import { env } from "@orb/server/foundation/env";
import { expect } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { CLIENT_ID, createNativeIssuer, ISSUER } from "@orb/testkit/node/helpers";
import { createTRPCClient, httpBatchLink } from "@trpc/client";

type Root = Pick<ServerTestHarness, "http">;

const MEMBER_PASSWORD = "entry-auth-roots-password";
const ISSUER_HOST = new URL(ISSUER).hostname;
// A public address for the scripted issuer host and for the signed caller, so no loopback or proxy rule applies.
const PUBLIC_ADDRESS = "93.184.215.14";
/** The claim the forward-header verifier reads the handle from. */
export const FORWARD_USERNAME_CLAIM = "preferred_username";

/** A role policy differing from the process env only by `overrides`. */
export function policy(overrides: Partial<SessionsRolePolicyConfig>): SessionsRolePolicyConfig {
  return { ...env, ...overrides };
}

/** `sessions.me` over the mounted tRPC wire, encoded by the native client. */
export async function wireViewer(root: Root, headers: Record<string, string> = {}): Promise<ViewerView> {
  const client = createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: "http://localhost/api/trpc",
        headers,
        fetch: async (url, init) => await root.http.request(String(url), init === undefined ? undefined : { ...init, signal: init.signal ?? null }),
      }),
    ],
  });
  return viewerViewSchema.parse(await client.sessions.me.query());
}

/** The status the debug gate answers on its info route for these credentials. */
export async function debugStatus(root: Root, headers: Record<string, string> = {}, path = "/api/_debug/info"): Promise<number> {
  const response = await root.http.request(path, { headers });
  await response.arrayBuffer();
  return response.status;
}

/** Who the seam resolved this request as. */
export async function authMe(root: Root, headers: Record<string, string> = {}): Promise<ReturnType<typeof authMeSchema.parse>> {
  const response = await root.http.request("/api/auth/me", { headers });
  expect(response.status).toBe(200);
  return authMeSchema.parse(await response.json());
}

/** The live session cookie a mint wrote; the cleared other-transport name is dropped. */
export function sessionCookie(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((line) => line.split(";")[0] ?? "")
    .filter((pair) => !pair.endsWith("="))
    .join("; ");
}

/** A real local account and the cookie its real password login mints. */
export async function signedInMember(
  root: ServerTestHarness,
  handle: Handle,
  headers: Record<string, string> = {},
): Promise<{ readonly id: UserId; readonly cookie: string }> {
  const owner = await root.principalFor(root.ownerId);
  const created = await root.services.admin.createUser({ principal: owner, handle, password: MEMBER_PASSWORD });
  const login = await root.http.request("/api/auth/login", {
    method: "POST",
    headers: { [CSRF_HEADER]: "1", ...headers },
    body: new URLSearchParams({ handle, password: MEMBER_PASSWORD }),
  });
  expect(login.status).toBe(200);
  return { id: created.id, cookie: sessionCookie(login) };
}

/** The owner's real first-run claim on a local box, and the cookie it mints. */
export async function claimedOwnerCookie(root: Root): Promise<string> {
  const claimed = await root.http.request("/api/auth/first-run", {
    method: "POST",
    headers: { [CSRF_HEADER]: "1" },
    body: new URLSearchParams({ password: MEMBER_PASSWORD }),
  });
  expect(claimed.status).toBe(200);
  return sessionCookie(claimed);
}

/** A forward-header root that verifies JWTs against a scripted issuer, and the signer for that issuer. */
export async function signedForwardRoot(rolePolicyConfig: SessionsRolePolicyConfig): Promise<{
  readonly root: ServerTestHarness;
  readonly signedHeaders: (claims: Record<string, unknown>) => Promise<Record<string, string>>;
}> {
  const issuer = await createNativeIssuer();
  const root = await createServerHarness({
    rolePolicyConfig,
    physicalPeer: () => PUBLIC_ADDRESS,
    authConfig: {
      mode: "forward-header",
      fallback: "deny",
      verifyForwardJwt: true,
      jwksAllowlist: [ISSUER_HOST],
      jwtIssuer: ISSUER,
      jwtAudience: CLIENT_ID,
      forwardTrustedProxies: [],
    },
    networkExecution: {
      resolver: (hostname) => (hostname === ISSUER_HOST ? Promise.resolve([PUBLIC_ADDRESS]) : Promise.reject(new Error("unscripted JWKS host"))),
      fetch: (input, init) => issuer.fetch(input, init),
    },
  });
  return {
    root,
    signedHeaders: async (claims) => ({
      "x-authentik-jwt": await issuer.signedToken({ iss: ISSUER, aud: CLIENT_ID, ...claims }),
      "x-authentik-meta-jwks": new URL("jwks", ISSUER).href,
    }),
  };
}
