// backends/kit/fetch-json — THE ERROR-BODY HYGIENE of the second upstream-prose path.
//
// `fetchJson` and `providerErrorFromHttp` are the only two places a reflected upstream body becomes a
// `ProviderError.message`, and that message reaches the tRPC wire (it is what the transport classifier may
// carry) and a DURABLE sink (the #1373 credential strike-out logs it as a `securityEvent`). Until
// 2026-09-20 only ONE of them was sanitized: this one ran `redactSecretsFromText` and dropped the raw
// remainder into the message — no 500-char cap (the bound was the 64 KiB READ), no control-char strip, no
// markup strip. An upstream HTML 502 page rode to the caller whole.
//
// These arms are the planted control for that finding, in the direction that matters: what a hostile /
// noisy upstream body becomes. They drive the REAL `fetchJson` through its injected `fetch`, so there is
// no mock of the thing under test.

import { fetchJson } from "../../../../packages/inference/src/backends/kit/fetch-json.ts";
import { NO_PROVIDER_SECRETS, resolvedScrubSet } from "../../../../packages/inference/src/backends/kit/sanitize.ts";
import { ProviderError } from "../../../../packages/inference/src/contract/errors.ts";
import { expect, test } from "../../../support/fixtures.ts";

const SERVER_ERROR = 502;
const UNAUTHORIZED = 401;
const OK = 200;
/** `sanitizeApiError`'s cap plus its truncation marker — the bound every provider message now obeys. */
const SANITIZED_CEILING = 600;

/** A `fetch` that answers once with the given status + body. */
function answering(status: number, body: string, contentType = "text/html"): typeof fetch {
  return (): Promise<Response> => Promise.resolve(new Response(body, { status, headers: { "content-type": contentType } }));
}

async function failureFrom(fetchImpl: typeof fetch, secrets = NO_PROVIDER_SECRETS): Promise<ProviderError> {
  const caught: unknown = await fetchJson({ fetch: fetchImpl, url: "https://upstream.example/v1/models", secrets, label: "endpoint models" }).catch(
    (err: unknown) => err,
  );
  if (!(caught instanceof ProviderError)) {
    throw new Error(`expected a ProviderError, got ${String(caught)}`);
  }
  return caught;
}

test("an upstream HTML error page reaches the message as TEXT — markup stripped, control chars dropped, capped", async () => {
  // The shape a reverse proxy in front of a self-hosted endpoint actually returns: a full HTML document,
  // far past the cap, with a stray control char in it.
  const page = `<html><head><title>502</title></head><body><h1>Bad Gateway</h1><p>upstream\u0007 ${"filler ".repeat(200)}</p></body></html>`;
  const error = await failureFrom(answering(SERVER_ERROR, page));

  expect(error.message).not.toContain("<html>");
  expect(error.message).not.toContain("<h1>");
  expect(error.message).not.toContain("\u0007");
  // The words survive — this is sanitization, not deletion: an operator still reads what the upstream said.
  expect(error.message).toContain("Bad Gateway");
  expect(error.message.length).toBeLessThan(SANITIZED_CEILING);
  // The classification still rides (the hygiene change must not cost the typed facts).
  expect(error.kind).toBe("server");
  expect(error.apiErrorStatus).toBe(SERVER_ERROR);
});

test("a reflected credential is scrubbed BY VALUE before anything mangles it (#1809 order)", async () => {
  const secret = "sk-or-v1-0123456789abcdef0123456789abcdef";
  const secrets = resolvedScrubSet({ credential: { secret }, transport: null });
  const error = await failureFrom(answering(UNAUTHORIZED, `{"error":{"message":"invalid key ${secret}"}}`, "application/json"), secrets);

  expect(error.message).not.toContain(secret);
  expect(error.kind).toBe("auth_failed");
});

test("the message stays bounded even when the upstream body is far past the READ cap", async () => {
  // The read bound is 64 KiB; the MESSAGE bound is `sanitizeApiError`'s cap. Before the fix the message
  // inherited the read bound, so a body like this rode to the caller in full.
  const error = await failureFrom(answering(SERVER_ERROR, "A".repeat(200_000)));
  expect(error.message.length).toBeLessThan(SANITIZED_CEILING);
});

test("POSITIVE CONTROL — a 2xx JSON body is untouched by any of this and parses normally", async () => {
  const result = await fetchJson({
    fetch: answering(OK, '{"data":[{"id":"some-model"}]}', "application/json"),
    url: "https://upstream.example/v1/models",
    secrets: NO_PROVIDER_SECRETS,
    label: "endpoint models",
  });
  expect(result.status).toBe(OK);
  expect(result.json).toEqual({ data: [{ id: "some-model" }] });
});
