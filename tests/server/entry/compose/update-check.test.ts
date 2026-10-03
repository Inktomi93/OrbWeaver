// entry/compose/update-check — the per-channel upstream probes behind Settings → This install's "check for updates".
// Locks the REQUEST each makes and the failure-reason mapping without a live network:
//   • the host allowlist is EXACT (this op can never become a general-purpose fetcher),
//   • a User-Agent is sent (GitHub refuses anonymous requests without one — required, not polish),
//   • main asks for main's head commit, stable for the latest release, and each 200 payload becomes its arm,
//   • 403/429 → a "rate-limited, try again" reason, not "unreachable" (different human action),
//   • a 404 on the release lookup → "no stable release yet", its own answer,
//   • a throw (offline / egress denial / deadline) → an offline reason, and never a throw of our own,
//   • a reshaped or non-JSON payload, or a tag that is not v<major>.<minor>.<patch> → a named refusal.
// The last one is the point of the whole op: every arm that cannot answer says so, because the verdict
// layer above turns a missing reason into a verdict that looks like "you are current".

import { createUpstreamProbes, parseLatestRelease, parseMainHead } from "@orb/server/entry/compose";
import type { SafeFetchOptions, SafeFetchResult } from "@orb/server/infra/network";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const SHA = "f00dcafe1234567890abcdef1234567890abcdef";
const COMMIT_PAYLOAD = JSON.stringify({ sha: SHA, commit: { committer: { date: "2026-09-17T12:00:00Z" } } });
/** The release payload in its own snake_case JSON, written as text. */
function releaseBody(tag: string, publishedAt: string | null = null): string {
  return `{"tag_name":${JSON.stringify(tag)},"published_at":${JSON.stringify(publishedAt)},"name":${JSON.stringify(tag)}}`;
}
const RELEASE_PAYLOAD = releaseBody("v0.2.0", "2026-10-01T12:00:00Z");

function result(over: { status?: number; body?: string; dispose?: () => void }): SafeFetchResult {
  return {
    status: over.status ?? 200,
    headers: new Headers(),
    contentType: "application/json",
    dispose: over.dispose ?? ((): void => undefined),
    bytes: (): Promise<Uint8Array> => Promise.resolve(new TextEncoder().encode(over.body ?? COMMIT_PAYLOAD)),
  };
}

interface Seen {
  readonly url: string;
  readonly options: SafeFetchOptions;
}

