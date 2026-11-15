// `throwHttpError` — the ONE non-OK-response error for the raw-`fetch` upload seams (import-bundle,
// import-characters, upload-asset — Hono multipart/raw-body routes, not tRPC). Was hand-rolled three
// ways (a body-reading variant, and two status-text-only variants that discarded the server's `{error}`);
// this is the body-reading variant, the canonical shape (C18 — net-negative LOC, no behavior loss).

import { isFetchFailure } from "@orb/kit/fetch-failure";
import type { JsonValue } from "@orb/kit/json";
import { parseJsonText } from "@orb/kit/json";

/** A non-OK upload response. `status` lets a caller choose its words without reading the message. */
export class HttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/** Whether a raw-fetch request failed as a request: on the network or its abort signal, or with a non-OK or malformed
 *  answer ({@link HttpError}). Any other throw is a fault in the caller's own code. */
export function isHttpFailure(error: unknown): boolean {
  return error instanceof HttpError || isFetchFailure(error);
}

/** A raw-fetch response body as JSON, or `undefined` when it dies mid-read or is not JSON text. Any other fault
 *  rejects. */
export async function readJsonBody(response: Response): Promise<JsonValue | undefined> {
  try {
    return parseJsonText(await response.text());
  } catch (error) {
    if (!isFetchFailure(error)) {
      throw error;
    }
    return undefined;
  }
}

/** Throw `HttpError("<prefix>: <status> <statusText> — <server body>")` for a non-OK `Response`. Reads the
 *  body as text (never fails — a malformed/absent body degrades to no suffix) so the server's real
 *  `{error}` message (or whatever it sent) reaches the caller instead of a bare status line. */
export async function throwHttpError(prefix: string, response: Response): Promise<never> {
  // A body that dies mid-read only drops the message suffix; the line after it always throws the status-line Error
  // that the upload seams' callers receive. Any other fault rejects.
  const detail = await response.text().catch((error: unknown): string => {
    if (!isFetchFailure(error)) {
      throw error;
    }
    return "";
  });
  const suffix = detail === "" ? "" : ` — ${detail}`;
  throw new HttpError(`${prefix}: ${response.status} ${response.statusText}${suffix}`, response.status);
}
