// A JSON door answers a body that is not JSON with its own coded 400, never a server error. Each control sends the
// same route a well-formed body its schema refuses, so the refusal is the parse's and not a gate in front of it.
// @subject packages/server/src/entry/http/auth-routes.ts
// @subject packages/server/src/foundation/observability/debug/routes.ts
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { forEachNonEmpty } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { NATIVE_OIDC_SETTINGS } from "@orb/testkit/node/helpers";
import { CSRF_HEADERS, DEBUG_ROUTE, LOCAL_AUTH_ROUTES, PENDING_ROUTES } from "./_body-limit-inputs.ts";

const NOT_JSON = '{"handle": "half-a-body",';
const WRONG_SHAPE = JSON.stringify({ unexpected: true });

async function post(root: Pick<ServerTestHarness, "http">, path: string, body: string): Promise<{ readonly status: number; readonly body: unknown }> {
  const response = await root.http.request(path, { method: "POST", headers: { ...CSRF_HEADERS, "content-type": "application/json" }, body });
  return { status: response.status, body: await response.json() };
}

const SIGNUP_ROUTES = LOCAL_AUTH_ROUTES.filter(({ path }) => path.startsWith("/api/auth/signup")).map(({ path }) => path);
const [, PENDING_CONFIRM_ROUTE = ""] = PENDING_ROUTES.map(({ path }) => path);

forEachNonEmpty(SIGNUP_ROUTES, "signup routes", (path) => {
  test(`local ${path} answers a body that is not JSON with invalid_request`, async () => {
    await using root = await createServerHarness({ env: { [AUTH_MODE_KEY]: "local", [AUTH_FALLBACK_KEY]: "deny" } });
    // The signup doors exist only on a box that admits more than one human.
    await root.services.settings.updateAppSettings({ principal: await root.principalFor(root.ownerId), partial: { localMultiUser: true } });
    const refused = await post(root, path, NOT_JSON);
    expect(refused).toEqual(await post(root, path, WRONG_SHAPE));
    expect(refused).toEqual({ status: 400, body: { error: "invalid_request" } });
  });
});

test("the OIDC pending-join confirm answers a body that is not JSON with invalid_request", async () => {
  await using root = await createServerHarness({ env: { [AUTH_MODE_KEY]: "oidc", [AUTH_FALLBACK_KEY]: "deny" }, oidc: NATIVE_OIDC_SETTINGS });
  expect(PENDING_CONFIRM_ROUTE).toMatch(/confirm$/u);
  const refused = await post(root, PENDING_CONFIRM_ROUTE, NOT_JSON);
  expect(refused).toEqual(await post(root, PENDING_CONFIRM_ROUTE, WRONG_SHAPE));
  expect(refused).toEqual({ status: 400, body: { error: "invalid_request" } });
});

test("the bug-report writer answers a body that is not JSON with its schema refusal", async () => {
  await using root = await createServerHarness({ env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" }, physicalPeer: () => "127.0.0.1" });
  const refused = await post(root, DEBUG_ROUTE.path, NOT_JSON);
  expect(refused).toEqual({ status: 400, body: { error: "invalid bug report", issues: expect.any(String) } });
  // Control: a JSON null, the value a body that is not JSON stands for, earns the identical refusal.
  expect(refused).toEqual(await post(root, DEBUG_ROUTE.path, "null"));
});