describe("createUpstreamProbes", () => {
  test("main: a 200 commit payload becomes main's head, with the sha shortened to the same 12 the local one uses", async () => {
    const probes = createUpstreamProbes({ localVersion: () => "0.4.1", fetchImpl: () => Promise.resolve(result({})) });
    expect(await probes.main()).toEqual({
      ok: true,
      upstream: { channel: "main", commit: SHA, short: "f00dcafe1234", committedAt: "2026-09-17T12:00:00Z" },
    });
  });

  test("stable: a 200 release payload becomes the latest version, its v prefix removed", async () => {
    const probes = createUpstreamProbes({ localVersion: () => "0.1.0", fetchImpl: () => Promise.resolve(result({ body: RELEASE_PAYLOAD })) });
    expect(await probes.stable()).toEqual({ ok: true, upstream: { channel: "stable", version: "0.2.0", publishedAt: "2026-10-01T12:00:00Z" } });
  });

  test("each channel asks its own URL, pins api.github.com EXACTLY and carries a User-Agent GitHub will accept", async () => {
    const seen: Seen[] = [];
    const probes = createUpstreamProbes({
      localVersion: () => "0.4.1",
      fetchImpl: (url: string, options: SafeFetchOptions) => {
        seen.push({ url, options });
        return Promise.resolve(result({}));
      },
    });
    await probes.main();
    await probes.stable();

    expect(seen.map((call) => call.url)).toEqual([
      "https://api.github.com/repos/Inktomi93/orbweaver/commits/main",
      "https://api.github.com/repos/Inktomi93/orbweaver/releases/latest",
    ]);
    for (const call of seen) {
      // An exact host list, never the ANY_HOST escape: there is no caller input here to justify one.
      expect(call.options.allowedHosts).toEqual(["api.github.com"]);
      expect(call.options.method).toBe("GET");
      expect(call.options.headers?.["user-agent"]).toContain("Orbweaver/0.4.1");
    }
  });

  test("a rate-limited 403 says SO — 'try again in a few minutes', not 'unreachable'", async () => {
    const probes = createUpstreamProbes({ localVersion: () => "0.4.1", fetchImpl: () => Promise.resolve(result({ status: 403 })) });
    const outcome = await probes.main();
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? "" : outcome.reason).toContain("rate-limiting");
  });

  test("a 404 on the release lookup means no stable release exists yet, and says so", async () => {
    const probes = createUpstreamProbes({ localVersion: () => "0.0.0", fetchImpl: () => Promise.resolve(result({ status: 404 })) });
    expect(await probes.stable()).toEqual({ ok: false, reason: "no stable release has been published on GitHub yet" });
  });

  test("a 404 on main's head is NOT read as 'no release' — it is GitHub's plain answer", async () => {
    const probes = createUpstreamProbes({ localVersion: () => "0.4.1", fetchImpl: () => Promise.resolve(result({ status: 404 })) });
    expect(await probes.main()).toEqual({ ok: false, reason: "GitHub answered 404" });
  });

  test("a non-2xx response is DISPOSED — an abandoned body must not leak its pinned Agent", async () => {
    let disposed = false;
    const probes = createUpstreamProbes({
      localVersion: () => "0.4.1",
      fetchImpl: () =>
        Promise.resolve(
          result({
            status: 500,
            dispose: (): void => {
              disposed = true;
            },
          }),
        ),
    });
    await probes.stable();
    expect(disposed).toBe(true);
  });

  test("an egress throw (offline, private-range denial, deadline) becomes a reason — the op never throws", async () => {
    const probes = createUpstreamProbes({ localVersion: () => "0.4.1", fetchImpl: () => Promise.reject(new Error("getaddrinfo ENOTFOUND")) });
    const outcome = await probes.stable();
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? "" : outcome.reason).toContain("offline");
  });
});

describe("parseMainHead", () => {
  test("a RESHAPED payload refuses rather than yielding an undefined sha that would render as 'behind'", () => {
    expect(parseMainHead(JSON.stringify({ object: { sha: SHA } }))).toEqual({
      ok: false,
      reason: "GitHub's answer was not the commit payload this check expects",
    });
  });

  test("an HTML error page (a captive portal, a proxy) refuses", () => {
    expect(parseMainHead("<html>nope</html>").ok).toBe(false);
  });

  test("a payload with no committer date still answers — the DATE is optional, the sha is not", () => {
    expect(parseMainHead(JSON.stringify({ sha: SHA, commit: {} }))).toEqual({
      ok: true,
      upstream: { channel: "main", commit: SHA, short: "f00dcafe1234", committedAt: null },
    });
  });
});

describe("parseLatestRelease", () => {
  test("a tag that is not v<major>.<minor>.<patch> is refused rather than ordered by guess", () => {
    for (const tag of ["0.2.0", "v0.2", "v0.2.0-rc.1", "release-0.2.0"]) {
      expect(parseLatestRelease(releaseBody(tag)).ok).toBe(false);
    }
  });

  test("a release with no publication date still answers — the DATE is optional, the version is not", () => {
    expect(parseLatestRelease(releaseBody("v0.2.0"))).toEqual({
      ok: true,
      upstream: { channel: "stable", version: "0.2.0", publishedAt: null },
    });
  });

  test("a RESHAPED payload refuses", () => {
    expect(parseLatestRelease(JSON.stringify({ name: "v0.2.0" })).ok).toBe(false);
  });
});
