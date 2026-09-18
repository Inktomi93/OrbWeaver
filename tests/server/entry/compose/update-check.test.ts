// entry/compose/update-check — the upstream-head probe behind Settings → About's "check for updates".
// Locks the REQUEST it makes and the failure-reason mapping without a live network:
//   • the host allowlist is EXACT (this op can never become a general-purpose fetcher),
//   • a User-Agent is sent (GitHub refuses anonymous requests without one — required, not polish),
//   • a 200 payload → the head, with the sha shortened the same way the local one is,
//   • 403/429 → a "rate-limited, try again" reason, not "unreachable" (different human action),
//   • a throw (offline / egress denial / deadline) → an offline reason, and never a throw of our own,
//   • a reshaped or non-JSON payload → a named refusal, NEVER a guessed sha.
// The last one is the point of the whole op: every arm that cannot answer says so, because the verdict
// layer above turns a missing reason into a verdict that looks like "you are current".

import { createProbeUpstreamHead, parseUpstream } from "@orb/server/entry/compose";
import type { SafeFetchOptions, SafeFetchResult } from "@orb/server/infra/network";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const SHA = "f00dcafe1234567890abcdef1234567890abcdef";
const PAYLOAD = JSON.stringify({ sha: SHA, commit: { committer: { date: "2026-09-17T12:00:00Z" } } });

function result(over: { status?: number; body?: string; dispose?: () => void }): SafeFetchResult {
  return {
    status: over.status ?? 200,
    headers: new Headers(),
    contentType: "application/json",
    dispose: over.dispose ?? ((): void => undefined),
    bytes: (): Promise<Uint8Array> => Promise.resolve(new TextEncoder().encode(over.body ?? PAYLOAD)),
  };
}

describe("createProbeUpstreamHead", () => {
  test("a 200 commit payload becomes the head, with the sha shortened to the same 12 the local one uses", async () => {
    const probe = createProbeUpstreamHead({ localVersion: () => "0.4.1", fetchImpl: () => Promise.resolve(result({})) });
    expect(await probe()).toEqual({ ok: true, head: { commit: SHA, short: "f00dcafe1234", committedAt: "2026-09-17T12:00:00Z" } });
  });

  test("the request pins api.github.com EXACTLY and carries a User-Agent GitHub will accept", async () => {
    let seen: { url: string; options: SafeFetchOptions } | null = null;
    const probe = createProbeUpstreamHead({
      localVersion: () => "0.4.1",
      fetchImpl: (url, options) => {
        seen = { url, options };
        return Promise.resolve(result({}));
      },
    });
    await probe();

    const call = seen as { url: string; options: SafeFetchOptions } | null;
    expect(call?.url).toBe("https://api.github.com/repos/Inktomi93/orbweaver/commits/main");
    // An exact host list, never the ANY_HOST escape: there is no caller input here to justify one.
    expect(call?.options.allowedHosts).toEqual(["api.github.com"]);
    expect(call?.options.method).toBe("GET");
    expect(call?.options.headers?.["user-agent"]).toContain("Orbweaver/0.4.1");
  });

  test("a rate-limited 403 says SO — 'try again in a few minutes', not 'unreachable'", async () => {
    const probe = createProbeUpstreamHead({ localVersion: () => "0.4.1", fetchImpl: () => Promise.resolve(result({ status: 403 })) });
    const outcome = await probe();
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? "" : outcome.reason).toContain("rate-limiting");
  });

  test("a non-2xx response is DISPOSED — an abandoned body must not leak its pinned Agent", async () => {
    let disposed = false;
    const probe = createProbeUpstreamHead({
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
    await probe();
    expect(disposed).toBe(true);
  });

  test("an egress throw (offline, private-range denial, deadline) becomes a reason — the op never throws", async () => {
    const probe = createProbeUpstreamHead({ localVersion: () => "0.4.1", fetchImpl: () => Promise.reject(new Error("getaddrinfo ENOTFOUND")) });
    const outcome = await probe();
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? "" : outcome.reason).toContain("offline");
  });
});

describe("parseUpstream", () => {
  test("a RESHAPED payload refuses rather than yielding an undefined sha that would render as 'behind'", () => {
    expect(parseUpstream(JSON.stringify({ object: { sha: SHA } }))).toEqual({
      ok: false,
      reason: "GitHub's answer was not the commit payload this check expects",
    });
  });

  test("an HTML error page (a captive portal, a proxy) refuses", () => {
    expect(parseUpstream("<html>nope</html>").ok).toBe(false);
  });

  test("a payload with no committer date still answers — the DATE is optional, the sha is not", () => {
    expect(parseUpstream(JSON.stringify({ sha: SHA, commit: {} }))).toEqual({
      ok: true,
      head: { commit: SHA, short: "f00dcafe1234", committedAt: null },
    });
  });
});
