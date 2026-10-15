// Cookie bytes stay Node-owned; only native HTTP responses describe the admitted source identity.
import { authConfigSchema } from "@orb/contracts/auth-config";
import type { Principal } from "@orb/contracts/identity";
import { authMeSchema, viewerViewSchema } from "@orb/contracts/identity";
import { z } from "zod";
import type { CorpusCookieIdentity } from "../iso/corpus.ts";
import { corpusCookieIdentitySchema } from "../iso/corpus.ts";
import type { ServerTestHarness } from "./server.ts";

/** Observe the same native cookie over HTTP; expected identity is a fixture check, not a Principal mint. */
export async function captureCorpusCookieIdentity(root: ServerTestHarness, expected: Principal, cookie: string): Promise<CorpusCookieIdentity> {
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
  if (identity.viewer.userId !== expected.userId || identity.viewer.handle !== expected.handle || identity.viewer.globalRole !== expected.role) {
    throw new Error("Corpus cookie does not admit the expected viewer");
  }
  return identity;
}
