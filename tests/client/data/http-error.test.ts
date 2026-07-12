// `throwHttpError` (data/http-error.ts) — the ONE non-OK-response error for the raw-`fetch` upload seams
// (import-bundle/import-characters/upload-asset). It exists to STOP the pre-C18 bug where two of the three
// hand-rolled variants discarded the server's `{error}` body and threw a bare status line. So the behavior
// worth pinning is exactly that: the server's body reaches the caller as the message suffix, the empty-body
// path degrades to NO suffix (not `— `), and a body-read that REJECTS never masks the real HTTP failure with
// its own throw (the `.catch(() => "")` — a torn/aborted stream must still surface the status, not a
// TypeError). Uses real `Response` (a web global under Node/es2025) — never a hand-mock, which would erase the
// exact `.text()`/status/statusText wiring this seam is here to get right.

import { throwHttpError } from "@orb/client/data";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

// No trailing ` — ` separator on the empty-body path.
const ENDS_AT_STATUS_TEXT = /Internal Server Error$/u;

describe("throwHttpError", () => {
  test("threads the server's body into the message so the caller sees the real error, not a bare status", async () => {
    const response = new Response(JSON.stringify({ error: "book already exists" }), {
      status: 409,
      statusText: "Conflict",
    });

    await expect(throwHttpError("import-bundle", response)).rejects.toThrow(
      `import-bundle: 409 Conflict — ${JSON.stringify({ error: "book already exists" })}`,
    );
  });

  test("an empty body degrades to NO suffix (not a dangling ` — `)", async () => {
    // 204-style / bodyless failure: the em-dash separator must not appear with nothing after it.
    const response = new Response(null, { status: 500, statusText: "Internal Server Error" });

    await expect(throwHttpError("upload-asset", response)).rejects.toThrow(
      "upload-asset: 500 Internal Server Error",
    );
    // Guard the boundary precisely — no trailing separator on the empty path.
    await expect(throwHttpError("upload-asset", response)).rejects.toThrow(ENDS_AT_STATUS_TEXT);
  });

  test("a body-read that REJECTS still surfaces the status — the .catch masks the read error, not the HTTP failure", async () => {
    // A torn/aborted body stream: `response.text()` rejects. The seam must degrade to no-suffix and STILL
    // throw the status line, never let the read's TypeError escape and hide the real non-OK response.
    const response = new Response("unused", { status: 502, statusText: "Bad Gateway" });
    Object.defineProperty(response, "text", {
      value: () => Promise.reject(new Error("stream torn")),
    });

    await expect(throwHttpError("import-characters", response)).rejects.toThrow(
      "import-characters: 502 Bad Gateway",
    );
  });

  test("the prefix + status + statusText are all preserved verbatim from the response", async () => {
    const response = new Response("nope", { status: 403, statusText: "Forbidden" });

    const err = await throwHttpError("upload-asset", response).catch((e: unknown) => e as Error);

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("upload-asset: 403 Forbidden — nope");
  });
});
