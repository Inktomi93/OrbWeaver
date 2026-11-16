// @subject packages/client/src/data/trpc.ts
// @subject packages/client/src/lib/request-refused.ts
// A tRPC call the server's HTTP edge turns away without JSON reaches the caller as a typed refusal, and a file import
// checks its size against the same limit before it sends. The 413 and the 403 come from the composed server's own mount
// and allowlist through the production client; the answers only a proxy in front of the app can give are scripted at
// the fetch edge.

import { createAppQueryClient, createTrpcClient } from "@orb/client/data";
import { readTextWithin, refuseOversizeFiles, requestRefusalOf } from "@orb/client/lib";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { IMPORT_FILE_TEXT_MAX_CHARS, TRPC_BODY_MAX_BYTES } from "@orb/contracts/uploads";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { isTRPCClientError } from "@trpc/client";
import { afterEach, vi } from "vitest";

// The kinds a refusal carries, read off the production reader's own result.
type RefusalKind = NonNullable<ReturnType<typeof requestRefusalOf>>["kind"];

const CLIENT_URL = "http://127.0.0.1:1/api/trpc";
const LISTED_PEER = "203.0.113.7";
const UNLISTED_PEER = "198.51.100.9";
const SMALL_CAP = 8;
// A figure with no fraction: a number, a space and a unit, with no digit after a point in front of it.
const WHOLE_FIGURE = /(?<!\d\.)\b\d+ (?:B|KB|MB|GB)\b/u;
const OK = 200;
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

// Every kind but the two the server itself answers above, each with the status the answer carries. The record is
// exhaustive by type, so a new kind with no scripted answer fails `tsc`. A 413 here has no limit header, which is how a
// proxy's differs from the app's own.
const PROXY_ANSWERS: Readonly<Record<Exclude<RefusalKind, "tooLarge" | "forbidden">, { readonly answer: () => Response; readonly status: number }>> = {
  tooLargeAtProxy: { answer: () => new Response("", { status: PAYLOAD_TOO_LARGE, headers: MEDIA_HTML }), status: PAYLOAD_TOO_LARGE },
  signedOut: { answer: () => new Response("", { status: UNAUTHORIZED }), status: UNAUTHORIZED },
  unsupportedMedia: { answer: () => new Response("", { status: UNSUPPORTED_MEDIA }), status: UNSUPPORTED_MEDIA },
  rateLimited: { answer: () => new Response("", { status: TOO_MANY_REQUESTS }), status: TOO_MANY_REQUESTS },
  unreachable: { answer: () => new Response("<html>bad gateway</html>", { status: BAD_GATEWAY, headers: MEDIA_HTML }), status: BAD_GATEWAY },
  redirected: {
    answer: () => Object.defineProperty(new Response("<html>sign in</html>", { headers: MEDIA_HTML }), "redirected", { value: true }),
    status: OK,
  },
  unexpected: { answer: () => new Response("", { status: TEAPOT }), status: TEAPOT },
};

test("an answer that is not JSON reaches the caller as the kind its status names, and only the app's own 413 names a limit", async () => {
  for (const [kind, { answer, status }] of Object.entries(PROXY_ANSWERS)) {
    vi.stubGlobal("fetch", (): Promise<Response> => Promise.resolve(answer()));
    const refusal = await refusalOfCall(previewWith("{}"));
    expect(refusal.kind, kind).toBe(kind);
    expect(refusal.status, kind).toBe(status);
    // The limit is the app's to state: a refusal from in front of it carries none.
    expect(refusal.limit, kind).toBeNull();
  }
});

// A proxy's error page can be JSON of its own. It is not a tRPC envelope, so it is classified by status like any other,
// and a tRPC error envelope on the same status still reaches the link as the app's answer.
test("a JSON error page that is not a tRPC envelope is classified by its status, and a tRPC error envelope is left to the link", async () => {
  const jsonPage = (status: number): Response => Response.json({ message: "upstream failure" }, { status });
  for (const [status, kind] of [
    [BAD_GATEWAY, "unreachable"],
    [PAYLOAD_TOO_LARGE, "tooLargeAtProxy"],
    [TOO_MANY_REQUESTS, "rateLimited"],
  ] as const) {
    vi.stubGlobal("fetch", (): Promise<Response> => Promise.resolve(jsonPage(status)));
    const refusal = await refusalOfCall(previewWith("{}"));
    expect(refusal.kind, String(status)).toBe(kind);
    expect(refusal.status, String(status)).toBe(status);
  }

  vi.stubGlobal("fetch", (): Promise<Response> => Promise.resolve(Response.json([{ error: { message: "nope", code: -32_600, data: {} } }], { status: 400 })));
  const answered = await previewWith("{}").then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(isTRPCClientError(answered)).toBe(true);
  expect(requestRefusalOf(answered)).toBeUndefined();
});

test("a picked file over a limit is refused before any request, and a file within it is read", async () => {
  const cap = IMPORT_FILE_TEXT_MAX_CHARS.regexScript;
  expect(await readTextWithin(new File(["x".repeat(cap)], "within.json"), cap)).toHaveLength(cap);

  const failure = await readTextWithin(new File(["x".repeat(cap + 1)], "over.json"), cap).then(
    () => undefined,
    (error: unknown) => error,
  );
  const refusal = requestRefusalOf(failure);
  expect(refusal).toMatchObject({ kind: "tooLarge", status: null, limit: cap });
  // A cap that is not a whole number of units is told as a whole figure ("195 KB"), never with a fraction.
  expect(refusal?.message).toMatch(WHOLE_FIGURE);

  // The check sums sizes against whatever cap it is handed, so a small cap proves the sum without a 256 MiB file.
  const half = new File(["x".repeat(SMALL_CAP / 2)], "a.png");
  const halfAndOneByte = new File(["x".repeat(SMALL_CAP / 2 + 1)], "b.png");
  expect(refuseOversizeFiles([half, half], SMALL_CAP)).toBeUndefined();
  expect(refuseOversizeFiles([half, halfAndOneByte], SMALL_CAP)).toMatchObject({ kind: "tooLarge", limit: SMALL_CAP });
});

// A repeat of the same request cannot change these, so a query settles on its first answer; the rest can clear by themselves.
const SETTLES_AT_ONCE: ReadonlySet<RefusalKind> = new Set<RefusalKind>(["tooLarge", "tooLargeAtProxy", "forbidden", "signedOut", "unsupportedMedia"]);

test("a query settles on its first answer when the refusal cannot change, and is asked again when it can", async () => {
  const refusals = [await refusalOfCall(readTextWithin(new File(["xx"], "over.json"), 1))];
  for (const { answer } of Object.values(PROXY_ANSWERS)) {
    vi.stubGlobal("fetch", (): Promise<Response> => Promise.resolve(answer()));
    refusals.push(await refusalOfCall(previewWith("{}")));
  }
  const client = createAppQueryClient();
  for (const refusal of refusals) {
    let asked = 0;
    await client
      .query({
        queryKey: [refusal.kind],
        queryFn: (): Promise<never> => {
          asked += 1;
          return Promise.reject(refusal);
        },
        retryDelay: 0,
      })
      .catch(() => undefined);
    expect(asked > 1, refusal.kind).toBe(!SETTLES_AT_ONCE.has(refusal.kind));
  }
});
