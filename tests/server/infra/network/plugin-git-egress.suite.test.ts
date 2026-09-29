// The isomorphic-git HTTP adapter is only safe if it actually routes every smart-HTTP request through
// safeFetch. This pins the sharp redirect case at the adapter door: public first hop, private second hop,
// refused before the redirected socket.

import { __setEgressResolverForTest, guardedGitHttp } from "@orb/server/infra/network";
import { afterEach, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const PUBLIC_ADDR = "93.184.216.34";

afterEach(() => {
  __setEgressResolverForTest(null);
  vi.unstubAllGlobals();
});

test("guardedGitHttp revalidates a redirect hop and refuses a private destination before its socket", async () => {
  __setEgressResolverForTest((host) => Promise.resolve(host === "internal.test" ? ["10.0.0.5"] : [PUBLIC_ADDR]));
  const calls: string[] = [];
  vi.stubGlobal("fetch", (url: URL | string) => {
    calls.push(String(url));
    return Promise.resolve(Response.redirect("https://internal.test/git-upload-pack", 302));
  });

  await expect(guardedGitHttp.request({ url: "https://public.test/info/refs?service=git-upload-pack" })).rejects.toMatchObject({
    name: "EgressBlockedError",
    reason: "private-address",
  });
  expect(calls).toEqual(["https://public.test/info/refs?service=git-upload-pack"]);
});

test("guardedGitHttp refuses plain HTTP before transport", async () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  await expect(guardedGitHttp.request({ url: "http://public.test/info/refs?service=git-upload-pack" })).rejects.toMatchObject({ reason: "scheme" });
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("guardedGitHttp refuses URL-embedded credentials before transport", async () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  await expect(guardedGitHttp.request({ url: "https://user:secret@public.test/info/refs?service=git-upload-pack" })).rejects.toMatchObject({
    reason: "credentials",
  });
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("guardedGitHttp strips Authorization before following a cross-origin redirect", async () => {
  __setEgressResolverForTest(() => Promise.resolve([PUBLIC_ADDR]));
  const sent: Record<string, string>[] = [];
  vi.stubGlobal("fetch", (url: URL | string, init?: RequestInit) => {
    sent.push({ ...(init?.headers as Record<string, string>) });
    return Promise.resolve(
      String(url).startsWith("https://public.test")
        ? Response.redirect("https://other.test/git-upload-pack", 302)
        : new Response(new Uint8Array([1]), { status: 200 }),
    );
  });
  await guardedGitHttp.request({
    url: "https://public.test/info/refs?service=git-upload-pack",
    headers: { authorization: "Basic secret", "x-git-protocol": "version=2" },
  });
  expect(sent[0]?.["authorization"]).toBe("Basic secret");
  expect(sent[1]?.["authorization"]).toBeUndefined();
  expect(sent[1]?.["x-git-protocol"]).toBe("version=2");
});
