// @subject packages/server/src/entry/http/security-headers.ts
// Only an own-policy reply's policy leaves its route. A policy header a handler set on the request context, under any
// spelling the lint cannot see, never rides out: a refusal and a fault keep the whole app header set, and a document or
// resource keeps its reply's policy. A context copy on a refusal used to make the middleware read the response as the
// route's own and skip every app header.

import { expect, test } from "@orb/testkit/node";
import type { Context } from "hono";
import { Hono } from "hono";
import type { OwnPolicyReply, SecurityHeadersOptions } from "#server/entry/http/security-headers.ts";
import { OWN_POLICY_ROUTES, securityHeaders } from "#server/entry/http/security-headers.ts";

const POLICY = "content-security-policy";
const FRAME_OPTIONS = "x-frame-options";
const RESOURCE_POLICY = "cross-origin-resource-policy";
// A wide-open policy a handler could prepare through a computed name the native lint does not read.
const PLANTED = "default-src * 'unsafe-inline'";
const REPLY_POLICY = "default-src 'none'; sandbox";
// What the app header set promises every response it covers; the specification, stated here.
const APP_REQUIRED_DIRECTIVES = ["default-src 'self'", "object-src 'none'", "frame-ancestors 'none'"] as const;
const DENY = "DENY";
const SAME_ORIGIN = "same-origin";
const OK = 200;
const UNAUTHORIZED = 401;
const SERVER_ERROR = 500;
const OPTIONS: SecurityHeadersOptions = { dev: false, allowExternalMedia: () => false, trustedProxies: [] };
const ROUTE = OWN_POLICY_ROUTES.cardFrameDocument;
const URL_PATH = `${ROUTE.prefix}0f${ROUTE.suffix}`;

interface Served {
  readonly status: number;
  readonly policy: string | null;
  readonly frameOptions: string | null;
  readonly resourcePolicy: string | null;
}

type Answer = () => OwnPolicyReply;

const refusal: Answer = () => ({ kind: "refusal", status: UNAUTHORIZED });
const documentReply: Answer = () => ({ kind: "document", status: OK, body: "<p>doc</p>", headers: {}, policy: REPLY_POLICY });
const resourceReply: Answer = () => ({ kind: "resource", status: OK, body: new Uint8Array([1, 2, 3]), headers: {}, policy: REPLY_POLICY });

// The planted handler: it prepares the policy header on the context, optionally reads `c.res` (which moves prepared
// headers onto the context's response), then answers or throws.
function plant(c: Context, readsResponse: boolean): void {
  c.header(POLICY, PLANTED);
  const onContext = readsResponse ? c.res.headers.get(POLICY) : PLANTED;
  expect(onContext).toBe(PLANTED);
}

async function serve(answer: Answer | "throw", prepares: { readonly plant: boolean; readonly readsResponse: boolean }): Promise<Served> {
  const app = new Hono();
  const security = securityHeaders(OPTIONS);
  app.use("*", security.middleware);
  app.onError((_error, c) => c.text("Internal Server Error", SERVER_ERROR));
  security.registerOwnPolicyRoute(app, "cardFrameDocument", (c) => {
    if (prepares.plant) {
      plant(c, prepares.readsResponse);
    }
    if (answer === "throw") {
      return Promise.reject(new Error("planted handler fault"));
    }
    return Promise.resolve(answer());
  });
  const response = await app.request(URL_PATH);
  await response.arrayBuffer();
  return {
    status: response.status,
    policy: response.headers.get(POLICY),
    frameOptions: response.headers.get(FRAME_OPTIONS),
    resourcePolicy: response.headers.get(RESOURCE_POLICY),
  };
}

const directivesOf = (policy: string | null): readonly string[] => (policy ?? "").split(";").map((directive) => directive.trim());

function expectAppHeaders(served: Served, status: number): void {
  expect(served.status).toBe(status);
  expect(directivesOf(served.policy)).toEqual(expect.arrayContaining([...APP_REQUIRED_DIRECTIVES]));
  expect(served.frameOptions).toBe(DENY);
  expect(served.resourcePolicy).toBe(SAME_ORIGIN);
}

test.for([false, true])("a refusal leaves under the whole app header set even when the handler prepared a policy (reads c.res: %s)", async (readsResponse) => {
  const control = await serve(refusal, { plant: false, readsResponse: false });
  expectAppHeaders(control, UNAUTHORIZED);
  const planted = await serve(refusal, { plant: true, readsResponse });
  expectAppHeaders(planted, UNAUTHORIZED);
  expect(planted).toEqual(control);
});

test.for([false, true])("a fault after a prepared policy leaves under the whole app header set (reads c.res: %s)", async (readsResponse) => {
  const control = await serve("throw", { plant: false, readsResponse: false });
  expectAppHeaders(control, SERVER_ERROR);
  expect(await serve("throw", { plant: true, readsResponse })).toEqual(control);
});

test.for([
  ["document", false, documentReply],
  ["document", true, documentReply],
  ["resource", false, resourceReply],
  ["resource", true, resourceReply],
] as const)("a %s carries its reply's policy, never one the handler prepared (reads c.res: %s)", async ([, readsResponse, answer]) => {
  const control = await serve(answer, { plant: false, readsResponse: false });
  expect(control).toEqual({ status: OK, policy: REPLY_POLICY, frameOptions: null, resourcePolicy: null });
  expect(await serve(answer, { plant: true, readsResponse })).toEqual(control);
});
