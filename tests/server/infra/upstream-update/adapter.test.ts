// @subject packages/server/src/infra/upstream-update/adapter.ts

import type { UpstreamFetchDeps } from "@orb/server/infra/upstream-update";
import { createUpstreamFetches, parseLatestRelease, parseMainHead } from "@orb/server/infra/upstream-update";
import { expect, test } from "@orb/testkit/node";
import { vi } from "vitest";

type FetchResult = Awaited<ReturnType<NonNullable<UpstreamFetchDeps["fetchImpl"]>>>;
const COMMIT = "1234567890abcdef1234567890abcdef12345678";
const COMMIT_BODY = JSON.stringify({ sha: COMMIT, commit: {} });
const TAG_NAME = "tag_name";
const PUBLISHED_AT = "published_at";
const RELEASE_BODY = JSON.stringify({ [TAG_NAME]: "v1.2.3", [PUBLISHED_AT]: null });

function response(body: string, status = 200): FetchResult {
  return { status, contentType: "application/json", headers: new Headers(), bytes: async () => new TextEncoder().encode(body), dispose: vi.fn() };
}

test("manual requests pin each channel URL, exact redirect-safe host, GET, content type, deadline and byte cap", async () => {
  const fetchImpl = vi
    .fn<NonNullable<UpstreamFetchDeps["fetchImpl"]>>()
    .mockResolvedValueOnce(response(COMMIT_BODY))
    .mockResolvedValueOnce(response(RELEASE_BODY));
  const probes = createUpstreamFetches({ localVersion: () => "1.2.3", fetchImpl });
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(await probes.main()).toMatchObject({ ok: true, upstream: { channel: "main", commit: COMMIT } });
  expect(await probes.stable()).toEqual({ ok: true, upstream: { channel: "stable", version: "1.2.3", publishedAt: null } });
  expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
    "https://api.github.com/repos/Inktomi93/orbweaver/commits/main",
    "https://api.github.com/repos/Inktomi93/orbweaver/releases/latest",
  ]);
  for (const [, options] of fetchImpl.mock.calls) {
    expect(options).toMatchObject({
      allowedHosts: ["api.github.com"],
      method: "GET",
      allowedContentTypes: ["application/json"],
      maxBytes: 200_000,
      deadlineMs: 8000,
    });
    expect(options.headers?.["user-agent"]).toContain("Orbweaver/1.2.3");
  }
});

test("rate limits and missing releases keep distinct reasons, and non-success bodies are disposed without reading", async () => {
  const fetchImpl = vi.fn<NonNullable<UpstreamFetchDeps["fetchImpl"]>>();
  const probes = createUpstreamFetches({ localVersion: () => "1.2.3", fetchImpl });
  for (const status of [403, 429]) {
    const res = response(COMMIT_BODY, status);
    const bytes = vi.fn(res.bytes);
    fetchImpl.mockResolvedValue({ ...res, bytes });
    expect(await probes.main()).toMatchObject({ ok: false, reason: expect.stringContaining("rate-limiting") });
    expect(res.dispose).toHaveBeenCalledOnce();
    expect(bytes).not.toHaveBeenCalled();
  }
  fetchImpl.mockResolvedValue(response(COMMIT_BODY, 404));
  expect(await probes.stable()).toEqual({ ok: false, reason: "no stable release has been published on GitHub yet" });
  expect(await probes.main()).toEqual({ ok: false, reason: "GitHub answered 404" });
});

test("transport and mid-body failures become distinct typed refusals; a following success still parses", async () => {
  const fetchImpl = vi.fn<NonNullable<UpstreamFetchDeps["fetchImpl"]>>().mockRejectedValueOnce(new Error("transport refused"));
  const probes = createUpstreamFetches({ localVersion: () => "1.2.3", fetchImpl });
  expect(await probes.main()).toEqual({ ok: false, reason: "couldn't reach GitHub — this box may be offline" });
  fetchImpl.mockResolvedValueOnce({
    ...response(COMMIT_BODY),
    bytes: () => Promise.reject(new Error("body cap")),
  });
  expect(await probes.main()).toEqual({ ok: false, reason: "GitHub's answer could not be read" });
  fetchImpl.mockResolvedValueOnce(response(COMMIT_BODY));
  expect(await probes.main()).toEqual({ ok: true, upstream: { channel: "main", commit: COMMIT, short: COMMIT.slice(0, 12), committedAt: null } });
});

test("foreign payloads and non-release tags refuse while canonical commit and release payloads parse", () => {
  expect(parseMainHead(COMMIT_BODY).ok).toBe(true);
  expect(parseLatestRelease(RELEASE_BODY).ok).toBe(true);
  expect(parseMainHead("<html>proxy</html>").ok).toBe(false);
  expect(parseMainHead(JSON.stringify({ object: { sha: COMMIT } })).ok).toBe(false);
  expect(parseLatestRelease(JSON.stringify({ name: "v1.2.3" })).ok).toBe(false);
  for (const tag of ["1.2.3", "v1.2", "v1.2.3-rc.1", "release-1.2.3"]) {
    expect(parseLatestRelease(JSON.stringify({ [TAG_NAME]: tag })).ok).toBe(false);
  }
});
