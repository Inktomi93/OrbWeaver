// @subject packages/client/src/data/trpc.ts
// @subject packages/client/src/lib/request-refused.ts
// A tRPC call the server's HTTP edge turns away without JSON reaches the caller as a typed refusal, and a file import
// checks its size against the same limit before it sends. The 413 and the 403 come from the composed server's own mount
// and allowlist through the production client; the answers only a proxy in front of the app can give are scripted at
// the fetch edge.

import { createTrpcClient } from "@orb/client/data";
import type { RefusalKind } from "@orb/client/lib";
import { readTextWithin, refuseOversizeFiles, requestRefusalOf } from "@orb/client/lib";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { IMPORT_FILE_TEXT_MAX_CHARS, IMPORT_MAX_TOTAL_BYTES, TRPC_BODY_MAX_BYTES } from "@orb/contracts/uploads";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { isTRPCClientError } from "@trpc/client";
import { afterEach, vi } from "vitest";

const CLIENT_URL = "http://127.0.0.1:1/api/trpc";
const LISTED_PEER = "203.0.113.7";
const UNLISTED_PEER = "198.51.100.9";
const FORBIDDEN = 403;
const PAYLOAD_TOO_LARGE = 413;
const TOO_MANY_REQUESTS = 429;
const BAD_GATEWAY = 502;
const UNAUTHORIZED = 401;
const UNSUPPORTED_MEDIA = 415;
const TEAPOT = 418;
const MEDIA_HTML = { "content-type": "text/html" };

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Send every request the client makes to the composed root's own mount, as the browser's fetch reaches the server. */
function serveFrom(root: Awaited<ReturnType<typeof createServerHarness>>): void {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => Promise.resolve(root.http.request(new Request(input, init))));
}

function previewWith(fileText: string): Promise<unknown> {
  return createTrpcClient(CLIENT_URL).preset.previewFile.mutate({ fileText, fileName: "probe.json" });
}

async function refusalOfCall(call: Promise<unknown>): Promise<NonNullable<ReturnType<typeof requestRefusalOf>>> {
  const failure = await call.then(
    () => undefined,
    (error: unknown) => error,
  );
  const refusal = requestRefusalOf(failure);
  if (refusal === undefined) {
    throw new Error(`the call did not fail as a refusal: ${String(failure)}`);
  }
  return refusal;
}

test("a body past the mount cap reaches the caller as a too-large refusal that names the mount's limit", async () => {
  await using root = await createServerHarness({
    env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
    physicalPeer: () => "127.0.0.1",
  });
  serveFrom(root);

  const answered = await previewWith("{}");
  expect(answered).toMatchObject({ ok: false });

  const refusal = await refusalOfCall(previewWith("x".repeat(TRPC_BODY_MAX_BYTES + 1)));
  expect(refusal.kind).toBe("tooLarge");
  expect(refusal.status).toBe(PAYLOAD_TOO_LARGE);
  expect(refusal.limit).toBe(TRPC_BODY_MAX_BYTES);
});

test("a caller outside the IP allowlist reaches the caller as a forbidden refusal, and a listed one is not refused at the edge", async () => {
  let peer = UNLISTED_PEER;
  await using root = await createServerHarness({
    env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner", ["IP_ALLOWLIST"]: "203.0.113.0/24" },
    physicalPeer: () => peer,
  });
  serveFrom(root);

  const refusal = await refusalOfCall(previewWith("{}"));
  expect(refusal.kind).toBe("forbidden");
  expect(refusal.status).toBe(FORBIDDEN);

  // A listed peer passes the allowlist and meets the next gate: the owner fallback admits only a loopback peer, so
  // this one is turned away by a tRPC answer, which is JSON and carries no edge refusal.
  peer = LISTED_PEER;
  const admitted = await previewWith("{}").then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(isTRPCClientError(admitted)).toBe(true);
  expect(requestRefusalOf(admitted)).toBeUndefined();
});

// Every kind a status can name, but the one the server itself answers above. The record is exhaustive by type, so a new
// kind with no scripted answer fails `tsc`.
const PROXY_ANSWERS: Readonly<Record<Exclude<RefusalKind, "tooLarge" | "forbidden">, () => Response>> = {
  signedOut: () => new Response("", { status: UNAUTHORIZED }),
  unsupportedMedia: () => new Response("", { status: UNSUPPORTED_MEDIA }),
  rateLimited: () => new Response("", { status: TOO_MANY_REQUESTS }),
  unreachable: () => new Response("<html>bad gateway</html>", { status: BAD_GATEWAY, headers: MEDIA_HTML }),
  redirected: () => Object.defineProperty(new Response("<html>sign in</html>", { headers: MEDIA_HTML }), "redirected", { value: true }),
  unexpected: () => new Response("", { status: TEAPOT }),
};

test("an answer that is not JSON reaches the caller as the kind its status names, with the raw status kept in the detail", async () => {
  for (const [kind, answer] of Object.entries(PROXY_ANSWERS)) {
    vi.stubGlobal("fetch", (): Promise<Response> => Promise.resolve(answer()));
    const refusal = await refusalOfCall(previewWith("{}"));
    expect(refusal.kind, kind).toBe(kind);
    expect(refusal.detail, kind).toContain("HTTP");
    expect(refusal.message, kind).not.toContain("HTTP");
  }
});

test("a picked file over a limit is refused before any request, and a file within it is read", async () => {
  const cap = IMPORT_FILE_TEXT_MAX_CHARS.regexScript;
  expect(await readTextWithin(new File(["x".repeat(cap)], "within.json"), cap)).toHaveLength(cap);

  const failure = await readTextWithin(new File(["x".repeat(cap + 1)], "over.json"), cap).then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(requestRefusalOf(failure)).toMatchObject({ kind: "tooLarge", status: null, limit: cap });

  const halves = [new File(["x".repeat(IMPORT_MAX_TOTAL_BYTES / 2)], "a.png"), new File(["x".repeat(IMPORT_MAX_TOTAL_BYTES / 2 + 1)], "b.png")];
  expect(refuseOversizeFiles(halves.slice(0, 1), IMPORT_MAX_TOTAL_BYTES)).toBeUndefined();
  expect(refuseOversizeFiles(halves, IMPORT_MAX_TOTAL_BYTES)).toMatchObject({ kind: "tooLarge", limit: IMPORT_MAX_TOTAL_BYTES });
});
