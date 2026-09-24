// `loginFixtureUser` against a loopback server that answers the login form with the exact `Set-Cookie`
// shapes the app writes: a mint under the transport's name plus a `Max-Age=0` clear of the other name.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { loginFixtureUser } from "../../../../tooling/src/snap/ops/fixture.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const HTTP_MINT = "orb_session_insecure=tok-http; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax";
const HTTPS_MINT = "__Host-orb_session=tok-https; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Lax";
const HTTPS_CLEAR = "__Host-orb_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax";
const HTTP_CLEAR = "orb_session_insecure=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax";

/** Serve one login response carrying `setCookies`, run `loginFixtureUser` against it, then close. */
async function loginAgainst(setCookies: readonly string[]): Promise<Awaited<ReturnType<typeof loginFixtureUser>>> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "set-cookie": [...setCookies], "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    return await loginFixtureUser(`http://127.0.0.1:${String(port)}`, "owner", "owner-dev-pass");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("a login that only CLEARS a session name minted nothing, and is refused", async () => {
  expect(await loginAgainst([HTTPS_CLEAR])).toEqual({ error: 'login for "owner" returned no session cookie' });
});

test("a plain-http login yields the minted insecure cookie, not the clear beside it", async () => {
  expect(await loginAgainst([HTTP_MINT, HTTPS_CLEAR])).toEqual({ cookie: HTTP_MINT });
});

test("an https login yields the minted __Host- cookie, whatever order the clear arrives in", async () => {
  expect(await loginAgainst([HTTP_CLEAR, HTTPS_MINT])).toEqual({ cookie: HTTPS_MINT });
});
