// The e2e OIDC issuer satisfies the real openid-client code grant, trusted only through the server child's own
// NODE_EXTRA_CA_CERTS, and it refuses a replayed code and a client that does not trust its certificate.
import type { ExecException } from "node:child_process";
import { execFile } from "node:child_process";
import { execPath } from "node:process";
import { expect, test } from "@orb/testkit/tooling";
import { OS_ASSIGNED_PORT } from "@orb/tooling/floor/host/ports";
import { z } from "zod";
import { ensureIssuerTls, stageIssuerIdentity, startOidcIssuer } from "./oidc-issuer.ts";

const CLIENT = { clientId: "e2e-oidc-client", clientSecret: "e2e-oidc-secret-insecure" } as const;
const IDENTITY = { sub: "e2e-joiner-sub", preferredUsername: "joiner", email: "joiner@e2e.invalid" } as const;
const REDIRECT_URI = "http://127.0.0.1:1/api/auth/oidc/callback";
const CHILD_TIMEOUT_MS = 60_000;
const grantResultSchema = z.object({ claims: z.record(z.string(), z.unknown()), replay: z.string() });

// The grant the server's OIDC routes run, in a child whose only trust for the issuer is its launch environment.
const GRANT = `
const client = await import("openid-client");
const issuer = new URL(process.argv[1]);
const [clientId, clientSecret, redirectUri] = process.argv.slice(2);
const config = await client.discovery(issuer, clientId, clientSecret);
const verifier = client.randomPKCECodeVerifier();
const state = client.randomState();
const nonce = client.randomNonce();
const authorize = client.buildAuthorizationUrl(config, {
  redirect_uri: redirectUri, scope: "openid profile email", state, nonce,
  code_challenge: await client.calculatePKCECodeChallenge(verifier), code_challenge_method: "S256",
});
const consent = await fetch(authorize, { redirect: "manual" });
const callback = new URL(consent.headers.get("location"));
const checks = { pkceCodeVerifier: verifier, expectedState: state, expectedNonce: nonce };
const tokens = await client.authorizationCodeGrant(config, callback, checks);
const replay = await client.authorizationCodeGrant(config, callback, checks).then(() => "accepted", (error) => error.error ?? error.code ?? String(error));
console.log(JSON.stringify({ claims: tokens.claims(), replay }));
`;

interface GrantRun {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** The child's exit code; a kill or a spawn failure has none. */
function exitStatus(error: ExecException | null): number | null {
  if (error === null) {
    return 0;
  }
  return typeof error.code === "number" ? error.code : null;
}

// Asynchronous on purpose: the issuer answers from this process's event loop, which a synchronous child would block.
function grant(repoRoot: string, issuerUrl: string, trust: readonly string[]): Promise<GrantRun> {
  const args = [...trust, execPath, "--input-type=module", "--eval", GRANT, issuerUrl, CLIENT.clientId, CLIENT.clientSecret, REDIRECT_URI];
  return new Promise((resolve) => {
    execFile("env", args, { cwd: repoRoot, encoding: "utf8", timeout: CHILD_TIMEOUT_MS }, (error, stdout, stderr) => {
      resolve({ status: exitStatus(error), stdout, stderr });
    });
  });
}

test("the real openid-client grant completes against the issuer and its code is single-use", { timeout: CHILD_TIMEOUT_MS * 3 }, async ({
  scratch,
  repoRoot,
}) => {
  const tls = ensureIssuerTls(scratch);
  await using issuer = await startOidcIssuer({ port: OS_ASSIGNED_PORT, tls, ...CLIENT });
  await stageIssuerIdentity(issuer.url, IDENTITY, tls.cert);

  const trusted = await grant(repoRoot, issuer.url, [`NODE_EXTRA_CA_CERTS=${tls.certPath}`]);
  expect(trusted.stderr).toBe("");
  const { claims, replay } = grantResultSchema.parse(JSON.parse(trusted.stdout));
  expect([claims["iss"], claims["aud"], claims["sub"], claims["preferred_username"], claims["email"]]).toEqual([
    issuer.url,
    CLIENT.clientId,
    IDENTITY.sub,
    IDENTITY.preferredUsername,
    IDENTITY.email,
  ]);
  expect(replay).toBe("invalid_grant");

  const untrusted = await grant(repoRoot, issuer.url, ["-u", "NODE_EXTRA_CA_CERTS"]);
  expect(untrusted.status).not.toBe(0);
  expect(untrusted.stderr).toMatch(/self[- ]signed|certificate/iu);
});

test("the issuer certificate is minted once and reused while it is valid", ({ scratch }) => {
  const first = ensureIssuerTls(scratch);
  expect(ensureIssuerTls(scratch).cert).toBe(first.cert);
});
