// foundation/observability/memory-log — the PD-72 chat-memory log sink. `recordMemoryLog` is a thin
// `memory:true`-tagged `getLog().debug(...)` call (the recordClientError/securityEvent shape); the pino
// ring is already fed by the ringStream, so this pins the RECORD SHAPE only: the `memory:true` tag, the
// `event` string as the log MESSAGE, and structured fields spread through as log fields. `logger.debug` is
// spied directly (the client-error.test.ts / securityEvent pattern — spy a real method, never `vi.mock` a
// sibling module; `getLog()` returns the base `logger` outside a request scope).

import { logger, recordMemoryLog } from "@orb/server/foundation/observability";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

describe("recordMemoryLog", () => {
  test("logs at debug level, tagged memory:true, with the event as the log message", () => {
    const spy = vi.spyOn(logger, "debug");
    recordMemoryLog({ event: "memory.recall" });
    expect(spy).toHaveBeenCalledOnce();
    const [fields, msg] = spy.mock.calls[0] as [Record<string, unknown>, string];
    expect(fields["memory"]).toBe(true);
    expect(msg).toBe("memory.recall");
  });

  test("structured fields ride through alongside the tag (event kept as a field too)", () => {
    const spy = vi.spyOn(logger, "debug");
    recordMemoryLog({ event: "memory.build", chatId: "chat_x", digestCount: 3 });
    const [fields] = spy.mock.calls[0] as [Record<string, unknown>, string];
    expect(fields["memory"]).toBe(true);
    expect(fields["chatId"]).toBe("chat_x");
    expect(fields["digestCount"]).toBe(3);
    expect(fields["event"]).toBe("memory.build");
  });
});
