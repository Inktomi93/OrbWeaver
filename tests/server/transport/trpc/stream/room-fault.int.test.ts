// A room pump that hits an internal fault ends its room with the room's own sentence and one error record that holds the
// cause; a pump that is refused for a modeled reason keeps its message and logs a warning, never an error.
// @subject packages/server/src/transport/trpc/stream/socket.ts

import { DomainConflictError, DomainInternalFaultError } from "@orb/kit/errors";
import { expect, test } from "@orb/testkit/node";
import { vi } from "vitest";
import { z } from "zod";
import { openDevice, openRoom } from "./_held-room.ts";

const FAULT_DETAIL = "the room's tripwire detail";
const REFUSAL_DETAIL = "the room is busy with another writer";
const LOG_SCAN_LIMIT = 2000;
const logRecordSchema = z.looseObject({ level: z.string(), err: z.looseObject({ message: z.string() }).optional() });
const procedureFaultSchema = z.looseObject({ error: z.looseObject({ message: z.string() }) });

class TripwireError extends DomainInternalFaultError {}

type Room = Awaited<ReturnType<typeof openRoom>>;

/** The levels of every record whose error carried this detail. */
function levelsFor(room: Room, detail: string): readonly string[] {
  return room.root.observability
    .logLines(LOG_SCAN_LIMIT)
    .map((line) => logRecordSchema.parse(JSON.parse(line)))
    .filter((record) => record.err?.message.includes(detail) === true)
    .map((record) => record.level);
}

/** The sentence a procedure's 500 carries, read from the same fault thrown at a procedure. */
async function procedureSentence(room: Room): Promise<string> {
  const listTags = vi.spyOn(room.root.services.tag, "listTags").mockRejectedValue(new TripwireError(FAULT_DETAIL));
  try {
    const response = await room.root.http.request("/api/trpc/tag.listTags", { headers: { cookie: room.hostSeat.cookie } });
    return procedureFaultSchema.parse(JSON.parse(await response.text())).error.message;
  } finally {
    listTags.mockRestore();
  }
}

test("a room that hits an internal fault says the room sentence, not the procedure's, and logs the cause once at error", async () => {
  await using room = await openRoom();
  const procedure = await procedureSentence(room);
  const priorFaultRecords = levelsFor(room, FAULT_DETAIL).length;
  const bounds = vi.spyOn(room.root.services.chat, "chatEventBounds").mockRejectedValue(new TripwireError(FAULT_DETAIL));
  const device = await openDevice(room, room.hostSeat);
  try {
    await device.attach();
    const failure = await device.waitFor(() => false).catch((error: unknown) => (error instanceof Error ? error.message : String(error)));

    expect(failure).toContain("INTERNAL_SERVER_ERROR");
    expect(failure).not.toContain(FAULT_DETAIL);
    expect(failure).not.toContain(procedure);
    expect(levelsFor(room, FAULT_DETAIL).slice(priorFaultRecords)).toEqual(["error"]);
  } finally {
    bounds.mockRestore();
    await device.close();
  }
});

test("a room refused for a modeled reason keeps its message and logs a warning, not an error", async () => {
  await using room = await openRoom();
  const bounds = vi.spyOn(room.root.services.chat, "chatEventBounds").mockRejectedValue(new DomainConflictError(REFUSAL_DETAIL));
  const device = await openDevice(room, room.hostSeat);
  try {
    await device.attach();
    const failure = await device.waitFor(() => false).catch((error: unknown) => (error instanceof Error ? error.message : String(error)));

    expect(failure).toContain("CONFLICT");
    expect(failure).toContain(REFUSAL_DETAIL);
    expect(levelsFor(room, REFUSAL_DETAIL)).toEqual(["warn"]);
  } finally {
    bounds.mockRestore();
    await device.close();
  }
});
