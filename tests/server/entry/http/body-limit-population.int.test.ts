// @subject packages/server/src/entry/http/app.ts
import type { AuthMode } from "@orb/contracts/identity";
import { AUTH_MODES } from "@orb/contracts/identity";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { NATIVE_OIDC_SETTINGS } from "@orb/testkit/node/helpers";
import {
  BACKCHANNEL_ROUTE,
  BUNDLE_ROUTE,
  bodyRequest,
  CSRF_HEADERS,
  DEBUG_ROUTE,
  FRAME_ROUTES,
  INTAKE_ROUTES,
  LOCAL_AUTH_ROUTES,
  LOGOUT_ROUTE,
  observedBody,
  PENDING_ROUTES,
  PLUGIN_DELETE_ROUTE,
  REQUEST_CHUNK_BYTES,
} from "./_body-limit-inputs.ts";

const MUTATIONS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const COMMON = [...INTAKE_ROUTES, ...FRAME_ROUTES, DEBUG_ROUTE];
const COMMON_KEYS = [...COMMON.map(({ path }) => `POST ${path}`), `POST ${BUNDLE_ROUTE}`, `POST ${LOGOUT_ROUTE}`, `DELETE ${PLUGIN_DELETE_ROUTE}`];
// Native ALL rows are actual global/debug middleware and the separately JSON-guarded, capped tRPC mount.
const MIDDLEWARE_PATHS = ["/*", "/api/trpc/*", "/api/_debug/*"].sort();

function mountedMutations(root: Pick<ServerTestHarness, "http">): readonly string[] {
  const routes = root.http.routes;
  expect(routes.length).toBeGreaterThan(0);
  const all = routes.filter(({ method }) => method === "ALL");
  expect(all.length).toBeGreaterThan(0);
  expect([...new Set(all.map(({ path }) => path))].sort()).toEqual(MIDDLEWARE_PATHS);
  expect(all.some(({ path }) => path === "/api/trpc/*")).toBe(true);
  return [...new Set(routes.filter(({ method }) => MUTATIONS.has(method)).map(({ method, path }) => `${method} ${path}`))].sort();
}

for (const mode of AUTH_MODES) {
  for (const backchannel of mode === "oidc" ? [false, true] : [false]) {
    test(`actual native body-limit population: ${mode}, backchannel=${backchannel}`, async () => {
      await using root = await createServerHarness({
        // The parse refuses `deny` under `single-user`, so that pairing alone stays on the overlay.
        ...(mode === "single-user" ? { authConfig: { mode, fallback: "deny" } } : { env: { ["AUTH_MODE"]: mode, ["AUTH_FALLBACK"]: "deny" } }),
        // biome-ignore lint/style/useNamingConvention: this is the validated production OIDC startup key.
        oidc: { ...NATIVE_OIDC_SETTINGS, OIDC_BACKCHANNEL_LOGOUT: backchannel },
      });
      const extras = {
        local: LOCAL_AUTH_ROUTES,
        oidc: [...PENDING_ROUTES, ...(backchannel ? [BACKCHANNEL_ROUTE] : [])],
        "forward-header": [],
        "single-user": [],
      } satisfies Record<AuthMode, readonly (typeof LOCAL_AUTH_ROUTES)[number][]>;
      const extra = extras[mode];
      const expected = [...COMMON_KEYS, ...extra.map(({ path }) => `POST ${path}`)].sort();
      expect(mountedMutations(root)).toEqual(expected);
      expect(COMMON.length + extra.length).toBeGreaterThan(0);
      const absent = [...(mode === "local" ? PENDING_ROUTES : LOCAL_AUTH_ROUTES), ...(backchannel ? [] : [BACKCHANNEL_ROUTE])];
      for (const path of absent) {
        const response = await root.http.request(path.path, { method: "POST", headers: CSRF_HEADERS });
        expect(response.status).toBe(404);
        await response.arrayBuffer();
      }
    });
  }
}

for (const framing of ["declared", "streamed"] as const) {
  test(`every mounted buffered common intake refuses ${framing} oversized bytes before its tail`, async () => {
    await using root = await createServerHarness({
      env: { ["AUTH_MODE"]: "single-user", ["AUTH_FALLBACK"]: "owner" },
      physicalPeer: () => "127.0.0.1",
    });
    for (const route of COMMON) {
      using input = observedBody(framing === "declared" ? 0 : route.bytes);
      const headers = new Headers(CSRF_HEADERS);
      headers.set("content-type", route.path.includes("frame") || route === DEBUG_ROUTE ? "application/json" : "multipart/form-data; boundary=orb-cap");
      if (framing === "declared") {
        headers.set("content-length", String(route.bytes));
      }
      const response = await bodyRequest(root, route.path, input.body, headers);
      expect(response.status, route.path).toBe(413);
      await response.arrayBuffer();
      const minimum = route === DEBUG_ROUTE ? 1 : route.bytes;
      expect(input.snapshot(), route.path).toMatchObject({ tripwire: false });
      expect(input.snapshot().bytes, route.path).toBeGreaterThanOrEqual(framing === "declared" ? 0 : minimum);
      expect(input.snapshot().bytes, route.path).toBeLessThanOrEqual(framing === "declared" ? 0 : route.bytes);
      expect(input.snapshot().pulls, route.path).toBe(Math.ceil(input.snapshot().bytes / REQUEST_CHUNK_BYTES));
    }
  });

  test(`local helper-transitive JSON and password routes refuse ${framing} oversized bytes`, async () => {
    await using root = await createServerHarness({ env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "deny" } });
    for (const route of LOCAL_AUTH_ROUTES) {
      using input = observedBody(framing === "declared" ? 0 : route.bytes);
      const headers = new Headers(CSRF_HEADERS);
      headers.set("content-type", "application/json");
      if (framing === "declared") {
        headers.set("content-length", String(route.bytes));
      }
      const response = await bodyRequest(root, route.path, input.body, headers);
      expect(response.status, route.path).toBe(413);
      await response.arrayBuffer();
      expect(input.snapshot(), route.path).toMatchObject({ bytes: framing === "declared" ? 0 : route.bytes, tripwire: false });
    }
  });

  test(`native OIDC pending and backchannel routes refuse ${framing} oversized bytes without issuer work`, async () => {
    await using root = await createServerHarness({
      env: { ["AUTH_MODE"]: "oidc", ["AUTH_FALLBACK"]: "deny" },
      oidc: NATIVE_OIDC_SETTINGS,
    });
    for (const route of [...PENDING_ROUTES, BACKCHANNEL_ROUTE]) {
      using input = observedBody(framing === "declared" ? 0 : route.bytes);
      const headers = new Headers(CSRF_HEADERS);
      headers.set("content-type", "application/json");
      if (framing === "declared") {
        headers.set("content-length", String(route.bytes));
      }
      const response = await bodyRequest(root, route.path, input.body, headers);
      expect(response.status, route.path).toBe(413);
      await response.arrayBuffer();
      expect(input.snapshot(), route.path).toMatchObject({ bytes: framing === "declared" ? 0 : route.bytes, tripwire: false });
    }
  });
}
