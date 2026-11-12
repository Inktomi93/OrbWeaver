// A tripwire thrown inside a subscription ends the stream with a typed terminal frame that carries none of its text, and
// the transport logs it once at error with the tripwire as the cause: the subscription wrapper's own log line.
// @subject packages/server/src/transport/trpc/subscriptions.ts
// @subject packages/server/src/transport/trpc/routers/chat.ts

import { CSRF_HEADER } from "@orb/contracts/identity";
import { DomainInternalFaultError } from "@orb/kit/errors";
import { expect, test } from "@orb/testkit/node";
import { vi } from "vitest";
import { z } from "zod";
import { openRoom } from "./stream/_held-room.ts";

const FAULT_DETAIL = "the draft's tripwire detail";
const LOG_SCAN_LIMIT = 2000;
const REPORTED_TIME_ZONE = "UTC";
const logRecordSchema = z.looseObject({ level: z.string(), event: z.string().optional(), err: z.looseObject({ message: z.string() }).optional() });
const errorFrameSchema = z.looseObject({ __subscriptionError: z.literal(true), code: z.string() });

class TripwireError extends DomainInternalFaultError {}

async function* faultingDraft(): AsyncGenerator<{ readonly delta: string }> {
  yield await Promise.reject(new TripwireError(FAULT_DETAIL));
}

test("a subscription that hits a tripwire ends with a terminal error frame without its text and logs it once at error", async () => {
  await using room = await openRoom();
  const impersonate = vi.spyOn(room.root.services.chat, "impersonateStream").mockReturnValue(faultingDraft());
  try {
    const address = new URL("http://localhost/api/trpc/chat.impersonateStream");
    address.searchParams.set("input", JSON.stringify({ chatId: room.chatId, timeZone: REPORTED_TIME_ZONE }));
    const response = await room.root.http.request(address, { headers: { cookie: room.hostSeat.cookie, accept: "text/event-stream", [CSRF_HEADER]: "1" } });
    const body = await response.text();

    expect(body).not.toContain(FAULT_DETAIL);
    const frames = body
      .split("\n")
      .filter((line) => line.startsWith("data: {"))
      .map((line) => errorFrameSchema.safeParse(JSON.parse(line.slice("data: ".length))))
      .flatMap((parsed) => (parsed.success ? [parsed.data] : []));
    expect(frames.map(({ code }) => code)).toEqual(["INTERNAL_SERVER_ERROR"]);

    const invariantRecords = room.root.observability
      .logLines(LOG_SCAN_LIMIT)
      .map((line) => logRecordSchema.parse(JSON.parse(line)))
      .filter((record) => record.event === "trpc.invariant" && record.err?.message.includes(FAULT_DETAIL) === true);
    expect(invariantRecords.map(({ level }) => level)).toEqual(["error"]);
  } finally {
    impersonate.mockRestore();
  }
});
