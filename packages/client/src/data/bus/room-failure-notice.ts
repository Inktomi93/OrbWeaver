// What a `roomFailed` frame says to the person, keyed on the tRPC code the server classified the room's fault as
// (`STREAM_ERROR_CODES`). A permanent refusal says so and offers no retry; a transient one says to try again. A
// code with no wording of its own keeps the server's sentence, which the transport only lets through as copy
// written for the reader.

import type { StreamErrorCode } from "@orb/contracts/stream";

const ROOM_FORBIDDEN_NOTICE = "You don't have permission to open this room.";
const ROOM_NOT_FOUND_NOTICE = "This room doesn't exist, or you can't open it.";
const ROOM_UNAVAILABLE_NOTICE = "This room is briefly unavailable. Try again in a moment.";
const ROOM_RATE_LIMITED_NOTICE = "Too many rooms are opening at once. Wait a moment, then try again.";

export function roomFailureNotice(code: StreamErrorCode, message: string): string {
  switch (code) {
    case "FORBIDDEN":
      return ROOM_FORBIDDEN_NOTICE;
    case "NOT_FOUND":
      return ROOM_NOT_FOUND_NOTICE;
    case "SERVICE_UNAVAILABLE":
      return ROOM_UNAVAILABLE_NOTICE;
    case "TOO_MANY_REQUESTS":
      return ROOM_RATE_LIMITED_NOTICE;
    case "BAD_REQUEST":
    case "CONFLICT":
    case "PRECONDITION_FAILED":
    case "INTERNAL_SERVER_ERROR":
      return message;
    default:
      throw new Error("Unreachable room failure code", { cause: code satisfies never });
  }
}
