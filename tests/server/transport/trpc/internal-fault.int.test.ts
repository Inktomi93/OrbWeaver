// An invariant tripwire thrown inside a procedure answers a fixed 500 whose body carries none of its text, and the
// transport logs it once at error with the tripwire as the cause.
// @subject packages/server/src/transport/trpc/error-mapping.ts
// @subject packages/server/src/transport/trpc/trpc.ts

import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { DomainInternalFaultError } from "@orb/kit/errors";
import { classifyDomainError } from "@orb/server/transport/trpc";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { vi } from "vitest";
import { z } from "zod";

const INTERNAL_DETAIL = "declared space dim 768, embedder returned 512";
const LOG_SCAN_LIMIT = 500;
const logRecordSchema = z.looseObject({ level: z.string(), err: z.looseObject({ message: z.string() }).optional() });
const responseSchema = z.looseObject({ error: z.looseObject({ message: z.string(), data: z.looseObject({ code: z.string() }) }) });

class TripwireError extends DomainInternalFaultError {}

test("a tripwire classifies as an internal server error that carries none of its own text", () => {
  const tripwire = new TripwireError(INTERNAL_DETAIL);
  const classified = classifyDomainError(tripwire);
  expect(classified).toMatchObject({ code: "INTERNAL_SERVER_ERROR", cause: tripwire });
  expect(present(classified).message).not.toContain(INTERNAL_DETAIL);
});

test("a procedure that hits a tripwire answers 500 without its text and logs it once at error", async () => {
  await using root = await createServerHarness({
    logLevel: "warn",
    physicalPeer: () => "127.0.0.1",
    env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
  });
  const tripwireErrors = (): number =>
    root.observability
      .logLines(LOG_SCAN_LIMIT)
      .map((line) => logRecordSchema.parse(JSON.parse(line)))
      .filter((record) => record.level === "error" && record.err?.message.includes(INTERNAL_DETAIL) === true).length;

  const healthy = await root.http.request("/api/trpc/tag.listTags");
  expect(healthy.status).toBe(200);
  await healthy.arrayBuffer();
  expect(tripwireErrors()).toBe(0);

  const listTags = vi.spyOn(root.services.tag, "listTags").mockRejectedValue(new TripwireError(INTERNAL_DETAIL));
  try {
    const response = await root.http.request("/api/trpc/tag.listTags");
    const body = await response.text();
    expect(response.status).toBe(500);
    expect(responseSchema.parse(JSON.parse(body)).error.data.code).toBe("INTERNAL_SERVER_ERROR");
    expect(body).not.toContain(INTERNAL_DETAIL);
    expect(tripwireErrors()).toBe(1);
  } finally {
    listTags.mockRestore();
  }
});
