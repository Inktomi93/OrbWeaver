// @subject packages/server/src/entry/app.ts
// A preset file larger than a mebibyte reaches the preset import procedures through the tRPC mount. The mount's body
// cap bounds a hostile body; the procedure's own input schema is the limit a person meets.

import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { CSRF_HEADERS } from "../../entry/http/_body-limit-inputs.ts";

const BYTES_PER_MIB = 1024 * 1024;

function presetFileOf(bytes: number): string {
  return JSON.stringify({ temperature: 1, prompts: [{ identifier: "main", name: "Main", role: "system", content: "x".repeat(bytes) }] });
}

async function previewStatus(bytes: number): Promise<{ readonly status: number; readonly contentType: string }> {
  await using root = await createServerHarness({
    env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
    physicalPeer: () => "127.0.0.1",
  });
  const response = await root.http.request("/api/trpc/preset.previewFile", {
    method: "POST",
    headers: { ...CSRF_HEADERS, "content-type": "application/json" },
    body: JSON.stringify({ fileText: presetFileOf(bytes), fileName: "large.json" }),
  });
  await response.arrayBuffer();
  return { status: response.status, contentType: response.headers.get("content-type") ?? "" };
}

test("a two mebibyte preset file is previewed, and a body past the mount cap is still refused", async () => {
  const large = await previewStatus(2 * BYTES_PER_MIB);
  expect(large.status).toBe(200);
  expect(large.contentType).toContain("json");

  const hostile = await previewStatus(40 * BYTES_PER_MIB);
  expect(hostile.status).toBe(413);
});
