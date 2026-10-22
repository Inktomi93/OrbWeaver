// Cookie bytes stay Node-owned; HTTP proves admission, while internal account reads retain their resolved caller.
import { authConfigSchema } from "@orb/contracts/auth-config";
import type { Principal, ViewerView } from "@orb/contracts/identity";
import { authMeSchema, CSRF_HEADER, viewerViewSchema } from "@orb/contracts/identity";
import type { Handle } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { readSessionCookie } from "@orb/server/entry/auth";
import { z } from "zod";
import type { CorpusCookieIdentity, CorpusWire } from "../iso/corpus.ts";
import { corpusCookieIdentitySchema } from "../iso/corpus.ts";
import { seedLoginBuckets } from "./factories/sessions.ts";
import type { ServerTestHarness } from "./server.ts";

type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;

/** A fresh scenario account never adopts or resets a copied human's handle. */
export async function seedCorpusAccount(root: ServerTestHarness): ReturnType<ServerTestHarness["principalFor"]> {
  let handle: Handle;
  do {
    handle = brandedId<Handle>().parse(`c-${root.ids.next("")}`);
  } while ((await root.app.sessions.resolveHandle(handle)) !== null);
  const userId = await root.app.sessions.ensureUser(handle);
  return await root.principalFor(userId);
}

export interface CapturedAccountViews {
  readonly viewer: Awaited<ReturnType<Caller["sessions"]["me"]>>;
  readonly diagnostics: Awaited<ReturnType<Caller["bugReportDiagnostics"]>>;
}

/** Keep the caller-bound viewer and privileged diagnostics together without retaining request credentials. */
export async function captureAccountViews(caller: Caller): Promise<CapturedAccountViews> {
  return { viewer: await caller.sessions.me(), diagnostics: await caller.bugReportDiagnostics() };
}

/** Observe the same native cookie over HTTP; expected identity is a fixture check, not a Principal mint. */
export async function captureCorpusCookieIdentity(root: ServerTestHarness, expected: ViewerView, cookie: string): Promise<CorpusCookieIdentity> {
  const address = await root.listen();
  const origin = `http://${address.address}:${String(address.port)}`;
  const read = async (path: string): Promise<Response> => {
    // The native relay tell denies loopback-owner fallback without changing valid cookie admission.
    const response = await fetch(new URL(path, origin), { headers: { cookie, forwarded: "" } });
    if (!response.ok) {
      await response.arrayBuffer();
      throw new Error(`Corpus cookie identity request refused (${response.status})`);
    }
    return response;
  };
  const authConfig = authConfigSchema.parse(await (await read("/api/auth/config")).json());
  const authMe = authMeSchema.parse(await (await read("/api/auth/me")).json());
  const envelope = z.object({ result: z.object({ data: viewerViewSchema }) }).parse(await (await read("/api/trpc/sessions.me")).json());
  const identity = corpusCookieIdentitySchema.parse({ authConfig, authMe, viewer: envelope.result.data });
  if (identity.viewer.userId !== expected.userId || identity.viewer.handle !== expected.handle || identity.viewer.globalRole !== expected.globalRole) {
    throw new Error("Corpus cookie does not admit the expected viewer");
  }
  return identity;
}

export interface CapturedCookieAuth {
  readonly auth: CorpusWire["auth"];
  readonly identity: Awaited<ReturnType<typeof captureCorpusCookieIdentity>>;
  readonly cookie: string;
  readonly loginBuckets: Awaited<ReturnType<typeof seedLoginBuckets>>["buckets"];
  readonly secrets: readonly string[];
}

/** Capture the actual HTTP cookie path for Node corpus readers. */
export async function captureCookieAuth(root: ServerTestHarness, viewer: Principal, password: string): Promise<CapturedCookieAuth> {
  const caller = await root.internalCallerFor(root.ownerId);
  const expected = await (await root.internalCallerFor(viewer.userId)).sessions.me();
  await caller.admin.resetPassword({ userId: viewer.userId, password });
  const anonymousConfigResponse = await root.http.request("/api/auth/config");
  if (!anonymousConfigResponse.ok) {
    throw new Error(`synthetic corpus auth-config request failed (${anonymousConfigResponse.status})`);
  }
  const anonymousConfig = authConfigSchema.parse(await anonymousConfigResponse.json());
  if (anonymousConfig.mode !== "local") {
    throw new Error("synthetic corpus cookie capture requires the actual local-auth server configuration");
  }
  const anonymousMeResponse = await root.http.request("/api/auth/me");
  if (!anonymousMeResponse.ok) {
    throw new Error(`synthetic corpus anonymous identity request failed (${anonymousMeResponse.status})`);
  }
  const anonymousMe = authMeSchema.parse(await anonymousMeResponse.json());
  if (anonymousMe.authenticated) {
    throw new Error("synthetic corpus anonymous identity request unexpectedly admitted a principal");
  }
  const { response: login, buckets: loginBuckets } = await seedLoginBuckets(root, [
    "/api/auth/login",
    {
      method: "POST",
      headers: { [CSRF_HEADER]: "1", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ handle: viewer.handle, password }),
    },
  ]);
  if (!login.ok) {
    throw new Error(`synthetic corpus viewer login failed (${login.status})`);
  }
  await login.arrayBuffer();
  const cookie = login.headers
    .getSetCookie()
    .map((line) => line.split(";", 1).join(""))
    .join("; ");
  if (cookie === "") {
    throw new Error("synthetic corpus viewer login returned no session cookie");
  }
  const signedInMeResponse = await root.http.request("/api/auth/me", { headers: { cookie } });
  if (!signedInMeResponse.ok) {
    throw new Error(`synthetic corpus signed-in identity request failed (${signedInMeResponse.status})`);
  }
  const signedInMe = authMeSchema.parse(await signedInMeResponse.json());
  if (!signedInMe.authenticated || signedInMe.handle !== expected.handle || signedInMe.role !== expected.globalRole) {
    throw new Error("synthetic corpus login cookie did not admit the actual seeded viewer");
  }
  const signedInConfigResponse = await root.http.request("/api/auth/config", { headers: { cookie } });
  if (!signedInConfigResponse.ok) {
    throw new Error(`synthetic corpus signed-in auth-config request failed (${signedInConfigResponse.status})`);
  }
  const signedInConfig = authConfigSchema.parse(await signedInConfigResponse.json());
  return {
    auth: { anonymousConfig, anonymousMe, signedInConfig, signedInMe },
    identity: await captureCorpusCookieIdentity(root, expected, cookie),
    cookie,
    loginBuckets,
    secrets: [password, cookie, readSessionCookie(new Headers({ cookie }), "http")].filter((value) => value !== null),
  };
}
